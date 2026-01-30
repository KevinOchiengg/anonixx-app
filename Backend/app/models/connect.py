from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


# ==================== BROADCAST ====================
class Broadcast(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    user_id: str
    anonymous_name: str
    content: str
    vibe_tags: List[str] = []
    mood_emoji: Optional[str] = None
    intention_tag: Optional[str] = None
    timezone: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime
    response_count: int = 0
    
    class Config:
        populate_by_name = True


# ==================== CONNECTION ====================
class ConnectionStatus:
    PENDING = "pending"
    ACTIVE = "active"
    ARCHIVED = "archived"
    BLOCKED = "blocked"


class Connection(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    user1_id: str
    user2_id: str
    user1_anonymous_name: str
    user2_anonymous_name: str
    opening_message: str
    status: str = ConnectionStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_message_at: Optional[datetime] = None
    user1_revealed: bool = False
    user2_revealed: bool = False
    user1_reveal_initiated: bool = False
    user2_reveal_initiated: bool = False
    user1_reveal_paid: bool = False
    user2_reveal_paid: bool = False
    reveal_completed_at: Optional[datetime] = None
    user1_reveal_cooling_until: Optional[datetime] = None
    user2_reveal_cooling_until: Optional[datetime] = None
    message_count: int = 0
    days_active: int = 0
    reveal_eligible: bool = False
    
    class Config:
        populate_by_name = True


# ==================== MESSAGE ====================
class Message(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    connection_id: str
    sender_id: str
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_read: bool = False
    
    class Config:
        populate_by_name = True


# ==================== VIBE TAGS ====================
VIBE_TAGS = [
    "night owl", "early bird", "deep talks", "old soul", "bookworm",
    "creative", "overthinker", "needs space", "adventurous", "homebody",
    "music lover", "nature person", "city dweller", "coffee addict",
    "tea enthusiast", "spiritual", "logical", "emotional", "sarcastic", "sincere",
]

INTENTION_TAGS = [
    "seeking connection",
    "just talking",
    "seeing where it goes"
]

MOOD_EMOJIS = ["🌙", "💭", "🌊", "🌱", "✨", "🔥", "❄️", "🌸"]


# ==================== IDENTITY REVEAL ====================
class IdentityReveal(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    connection_id: str
    initiator_id: str
    recipient_id: str
    status: str
    initiated_at: datetime = Field(default_factory=datetime.utcnow)
    cooling_ends_at: datetime
    responded_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    payment_amount: float = 4.99
    payment_status: str = "pending"
    payment_intent_id: Optional[str] = None
    
    class Config:
        populate_by_name = True


# ==================== BLOCKING ====================
class Block(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    blocker_id: str
    blocked_id: str
    connection_id: Optional[str] = None
    reason: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True