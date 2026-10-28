"""Atomic coin credit/debit. Every coin change goes through here."""
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId


def _now() -> datetime:
    return datetime.now(timezone.utc)


# Coin reasons that count as earned (withdrawable). Bonus and bought coins never do.
WITHDRAWABLE_REASONS = {"drop_unlock_reward"}


async def credit_coins(
    db,
    user_id: str,
    amount: int,
    reason: str,
    description: str,
    meta: Optional[dict] = None,
) -> int:
    """Add coins and record the transaction. Returns the new balance; ValueError if no user."""
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
    """Take coins if the balance covers it, and record the transaction. Returns the new balance;
    ValueError if short. Spending uses non-earned coins first; from_withdrawable=True
    (withdrawals) takes it all from earned coins."""
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
