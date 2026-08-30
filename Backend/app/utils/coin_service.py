"""
utils/coin_service.py — Atomic coin credit / debit helper.

All coin mutations in Anonixx go through here.
Uses find_one_and_update so balance never drifts under concurrent requests.
"""
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId


def _now() -> datetime:
    return datetime.now(timezone.utc)


# Only coins EARNED from real activity may be cashed out. The signup bonus
# and purchased coins are fully spendable in-app but never withdrawable —
# otherwise registering an account (or buying with a stolen card) becomes a
# direct cash-out path. `withdrawable_coins` on the user doc tracks this
# earned subset; see api/v1/coins.py's /withdraw.
WITHDRAWABLE_REASONS = {"drop_unlock_reward"}


async def credit_coins(
    db,
    user_id: str,
    amount: int,
    reason: str,
    description: str,
    meta: Optional[dict] = None,
) -> int:
    """
    Atomically add `amount` coins to user's balance.
    Creates a transaction record.
    Returns the new balance.
    Raises ValueError if user not found.
    """
    inc = {"coin_balance": amount}
    if reason in WITHDRAWABLE_REASONS:
        inc["withdrawable_coins"] = amount

    result = await db.users.find_one_and_update(
        {"_id": ObjectId(user_id)},
        {"$inc": inc},
        return_document=True,
    )
    if not result:
        raise ValueError("User not found")

    new_balance = result["coin_balance"]

    await db.coin_transactions.insert_one({
        "user_id":          user_id,
        "amount":           amount,
        "balance_after":    new_balance,
        "transaction_type": "earn",
        "reason":           reason,
        "description":      description,
        "meta":             meta or {},
        "created_at":       _now(),
    })

    return new_balance


async def debit_coins(
    db,
    user_id: str,
    amount: int,
    reason: str,
    description: str,
    meta: Optional[dict] = None,
    from_withdrawable: bool = False,
) -> int:
    """
    Atomically subtract `amount` coins from user's balance.
    Only succeeds if balance >= amount (atomic check + update).
    Creates a transaction record.
    Returns the new balance.
    Raises ValueError if insufficient coins or user not found.

    Ordinary spending draws from granted/purchased coins first, so a user's
    earned (withdrawable) balance survives until nothing else is left — the
    $min below just clamps it to whatever balance remains. A withdrawal is
    different: pass from_withdrawable=True and it reduces the earned bucket
    by the full amount, since that's exactly what's being cashed out.
    """
    remaining = {"$subtract": ["$coin_balance", amount]}
    new_withdrawable = (
        {"$max": [0, {"$subtract": [{"$ifNull": ["$withdrawable_coins", 0]}, amount]}]}
        if from_withdrawable
        else {"$min": [{"$ifNull": ["$withdrawable_coins", 0]}, remaining]}
    )

    result = await db.users.find_one_and_update(
        {"_id": ObjectId(user_id), "coin_balance": {"$gte": amount}},
        [{"$set": {"coin_balance": remaining, "withdrawable_coins": new_withdrawable}}],
        return_document=True,
    )
    if not result:
        # Check if user exists to give the right error
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise ValueError("User not found")
        raise ValueError("Insufficient coins")

    new_balance = result["coin_balance"]

    await db.coin_transactions.insert_one({
        "user_id":          user_id,
        "amount":           -amount,
        "balance_after":    new_balance,
        "transaction_type": "spend",
        "reason":           reason,
        "description":      description,
        "meta":             meta or {},
        "created_at":       _now(),
    })

    return new_balance
