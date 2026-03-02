"""
app/api/v1/connect.py
Connect/Traces system - Anonymous connections via broadcasts
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from enum import Enum

from app.database import get_database
from app.dependencies import get_current_user_id

router = APIRouter(prefix="/connect", tags=["Connect/Traces"])


# ==================== ENUMS ====================

class VibeTags(str, Enum):
    FRIENDSHIP = "friendship"
    SUPPORT = "support"
    DATING = "dating"
    WORKOUT = "workout"
    STUDY = "study"
    CREATIVE = "creative"
    GAMING = "gaming"
    COFFEE = "coffee"
    ADVICE = "advice"
    CHAT = "chat"


class ConnectionStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    EXPIRED = "expired"
    BLOCKED = "blocked"
    PREMIUM = "premium"  # Unlocked for $2


class AvatarAura(str, Enum):
    PURPLE_GLOW = "purple_glow"
    RED_SHADOW = "red_shadow"
    GREEN_MIST = "green_mist"
    BLUE_VOID = "blue_void"
    DARK_PHANTOM = "dark_phantom"
    CORAL_FLAME = "coral_flame"


# ==================== REQUEST MODELS ====================

class CreateBroadcastRequest(BaseModel):
    message: str
    vibe_tags: List[VibeTags] = []


class SendOpenerRequest(BaseModel):
    broadcast_id: str
    message: str


class SendMessageRequest(BaseModel):
    connection_id: str
    content: str


class InitiateRevealRequest(BaseModel):
    connection_id: str


class RespondRevealRequest(BaseModel):
    reveal_id: str
    accept: bool


class BlockUserRequest(BaseModel):
    connection_id: str
    reason: Optional[str] = None


# ==================== HELPER FUNCTIONS ====================

async def reset_daily_traces_if_needed(user_id: str, db):
    """Reset daily trace tokens at midnight"""
    user = await db["users"].find_one({"_id": ObjectId(user_id)})

    if not user:
        return

    last_reset = user.get("last_trace_reset", datetime.now(timezone.utc))
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    # If last reset was before today, reset tokens
    if last_reset < today_start:
        await db["users"].update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {
                    "daily_traces_remaining": 5,  # Reset to 5
                    "last_trace_reset": datetime.now(timezone.utc)
                }
            }
        )
        print(f"✅ Reset daily traces for user {user_id}")


async def get_user_hints(user_id: str, db) -> dict:
    """Get user's public hints (interests, city, age_range, vibe)"""
    user = await db["users"].find_one({"_id": ObjectId(user_id)})

    if not user:
        return {}

    return {
        "avatar_aura": user.get("avatar_aura", AvatarAura.PURPLE_GLOW),
        "interests": user.get("interests", [])[:3],  # Max 3
        "city": user.get("city"),
        "age_range": user.get("age_range"),
        "vibe": user.get("vibe")
    }


def calculate_trending_score(broadcast: dict) -> float:
    """Calculate trending score for Hot Traces"""
    clicks = broadcast.get("click_count", 0)
    openers = broadcast.get("pending_openers", 0)

    # Time decay (newer = higher score)
    hours_old = (datetime.now(timezone.utc) - broadcast["created_at"]).total_seconds() / 3600
    recency_factor = max(0, 1 - (hours_old / 24))  # Decay over 24 hours

    score = (clicks * 2 + openers * 5) * recency_factor
    return score


# ==================== BROADCASTS (PUBLIC TRACES) ====================

