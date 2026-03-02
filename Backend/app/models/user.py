from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, timezone
from typing import Optional, List
from enum import Enum


# ==================== ENUMS ====================

class AvatarAura(str, Enum):
    """Anonymous avatar auras (no photos allowed)"""
    PURPLE_GLOW = "purple_glow"
    RED_SHADOW = "red_shadow"
    GREEN_MIST = "green_mist"
    BLUE_VOID = "blue_void"
    DARK_PHANTOM = "dark_phantom"
    CORAL_FLAME = "coral_flame"


# ==================== MODELS ====================

class User(BaseModel):
    id: str = Field(..., alias="_id")
    email: EmailStr
    username: Optional[str] = None
    password_hash: Optional[str] = None

    # Anonymous identity
    anonymous_name: Optional[str] = None

    # ✅ NEW: Anonymous avatar (no photos)
    avatar_aura: AvatarAura = AvatarAura.PURPLE_GLOW

    # Profile
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None  # Keep for backward compatibility
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

    # Coins
    coin_balance: int = 100

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
                "avatar_aura": "purple_glow",
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
    avatar_aura: str
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
