from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id

router = APIRouter(prefix="/connections", tags=["Deep Connections"])


class SendInviteRequest(BaseModel):
    target_post_id: str
    message: Optional[str] = None


class SendMessageRequest(BaseModel):
    content: str


@router.get("/weekly-invites-left")
async def get_weekly_invites_left(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Check how many invites user has left this week"""
    week_ago = datetime.utcnow() - timedelta(days=7)
    
    invites_sent_this_week = await db["connection_invites"].count_documents({
        "sender_id": current_user_id,
        "created_at": {"$gte": week_ago}
    })
    
    return {
        "invites_left": max(0, 1 - invites_sent_this_week),
        "resets_in_days": 7 - (datetime.utcnow().weekday())
    }


@router.post("/send-invite")
async def send_connection_invite(
    data: SendInviteRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Send a 3-day anonymous conversation invite"""
    
    # Check weekly limit
    week_ago = datetime.utcnow() - timedelta(days=7)
    invites_sent_this_week = await db["connection_invites"].count_documents({
        "sender_id": current_user_id,
        "created_at": {"$gte": week_ago}
    })
    
    if invites_sent_this_week >= 1:
        raise HTTPException(
            status_code=400,
            detail="You've used your weekly invite. Try again next week."
        )
    
    # Get the post to find the author
    try:
        post = await db["posts"].find_one({"_id": ObjectId(data.target_post_id)})
    except:
        post = await db["posts"].find_one({"_id": data.target_post_id})
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    target_user_id = post["user_id"]
    
    # Can't invite yourself
    if target_user_id == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot invite yourself")
    
    # Check if already has active connection
    active_connection = await db["connections"].find_one({
        "$or": [
            {"user1_id": current_user_id, "user2_id": target_user_id},
            {"user1_id": target_user_id, "user2_id": current_user_id}
        ],
        "status": "active",
        "expires_at": {"$gt": datetime.utcnow()}
    })
    
    if active_connection:
        raise HTTPException(
            status_code=400,
            detail="You already have an active connection with this person"
        )
    
    # Create invite
    invite = {
        "_id": ObjectId(),
        "sender_id": current_user_id,
        "receiver_id": target_user_id,
        "post_id": data.target_post_id,
        "message": data.message,
        "status": "pending",
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(days=2)
    }
    
    await db["connection_invites"].insert_one(invite)
    
    return {
        "id": str(invite["_id"]),
        "message": "Invite sent. They have 2 days to respond."
    }


@router.get("/pending-invites")
async def get_pending_invites(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get invites sent to me"""
    invites_cursor = db["connection_invites"].find({
        "receiver_id": current_user_id,
        "status": "pending",
        "expires_at": {"$gt": datetime.utcnow()}
    }).sort("created_at", -1)
    
    invites = []
    async for invite in invites_cursor:
        try:
            post = await db["posts"].find_one({"_id": ObjectId(invite["post_id"])})
        except:
            post = await db["posts"].find_one({"_id": invite["post_id"]})
        
        invites.append({
            "id": str(invite["_id"]),
            "post_content": post["content"][:100] if post else "...",
            "message": invite.get("message"),
            "created_at": invite["created_at"].isoformat(),
            "expires_at": invite["expires_at"].isoformat()
        })
    
    return {"invites": invites}


@router.post("/invites/{invite_id}/accept")
async def accept_invite(
    invite_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Accept a connection invite"""
    try:
        invite = await db["connection_invites"].find_one({"_id": ObjectId(invite_id)})
    except:
        invite = await db["connection_invites"].find_one({"_id": invite_id})
    
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    
    if invite["receiver_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not your invite")
    
    if invite["status"] != "pending":
        raise HTTPException(status_code=400, detail="Invite already processed")
    
    if datetime.utcnow() > invite["expires_at"]:
        raise HTTPException(status_code=400, detail="Invite expired")
    
    # Update invite status
    await db["connection_invites"].update_one(
        {"_id": invite["_id"]},
        {"$set": {"status": "accepted"}}
    )
    
    # Create connection (3-day window)
    connection = {
        "_id": ObjectId(),
        "user1_id": invite["sender_id"],
        "user2_id": invite["receiver_id"],
        "status": "active",
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(days=3)
    }
    
    await db["connections"].insert_one(connection)
    
    return {
        "connection_id": str(connection["_id"]),
        "message": "Connection opened. You have 3 days to talk."
    }


@router.post("/invites/{invite_id}/decline")
async def decline_invite(
    invite_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Decline a connection invite"""
    try:
        invite = await db["connection_invites"].find_one({"_id": ObjectId(invite_id)})
    except:
        invite = await db["connection_invites"].find_one({"_id": invite_id})
    
    if not invite or invite["receiver_id"] != current_user_id:
        raise HTTPException(status_code=404, detail="Invite not found")
    
    await db["connection_invites"].update_one(
        {"_id": invite["_id"]},
        {"$set": {"status": "declined"}}
    )
    
    return {"message": "Invite declined"}


@router.get("/active-connections")
async def get_active_connections(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get user's active connections"""
    connections_cursor = db["connections"].find({
        "$or": [
            {"user1_id": current_user_id},
            {"user2_id": current_user_id}
        ],
        "status": "active",
        "expires_at": {"$gt": datetime.utcnow()}
    }).sort("created_at", -1)
    
    connections = []
    async for conn in connections_cursor:
        last_message = await db["connection_messages"].find_one(
            {"connection_id": str(conn["_id"])},
            sort=[("created_at", -1)]
        )
        
        unread_count = await db["connection_messages"].count_documents({
            "connection_id": str(conn["_id"]),
            "sender_id": {"$ne": current_user_id},
            "read": False
        })
        
        connections.append({
            "id": str(conn["_id"]),
            "expires_at": conn["expires_at"].isoformat(),
            "last_message": last_message["content"][:50] if last_message else None,
            "last_message_at": last_message["created_at"].isoformat() if last_message else None,
            "unread_count": unread_count
        })
    
    return {"connections": connections}


@router.get("/connections/{connection_id}/messages")
async def get_connection_messages(
    connection_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get messages in a connection"""
    try:
        connection = await db["connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        connection = await db["connections"].find_one({"_id": connection_id})
    
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    if connection["user1_id"] != current_user_id and connection["user2_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not your connection")
    
    messages_cursor = db["connection_messages"].find({
        "connection_id": connection_id
    }).sort("created_at", 1)
    
    messages = []
    async for msg in messages_cursor:
        messages.append({
            "id": str(msg["_id"]),
            "content": msg["content"],
            "is_own": msg["sender_id"] == current_user_id,
            "created_at": msg["created_at"].isoformat(),
            "read": msg.get("read", False)
        })
    
    await db["connection_messages"].update_many(
        {
            "connection_id": connection_id,
            "sender_id": {"$ne": current_user_id},
            "read": False
        },
        {"$set": {"read": True}}
    )
    
    return {
        "messages": messages,
        "expires_at": connection["expires_at"].isoformat(),
        "is_expired": datetime.utcnow() > connection["expires_at"]
    }


@router.post("/connections/{connection_id}/messages")
async def send_message(
    connection_id: str,
    data: SendMessageRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Send a message in a connection"""
    try:
        connection = await db["connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        connection = await db["connections"].find_one({"_id": connection_id})
    
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    if connection["user1_id"] != current_user_id and connection["user2_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not your connection")
    
    if datetime.utcnow() > connection["expires_at"]:
        raise HTTPException(status_code=400, detail="Connection expired")
    
    message = {
        "_id": ObjectId(),
        "connection_id": connection_id,
        "sender_id": current_user_id,
        "content": data.content,
        "read": False,
        "created_at": datetime.utcnow()
    }
    
    await db["connection_messages"].insert_one(message)
    
    return {
        "id": str(message["_id"]),
        "message": "Message sent"
    }