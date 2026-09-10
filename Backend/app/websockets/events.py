"""
Socket.IO event handlers. Presence (connect/disconnect) plus room join/
leave for drop comment threads. The old chat-room events (join_chat/
leave_chat/messages_read/user_typing) tied to the now-removed
connect_messages system were deleted long ago — Link Up's DropChatScreen
now gets live messages a different way: emit_new_message
(app/websockets/chat.py) targets the recipient's personal user_{id} room
directly, since a DM only ever has two known participants and doesn't
need a per-conversation room the way comment threads do.
"""

from bson import ObjectId

from app.sio import sio
from app.database import db as _db_holder
from app.core.jwt import decode_token
from app.websockets.activity import emit_high_activity


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


# ─── Drop comment threads ──────────────────────────────────────────────────
# Room-per-drop, joined only while a client has that drop's comment sheet
# open — keeps new_comment/comment_liked broadcasts (app/websockets/
# comments.py) scoped to people actually looking at the thread right now.

@sio.event
async def join_drop_thread(sid: str, data: dict):
    drop_id = (data or {}).get("dropId")
    if drop_id:
        await sio.enter_room(sid, f"drop_{drop_id}")


@sio.event
async def leave_drop_thread(sid: str, data: dict):
    drop_id = (data or {}).get("dropId")
    if drop_id:
        await sio.leave_room(sid, f"drop_{drop_id}")


# ─── Link Up DM typing ──────────────────────────────────────────────────────
# Client -> server: "I'm typing in this chat." Relayed as user_typing to the
# other party's personal room. MessagesScreen (chat list) has listened for
# user_typing since before this handler existed — this is what actually
# starts firing it; DropChatScreen (the open conversation) also listens,
# filtering by connectionId since a user can have more than one open chat.

@sio.event
async def typing(sid: str, data: dict):
    connection_id = (data or {}).get("connectionId")
    sender_id = _sid_to_user.get(sid)
    if not connection_id or not sender_id:
        return
    try:
        conn = await _db()["drop_connections"].find_one({"_id": ObjectId(connection_id)})
    except Exception:
        return
    if not conn:
        return
    other_id = conn["unlocker_id"] if sender_id == conn["sender_id"] else conn["sender_id"]
    await sio.emit(
        "user_typing",
        {"userId": sender_id, "connectionId": connection_id},
        room=f"user_{other_id}",
    )


