"""
backend/app/api/v1/chats.py
Chat and messaging system with real-time support
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from enum import Enum
from app.core.security import get_current_user
from app.database import get_database
from app.models.user import User
from app.api.v1.coins import add_transaction, COIN_PRICES, TransactionType, TransactionReason

router = APIRouter(prefix="/chats", tags=["chats"])


# Enums
class MessageType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
    FILE = "file"
    VOICE = "voice"


class ChatType(str, Enum):
    DIRECT = "direct"
    GROUP = "group"


# Models
class Message(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    chat_id: str
    sender_id: str
    content: str
    message_type: MessageType = MessageType.TEXT
    
    # Attachments
    media_url: Optional[str] = None
    
    # Status
    is_read: bool = False
    read_by: List[str] = []
    delivered_to: List[str] = []
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None
    is_deleted: bool = False

    class Config:
        populate_by_name = True


class Chat(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    chat_type: ChatType
    
    # Participants
    participants: List[str] = []
    
    # Group chat specific
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    admin_ids: List[str] = []
    
    # Last message
    last_message: Optional[str] = None
    last_message_at: Optional[datetime] = None
    last_sender_id: Optional[str] = None
    
    # Stats
    unread_count: dict = {}  # {user_id: count}
    
    # Settings
    is_muted: dict = {}  # {user_id: bool}
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        populate_by_name = True


# API Schemas
class MessageCreate(BaseModel):
    content: str
    message_type: MessageType = MessageType.TEXT
    media_url: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "content": "Hey! How are you?",
                "message_type": "text"
            }
        }


class ChatCreate(BaseModel):
    participant_ids: List[str]
    name: Optional[str] = None  # For group chats
    chat_type: ChatType = ChatType.DIRECT

    class Config:
        json_schema_extra = {
            "example": {
                "participant_ids": ["user123"],
                "chat_type": "direct"
            }
        }


class UserInfo(BaseModel):
    id: str
    username: str
    avatar_url: Optional[str]
    is_online: bool = False


class MessageResponse(BaseModel):
    id: str
    chat_id: str
    sender: UserInfo
    content: str
    message_type: str
    media_url: Optional[str]
    is_read: bool
    read_by: List[str]
    created_at: datetime


class ChatResponse(BaseModel):
    id: str
    chat_type: str
    participants: List[UserInfo]
    name: Optional[str]
    avatar_url: Optional[str]
    last_message: Optional[str]
    last_message_at: Optional[datetime]
    last_sender_id: Optional[str]
    unread_count: int
    is_muted: bool
    created_at: datetime


async def get_user_info(user_id: str) -> UserInfo:
    """Get user info"""
    db = await get_database()
    user = await db.users.find_one({"_id": user_id})
    if not user:
        return UserInfo(id=user_id, username="Unknown", avatar_url=None)
    return UserInfo(
        id=user["_id"],
        username=user.get("username", "Unknown"),
        avatar_url=user.get("avatar_url"),
        is_online=user.get("is_online", False)
    )


@router.post("/", response_model=ChatResponse, status_code=201)
async def create_chat(
    data: ChatCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new chat"""
    db = await get_database()
    
    # For direct chats, check if already exists
    if data.chat_type == ChatType.DIRECT:
        if len(data.participant_ids) != 1:
            raise HTTPException(status_code=400, detail="Direct chat must have exactly 1 other participant")
        
        other_user_id = data.participant_ids[0]
        
        # Check if chat already exists
        existing = await db.chats.find_one({
            "chat_type": ChatType.DIRECT,
            "participants": {"$all": [current_user.id, other_user_id]}
        })
        
        if existing:
            # Return existing chat
            participants_info = [await get_user_info(p) for p in existing["participants"]]
            return ChatResponse(
                id=str(existing["_id"]),
                chat_type=existing["chat_type"],
                participants=participants_info,
                name=existing.get("name"),
                avatar_url=existing.get("avatar_url"),
                last_message=existing.get("last_message"),
                last_message_at=existing.get("last_message_at"),
                last_sender_id=existing.get("last_sender_id"),
                unread_count=existing.get("unread_count", {}).get(current_user.id, 0),
                is_muted=existing.get("is_muted", {}).get(current_user.id, False),
                created_at=existing["created_at"]
            )
    
    # Create new chat
    participants = [current_user.id] + data.participant_ids
    
    chat = Chat(
        chat_type=data.chat_type,
        participants=participants,
        name=data.name,
        admin_ids=[current_user.id] if data.chat_type == ChatType.GROUP else []
    )
    
    result = await db.chats.insert_one(chat.dict(by_alias=True))
    
    participants_info = [await get_user_info(p) for p in participants]
    
    return ChatResponse(
        id=str(result.inserted_id),
        chat_type=chat.chat_type.value,
        participants=participants_info,
        name=chat.name,
        avatar_url=chat.avatar_url,
        last_message=None,
        last_message_at=None,
        last_sender_id=None,
        unread_count=0,
        is_muted=False,
        created_at=chat.created_at
    )