@router.post("/broadcasts")
async def create_broadcast(
    data: CreateBroadcastRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """
    Create a public broadcast/trace
    "I need a friend to hang out with" → shareable link
    """
    print(f"🔵 Creating broadcast for user {current_user_id}")

    # Reset daily tokens if needed
    await reset_daily_traces_if_needed(current_user_id, db)

    # Check daily limit
    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    traces_remaining = user.get("daily_traces_remaining", 5)

    if traces_remaining <= 0:
        raise HTTPException(
            status_code=400,
            detail="Daily trace limit reached (5 per day). Resets at midnight."
        )

    # Check if user already has active broadcast
    existing = await db["broadcasts"].find_one({
        "user_id": current_user_id,
        "is_active": True
    })

    if existing:
        raise HTTPException(
            status_code=400,
            detail="You already have an active broadcast. Deactivate it first."
        )

    # Get user hints
    hints = await get_user_hints(current_user_id, db)

    # Create broadcast
    broadcast = {
        "_id": ObjectId(),
        "user_id": current_user_id,
        "message": data.message,
        "vibe_tags": [tag.value for tag in data.vibe_tags],
        "hints": hints,  # Anonymous hints shown to viewers
        "click_count": 0,
        "pending_openers": 0,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7)  # 7 days
    }

    await db["broadcasts"].insert_one(broadcast)

    # Deduct 1 trace token
    await db["users"].update_one(
        {"_id": ObjectId(current_user_id)},
        {"$inc": {"daily_traces_remaining": -1}}
    )

    print(f"✅ Broadcast created: {broadcast['_id']}")

    return {
        "id": str(broadcast["_id"]),
        "message": "Broadcast created! Share the link.",
        "traces_remaining": traces_remaining - 1
    }


