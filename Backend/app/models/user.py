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

    # Optional real photo; otherwise clients show the name's first letter.
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

    # Age: date of birth at signup (18+ only); age_verified once it proves adulthood.
    date_of_birth: Optional[date] = None
    age_verified: bool = False
    is_premium: bool = False
    premium_until: Optional[str] = None
    blocked_user_ids: List[str] = []

    # Deception strikes: 2nd = 7-day posting ban, 3rd = account disabled.
    deception_strikes: int = 0
    posting_suspended_until: Optional[datetime] = None

    # coin_balance is all spendable coins; withdrawable_coins is the earned part that can be cashed out.
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
    is_premium: bool = False
    premium_until: Optional[str] = None
