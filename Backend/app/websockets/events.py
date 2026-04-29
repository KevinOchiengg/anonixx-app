"""
Socket.IO event handlers for real-time chat.

Events (client → server):
  join_chat    { chatId }        — join a chat room; triggers delivery acks
  leave_chat   { chatId }        — leave a chat room
  messages_read { chatId }       — mark all incoming messages in chat as read

Events (server → client):
  new_message       { ...message }                 → sent to user_{recipient_id}
  messages_delivered { chatId, messageIds: [...] } → sent to user_{sender_id}
  messages_read      { chatId, messageIds: [...] } → sent to user_{sender_id}
"""

from datetime import datetime, timezone
from bson import ObjectId

from app.sio import sio
from app.database import db as _db_holder
from app.core.jwt import decode_token
from app.websockets.activity import emit_high_activity


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _db():
    """Direct access to the Motor database (no Depends needed outside FastAPI)."""
    return _db_holder.db


# sid → user_id — in-memory; reset on server restart (acceptable for chat)
_sid_to_user: dict[str, str] = {}

# Currently online user IDs
_online_users: set[str] = set()

# Threshold for high-activity signal
_HIGH_ACTIVITY_THRESHOLD = 5


# ─── Connection lifecycle ─────────────────────────────────────────────────────

@sio.event
async def connect(sid: str, environ: dict, auth: dict):
    """Authenticate the socket connection via JWT token."""
    token = (auth or {}).get("token")
    if not token:
        return False  # reject unauthenticated connections

    payload = decode_token(token)
    if not payload:
        return False

    user_id = payload.get("sub")
    if not user_id:
        return False

    _sid_to_user[sid] = user_id
    _online_users.add(user_id)

    # Personal room so the server can reach this user directly
    await sio.enter_room(sid, f"user_{user_id}")

    # Tell all OTHER connected users who just came online (userId required
    # so the frontend can update per-user presence indicators)
    await sio.emit(
        "user_online",
        {"userId": user_id, "count": len(_online_users)},
        skip_sid=sid,
    )

    # Tell the newly connected user if space is busy
    if len(_online_users) >= _HIGH_ACTIVITY_THRESHOLD:
        await emit_high_activity(user_id, online_count=len(_online_users))


@sio.event
async def disconnect(sid: str):
    user_id = _sid_to_user.pop(sid, None)
    if user_id:
        _online_users.discard(user_id)
        # Notify all other users this person went offline
        await sio.emit(
            "user_offline",
            {"userId": user_id, "count": len(_online_users)},
        )


def is_user_online(user_id: str) -> bool:
    """Check if a user currently has an active socket connection."""
    return user_id in _online_users


# ─── Chat room management ─────────────────────────────────────────────────────

@sio.event
async def join_chat(sid: str, data: dict):
    """
    Client opened a chat screen.
    1. Join the chat room (for future real-time messages).
    2. Mark any undelivered messages from the other user as delivered.
    3. Notify the sender with a `messages_delivered` event.
    """
    user_id = _sid_to_user.get(sid)
    if not user_id:
        return

    chat_id = data.get("chatId")
    if not chat_id:
        return

    await sio.enter_room(sid, f"chat_{chat_id}")

    database = _db()
    if database is None:
        return

    # Find undelivered messages from the other participant
    undelivered = await database["connect_messages"].find(
        {
            "chat_id":      chat_id,
            "sender_id":    {"$ne": user_id},
            "is_delivered": False,
        },
        {"_id": 1, "sender_id": 1},
    ).to_list(length=200)

    if not undelivered:
        return

    object_ids = [m["_id"] for m in undelivered]
    msg_ids    = [str(m["_id"]) for m in undelivered]
    sender_id  = undelivered[0]["sender_id"]   # 2-person chat: one sender

    await database["connect_messages"].update_many(
        {"_id": {"$in": object_ids}},
        {"$set": {"is_delivered": True, "delivered_at": _now()}},
    )

    await sio.emit(
        "messages_delivered",
        {"chatId": chat_id, "messageIds": msg_ids},
        room=f"user_{sender_id}",
    )


@sio.event
async def leave_chat(sid: str, data: dict):
    chat_id = data.get("chatId")
    if chat_id:
        await sio.leave_room(sid, f"chat_{chat_id}")


# ─── Read receipts ────────────────────────────────────────────────────────────

@sio.event
async def messages_read(sid: str, data: dict):
    """
    Client signals all visible messages in a chat have been read.
    1. Mark them as read + delivered in the DB.
    2. Notify the sender with a `messages_read` event.
    """
    user_id = _sid_to_user.get(sid)
    if not user_id:
        return

    chat_id = data.get("chatId")
    if not chat_id:
        return

    database = _db()
    if database is None:
        return

    unread = await database["connect_messages"].find(
        {
            "chat_id":   chat_id,
            "sender_id": {"$ne": user_id},
            "is_read":   False,
        },
        {"_id": 1, "sender_id": 1},
    ).to_list(length=200)

    if not unread:
        return

    object_ids = [m["_id"] for m in unread]
    msg_ids    = [str(m["_id"]) for m in unread]
    sender_id  = unread[0]["sender_id"]

    await database["connect_messages"].update_many(
        {"_id": {"$in": object_ids}},
        {"$set": {"is_read": True, "is_delivered": True, "read_at": _now()}},
    )

    await sio.emit(
        "messages_read",
        {"chatId": chat_id, "messageIds": msg_ids},
        room=f"user_{sender_id}",
    )


# ─── Typing indicator ─────────────────────────────────────────────────────────

@sio.event
async def user_typing(sid: str, data: dict):
    """
    Client signals they are typing in a chat.
    Forwards a `user_typing` event to the recipient.

    Client emits: user_typing { chatId, recipientId }
    """
    sender_id = _sid_to_user.get(sid)
    if not sender_id:
        return

    recipient_id = data.get("recipientId")
    if not recipient_id:
        return

    await sio.emit(
        "user_typing",
        {"userId": sender_id, "chatId": data.get("chatId")},
        room=f"user_{recipient_id}",
    )
