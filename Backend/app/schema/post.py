from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime
from app.schemas.common import ContentType, PyObjectId


class PostCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)
    content_type: ContentType = ContentType.TEXT
    media_url: Optional[str] = None
    group_id: Optional[str] = None
    is_anonymous: bool = True


class PostUpdate(BaseModel):
    content: Optional[str] = Field(None, max_length=5000)


class ReactionCreate(BaseModel):
    reaction_type: str = Field(..., pattern="^(like|love|fire|wow|sad|angry)$")


class PostResponse(BaseModel):
    id: str
    user_id: str
    anonymous_name: str
    content: str
    content_type: ContentType
    media_url: Optional[str] = None
    group_id: Optional[str] = None
    reactions: Dict[str, int] = {}
    reply_count: int = 0
    is_anonymous: bool = True
    is_trending: bool = False
    trending_score: float = 0.0
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PostListResponse(BaseModel):
    posts: List[PostResponse]
    next_cursor: Optional[str] = None
    has_more: bool = False