from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.schemas.common import ContentType


class MessageCreate(BaseModel):
    chat_id: str
    content: str = Field(..., max_length=5000)
    content_type: ContentType = ContentType.TEXT
    media_url: Optional[str] = None
    reply_to: Optional[str] = None


class MessageResponse(BaseModel):
    id: str
    chat_id: str
    sender_id: str
    sender_name: str
    content: str
    content_type: ContentType
    media_url: Optional[str] = None
    reply_to: Optional[str] = None
    reactions: List[str] = []
    is_read: bool = False
    created_at: datetime

    class Config:
        from_attributes = True