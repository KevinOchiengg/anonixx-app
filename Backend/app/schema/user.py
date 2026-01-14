from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List
from datetime import datetime
from app.schemas.common import PyObjectId


class UserCreate(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: str = Field(..., min_length=8)
    username: Optional[str] = Field(None, min_length=3, max_length=30)


class UserLogin(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: str


class AnonymousUserCreate(BaseModel):
    """Create anonymous user (no credentials needed)"""
    device_id: Optional[str] = None


class ConvertAnonymousUser(BaseModel):
    """Convert anonymous account to registered"""
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: str = Field(..., min_length=8)
    username: Optional[str] = Field(None, min_length=3, max_length=30)


class UserProfile(BaseModel):
    id: str
    anonymous_name: str
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    avatar: Optional[str] = None
    bio: Optional[str] = None
    coin_balance: int = 0
    reputation_score: int = 0
    is_anonymous: bool = True
    is_premium: bool = False
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=30)
    bio: Optional[str] = Field(None, max_length=500)
    avatar: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserProfile