from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime
from enum import Enum

class PostType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"

class Post(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    content: str
    post_type: PostType = PostType.TEXT
    images: List[str] = []
    audio_url: Optional[str] = None
    video_url: Optional[str] = None
    is_anonymous: bool = False
    anonymous_name: Optional[str] = None
    reactions: Dict[str, str] = {}
    comments_count: int = 0
    views_count: int = 0
    is_deleted: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True

class Comment(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    post_id: str
    user_id: str
    content: str
    is_anonymous: bool = False
    anonymous_name: Optional[str] = None
    reactions: Dict[str, str] = {}
    is_deleted: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True