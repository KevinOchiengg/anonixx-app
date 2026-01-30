from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from datetime import datetime, timedelta
from bson import ObjectId

from app.models.connect import (
    Broadcast, Connection, Message, IdentityReveal, Block,
    ConnectionStatus, VIBE_TAGS, INTENTION_TAGS, MOOD_EMOJIS
)
from app.dependencies import get_current_user_id, get_optional_user_id, get_database
from app.utils.anonymous_names import generate_anonymous_name
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/connect", tags=["connect"])


# ==================== REQUEST/RESPONSE MODELS ====================

class CreateBroadcastRequest(BaseModel):
    content: str = Field(..., min_length=100, max_length=300)
    vibe_tags: List[str] = Field(..., min_items=3, max_items=5)
    mood_emoji: Optional[str] = None
    intention_tag: Optional[str] = None
    timezone: Optional[str] = None


class SendOpenerRequest(BaseModel):
    broadcast_id: str
    message: str = Field(..., min_length=20, max_length=200)


class SendMessageRequest(BaseModel):
    connection_id: str
    content: str = Field(..., min_length=1, max_length=1000)


class InitiateRevealRequest(BaseModel):
    connection_id: str


class RespondToRevealRequest(BaseModel):
    reveal_id: str
    accept: bool


class BlockUserRequest(BaseModel):
    connection_id: str
    reason: Optional[str] = None


# ==================== BROADCASTS ====================