@router.get("/", response_model=List[ChatResponse])
async def get_chats(current_user: User = Depends(get_current_user)):
    """Get all chats for current user"""
    db = await get_database()
    
    chats = await db.chats.find({
        "participants": current_user.id
    }).sort("last_message_at", -1).to_list(None)
    
    result = []
    for chat in chats:
        participants_info = [await get_user_info(p) for p in chat["participants"]]
        
        result.append(ChatResponse(
            id=str(chat["_id"]),
            chat_type=chat["chat_type"],
            participants=participants_info,
            name=chat.get("name"),
            avatar_url=chat.get("avatar_url"),
            last_message=chat.get("last_message"),
            last_message_at=chat.get("last_message_at"),
            last_sender_id=chat.get("last_sender_id"),
            unread_count=chat.get("unread_count", {}).get(current_user.id, 0),
            is_muted=chat.get("is_muted", {}).get(current_user.id, False),
            created_at=chat["created_at"]
        ))
    
    return result


@router.get("/{chat_id}", response_model=ChatResponse)
async def get_chat(
    chat_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a single chat"""
    db = await get_database()
    
    chat = await db.chats.find_one({"_id": chat_id})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    if current_user.id not in chat["participants"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    participants_info = [await get_user_info(p) for p in chat["participants"]]
    
    return ChatResponse(
        id=str(chat["_id"]),
        chat_type=chat["chat_type"],
        participants=participants_info,
        name=chat.get("name"),
        avatar_url=chat.get("avatar_url"),
        last_message=chat.get("last_message"),
        last_message_at=chat.get("last_message_at"),
        last_sender_id=chat.get("last_sender_id"),
        unread_count=chat.get("unread_count", {}).get(current_user.id, 0),
        is_muted=chat.get("is_muted", {}).get(current_user.id, False),
        created_at=chat["created_at"]
    )


@router.post("/{chat_id}/messages", response_model=MessageResponse, status_code=201)
async def send_message(
    chat_id: str,
    data: MessageCreate,
    current_user: User = Depends(get_current_user)
):
    """Send a message in a chat"""
    db = await get_database()
    
    # Get chat
    chat = await db.chats.find_one({"_id": chat_id})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    if current_user.id not in chat["participants"]:
        raise HTTPException(status_code=403, detail="Not a participant")
    
    # Create message
    message = Message(
        chat_id=chat_id,
        sender_id=current_user.id,
        content=data.content,
        message_type=data.message_type,
        media_url=data.media_url
    )
    
    result = await db.messages.insert_one(message.dict(by_alias=True))
    
    # Update chat
    unread_count = chat.get("unread_count", {})
    for participant_id in chat["participants"]:
        if participant_id != current_user.id:
            unread_count[participant_id] = unread_count.get(participant_id, 0) + 1
    
    await db.chats.update_one(
        {"_id": chat_id},
        {"$set": {
            "last_message": data.content,
            "last_message_at": datetime.utcnow(),
            "last_sender_id": current_user.id,
            "unread_count": unread_count,
            "updated_at": datetime.utcnow()
        }}
    )
    
    sender_info = await get_user_info(current_user.id)
    
    # TODO: Emit Socket.io event for real-time delivery
    # socketio.emit('new_message', message_response, room=chat_id)
    
    return MessageResponse(
        id=str(result.inserted_id),
        chat_id=chat_id,
        sender=sender_info,
        content=data.content,
        message_type=data.message_type.value,
        media_url=data.media_url,
        is_read=False,
        read_by=[],
        created_at=message.created_at
    )


@router.get("/{chat_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    chat_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """Get messages in a chat"""
    db = await get_database()
    
    # Check access
    chat = await db.chats.find_one({"_id": chat_id})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    if current_user.id not in chat["participants"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    skip = (page - 1) * limit
    
    messages = await db.messages.find({
        "chat_id": chat_id,
        "is_deleted": False
    }).sort("created_at", -1).skip(skip).limit(limit).to_list(None)
    
    result = []
    for msg in reversed(messages):  # Reverse to get chronological order
        sender_info = await get_user_info(msg["sender_id"])
        result.append(MessageResponse(
            id=str(msg["_id"]),
            chat_id=msg["chat_id"],
            sender=sender_info,
            content=msg["content"],
            message_type=msg["message_type"],
            media_url=msg.get("media_url"),
            is_read=msg.get("is_read", False),
            read_by=msg.get("read_by", []),
            created_at=msg["created_at"]
        ))
    
    return result


@router.post("/{chat_id}/read")
async def mark_as_read(
    chat_id: str,
    current_user: User = Depends(get_current_user)
):
    """Mark all messages in a chat as read"""
    db = await get_database()
    
    # Check access
    chat = await db.chats.find_one({"_id": chat_id})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    if current_user.id not in chat["participants"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Mark messages as read
    await db.messages.update_many(
        {
            "chat_id": chat_id,
            "sender_id": {"$ne": current_user.id},
            "read_by": {"$ne": current_user.id}
        },
        {"$push": {"read_by": current_user.id}}
    )
    
    # Reset unread count
    unread_count = chat.get("unread_count", {})
    unread_count[current_user.id] = 0
    
    await db.chats.update_one(
        {"_id": chat_id},
        {"$set": {f"unread_count": unread_count}}
    )
    
    return {"message": "Marked as read"}


@router.delete("/{chat_id}/messages/{message_id}")
async def delete_message(
    chat_id: str,
    message_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a message"""
    db = await get_database()
    
    message = await db.messages.find_one({"_id": message_id, "chat_id": chat_id})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    if message["sender_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Can only delete your own messages")
    
    await db.messages.update_one(
        {"_id": message_id},
        {"$set": {
            "is_deleted": True,
            "content": "This message was deleted",
            "updated_at": datetime.utcnow()
        }}
    )
    
    return {"message": "Message deleted"}


@router.post("/{chat_id}/mute")
async def mute_chat(
    chat_id: str,
    current_user: User = Depends(get_current_user)
):
    """Mute a chat"""
    db = await get_database()
    
    chat = await db.chats.find_one({"_id": chat_id})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    if current_user.id not in chat["participants"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.chats.update_one(
        {"_id": chat_id},
        {"$set": {f"is_muted.{current_user.id}": True}}
    )
    
    return {"message": "Chat muted"}


@router.post("/{chat_id}/unmute")
async def unmute_chat(
    chat_id: str,
    current_user: User = Depends(get_current_user)
):
    """Unmute a chat"""
    db = await get_database()
    
    await db.chats.update_one(
        {"_id": chat_id},
        {"$set": {f"is_muted.{current_user.id}": False}}
    )
    
    return {"message": "Chat unmuted"}