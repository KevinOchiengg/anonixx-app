"""Socket.IO handlers: presence, comment-thread rooms and chat typing."""

from datetime import datetime, timezone

from bson import ObjectId

from app.sio import sio
from app.database import db as _db_holder
from app.core.jwt import decode_token
from app.websockets.activity import emit_high_activity
from app.utils.user_tz import save_tz


def _db():
    """Direct access to the Motor database (no Depends needed outside FastAPI)."""
    return _db_holder.db


# sid → user_id — in-memory; reset on server restart (acceptable for chat)
_sid_to_user: dict[str, str] = {}

# Currently online user IDs
_online_users: set[str] = set()

# user_id → when their current stretch online began (admin Live panel)
_online_since: dict[str, datetime] = {}

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
    _online_since.setdefault(user_id, datetime.now(timezone.utc))
    try:
        await save_tz(_db(), user_id, (auth or {}).get("tz"))
    except Exception:
        pass

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
    if user_id and user_id in _sid_to_user.values():
        return  # still connected from another tab or device
    if user_id:
        _online_users.discard(user_id)
        _online_since.pop(user_id, None)
        # Notify all other users this person went offline
        await sio.emit(
            "user_offline",
            {"userId": user_id, "count": len(_online_users)},
        )


def is_user_online(user_id: str) -> bool:
    """Check if a user currently has an active socket connection."""
    return user_id in _online_users


def online_users() -> dict[str, datetime]:
    """Everyone connected right now, with when they came online."""
    return {u: _online_since.get(u) for u in _online_users}


# ─── Drop comment threads: joined while a drop's comments are open ─────────

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


# ─── Chat typing: relayed to the other person as user_typing ───────────────

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


