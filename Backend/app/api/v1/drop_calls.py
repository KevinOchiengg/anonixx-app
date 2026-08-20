"""
api/v1/drop_calls.py — Group video calls inside a poster's chat interface.

A "room": the poster (host) starts a call; anyone who has unlocked a chat
with them can join as a guest, up to their room's capacity (see
chat_profile.py CALL_MODES / FREE_GUEST_CAP / call-capacity purchases).
Solo-mode hosts are capped at 1 guest no matter what they've purchased.

Everyone who joins — host and guests alike — publishes camera + mic and can
toggle screen-share; there's no broadcaster/audience split like Circles.
Agora's Communication profile (same as the 1:1 CallScreen) handles that
symmetry natively, just with more than two participants in the channel.

Signaling is best-effort real-time (a socket event on start/join/leave) with
polling as the real guarantee — DropChatScreen already polls
GET /drops/connections/{id}/messages every few seconds, and that response
carries `active_call` so a guest finds out even if they missed the socket
event.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id
from app.config import settings
from app.api.v1.chat_profile import FREE_GUEST_CAP

router = APIRouter(prefix="/drop-calls", tags=["Drop Calls"])

CALL_TOKEN_EXPIRY = 3600  # 1 hour


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid_for(user_id: str) -> int:
    # Same scheme as connect.py's 1:1 calls — deterministic, fits Agora's uint32 uid.
    return abs(hash(user_id)) % (2 ** 32)


def _generate_token(channel: str, uid: int) -> str:
    if not settings.AGORA_APP_ID or not settings.AGORA_APP_CERTIFICATE:
        raise HTTPException(status_code=503, detail="Calls aren't configured yet. Add AGORA_APP_ID and AGORA_APP_CERTIFICATE to .env.")
    from agora_token_builder import RtcTokenBuilder
    expire = int(_now().timestamp()) + CALL_TOKEN_EXPIRY
    return RtcTokenBuilder.buildTokenWithUid(
        settings.AGORA_APP_ID, settings.AGORA_APP_CERTIFICATE,
        channel, uid, 1, expire,  # role 1 = publisher — everyone publishes
    )


async def _room_capacity(host_user_id: str, db) -> dict:
    profile = await db["chat_profiles"].find_one({"user_id": host_user_id})
    call_mode = (profile.get("call_mode") if profile else None) or "solo"
    if call_mode == "solo":
        return {"call_mode": "solo", "max_guests": 1}
    purchased = profile.get("purchased_slots", 0) if profile else 0
    return {"call_mode": "multi", "max_guests": FREE_GUEST_CAP + purchased}


async def _is_unlocked_guest(host_user_id: str, guest_user_id: str, db) -> bool:
    conn = await db["drop_connections"].find_one({
        "sender_id": host_user_id, "unlocker_id": guest_user_id,
    })
    return conn is not None


def _format_call(call: dict) -> dict:
    return {
        "id":          str(call["_id"]),
        "channel":     call["channel"],
        "host_user_id": call["host_user_id"],
        "status":      call["status"],
        "max_guests":  call["max_guests"],
        "guest_count": len(call.get("guest_user_ids", [])),
        "started_at":  call["started_at"].isoformat(),
    }


async def get_active_call_for_host(host_user_id: str, db) -> Optional[dict]:
    """Used by drops.py to embed `active_call` in the messages poll response."""
    call = await db["drop_calls"].find_one({"host_user_id": host_user_id, "status": "active"})
    return _format_call(call) if call else None


@router.post("/start")
async def start_call(
    current_user_id: str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    # A host restarting a call replaces any stale one — don't let a
    # forgotten "active" row from a crashed session lock them out forever.
    await db["drop_calls"].update_many(
        {"host_user_id": current_user_id, "status": "active"},
        {"$set": {"status": "ended", "ended_at": _now()}},
    )

    capacity = await _room_capacity(current_user_id, db)
    now = _now()
    result = await db["drop_calls"].insert_one({
        "host_user_id":    current_user_id,
        "status":          "active",
        "max_guests":      capacity["max_guests"],
        "guest_user_ids":  [],
        "started_at":      now,
        "ended_at":        None,
    })
    call_id = str(result.inserted_id)
    channel = f"dropcall_{call_id}"
    await db["drop_calls"].update_one({"_id": result.inserted_id}, {"$set": {"channel": channel}})

    uid   = _uid_for(current_user_id)
    token = _generate_token(channel, uid)

    # Best-effort nudge to everyone who could join — polling is the real
    # guarantee (see module docstring), this just makes it feel instant for
    # anyone already online.
    try:
        from app.sio import sio
        async for conn in db["drop_connections"].find({"sender_id": current_user_id}):
            await sio.emit(
                "drop_call_started",
                {"host_user_id": current_user_id, "call_id": call_id, "max_guests": capacity["max_guests"]},
                room=f"user_{conn['unlocker_id']}",
            )
    except Exception:
        pass

    return {
        "call_id":     call_id,
        "channel":     channel,
        "token":       token,
        "uid":         uid,
        "app_id":      settings.AGORA_APP_ID,
        "call_mode":   capacity["call_mode"],
        "max_guests":  capacity["max_guests"],
    }


@router.post("/{call_id}/join")
async def join_call(
    call_id:          str,
    current_user_id:  str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    try:
        call = await db["drop_calls"].find_one({"_id": ObjectId(call_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid call ID.")
    if not call or call["status"] != "active":
        raise HTTPException(status_code=404, detail="This call has ended.")

    host_id = call["host_user_id"]
    if current_user_id == host_id:
        raise HTTPException(status_code=400, detail="You're already hosting this call.")

    if not await _is_unlocked_guest(host_id, current_user_id, db):
        raise HTTPException(status_code=403, detail="Unlock a drop from this person to join their call.")

    guest_ids = call.get("guest_user_ids", [])
    if current_user_id not in guest_ids and len(guest_ids) >= call["max_guests"]:
        raise HTTPException(status_code=409, detail="This room is full right now.")

    await db["drop_calls"].update_one(
        {"_id": call["_id"]},
        {"$addToSet": {"guest_user_ids": current_user_id}},
    )

    uid   = _uid_for(current_user_id)
    token = _generate_token(call["channel"], uid)

    try:
        from app.sio import sio
        await sio.emit(
            "drop_call_guest_joined",
            {"call_id": call_id, "guest_user_id": current_user_id},
            room=f"user_{host_id}",
        )
    except Exception:
        pass

    return {
        "call_id":  call_id,
        "channel":  call["channel"],
        "token":    token,
        "uid":      uid,
        "app_id":   settings.AGORA_APP_ID,
    }


@router.post("/{call_id}/leave")
async def leave_call(
    call_id:          str,
    current_user_id:  str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    try:
        call = await db["drop_calls"].find_one({"_id": ObjectId(call_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid call ID.")
    if not call or call["status"] != "active":
        return {"message": "Already ended."}

    if current_user_id == call["host_user_id"]:
        return await _end_call(call, db)

    await db["drop_calls"].update_one(
        {"_id": call["_id"]},
        {"$pull": {"guest_user_ids": current_user_id}},
    )
    return {"message": "Left the call."}


@router.post("/{call_id}/end")
async def end_call(
    call_id:          str,
    current_user_id:  str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    try:
        call = await db["drop_calls"].find_one({"_id": ObjectId(call_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid call ID.")
    if not call:
        raise HTTPException(status_code=404, detail="Call not found.")
    if call["host_user_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Only the host can end this call.")
    return await _end_call(call, db)


async def _end_call(call: dict, db) -> dict:
    await db["drop_calls"].update_one(
        {"_id": call["_id"]},
        {"$set": {"status": "ended", "ended_at": _now()}},
    )
    try:
        from app.sio import sio
        for guest_id in call.get("guest_user_ids", []):
            await sio.emit("drop_call_ended", {"call_id": str(call["_id"])}, room=f"user_{guest_id}")
    except Exception:
        pass
    return {"message": "Call ended."}
