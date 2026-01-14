"""
backend/app/models/coin_transaction.py
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from enum import Enum


class TransactionType(str, Enum):
    EARN = "earn"
    SPEND = "spend"


class TransactionReason(str, Enum):
    POST_CREATED = "post_created"
    COMMENT_ADDED = "comment_added"
    DAILY_LOGIN = "daily_login"


class CoinTransaction(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    amount: int
    balance_after: int
    transaction_type: TransactionType
    reason: TransactionReason
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True