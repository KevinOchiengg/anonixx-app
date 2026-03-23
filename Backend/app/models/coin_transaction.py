"""
models/coin_transaction.py
"""
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import Optional
from enum import Enum


class TransactionType(str, Enum):
    EARN  = "earn"
    SPEND = "spend"


class TransactionReason(str, Enum):
    # Earn
    WELCOME_BONUS    = "welcome_bonus"
    DAILY_LOGIN      = "daily_login"
    STREAK_MILESTONE = "streak_milestone"
    POST_CREATED     = "post_created"
    POST_VIRAL       = "post_viral"
    POST_TRENDING    = "post_trending"
    COMMENT_ADDED    = "comment_added"
    DROP_REVEALED    = "drop_revealed"
    REFERRAL_BONUS   = "referral_bonus"
    MILESTONE        = "milestone"
    MPESA_PURCHASE   = "mpesa_purchase"
    # Spend
    CONNECT_UNLOCK   = "connect_unlock"
    DROP_REVEAL      = "drop_reveal"
    CIRCLE_ENTRY     = "circle_entry"
    STREAK_FREEZE    = "streak_freeze"
    PREMIUM          = "premium"


class CoinTransaction(BaseModel):
    id:               Optional[str]  = Field(None, alias="_id")
    user_id:          str
    amount:           int
    balance_after:    int
    transaction_type: TransactionType
    reason:           TransactionReason
    description:      Optional[str]  = None
    meta:             Optional[dict] = {}
    created_at:       datetime       = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    class Config:
        populate_by_name = True
