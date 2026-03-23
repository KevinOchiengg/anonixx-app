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
    result = await db.users.find_one_and_update(
        {"_id": ObjectId(user_id)},
        {"$inc": {"coin_balance": amount}},
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
) -> int:
    """
    Atomically subtract `amount` coins from user's balance.
    Only succeeds if balance >= amount (atomic check + update).
    Creates a transaction record.
    Returns the new balance.
    Raises ValueError if insufficient coins or user not found.
    """
    result = await db.users.find_one_and_update(
        {"_id": ObjectId(user_id), "coin_balance": {"$gte": amount}},
        {"$inc": {"coin_balance": -amount}},
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
