from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional, List 

class User(BaseModel):
    id: str = Field(..., alias="_id")
    email: EmailStr
    username: Optional[str] = None
    password_hash: Optional[str] = None
    
    # Anonymous identity
    anonymous_name: Optional[str] = None
    
    # Profile
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    
    # ✅ NEW: User interests (selected during onboarding)
    interests: List[str] = []  # ← ADD THIS LINE
    
    # Settings
    is_verified: bool = False
    is_active: bool = True
    is_online: bool = False
    is_premium: bool = False
    
    # Coins
    coin_balance: int = 100
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
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
    interests: List[str] = []  # ✅ Already here - good!
    is_verified: bool
    coin_balance: int
    created_at: datetime
