from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class GroupCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    rules: Optional[List[str]] = []
    is_public: bool = True
    category: Optional[str] = None


class GroupUpdate(BaseModel):
    description: Optional[str] = Field(None, max_length=1000)
    rules: Optional[List[str]] = None


class GroupResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    rules: List[str] = []
    is_public: bool = True
    category: Optional[str] = None
    member_count: int = 0
    creator_id: str
    moderators: List[str] = []
    created_at: datetime

    class Config:
        from_attributes = True