@router.post("/broadcasts")
async def create_broadcast(
    request: CreateBroadcastRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Create a new anonymous broadcast"""
    
    # Validate vibe tags
    for tag in request.vibe_tags:
        if tag not in VIBE_TAGS:
            raise HTTPException(400, f"Invalid vibe tag: {tag}")
    
    # Validate intention tag
    if request.intention_tag and request.intention_tag not in INTENTION_TAGS:
        raise HTTPException(400, f"Invalid intention tag: {request.intention_tag}")
    
    # Validate mood emoji
    if request.mood_emoji and request.mood_emoji not in MOOD_EMOJIS:
        raise HTTPException(400, f"Invalid mood emoji: {request.mood_emoji}")
    
    # Check if user has an active broadcast
    existing = await db["broadcasts"].find_one({
        "user_id": current_user_id,
        "is_active": True,
        "expires_at": {"$gt": datetime.utcnow()}
    })
    
    if existing:
        raise HTTPException(400, "You already have an active broadcast. Wait for it to expire.")
    
    # Generate anonymous name for this broadcast
    anonymous_name = generate_anonymous_name()
    
    # Create broadcast
    broadcast = {
        "user_id": current_user_id,
        "anonymous_name": anonymous_name,
        "content": request.content,
        "vibe_tags": request.vibe_tags,
        "mood_emoji": request.mood_emoji,
        "intention_tag": request.intention_tag,
        "timezone": request.timezone,
        "is_active": True,
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(days=7),
        "response_count": 0
    }
    
    result = await db["broadcasts"].insert_one(broadcast)
    broadcast["_id"] = str(result.inserted_id)
    
    return {
        "broadcast": broadcast,
        "message": "Broadcast created successfully"
    }


@router.get("/broadcasts")
async def get_broadcasts_feed(
    skip: int = 0,
    limit: int = 20,
    vibe_tags: Optional[str] = None,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get feed of active broadcasts (excluding own)"""
    
    # Build query
    query = {
        "is_active": True,
        "expires_at": {"$gt": datetime.utcnow()},
        "user_id": {"$ne": current_user_id}
    }
    
    # Filter by vibe tags if provided
    if vibe_tags:
        tags_list = [tag.strip() for tag in vibe_tags.split(",")]
        query["vibe_tags"] = {"$in": tags_list}
    
    # Get broadcasts
    broadcasts = await db["broadcasts"].find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(length=limit)
    
    # Get user's sent openers
    user_connections = await db["connections"].find({
        "user1_id": current_user_id
    }).to_list(length=None)
    
    responded_user_ids = [conn["user2_id"] for conn in user_connections]
    
    # Format response
    formatted_broadcasts = []
    for broadcast in broadcasts:
        formatted_broadcasts.append({
            "id": str(broadcast["_id"]),
            "anonymous_name": broadcast["anonymous_name"],
            "content": broadcast["content"],
            "vibe_tags": broadcast["vibe_tags"],
            "mood_emoji": broadcast.get("mood_emoji"),
            "intention_tag": broadcast.get("intention_tag"),
            "timezone": broadcast.get("timezone"),
            "time_ago": get_time_ago(broadcast["created_at"]),
            "already_responded": broadcast["user_id"] in responded_user_ids
        })
    
    return {
        "broadcasts": formatted_broadcasts,
        "has_more": len(broadcasts) == limit
    }


@router.get("/broadcasts/my-active")
async def get_my_active_broadcast(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get user's currently active broadcast"""
    
    broadcast = await db["broadcasts"].find_one({
        "user_id": current_user_id,
        "is_active": True,
        "expires_at": {"$gt": datetime.utcnow()}
    })
    
    if not broadcast:
        return {"broadcast": None}
    
    # Get pending openers count
    pending_count = await db["connections"].count_documents({
        "user2_id": current_user_id,
        "status": ConnectionStatus.PENDING
    })
    
    return {
        "broadcast": {
            "id": str(broadcast["_id"]),
            "content": broadcast["content"],
            "vibe_tags": broadcast["vibe_tags"],
            "mood_emoji": broadcast.get("mood_emoji"),
            "created_at": broadcast["created_at"],
            "expires_at": broadcast["expires_at"],
            "response_count": broadcast.get("response_count", 0),
            "pending_openers": pending_count
        }
    }


@router.delete("/broadcasts/{broadcast_id}")
async def deactivate_broadcast(
    broadcast_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Deactivate your broadcast"""
    
    result = await db["broadcasts"].update_one(
        {
            "_id": ObjectId(broadcast_id),
            "user_id": current_user_id
        },
        {"$set": {"is_active": False}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(404, "Broadcast not found")
    
    return {"message": "Broadcast deactivated"}


# ==================== CONNECTIONS & OPENERS ====================

@router.post("/openers")
async def send_opener(
    request: SendOpenerRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Send an opening message to a broadcast"""
    
    # Get broadcast
    broadcast = await db["broadcasts"].find_one({
        "_id": ObjectId(request.broadcast_id),
        "is_active": True,
        "expires_at": {"$gt": datetime.utcnow()}
    })
    
    if not broadcast:
        raise HTTPException(404, "Broadcast not found or expired")
    
    # Can't respond to own broadcast
    if broadcast["user_id"] == current_user_id:
        raise HTTPException(400, "Cannot respond to your own broadcast")
    
    # Check if already sent opener
    existing = await db["connections"].find_one({
        "user1_id": current_user_id,
        "user2_id": broadcast["user_id"]
    })
    
    if existing:
        raise HTTPException(400, "You've already sent an opener to this person")
    
    # Check message quality
    if len(request.message.split()) < 5:
        raise HTTPException(400, "Opener too short. Write something meaningful (5+ words)")
    
    # Generate anonymous names
    user1_anonymous_name = generate_anonymous_name()
    
    # Create connection
    connection = {
        "user1_id": current_user_id,
        "user2_id": broadcast["user_id"],
        "user1_anonymous_name": user1_anonymous_name,
        "user2_anonymous_name": broadcast["anonymous_name"],
        "opening_message": request.message,
        "status": ConnectionStatus.PENDING,
        "created_at": datetime.utcnow(),
        "message_count": 0,
        "days_active": 0,
        "reveal_eligible": False,
        "user1_revealed": False,
        "user2_revealed": False
    }
    
    result = await db["connections"].insert_one(connection)
    
    # Update broadcast response count
    await db["broadcasts"].update_one(
        {"_id": ObjectId(request.broadcast_id)},
        {"$inc": {"response_count": 1}}
    )
    
    return {
        "message": "Opener sent successfully",
        "connection_id": str(result.inserted_id)
    }


@router.get("/connections/pending")
async def get_pending_openers(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get openers waiting for your response"""
    
    connections = await db["connections"].find({
        "user2_id": current_user_id,
        "status": ConnectionStatus.PENDING
    }).sort("created_at", -1).to_list(length=50)
    
    formatted = []
    for conn in connections:
        formatted.append({
            "connection_id": str(conn["_id"]),
            "anonymous_name": conn["user1_anonymous_name"],
            "opening_message": conn["opening_message"],
            "created_at": conn["created_at"],
            "time_ago": get_time_ago(conn["created_at"])
        })
    
    return {"pending_openers": formatted}


@router.post("/connections/{connection_id}/accept")
async def accept_opener(
    connection_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Accept an opening message and start chatting"""
    
    result = await db["connections"].update_one(
        {
            "_id": ObjectId(connection_id),
            "user2_id": current_user_id,
            "status": ConnectionStatus.PENDING
        },
        {
            "$set": {
                "status": ConnectionStatus.ACTIVE,
                "last_message_at": datetime.utcnow()
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(404, "Opener not found")
    
    return {"message": "Connection accepted"}


@router.post("/connections/{connection_id}/decline")
async def decline_opener(
    connection_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Decline an opening message"""
    
    result = await db["connections"].update_one(
        {
            "_id": ObjectId(connection_id),
            "user2_id": current_user_id,
            "status": ConnectionStatus.PENDING
        },
        {"$set": {"status": ConnectionStatus.ARCHIVED}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(404, "Opener not found")
    
    return {"message": "Connection declined"}


@router.get("/connections")
async def get_active_connections(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get all active connections"""
    
    connections = await db["connections"].find({
        "$or": [
            {"user1_id": current_user_id},
            {"user2_id": current_user_id}
        ],
        "status": ConnectionStatus.ACTIVE
    }).sort("last_message_at", -1).to_list(length=100)
    
    formatted = []
    for conn in connections:
        # Determine which user is "other"
        is_user1 = conn["user1_id"] == current_user_id
        other_anonymous_name = conn["user2_anonymous_name"] if is_user1 else conn["user1_anonymous_name"]
        
        # Get last message
        last_message = await db["messages"].find_one(
            {"connection_id": str(conn["_id"])},
            sort=[("created_at", -1)]
        )
        
        # Get unread count
        unread_count = await db["messages"].count_documents({
            "connection_id": str(conn["_id"]),
            "sender_id": {"$ne": current_user_id},
            "is_read": False
        })
        
        formatted.append({
            "connection_id": str(conn["_id"]),
            "anonymous_name": other_anonymous_name,
            "last_message": last_message["content"] if last_message else conn["opening_message"],
            "last_message_at": conn.get("last_message_at", conn["created_at"]),
            "time_ago": get_time_ago(conn.get("last_message_at", conn["created_at"])),
            "unread_count": unread_count,
            "message_count": conn.get("message_count", 0),
            "days_active": conn.get("days_active", 0),
            "reveal_eligible": conn.get("reveal_eligible", False),
            "user1_revealed": conn.get("user1_revealed", False),
            "user2_revealed": conn.get("user2_revealed", False),
            "is_revealed": (conn.get("user1_revealed") and conn.get("user2_revealed"))
        })
    
    return {"connections": formatted}


@router.get("/connections/{connection_id}")
async def get_connection_details(
    connection_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get detailed info about a connection"""
    
    connection = await db["connections"].find_one({"_id": ObjectId(connection_id)})
    
    if not connection:
        raise HTTPException(404, "Connection not found")
    
    # Verify user is part of this connection
    if connection["user1_id"] != current_user_id and connection["user2_id"] != current_user_id:
        raise HTTPException(403, "Access denied")
    
    is_user1 = connection["user1_id"] == current_user_id
    
    # Basic info
    response = {
        "connection_id": str(connection["_id"]),
        "anonymous_name": connection["user2_anonymous_name"] if is_user1 else connection["user1_anonymous_name"],
        "status": connection["status"],
        "created_at": connection["created_at"],
        "message_count": connection.get("message_count", 0),
        "days_active": connection.get("days_active", 0),
        "reveal_eligible": connection.get("reveal_eligible", False)
    }
    
    # If revealed, show real identity
    other_user_revealed = connection.get("user2_revealed") if is_user1 else connection.get("user1_revealed")
    
    if other_user_revealed:
        other_user_id = connection["user2_id"] if is_user1 else connection["user1_id"]
        other_user = await db["users"].find_one({"_id": ObjectId(other_user_id)})
        
        if other_user:
            response["revealed_identity"] = {
                "name": other_user.get("username"),
                "age": other_user.get("age"),
                "city": other_user.get("city"),
                "avatar_url": other_user.get("avatar_url")
            }
    
    return response


# ==================== MESSAGES ====================

@router.post("/messages")
async def send_message(
    request: SendMessageRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Send a message in a connection"""
    
    connection = await db["connections"].find_one({"_id": ObjectId(request.connection_id)})
    
    if not connection:
        raise HTTPException(404, "Connection not found")
    
    # Verify user is part of connection
    if connection["user1_id"] != current_user_id and connection["user2_id"] != current_user_id:
        raise HTTPException(403, "Access denied")
    
    # Check if connection is active
    if connection["status"] != ConnectionStatus.ACTIVE:
        raise HTTPException(400, "Cannot send message to inactive connection")
    
    # Create message
    message = {
        "connection_id": request.connection_id,
        "sender_id": current_user_id,
        "content": request.content,
        "created_at": datetime.utcnow(),
        "is_read": False
    }
    
    result = await db["messages"].insert_one(message)
    
    # Update connection
    message_count = connection.get("message_count", 0) + 1
    days_active = (datetime.utcnow() - connection["created_at"]).days
    
    # Check if reveal eligible (2 weeks + 100 messages)
    reveal_eligible = days_active >= 14 and message_count >= 100
    
    await db["connections"].update_one(
        {"_id": ObjectId(request.connection_id)},
        {
            "$set": {
                "last_message_at": datetime.utcnow(),
                "message_count": message_count,
                "days_active": days_active,
                "reveal_eligible": reveal_eligible
            }
        }
    )
    
    message["_id"] = str(result.inserted_id)
    
    return {
        "message": message,
        "reveal_eligible": reveal_eligible
    }


@router.get("/connections/{connection_id}/messages")
async def get_messages(
    connection_id: str,
    skip: int = 0,
    limit: int = 50,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get messages in a connection"""
    
    connection = await db["connections"].find_one({"_id": ObjectId(connection_id)})
    
    if not connection:
        raise HTTPException(404, "Connection not found")
    
    # Verify access
    if connection["user1_id"] != current_user_id and connection["user2_id"] != current_user_id:
        raise HTTPException(403, "Access denied")
    
    # Get messages
    messages = await db["messages"].find(
        {"connection_id": connection_id}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(length=limit)
    
    messages.reverse()  # Oldest first
    
    # Mark as read
    await db["messages"].update_many(
        {
            "connection_id": connection_id,
            "sender_id": {"$ne": current_user_id},
            "is_read": False
        },
        {"$set": {"is_read": True}}
    )
    
    formatted = []
    for msg in messages:
        formatted.append({
            "id": str(msg["_id"]),
            "content": msg["content"],
            "is_mine": msg["sender_id"] == current_user_id,
            "created_at": msg["created_at"],
            "time_ago": get_time_ago(msg["created_at"])
        })
    
    return {
        "messages": formatted,
        "has_more": len(messages) == limit
    }


# ==================== UTILITY FUNCTIONS ====================

def get_time_ago(dt: datetime) -> str:
    """Convert datetime to 'time ago' string"""
    now = datetime.utcnow()
    diff = now - dt
    
    seconds = diff.total_seconds()
    
    if seconds < 60:
        return "just now"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        return f"{minutes}m ago"
    elif seconds < 86400:
        hours = int(seconds / 3600)
        return f"{hours}h ago"
    elif seconds < 604800:
        days = int(seconds / 86400)
        return f"{days}d ago"
    else:
        weeks = int(seconds / 604800)
        return f"{weeks}w ago"