@router.get("/broadcasts")
async def get_broadcasts(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
    vibe_tags: Optional[str] = None,  # Comma-separated
    current_user_id: Optional[str] = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """
    Get public broadcasts (Hot Traces feed)
    Sorted by trending score
    """
    query = {
        "is_active": True,
        "expires_at": {"$gt": datetime.now(timezone.utc)}
    }

    # Filter by vibe tags
    if vibe_tags:
        tags = vibe_tags.split(",")
        query["vibe_tags"] = {"$in": tags}

    # Exclude own broadcasts
    if current_user_id:
        query["user_id"] = {"$ne": current_user_id}

    broadcasts = await db["broadcasts"].find(query).to_list(None)

    # Calculate trending scores and sort
    for broadcast in broadcasts:
        broadcast["trending_score"] = calculate_trending_score(broadcast)

    broadcasts.sort(key=lambda x: x["trending_score"], reverse=True)

    # Paginate
    broadcasts = broadcasts[skip:skip + limit]

    result = []
    for b in broadcasts:
        result.append({
            "id": str(b["_id"]),
            "message": b["message"],
            "vibe_tags": b.get("vibe_tags", []),
            "hints": b.get("hints", {}),
            "click_count": b.get("click_count", 0),
            "pending_openers": b.get("pending_openers", 0),
            "trending_score": b["trending_score"],
            "created_at": b["created_at"].isoformat()
        })

    return {"broadcasts": result}


@router.get("/broadcasts/my-active")
async def get_my_active_broadcast(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get user's active broadcast"""
    broadcast = await db["broadcasts"].find_one({
        "user_id": current_user_id,
        "is_active": True
    })

    if not broadcast:
        return {"broadcast": None}

    return {
        "broadcast": {
            "id": str(broadcast["_id"]),
            "message": broadcast["message"],
            "vibe_tags": broadcast.get("vibe_tags", []),
            "click_count": broadcast.get("click_count", 0),
            "pending_openers": broadcast.get("pending_openers", 0),
            "created_at": broadcast["created_at"].isoformat(),
            "expires_at": broadcast["expires_at"].isoformat()
        }
    }


@router.delete("/broadcasts/{broadcast_id}")
async def deactivate_broadcast(
    broadcast_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Deactivate (delete) a broadcast"""
    try:
        broadcast = await db["broadcasts"].find_one({"_id": ObjectId(broadcast_id)})
    except:
        broadcast = await db["broadcasts"].find_one({"_id": broadcast_id})

    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    if broadcast["user_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not your broadcast")

    await db["broadcasts"].update_one(
        {"_id": broadcast["_id"]},
        {"$set": {"is_active": False}}
    )

    return {"message": "Broadcast deactivated"}


# ==================== OPENERS (TRACE REQUESTS) ====================

@router.post("/openers")
async def send_opener(
    data: SendOpenerRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """
    Send an opener to a broadcast
    This creates a pending connection
    """
    print(f"🔵 Sending opener to broadcast {data.broadcast_id}")

    # Reset daily tokens if needed
    await reset_daily_traces_if_needed(current_user_id, db)

    # Check daily limit
    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    traces_remaining = user.get("daily_traces_remaining", 5)

    if traces_remaining <= 0:
        raise HTTPException(
            status_code=400,
            detail="Daily trace limit reached (5 per day). Resets at midnight."
        )

    # Get broadcast
    try:
        broadcast = await db["broadcasts"].find_one({"_id": ObjectId(data.broadcast_id)})
    except:
        broadcast = await db["broadcasts"].find_one({"_id": data.broadcast_id})

    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    if not broadcast.get("is_active"):
        raise HTTPException(status_code=400, detail="Broadcast is no longer active")

    # Can't send opener to own broadcast
    if broadcast["user_id"] == current_user_id:
        raise HTTPException(status_code=400, detail="Can't send opener to your own broadcast")

    # Check if already sent opener to this broadcast
    existing = await db["connections"].find_one({
        "broadcast_id": data.broadcast_id,
        "opener_user_id": current_user_id
    })

    if existing:
        raise HTTPException(status_code=400, detail="Already sent opener to this broadcast")

    # Get sender hints
    sender_hints = await get_user_hints(current_user_id, db)

    # Create connection (pending)
    connection = {
        "_id": ObjectId(),
        "broadcast_id": data.broadcast_id,
        "broadcast_user_id": broadcast["user_id"],  # Who posted broadcast
        "opener_user_id": current_user_id,  # Who sent opener
        "opener_message": data.message,
        "opener_hints": sender_hints,  # Hints shown to broadcast owner
        "status": ConnectionStatus.PENDING,
        "message_count": 0,
        "message_limit": 50,  # Free tier limit
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7)  # 7 days from creation
    }

    await db["connections"].insert_one(connection)

    # Increment broadcast stats
    await db["broadcasts"].update_one(
        {"_id": broadcast["_id"]},
        {
            "$inc": {
                "click_count": 1,
                "pending_openers": 1
            }
        }
    )

    # Deduct 1 trace token
    await db["users"].update_one(
        {"_id": ObjectId(current_user_id)},
        {"$inc": {"daily_traces_remaining": -1}}
    )

    print(f"✅ Opener sent, connection created: {connection['_id']}")

    # TODO: Send push notification to broadcast owner

    return {
        "message": "Opener sent! Waiting for them to accept.",
        "traces_remaining": traces_remaining - 1
    }


# ==================== CONNECTIONS ====================

@router.get("/connections/pending")
async def get_pending_openers(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get openers sent to my broadcasts (inbox)"""
    pending = await db["connections"].find({
        "broadcast_user_id": current_user_id,
        "status": ConnectionStatus.PENDING,
        "expires_at": {"$gt": datetime.now(timezone.utc)}
    }).sort("created_at", -1).to_list(None)

    result = []
    for conn in pending:
        # Get broadcast info
        try:
            broadcast = await db["broadcasts"].find_one({"_id": ObjectId(conn["broadcast_id"])})
        except:
            broadcast = await db["broadcasts"].find_one({"_id": conn["broadcast_id"]})

        result.append({
            "id": str(conn["_id"]),
            "opener_message": conn["opener_message"],
            "opener_hints": conn.get("opener_hints", {}),
            "broadcast_message": broadcast["message"] if broadcast else "...",
            "created_at": conn["created_at"].isoformat(),
            "expires_at": conn["expires_at"].isoformat()
        })

    return {"pending_openers": result}


@router.post("/connections/{connection_id}/accept")
async def accept_opener(
    connection_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Accept an opener → activates connection"""
    try:
        conn = await db["connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        conn = await db["connections"].find_one({"_id": connection_id})

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if conn["broadcast_user_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not your connection")

    if conn["status"] != ConnectionStatus.PENDING:
        raise HTTPException(status_code=400, detail="Connection not pending")

    # Activate connection
    await db["connections"].update_one(
        {"_id": conn["_id"]},
        {
            "$set": {
                "status": ConnectionStatus.ACTIVE,
                "accepted_at": datetime.now(timezone.utc)
            }
        }
    )

    # Decrement pending count on broadcast
    await db["broadcasts"].update_one(
        {"_id": ObjectId(conn["broadcast_id"])},
        {"$inc": {"pending_openers": -1}}
    )

    print(f"✅ Connection accepted: {connection_id}")

    # TODO: Send push notification to opener

    return {"message": "Connection accepted! Start chatting."}


@router.post("/connections/{connection_id}/decline")
async def decline_opener(
    connection_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Decline an opener"""
    try:
        conn = await db["connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        conn = await db["connections"].find_one({"_id": connection_id})

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if conn["broadcast_user_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not your connection")

    # Delete connection
    await db["connections"].delete_one({"_id": conn["_id"]})

    # Decrement pending count
    await db["broadcasts"].update_one(
        {"_id": ObjectId(conn["broadcast_id"])},
        {"$inc": {"pending_openers": -1}}
    )

    return {"message": "Opener declined"}


@router.get("/connections")
async def get_connections(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get all active connections"""
    connections = await db["connections"].find({
        "$or": [
            {"broadcast_user_id": current_user_id},
            {"opener_user_id": current_user_id}
        ],
        "status": {"$in": [ConnectionStatus.ACTIVE, ConnectionStatus.PREMIUM]},
        "expires_at": {"$gt": datetime.now(timezone.utc)}
    }).sort("created_at", -1).to_list(None)

    result = []
    for conn in connections:
        # Get last message
        last_msg = await db["connection_messages"].find_one(
            {"connection_id": str(conn["_id"])},
            sort=[("created_at", -1)]
        )

        # Get unread count
        unread = await db["connection_messages"].count_documents({
            "connection_id": str(conn["_id"]),
            "sender_id": {"$ne": current_user_id},
            "is_read": False
        })

        # Determine if user is broadcast owner or opener
        is_broadcast_owner = conn["broadcast_user_id"] == current_user_id

        result.append({
            "id": str(conn["_id"]),
            "status": conn["status"],
            "message_count": conn.get("message_count", 0),
            "message_limit": conn.get("message_limit", 50),
            "is_premium": conn["status"] == ConnectionStatus.PREMIUM,
            "is_broadcast_owner": is_broadcast_owner,
            "other_user_hints": conn.get("opener_hints" if is_broadcast_owner else "broadcast_hints", {}),
            "last_message": last_msg["content"][:50] if last_msg else None,
            "last_message_at": last_msg["created_at"].isoformat() if last_msg else None,
            "unread_count": unread,
            "expires_at": conn["expires_at"].isoformat(),
            "created_at": conn["created_at"].isoformat()
        })

    return {"connections": result}


@router.get("/connections/{connection_id}")
async def get_connection_details(
    connection_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get connection details"""
    try:
        conn = await db["connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        conn = await db["connections"].find_one({"_id": connection_id})

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if current_user_id not in [conn["broadcast_user_id"], conn["opener_user_id"]]:
        raise HTTPException(status_code=403, detail="Not your connection")

    is_broadcast_owner = conn["broadcast_user_id"] == current_user_id

    return {
        "id": str(conn["_id"]),
        "status": conn["status"],
        "message_count": conn.get("message_count", 0),
        "message_limit": conn.get("message_limit", 50),
        "is_premium": conn["status"] == ConnectionStatus.PREMIUM,
        "is_broadcast_owner": is_broadcast_owner,
        "expires_at": conn["expires_at"].isoformat(),
        "created_at": conn["created_at"].isoformat()
    }


# ==================== MESSAGES ====================

@router.post("/messages")
async def send_message(
    data: SendMessageRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Send message in a connection"""
    try:
        conn = await db["connections"].find_one({"_id": ObjectId(data.connection_id)})
    except:
        conn = await db["connections"].find_one({"_id": data.connection_id})

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if current_user_id not in [conn["broadcast_user_id"], conn["opener_user_id"]]:
        raise HTTPException(status_code=403, detail="Not your connection")

    # Check if expired
    if datetime.now(timezone.utc) > conn["expires_at"]:
        raise HTTPException(status_code=400, detail="Connection expired. Unlock premium to continue.")

    # ✅ RECIPIENT PRIVILEGE: Broadcast owner gets unlimited messages
    is_broadcast_owner = conn["broadcast_user_id"] == current_user_id
    is_premium = conn["status"] == ConnectionStatus.PREMIUM

    if not is_broadcast_owner and not is_premium:
        # Check message limit for opener (non-broadcast owner)
        if conn.get("message_count", 0) >= conn.get("message_limit", 50):
            raise HTTPException(
                status_code=400,
                detail="Message limit reached (50 free messages). Unlock premium for $2."
            )

    # Create message
    message = {
        "_id": ObjectId(),
        "connection_id": data.connection_id,
        "sender_id": current_user_id,
        "content": data.content,
        "is_read": False,
        "created_at": datetime.now(timezone.utc)
    }

    await db["connection_messages"].insert_one(message)

    # Increment message count
    await db["connections"].update_one(
        {"_id": conn["_id"]},
        {"$inc": {"message_count": 1}}
    )

    print(f"✅ Message sent in connection {data.connection_id}")

    # TODO: Send push notification to other user

    return {
        "id": str(message["_id"]),
        "message": "Message sent",
        "messages_remaining": None if (is_broadcast_owner or is_premium) else (50 - conn.get("message_count", 0) - 1)
    }


@router.get("/connections/{connection_id}/messages")
async def get_messages(
    connection_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get messages in a connection"""
    try:
        conn = await db["connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        conn = await db["connections"].find_one({"_id": connection_id})

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if current_user_id not in [conn["broadcast_user_id"], conn["opener_user_id"]]:
        raise HTTPException(status_code=403, detail="Not your connection")

    # Get messages
    messages = await db["connection_messages"].find({
        "connection_id": connection_id
    }).sort("created_at", 1).skip(skip).limit(limit).to_list(None)

    result = []
    for msg in messages:
        result.append({
            "id": str(msg["_id"]),
            "content": msg["content"],
            "is_own": msg["sender_id"] == current_user_id,
            "is_read": msg.get("is_read", False),
            "created_at": msg["created_at"].isoformat()
        })

    # Mark messages as read
    await db["connection_messages"].update_many(
        {
            "connection_id": connection_id,
            "sender_id": {"$ne": current_user_id},
            "is_read": False
        },
        {"$set": {"is_read": True}}
    )

    return {
        "messages": result,
        "connection": {
            "status": conn["status"],
            "message_count": conn.get("message_count", 0),
            "message_limit": conn.get("message_limit", 50),
            "is_premium": conn["status"] == ConnectionStatus.PREMIUM,
            "expires_at": conn["expires_at"].isoformat()
        }
    }


# ==================== REVEAL ====================

@router.post("/reveal/initiate")
async def initiate_reveal(
    data: InitiateRevealRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Initiate identity reveal"""
    try:
        conn = await db["connections"].find_one({"_id": ObjectId(data.connection_id)})
    except:
        conn = await db["connections"].find_one({"_id": data.connection_id})

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if current_user_id not in [conn["broadcast_user_id"], conn["opener_user_id"]]:
        raise HTTPException(status_code=403, detail="Not your connection")

    # Must be premium to reveal
    if conn["status"] != ConnectionStatus.PREMIUM:
        raise HTTPException(
            status_code=400,
            detail="Unlock premium ($2) to reveal identities"
        )

    # Check if already revealed
    existing = await db["reveals"].find_one({
        "connection_id": data.connection_id,
        "status": {"$in": ["pending", "accepted"]}
    })

    if existing:
        raise HTTPException(status_code=400, detail="Reveal already initiated")

    # Create reveal request
    reveal = {
        "_id": ObjectId(),
        "connection_id": data.connection_id,
        "initiator_id": current_user_id,
        "other_user_id": conn["opener_user_id"] if current_user_id == conn["broadcast_user_id"] else conn["broadcast_user_id"],
        "status": "pending",
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=24)  # 24h to respond
    }

    await db["reveals"].insert_one(reveal)

    print(f"✅ Reveal initiated: {reveal['_id']}")

    # TODO: Send push notification to other user

    return {
        "reveal_id": str(reveal["_id"]),
        "message": "Reveal request sent. Waiting for their response."
    }


@router.post("/reveal/cancel/{reveal_id}")
async def cancel_reveal(
    reveal_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Cancel reveal request"""
    try:
        reveal = await db["reveals"].find_one({"_id": ObjectId(reveal_id)})
    except:
        reveal = await db["reveals"].find_one({"_id": reveal_id})

    if not reveal:
        raise HTTPException(status_code=404, detail="Reveal not found")

    if reveal["initiator_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not your reveal")

    await db["reveals"].update_one(
        {"_id": reveal["_id"]},
        {"$set": {"status": "cancelled"}}
    )

    return {"message": "Reveal cancelled"}


@router.get("/reveal/pending")
async def get_pending_reveals(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get reveals waiting for my response"""
    reveals = await db["reveals"].find({
        "other_user_id": current_user_id,
        "status": "pending",
        "expires_at": {"$gt": datetime.now(timezone.utc)}
    }).to_list(None)

    result = []
    for reveal in reveals:
        # Get connection
        try:
            conn = await db["connections"].find_one({"_id": ObjectId(reveal["connection_id"])})
        except:
            conn = await db["connections"].find_one({"_id": reveal["connection_id"]})

        result.append({
            "reveal_id": str(reveal["_id"]),
            "connection_id": str(reveal["connection_id"]),
            "created_at": reveal["created_at"].isoformat(),
            "expires_at": reveal["expires_at"].isoformat()
        })

    return {"pending_reveals": result}


@router.post("/reveal/respond")
async def respond_to_reveal(
    data: RespondRevealRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Respond to reveal request (accept/decline)"""
    try:
        reveal = await db["reveals"].find_one({"_id": ObjectId(data.reveal_id)})
    except:
        reveal = await db["reveals"].find_one({"_id": data.reveal_id})

    if not reveal:
        raise HTTPException(status_code=404, detail="Reveal not found")

    if reveal["other_user_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not your reveal to respond to")

    if reveal["status"] != "pending":
        raise HTTPException(status_code=400, detail="Reveal already processed")

    if data.accept:
        # Accept reveal - get both user profiles
        user1 = await db["users"].find_one({"_id": ObjectId(reveal["initiator_id"])})
        user2 = await db["users"].find_one({"_id": ObjectId(current_user_id)})

        await db["reveals"].update_one(
            {"_id": reveal["_id"]},
            {
                "$set": {
                    "status": "accepted",
                    "accepted_at": datetime.now(timezone.utc),
                    "user1_info": {
                        "username": user1.get("username"),
                        "email": user1.get("email"),
                        "avatar_url": user1.get("avatar_url")
                    },
                    "user2_info": {
                        "username": user2.get("username"),
                        "email": user2.get("email"),
                        "avatar_url": user2.get("avatar_url")
                    }
                }
            }
        )

        return {
            "message": "Identities revealed!",
            "other_user": {
                "username": user1.get("username"),
                "email": user1.get("email"),
                "avatar_url": user1.get("avatar_url")
            }
        }
    else:
        # Decline reveal
        await db["reveals"].update_one(
            {"_id": reveal["_id"]},
            {"$set": {"status": "declined"}}
        )

        return {"message": "Reveal declined. You remain anonymous."}


# ==================== BLOCKING ====================

@router.post("/block")
async def block_user(
    data: BlockUserRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Block a user via connection"""
    try:
        conn = await db["connections"].find_one({"_id": ObjectId(data.connection_id)})
    except:
        conn = await db["connections"].find_one({"_id": data.connection_id})

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if current_user_id not in [conn["broadcast_user_id"], conn["opener_user_id"]]:
        raise HTTPException(status_code=403, detail="Not your connection")

    # Block connection
    await db["connections"].update_one(
        {"_id": conn["_id"]},
        {"$set": {"status": ConnectionStatus.BLOCKED}}
    )

    # Record block
    other_user_id = conn["opener_user_id"] if current_user_id == conn["broadcast_user_id"] else conn["broadcast_user_id"]

    await db["blocks"].insert_one({
        "_id": ObjectId(),
        "blocker_id": current_user_id,
        "blocked_id": other_user_id,
        "connection_id": data.connection_id,
        "reason": data.reason,
        "created_at": datetime.now(timezone.utc)
    })

    return {"message": "User blocked"}


# ==================== DAILY TOKENS ====================

@router.get("/tokens/remaining")
async def get_remaining_tokens(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get remaining daily trace tokens"""
    await reset_daily_traces_if_needed(current_user_id, db)

    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})

    return {
        "traces_remaining": user.get("daily_traces_remaining", 5),
        "resets_in_hours": 24 - datetime.now(timezone.utc).hour
    }
