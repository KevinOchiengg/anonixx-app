from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, timezone, date
from typing import Optional, List


# ==================== MODELS ====================

class User(BaseModel):
    id: str = Field(..., alias="_id")
    email: EmailStr
    username: Optional[str] = None
    password_hash: Optional[str] = None

    # Anonymous identity
    anonymous_name: Optional[str] = None

    # Profile — a real photo if the user chose to set one; no avatar photo
    # shown otherwise (the client falls back to the first initial of
    # anonymous_name).
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    cover_image_url: Optional[str] = None

    # ✅ User interests (selected during onboarding)
    interests: List[str] = []

    # ✅ NEW: Public hints (shown in Traces)
    city: Optional[str] = None
    age_range: Optional[str] = None  # "20s", "30s", etc.
    vibe: Optional[str] = None  # One-line description

    # ✅ NEW: Daily Trace tokens
    daily_traces_remaining: int = 5
    last_trace_reset: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Settings
    is_verified: bool = False
    is_active: bool = True
    is_online: bool = False
    is_premium: bool = False
    premium_plan: Optional[str] = None       # "monthly" | "quarterly" | "yearly" — see api/v1/premium.py
    premium_until: Optional[datetime] = None  # None + is_premium=True means never-expiring

    # ✅ NEW: Age verification + safety
    # Self-attested date of birth, required at signup — Anonixx is 18+ only.
    # age_verified is set True at signup once date_of_birth proves adulthood.
    date_of_birth: Optional[date] = None
    age_verified: bool = False
    blocked_user_ids: List[str] = []

    # Deceptive-confession strikes — see api/v1/deception_reports.py. Strike
    # 2 suspends posting for 7 days; strike 3+ deactivates the account
    # (is_active=False, same field the admin ban toggle uses).
    deception_strikes: int = 0
    posting_suspended_until: Optional[datetime] = None

    # Coins. `coin_balance` is everything spendable in-app; `withdrawable_coins`
    # is the earned subset that may be cashed out (signup bonus and purchased
    # coins never count) — see WITHDRAWABLE_REASONS in utils/coin_service.py.
    coin_balance: int = 100
    withdrawable_coins: int = 0

    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None
    last_login: Optional[datetime] = None

    class Config:
        populate_by_name = True
        extra = "allow"
        json_schema_extra = {
            "example": {
                "_id": "user123",
                "email": "user@echo.com",
                "username": "johndoe",
                "anonymous_name": "Quiet Soul 427",
                "interests": ["anxiety", "relationships"],
                "city": "San Francisco",
                "age_range": "20s",
                "vibe": "Looking for deep conversations",
                "daily_traces_remaining": 5,
                "coin_balance": 100,
                "is_verified": False
            }
        }


class UserInDB(User):
    """User model as stored in database"""
    pass


class UserResponse(BaseModel):
    """User response model (without sensitive data)"""
    id: str
    email: str
    username: Optional[str]
    anonymous_name: Optional[str]
    display_name: Optional[str]
    bio: Optional[str]
    avatar_url: Optional[str]
    cover_image_url: Optional[str]
    interests: List[str] = []
    city: Optional[str] = None
    age_range: Optional[str] = None
    vibe: Optional[str] = None
    daily_traces_remaining: int = 5
    is_verified: bool
    coin_balance: int
    created_at: datetime
    age_verified: bool = False
