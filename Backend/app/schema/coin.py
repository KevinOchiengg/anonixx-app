from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.schemas.common import TransactionStatus, PaymentProvider


class CoinBalance(BaseModel):
    user_id: str
    balance: int
    total_earned: int = 0
    total_spent: int = 0


class CoinTransaction(BaseModel):
    id: str
    user_id: str
    amount: int
    transaction_type: str  # "purchase", "earn", "spend", "refund"
    provider: PaymentProvider
    reference_id: Optional[str] = None
    status: TransactionStatus
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class EarnCoinsRequest(BaseModel):
    action: str  # "post", "like", "daily_login", "streak"
    amount: int


class SpendCoinsRequest(BaseModel):
    action: str  # "boost", "premium_reaction", "reveal_identity"
    amount: int
    target_id: Optional[str] = None