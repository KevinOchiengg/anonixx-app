"""
app/api/v1/connect.py
Anonymous Connection System
Flow: Feed → Tap profile → View anonymous profile → Send connect request → Chat → Reveal
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from enum import Enum

from app.database import get_database
from app.dependencies import get_current_user_id
from app.utils.notifications import send_push_notification

router = APIRouter(prefix="/connect", tags=["Connect"])


# ==================== ENUMS ====================

class RequestStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    BLOCKED = "blocked"

class ChatStatus(str, Enum):
    ACTIVE = "active"
    UNLOCKED = "unlocked"   # paid $2
    BLOCKED = "blocked"

class RevealStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    CANCELLED = "cancelled"


# ==================== REQUEST MODELS ====================

class SendConnectRequest(BaseModel):
    to_anonymous_name: str      # The anonymous name shown on the confession card

class SendMessageRequest(BaseModel):
    chat_id: str
    content: str

class RevealResponseRequest(BaseModel):
    reveal_id: str
    accept: bool

class BlockRequest(BaseModel):
    chat_id: str
    reason: Optional[str] = None

class UpdateVibesRequest(BaseModel):
    vibe_tags: List[str]        # Max 3


# ==================== HELPERS ====================

FREE_MESSAGE_LIMIT = 10

async def get_user_by_anonymous_name(anonymous_name: str, db):
    """Look up a user by their anonymous_name"""
    return await db["users"].find_one({"anonymous_name": anonymous_name})

async def get_chat_participant_ids(chat: dict) -> tuple:
    """Returns (from_user_id, to_user_id)"""
    return chat["from_user_id"], chat["to_user_id"]

def is_participant(chat: dict, user_id: str) -> bool:
    return user_id in [chat["from_user_id"], chat["to_user_id"]]

def other_participant(chat: dict, user_id: str) -> str:
    return chat["to_user_id"] if chat["from_user_id"] == user_id else chat["from_user_id"]


# ==================== ANONYMOUS PROFILE ====================

@router.get("/profile/{anonymous_name}")
async def get_anonymous_profile(
    anonymous_name: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """
    Get a user's anonymous profile.
    Shown when tapping a name/avatar on the feed.
    Returns only non-identifying info.
    """
    user = await get_user_by_anonymous_name(anonymous_name, db)

    if not user:
        raise HTTPException(status_code=404, detail="Profile not found")

    target_id = str(user["_id"])

    # Can't view own profile this way
    if target_id == current_user_id:
        raise HTTPException(status_code=400, detail="This is your own profile")

    # Get confession count
    confession_count = await db["posts"].count_documents({
        "user_id": target_id,
        "post_type": {"$ne": "response"}
    })

    # Check connect status between these two users
    connect_status = None
    chat_id = None

    # Check if pending request exists (either direction)
    pending = await db["connect_requests"].find_one({
        "$or": [
            {"from_user_id": current_user_id, "to_user_id": target_id},
            {"from_user_id": target_id, "to_user_id": current_user_id}
        ],
        "status": RequestStatus.PENDING
    })

    if pending:
        connect_status = "pending"
    else:
        # Check if active chat exists
        chat = await db["connect_chats"].find_one({
            "$or": [
                {"from_user_id": current_user_id, "to_user_id": target_id},
                {"from_user_id": target_id, "to_user_id": current_user_id}
            ],
            "status": {"$in": [ChatStatus.ACTIVE, ChatStatus.UNLOCKED]}
        })
        if chat:
            connect_status = "chatting"
            chat_id = str(chat["_id"])

    # Join date — month + year only
    created_at = user.get("created_at", datetime.now(timezone.utc))
    join_date = created_at.strftime("%B %Y")

    return {
        "anonymous_name": user["anonymous_name"],
        "avatar": user.get("avatar", "ghost"),
        "avatar_color": user.get("avatar_color", "#FF634A"),
        "avatar_aura": user.get("avatar_aura", "purple_glow"),
        "vibe_tags": user.get("vibe_tags", [])[:3],
        "confession_count": confession_count,
        "join_date": join_date,
        "connect_status": connect_status,   # null | "pending" | "chatting"
        "chat_id": chat_id,                 # set if already chatting
        "gender": user.get("gender"),       # male | female | nonbinary | prefer_not_to_say | null
    }


# ==================== VIBE TAGS ====================

VALID_VIBE_TAGS = [
    "carries a lot", "dark humor", "night owl", "been through it",
    "overthinker", "healing slowly", "blunt", "soft inside",
    "loud silence", "complicated", "lost", "still standing",
    "open book", "hard to reach", "always listening"
]

@router.get("/vibes/options")
async def get_vibe_options():
    """Get all available vibe tags for onboarding/settings"""
    return {"vibe_tags": VALID_VIBE_TAGS}

@router.put("/vibes")
async def update_vibe_tags(
    data: UpdateVibesRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Update user's vibe tags (max 3)"""
    # Validate
    invalid = [t for t in data.vibe_tags if t not in VALID_VIBE_TAGS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid vibe tags: {invalid}")

    if len(data.vibe_tags) > 3:
        raise HTTPException(status_code=400, detail="Maximum 3 vibe tags allowed")

    await db["users"].update_one(
        {"_id": ObjectId(current_user_id)},
        {"$set": {"vibe_tags": data.vibe_tags}}
    )

    return {"message": "Vibe tags updated", "vibe_tags": data.vibe_tags}


# ==================== CONNECT REQUESTS ====================

@router.post("/request")
async def send_connect_request(
    data: SendConnectRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """
    Send a connect request to a user by their anonymous name.
    Triggered from the anonymous profile bottom sheet.
    """
    # Look up target user
    target = await get_user_by_anonymous_name(data.to_anonymous_name, db)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target_id = str(target["_id"])

    if target_id == current_user_id:
        raise HTTPException(status_code=400, detail="Can't connect with yourself")

    # Check if blocked
    blocked = await db["connect_blocks"].find_one({
        "$or": [
            {"blocker_id": current_user_id, "blocked_id": target_id},
            {"blocker_id": target_id, "blocked_id": current_user_id}
        ]
    })
    if blocked:
        raise HTTPException(status_code=403, detail="Unable to connect with this user")

    # Check if request already exists (either direction, any status)
    existing_request = await db["connect_requests"].find_one({
        "$or": [
            {"from_user_id": current_user_id, "to_user_id": target_id},
            {"from_user_id": target_id, "to_user_id": current_user_id}
        ],
        "status": RequestStatus.PENDING
    })
    if existing_request:
        raise HTTPException(status_code=400, detail="Connect request already pending")

    # Check if already chatting
    existing_chat = await db["connect_chats"].find_one({
        "$or": [
            {"from_user_id": current_user_id, "to_user_id": target_id},
            {"from_user_id": target_id, "to_user_id": current_user_id}
        ],
        "status": {"$in": [ChatStatus.ACTIVE, ChatStatus.UNLOCKED]}
    })
    if existing_chat:
        raise HTTPException(status_code=400, detail="Already connected with this user")

    # Get sender's anonymous name
    sender = await db["users"].find_one({"_id": ObjectId(current_user_id)})

    # Create request
    request = {
        "_id": ObjectId(),
        "from_user_id": current_user_id,
        "from_anonymous_name": sender.get("anonymous_name", "Anonymous"),
        "from_avatar": sender.get("avatar", "ghost"),
        "from_avatar_color": sender.get("avatar_color", "#FF634A"),
        "from_vibe_tags": sender.get("vibe_tags", [])[:3],
        "to_user_id": target_id,
        "to_anonymous_name": data.to_anonymous_name,
        "status": RequestStatus.PENDING,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7)
    }

    await db["connect_requests"].insert_one(request)

    # Notify target
    await send_push_notification(
        user_id=target_id,
        template_key="connect_request",
        db=db,
        extra_data={"from_anonymous_name": sender.get("anonymous_name", "Anonymous")}
    )

    return {
        "message": "Request sent",
        "request_id": str(request["_id"])
    }


@router.get("/requests/incoming")
async def get_incoming_requests(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get incoming connect requests — shown in Connect > Requests tab"""
    requests = await db["connect_requests"].find({
        "to_user_id": current_user_id,
        "status": RequestStatus.PENDING,
        "expires_at": {"$gt": datetime.now(timezone.utc)}
    }).sort("created_at", -1).to_list(None)

    result = []
    for req in requests:
        result.append({
            "request_id": str(req["_id"]),
            "from_anonymous_name": req["from_anonymous_name"],
            "from_avatar": req.get("from_avatar", "ghost"),
            "from_avatar_color": req.get("from_avatar_color", "#FF634A"),
            "from_vibe_tags": req.get("from_vibe_tags", []),
            "created_at": req["created_at"].isoformat(),
            "expires_at": req["expires_at"].isoformat()
        })

    return {"requests": result, "count": len(result)}


@router.get("/requests/sent")
async def get_sent_requests(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get outgoing pending requests — so sender sees 'Pending...' state"""
    requests = await db["connect_requests"].find({
        "from_user_id": current_user_id,
        "status": RequestStatus.PENDING,
        "expires_at": {"$gt": datetime.now(timezone.utc)}
    }).sort("created_at", -1).to_list(None)

    result = []
    for req in requests:
        result.append({
            "request_id": str(req["_id"]),
            "to_anonymous_name": req["to_anonymous_name"],
            "created_at": req["created_at"].isoformat(),
            "expires_at": req["expires_at"].isoformat()
        })

    return {"sent_requests": result}


@router.post("/requests/{request_id}/accept")
async def accept_request(
    request_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Accept a connect request — creates a chat"""
    req = await db["connect_requests"].find_one({"_id": ObjectId(request_id)})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req["to_user_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not your request")

    if req["status"] != RequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request no longer pending")

    # Update request status
    await db["connect_requests"].update_one(
        {"_id": req["_id"]},
        {"$set": {"status": RequestStatus.ACCEPTED, "accepted_at": datetime.now(timezone.utc)}}
    )

    # Get acceptor info
    acceptor = await db["users"].find_one({"_id": ObjectId(current_user_id)})

    # Create chat
    chat = {
        "_id": ObjectId(),
        "request_id": str(req["_id"]),
        "from_user_id": req["from_user_id"],
        "from_anonymous_name": req["from_anonymous_name"],
        "from_avatar": req.get("from_avatar", "ghost"),
        "from_avatar_color": req.get("from_avatar_color", "#FF634A"),
        "to_user_id": current_user_id,
        "to_anonymous_name": acceptor.get("anonymous_name", "Anonymous"),
        "to_avatar": acceptor.get("avatar", "ghost"),
        "to_avatar_color": acceptor.get("avatar_color", "#FF634A"),
        "status": ChatStatus.ACTIVE,
        "message_count": 0,
        "is_unlocked": False,
        "reveal_status": None,      # None | "pending" | "accepted" | "declined"
        "reveal_initiator_id": None,
        "created_at": datetime.now(timezone.utc),
        "last_message_at": datetime.now(timezone.utc)
    }

    await db["connect_chats"].insert_one(chat)

    # Notify requester
    await send_push_notification(
        user_id=req["from_user_id"],
        template_key="connect_accepted",
        db=db,
        extra_data={"chat_id": str(chat["_id"])}
    )

    return {
        "message": "Request accepted",
        "chat_id": str(chat["_id"])
    }


@router.post("/requests/{request_id}/decline")
async def decline_request(
    request_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """
    Decline a connect request.
    Silently removed — requester gets no rejection notification.
    """
    req = await db["connect_requests"].find_one({"_id": ObjectId(request_id)})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req["to_user_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not your request")

    # Hard delete — requester never knows
    await db["connect_requests"].delete_one({"_id": req["_id"]})

    return {"message": "Request removed"}


# ==================== CHATS ====================

@router.get("/chats")
async def get_chats(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get all active chats — shown in Connect > Chats tab"""
    chats = await db["connect_chats"].find({
        "$or": [
            {"from_user_id": current_user_id},
            {"to_user_id": current_user_id}
        ],
        "status": {"$in": [ChatStatus.ACTIVE, ChatStatus.UNLOCKED]}
    }).sort("last_message_at", -1).to_list(None)

    result = []
    for chat in chats:
        is_sender = chat["from_user_id"] == current_user_id

        # Other person's info
        other_name = chat["to_anonymous_name"] if is_sender else chat["from_anonymous_name"]
        other_avatar = chat["to_avatar"] if is_sender else chat["from_avatar"]
        other_color = chat["to_avatar_color"] if is_sender else chat["from_avatar_color"]

        # Last message
        last_msg = await db["connect_messages"].find_one(
            {"chat_id": str(chat["_id"])},
            sort=[("created_at", -1)]
        )

        # Unread count
        unread = await db["connect_messages"].count_documents({
            "chat_id": str(chat["_id"]),
            "sender_id": {"$ne": current_user_id},
            "is_read": False
        })

        messages_left = None
        if not chat.get("is_unlocked"):
            messages_left = max(0, FREE_MESSAGE_LIMIT - chat.get("message_count", 0))

        result.append({
            "chat_id": str(chat["_id"]),
            "other_anonymous_name": other_name,
            "other_avatar": other_avatar,
            "other_avatar_color": other_color,
            "last_message": last_msg["content"][:60] if last_msg else None,
            "last_message_at": chat["last_message_at"].isoformat(),
            "unread_count": unread,
            "is_unlocked": chat.get("is_unlocked", False),
            "messages_left": messages_left,
            "reveal_status": chat.get("reveal_status"),
            "reveal_initiator": chat.get("reveal_initiator_id") == current_user_id
        })

    return {"chats": result, "count": len(result)}


@router.get("/chats/{chat_id}/messages")
async def get_chat_messages(
    chat_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get messages in a chat"""
    chat = await db["connect_chats"].find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if not is_participant(chat, current_user_id):
        raise HTTPException(status_code=403, detail="Not your chat")

    messages = await db["connect_messages"].find({
        "chat_id": chat_id
    }).sort("created_at", 1).skip(skip).limit(limit).to_list(None)

    # Collect unread incoming message IDs before marking
    unread_docs = await db["connect_messages"].find(
        {"chat_id": chat_id, "sender_id": {"$ne": current_user_id}, "is_read": False},
        {"_id": 1, "sender_id": 1},
    ).to_list(length=200)

    if unread_docs:
        await db["connect_messages"].update_many(
            {"_id": {"$in": [m["_id"] for m in unread_docs]}},
            {"$set": {"is_read": True, "is_delivered": True, "read_at": datetime.now(timezone.utc)}},
        )
        # Notify the sender in real time (fallback path — socket event also fires from frontend)
        from app.sio import sio
        sender_id = unread_docs[0]["sender_id"]
        await sio.emit(
            "messages_read",
            {
                "chatId":     chat_id,
                "messageIds": [str(m["_id"]) for m in unread_docs],
            },
            room=f"user_{sender_id}",
        )

    is_sender = chat["from_user_id"] == current_user_id
    other_name = chat["to_anonymous_name"] if is_sender else chat["from_anonymous_name"]
    other_avatar = chat["to_avatar"] if is_sender else chat["from_avatar"]
    other_color = chat["to_avatar_color"] if is_sender else chat["from_avatar_color"]

    messages_left = None
    if not chat.get("is_unlocked"):
        messages_left = max(0, FREE_MESSAGE_LIMIT - chat.get("message_count", 0))

    return {
        "messages": [
            {
                "id":           str(m["_id"]),
                "content":      m["content"],
                "is_own":       m["sender_id"] == current_user_id,
                "is_delivered": m.get("is_delivered", False),
                "is_read":      m.get("is_read", False),
                "created_at":   m["created_at"].isoformat()
            }
            for m in messages
        ],
        "chat": {
            "chat_id": chat_id,
            "other_anonymous_name": other_name,
            "other_avatar": other_avatar,
            "other_avatar_color": other_color,
            "is_unlocked": chat.get("is_unlocked", False),
            "messages_left": messages_left,
            "reveal_status": chat.get("reveal_status"),
            "reveal_initiator": chat.get("reveal_initiator_id") == current_user_id,
            "message_count": chat.get("message_count", 0)
        }
    }


@router.post("/chats/{chat_id}/message")
async def send_message(
    chat_id: str,
    data: SendMessageRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Send a message in a chat"""
    chat = await db["connect_chats"].find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if not is_participant(chat, current_user_id):
        raise HTTPException(status_code=403, detail="Not your chat")

    if chat["status"] == ChatStatus.BLOCKED:
        raise HTTPException(status_code=403, detail="Chat is blocked")

    # Enforce message limit for locked chats
    if not chat.get("is_unlocked"):
        if chat.get("message_count", 0) >= FREE_MESSAGE_LIMIT:
            raise HTTPException(
                status_code=402,
                detail=f"Message limit reached ({FREE_MESSAGE_LIMIT} free messages). Unlock for $2."
            )

    if not data.content.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    message = {
        "_id":          ObjectId(),
        "chat_id":      chat_id,
        "sender_id":    current_user_id,
        "content":      data.content.strip(),
        "is_delivered": False,
        "is_read":      False,
        "created_at":   datetime.now(timezone.utc),
    }

    await db["connect_messages"].insert_one(message)

    # Emit real-time event to the recipient
    from app.sio import sio
    await sio.emit(
        "new_message",
        {
            "id":           str(message["_id"]),
            "chat_id":      chat_id,
            "content":      message["content"],
            "is_own":       False,
            "is_delivered": False,
            "is_read":      False,
            "created_at":   message["created_at"].isoformat(),
        },
        room=f"user_{other_participant(chat, current_user_id)}",
    )

    await db["connect_chats"].update_one(
        {"_id": ObjectId(chat_id)},
        {
            "$inc": {"message_count": 1},
            "$set": {"last_message_at": datetime.now(timezone.utc)}
        }
    )

    messages_left = None
    if not chat.get("is_unlocked"):
        messages_left = max(0, FREE_MESSAGE_LIMIT - chat.get("message_count", 0) - 1)

    # Notify other participant
    other_id = other_participant(chat, current_user_id)
    await send_push_notification(
        user_id=other_id,
        template_key="new_message",
        db=db,
        extra_data={"chat_id": chat_id}
    )

    return {
        "message_id": str(message["_id"]),
        "messages_left": messages_left
    }


# ==================== UNLOCK ====================

@router.post("/chats/{chat_id}/unlock")
async def unlock_chat(
    chat_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """
    Mark chat as unlocked after successful payment.
    Called by payments.py after Stripe/M-Pesa confirmation.
    """
    chat = await db["connect_chats"].find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if not is_participant(chat, current_user_id):
        raise HTTPException(status_code=403, detail="Not your chat")

    if chat.get("is_unlocked"):
        return {"message": "Already unlocked"}

    await db["connect_chats"].update_one(
        {"_id": ObjectId(chat_id)},
        {
            "$set": {
                "is_unlocked": True,
                "status": ChatStatus.UNLOCKED,
                "unlocked_at": datetime.now(timezone.utc),
                "unlocked_by": current_user_id
            }
        }
    )

    return {"message": "Chat unlocked. No more limits."}


# ==================== REVEAL ====================

@router.post("/chats/{chat_id}/reveal/request")
async def request_reveal(
    chat_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """
    Request identity reveal.
    Available to both participants at any time — no paywall.
    Other person must accept for reveal to happen.
    """
    chat = await db["connect_chats"].find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if not is_participant(chat, current_user_id):
        raise HTTPException(status_code=403, detail="Not your chat")

    if chat.get("reveal_status") in ["pending", "accepted"]:
        raise HTTPException(status_code=400, detail="Reveal already in progress or completed")

    await db["connect_chats"].update_one(
        {"_id": ObjectId(chat_id)},
        {
            "$set": {
                "reveal_status": RevealStatus.PENDING,
                "reveal_initiator_id": current_user_id,
                "reveal_requested_at": datetime.now(timezone.utc)
            }
        }
    )

    # Notify other participant
    other_id = other_participant(chat, current_user_id)
    await send_push_notification(
        user_id=other_id,
        template_key="reveal_request",
        db=db,
        extra_data={"chat_id": chat_id}
    )

    return {"message": "Reveal request sent. Waiting for their response."}


@router.post("/chats/{chat_id}/reveal/respond")
async def respond_to_reveal(
    chat_id: str,
    data: RevealResponseRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Accept or decline a reveal request"""
    chat = await db["connect_chats"].find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if not is_participant(chat, current_user_id):
        raise HTTPException(status_code=403, detail="Not your chat")

    if chat.get("reveal_status") != RevealStatus.PENDING:
        raise HTTPException(status_code=400, detail="No pending reveal request")

    # Only the non-initiator can respond
    if chat.get("reveal_initiator_id") == current_user_id:
        raise HTTPException(status_code=400, detail="You initiated this reveal — wait for their response")

    if data.accept:
        # Fetch both users' real info
        initiator = await db["users"].find_one({"_id": ObjectId(chat["reveal_initiator_id"])})
        responder = await db["users"].find_one({"_id": ObjectId(current_user_id)})

        await db["connect_chats"].update_one(
            {"_id": ObjectId(chat_id)},
            {
                "$set": {
                    "reveal_status": RevealStatus.ACCEPTED,
                    "reveal_accepted_at": datetime.now(timezone.utc),
                    "revealed_identities": {
                        chat["reveal_initiator_id"]: {
                            "username": initiator.get("username"),
                            "avatar_url": initiator.get("avatar_url")
                        },
                        current_user_id: {
                            "username": responder.get("username"),
                            "avatar_url": responder.get("avatar_url")
                        }
                    }
                }
            }
        )

        # Return the initiator's real info to the responder
        # Notify initiator their reveal was accepted
        await send_push_notification(
            user_id=chat["reveal_initiator_id"],
            template_key="reveal_accepted",
            db=db,
            extra_data={"chat_id": chat_id}
        )

        return {
            "accepted": True,
            "message": "Identities revealed.",
            "other_user": {
                "username": initiator.get("username"),
                "avatar_url": initiator.get("avatar_url")
            }
        }
    else:
        await db["connect_chats"].update_one(
            {"_id": ObjectId(chat_id)},
            {
                "$set": {
                    "reveal_status": RevealStatus.DECLINED,
                    "reveal_initiator_id": None
                }
            }
        )

        # Notify initiator their reveal was declined
        await send_push_notification(
            user_id=chat["reveal_initiator_id"],
            template_key="reveal_declined",
            db=db,
            extra_data={"chat_id": chat_id}
        )

        return {"accepted": False, "message": "Reveal declined. You remain anonymous."}


@router.get("/chats/{chat_id}/reveal/identity")
async def get_revealed_identity(
    chat_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get the other person's revealed identity — only if reveal was accepted"""
    chat = await db["connect_chats"].find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if not is_participant(chat, current_user_id):
        raise HTTPException(status_code=403, detail="Not your chat")

    if chat.get("reveal_status") != RevealStatus.ACCEPTED:
        raise HTTPException(status_code=403, detail="Identities not yet revealed")

    other_id = other_participant(chat, current_user_id)
    identities = chat.get("revealed_identities", {})
    other_identity = identities.get(other_id)

    if not other_identity:
        raise HTTPException(status_code=404, detail="Identity not found")

    return {"other_user": other_identity}


# ==================== BLOCK ====================

@router.post("/chats/{chat_id}/block")
async def block_from_chat(
    chat_id: str,
    data: BlockRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Block a user from within a chat"""
    chat = await db["connect_chats"].find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if not is_participant(chat, current_user_id):
        raise HTTPException(status_code=403, detail="Not your chat")

    blocked_id = other_participant(chat, current_user_id)

    # Block the chat
    await db["connect_chats"].update_one(
        {"_id": ObjectId(chat_id)},
        {"$set": {"status": ChatStatus.BLOCKED}}
    )

    # Record block so future requests are also blocked
    await db["connect_blocks"].update_one(
        {"blocker_id": current_user_id, "blocked_id": blocked_id},
        {
            "$set": {
                "blocker_id": current_user_id,
                "blocked_id": blocked_id,
                "chat_id": chat_id,
                "reason": data.reason,
                "created_at": datetime.now(timezone.utc)
            }
        },
        upsert=True
    )

    return {"message": "User blocked"}


# ==================== STATS ====================

@router.get("/stats")
async def get_connect_stats(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Badge counts for the Connect tab icon"""
    incoming_requests = await db["connect_requests"].count_documents({
        "to_user_id": current_user_id,
        "status": RequestStatus.PENDING,
        "expires_at": {"$gt": datetime.now(timezone.utc)}
    })

    unread_messages = await db["connect_messages"].count_documents({
        "sender_id": {"$ne": current_user_id},
        "is_read": False,
        "chat_id": {"$in": [
            str(c["_id"]) for c in await db["connect_chats"].find({
                "$or": [
                    {"from_user_id": current_user_id},
                    {"to_user_id": current_user_id}
                ]
            }).to_list(None)
        ]}
    })

    return {
        "incoming_requests": incoming_requests,
        "unread_messages": unread_messages,
        "total_badge": incoming_requests + unread_messages
    }
