"""
backend/app/models/group.py
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List
from enum import Enum


class GroupCategory(str, Enum):
    GENERAL = "general"
    GAMING = "gaming"
    MUSIC = "music"
    SPORTS = "sports"
    TECH = "tech"
    FOOD = "food"
    TRAVEL = "travel"
    ART = "art"


class MemberRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class GroupMember(BaseModel):
    user_id: str
    role: MemberRole
    joined_at: datetime = Field(default_factory=datetime.utcnow)


class Group(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    name: str
    description: str
    category: GroupCategory
    
    # Owner and members
    owner_id: str
    members: List[dict] = []  # List of GroupMember dicts
    member_count: int = 0
    
    # Settings
    avatar_url: Optional[str] = None
    tags: List[str] = []
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None
    is_deleted: bool = False

    class Config:
        populate_by_name = True