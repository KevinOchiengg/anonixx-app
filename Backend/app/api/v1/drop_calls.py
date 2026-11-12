"""Calls in Rooms, on Agora. Two kinds, one collection (`drop_calls`):

- Group sessions (kind "group", the original): the Room owner opens a session; people they've
  let in join, up to the room size (FREE_GUEST_CAP free, more bought in chat_profile.py). The
  owner can invite only some connections, remove or ask someone to mute, and end it for all.
- Direct calls (kind "direct"): either person in an open Room conversation rings the other
  (audio or video). The callee accepts or declines; unanswered rings become missed after
  RING_SECONDS. The callee's Room settings decide whether they take audio/video calls.

A call never touches the connection or its messages: leaving or ending one only ends the call.
Every token is minted here, only for people allowed in; the socket pushes changes and the
chat poll / GET /live are the fallback."""
import asyncio
import secrets
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import Optional
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id
from app.config import settings
from app.api.v1.chat_profile import FREE_GUEST_CAP, is_blocked_between

router = APIRouter(prefix="/drop-calls", tags=["Drop Calls"])

CALL_TOKEN_EXPIRY = 3600  # 1 hour; clients renew through POST /{id}/renew before it runs out
RING_SECONDS = 45         # an unanswered direct call becomes "missed" after this
GROUP = {"kind": {"$ne": "direct"}}   # group sessions (older rows have no kind)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _new_uid() -> int:
    # Random per person per call, stored on the call so the clients can map uid -> person.
    return secrets.randbelow(2 ** 31 - 2) + 1


def _generate_token(channel: str, uid: int) -> str:
    if not settings.AGORA_APP_ID or not settings.AGORA_APP_CERTIFICATE:
        raise HTTPException(status_code=503, detail="Calls aren't configured yet. Add AGORA_APP_ID and AGORA_APP_CERTIFICATE to .env.")
    from agora_token_builder import RtcTokenBuilder
    expire = int(_now().timestamp()) + CALL_TOKEN_EXPIRY
    return RtcTokenBuilder.buildTokenWithUid(
        settings.AGORA_APP_ID, settings.AGORA_APP_CERTIFICATE,
        channel, uid, 1, expire,  # role 1 = publisher — everyone publishes
    )


async def _emit(event: str, payload: dict, user_ids) -> None:
    try:
        from app.sio import sio
        for uid in user_ids:
            await sio.emit(event, payload, room=f"user_{uid}")
    except Exception:
        pass


def _push(user_id: str, title: str, body: str, db, data: dict, kind: str) -> None:
    from app.api.v1.drops import send_push_notification
    asyncio.create_task(send_push_notification(user_id, title, body, db, data, kind=kind))


async def _people(db, ids) -> dict:
    """user_id -> {name, avatar} for display. Names are the anonymous ones, never contact details."""
    oids = [ObjectId(i) for i in set(ids) if i and ObjectId.is_valid(i)]
    out = {}
    if oids:
        async for u in db["users"].find({"_id": {"$in": oids}}, {"anonymous_name": 1, "avatar_url": 1}):
            out[str(u["_id"])] = {"name": u.get("anonymous_name") or "Anonymous", "avatar_url": u.get("avatar_url")}
    return out


async def _room_capacity(host_user_id: str, db) -> dict:
    profile = await db["chat_profiles"].find_one({"user_id": host_user_id})
    call_mode = (profile.get("call_mode") if profile else None) or "solo"
    if call_mode == "solo":
        return {"call_mode": "solo", "max_guests": 1}
    purchased = profile.get("purchased_slots", 0) if profile else 0
    return {"call_mode": "multi", "max_guests": FREE_GUEST_CAP + purchased}


async def _is_unlocked_guest(host_user_id: str, guest_user_id: str, db) -> bool:
    conn = await db["drop_connections"].find_one({
        "sender_id": host_user_id, "unlocker_id": guest_user_id, "removed_at": None,
    })
    return conn is not None


def _format_call(call: dict) -> dict:
    return {
        "id":          str(call["_id"]),
        "kind":        call.get("kind") or "group",
        "channel":     call["channel"],
        "host_user_id": call["host_user_id"],
        "status":      call["status"],
        "video":       call.get("video", True),
        "max_guests":  call["max_guests"],
        "guest_count": len(call.get("guest_user_ids", [])),
        "invite_only": bool(call.get("invited_user_ids")),
        "started_at":  _aware(call["started_at"]).isoformat(),
        "answered_at": _aware(call["answered_at"]).isoformat() if call.get("answered_at") else None,
    }


def _can_see_session(call: dict, viewer_id: str) -> bool:
    invited = call.get("invited_user_ids") or []
    if viewer_id == call["host_user_id"]:
        return True
    if viewer_id in (call.get("removed_user_ids") or []):
        return False
    return not invited or viewer_id in invited


async def get_active_call_for_host(host_user_id: str, db, viewer_id: Optional[str] = None) -> Optional[dict]:
    """Used by drops.py to embed `active_call` (a group session) in the messages poll response.
    Invite-only sessions show only to the people invited."""
    call = await db["drop_calls"].find_one({"host_user_id": host_user_id, "status": "active", **GROUP})
    if not call or (viewer_id and not _can_see_session(call, viewer_id)):
        return None
    return _format_call(call)


async def _expire_rings(db) -> None:
    """Ringing direct calls past RING_SECONDS become missed (checked lazily on reads/starts)."""
    cutoff = _now() - timedelta(seconds=RING_SECONDS)
    async for call in db["drop_calls"].find({"kind": "direct", "status": "ringing", "started_at": {"$lt": cutoff}}):
        res = await db["drop_calls"].update_one(
            {"_id": call["_id"], "status": "ringing"}, {"$set": {"status": "missed", "ended_at": _now()}},
        )
        if res.modified_count:
            await _emit("call_missed", {"call_id": str(call["_id"])}, [call["host_user_id"], call["callee_id"]])
            names = await _people(db, [call["host_user_id"]])
            _push(call["callee_id"], "Missed call",
                  f"{names.get(call['host_user_id'], {}).get('name', 'Someone')} tried to call you.", db,
                  {"type": "call_missed", "url": f"/chat/{call['connection_id']}"}, "call")


async def _load(call_id: str, db) -> dict:
    try:
        call = await db["drop_calls"].find_one({"_id": ObjectId(call_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid call ID.")
    if not call:
        raise HTTPException(status_code=404, detail="Call not found.")
    return call


def _participant_ids(call: dict) -> list:
    if call.get("kind") == "direct":
        return [call["host_user_id"], call["callee_id"]]
    return [call["host_user_id"], *call.get("guest_user_ids", [])]


def _token_reply(call: dict, uid: int) -> dict:
    return {
        "call_id":  str(call["_id"]),
        "channel":  call["channel"],
        "token":    _generate_token(call["channel"], uid),
        "uid":      uid,
        "app_id":   settings.AGORA_APP_ID,
    }


# ==================== GROUP SESSIONS ====================

class StartSessionBody(BaseModel):
    invite_user_ids: Optional[list[str]] = None   # None/empty = everyone inside may join
    video: bool = True                             # False = starts as an audio session


@router.post("/start")
async def start_call(
    body: Optional[StartSessionBody] = None,
    current_user_id: str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    body = body or StartSessionBody()
    # A host restarting a session replaces any stale one — don't let a
    # forgotten "active" row from a crashed session lock them out forever.
    stale = await db["drop_calls"].find({"host_user_id": current_user_id, "status": "active", **GROUP}).to_list(None)
    if stale:
        await db["drop_calls"].update_many(
            {"_id": {"$in": [c["_id"] for c in stale]}}, {"$set": {"status": "ended", "ended_at": _now()}},
        )

    # Invites must be people currently inside this Room.
    invited = []
    if body.invite_user_ids:
        wanted = list(dict.fromkeys(body.invite_user_ids))[:50]
        async for conn in db["drop_connections"].find(
            {"sender_id": current_user_id, "unlocker_id": {"$in": wanted}, "removed_at": None}, {"unlocker_id": 1},
        ):
            if conn["unlocker_id"] not in invited:
                invited.append(conn["unlocker_id"])
        if not invited:
            raise HTTPException(status_code=400, detail="Invite people you've let in.")

    capacity = await _room_capacity(current_user_id, db)
    uid = _new_uid()
    now = _now()
    result = await db["drop_calls"].insert_one({
        "kind":            "group",
        "host_user_id":    current_user_id,
        "status":          "active",
        "video":           body.video,
        "max_guests":      capacity["max_guests"],
        "guest_user_ids":  [],
        "invited_user_ids": invited,
        "removed_user_ids": [],
        "uids":            {current_user_id: uid},
        "started_at":      now,
        "ended_at":        None,
    })
    call_id = str(result.inserted_id)
    channel = f"dropcall_{call_id}"
    await db["drop_calls"].update_one({"_id": result.inserted_id}, {"$set": {"channel": channel}})
    call = await db["drop_calls"].find_one({"_id": result.inserted_id})

    # Instant nudge to the people who may join; the chat poll / Live tab are the fallback.
    me = (await _people(db, [current_user_id])).get(current_user_id, {})
    targets = invited or [c["unlocker_id"] async for c in db["drop_connections"].find(
        {"sender_id": current_user_id, "removed_at": None}, {"unlocker_id": 1})]
    for guest_id in dict.fromkeys(targets):
        if await is_blocked_between(db, current_user_id, guest_id):
            continue
        _push(guest_id, "A session is live 📞",
              f"{me.get('name', 'Someone')} {'invited you to' if invited else 'opened'} a {'video' if body.video else 'voice'} session. Join in.",
              db, {"type": "session_started", "call_id": call_id, "url": f"/room/{current_user_id}"}, "session")
        await _emit("drop_call_started", {
            "host_user_id": current_user_id, "call_id": call_id, "max_guests": capacity["max_guests"],
            "invited": bool(invited), "video": body.video, "host_name": me.get("name"),
        }, [guest_id])

    return {
        **_token_reply(call, uid),
        "call_mode":   capacity["call_mode"],
        "max_guests":  capacity["max_guests"],
        "video":       body.video,
        "kind":        "group",
    }


@router.post("/{call_id}/join")
async def join_call(
    call_id:          str,
    current_user_id:  str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    call = await _load(call_id, db)
    if call.get("kind") == "direct":
        raise HTTPException(status_code=400, detail="Answer this call instead.")
    if call["status"] != "active":
        raise HTTPException(status_code=404, detail="This call has ended.")

    host_id = call["host_user_id"]
    if current_user_id == host_id:
        raise HTTPException(status_code=400, detail="You're already hosting this call.")

    if not await _is_unlocked_guest(host_id, current_user_id, db) or await is_blocked_between(db, host_id, current_user_id):
        raise HTTPException(status_code=403, detail="Only people let into this Room can join.")
    if current_user_id in (call.get("removed_user_ids") or []):
        raise HTTPException(status_code=403, detail="The host took you out of this session.")
    if call.get("invited_user_ids") and current_user_id not in call["invited_user_ids"]:
        raise HTTPException(status_code=403, detail="This session is invite-only.")

    # Claim a seat atomically, so two people can't take the last one at once.
    uid = (call.get("uids") or {}).get(current_user_id) or _new_uid()
    claimed = await db["drop_calls"].find_one_and_update(
        {"_id": call["_id"], "status": "active", "$or": [
            {"guest_user_ids": current_user_id},
            {"$expr": {"$lt": [{"$size": {"$ifNull": ["$guest_user_ids", []]}}, "$max_guests"]}},
        ]},
        {"$addToSet": {"guest_user_ids": current_user_id}, "$set": {f"uids.{current_user_id}": uid}},
    )
    if not claimed:
        raise HTTPException(status_code=409, detail="This session is full right now.")

    await _emit("drop_call_guest_joined", {"call_id": call_id, "guest_user_id": current_user_id}, [host_id])
    return {**_token_reply(call, uid), "kind": "group", "video": call.get("video", True)}


class TargetBody(BaseModel):
    user_id: str


@router.post("/{call_id}/remove")
async def remove_participant(
    call_id: str,
    body: TargetBody,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Host takes someone out of the session (they can't rejoin it). Their Room access is untouched."""
    call = await _load(call_id, db)
    if call["host_user_id"] != current_user_id or call.get("kind") == "direct":
        raise HTTPException(status_code=403, detail="Only the host can do that.")
    if call["status"] != "active":
        raise HTTPException(status_code=404, detail="This session has ended.")
    await db["drop_calls"].update_one(
        {"_id": call["_id"]},
        {"$pull": {"guest_user_ids": body.user_id}, "$addToSet": {"removed_user_ids": body.user_id}},
    )
    await _emit("drop_call_removed", {"call_id": call_id}, [body.user_id])
    await _emit("drop_call_participants", {"call_id": call_id}, [current_user_id])
    return {"removed": True}


@router.post("/{call_id}/mute")
async def ask_to_mute(
    call_id: str,
    body: TargetBody,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Host mutes a participant's mic (their app mutes it; they can unmute themselves)."""
    call = await _load(call_id, db)
    if call["host_user_id"] != current_user_id or call.get("kind") == "direct":
        raise HTTPException(status_code=403, detail="Only the host can do that.")
    if body.user_id not in call.get("guest_user_ids", []):
        raise HTTPException(status_code=404, detail="They're not in this session.")
    await _emit("drop_call_mute", {"call_id": call_id}, [body.user_id])
    return {"muted": True}


# ==================== DIRECT CALLS ====================

class DirectCallBody(BaseModel):
    connection_id: str
    video: bool = False


@router.post("/direct")
async def start_direct_call(
    body: DirectCallBody,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Ring the other person in an open Room conversation."""
    try:
        conn = await db["drop_connections"].find_one({"_id": ObjectId(body.connection_id)})
    except Exception:
        conn = None
    if not conn or current_user_id not in (conn["sender_id"], conn["unlocker_id"]):
        raise HTTPException(status_code=404, detail="Conversation not found.")
    if conn.get("removed_at"):
        raise HTTPException(status_code=403, detail="This Room is closed to you.")
    callee_id = conn["unlocker_id"] if conn["sender_id"] == current_user_id else conn["sender_id"]
    if await is_blocked_between(db, current_user_id, callee_id):
        raise HTTPException(status_code=404, detail="Conversation not found.")

    names = await _people(db, [current_user_id, callee_id])
    callee_name = names.get(callee_id, {}).get("name", "They")
    prefs = await db["chat_profiles"].find_one({"user_id": callee_id}, {"allow_audio_calls": 1, "allow_video_calls": 1}) or {}
    if prefs.get("allow_video_calls" if body.video else "allow_audio_calls", True) is False:
        raise HTTPException(status_code=403, detail=f"{callee_name} isn't taking {'video' if body.video else 'voice'} calls right now. Send a message instead.")

    await _expire_rings(db)
    # One live direct call per person: end my own stale rings, refuse if they're busy.
    await db["drop_calls"].update_many(
        {"kind": "direct", "host_user_id": current_user_id, "status": "ringing"},
        {"$set": {"status": "cancelled", "ended_at": _now()}},
    )
    busy = await db["drop_calls"].find_one({
        "kind": "direct", "status": {"$in": ["ringing", "active"]},
        "$or": [{"host_user_id": callee_id}, {"callee_id": callee_id}],
    }, {"_id": 1})
    if busy:
        raise HTTPException(status_code=409, detail=f"{callee_name} is on another call. Try again soon.")

    uid = _new_uid()
    now = _now()
    res = await db["drop_calls"].insert_one({
        "kind": "direct",
        "host_user_id": current_user_id,
        "callee_id": callee_id,
        "connection_id": body.connection_id,
        "video": body.video,
        "status": "ringing",
        "max_guests": 1,
        "guest_user_ids": [],
        "uids": {current_user_id: uid},
        "started_at": now,
        "answered_at": None,
        "ended_at": None,
    })
    channel = f"dropcall_{res.inserted_id}"
    await db["drop_calls"].update_one({"_id": res.inserted_id}, {"$set": {"channel": channel}})
    call = await db["drop_calls"].find_one({"_id": res.inserted_id})
    me = names.get(current_user_id, {})

    await _emit("call_incoming", {
        "call_id": str(call["_id"]), "connection_id": body.connection_id, "video": body.video,
        "caller_id": current_user_id, "caller_name": me.get("name"), "caller_avatar": me.get("avatar_url"),
        "ring_seconds": RING_SECONDS,
    }, [callee_id])
    _push(callee_id, f"{me.get('name', 'Someone')} is calling 📞",
          f"Incoming {'video' if body.video else 'voice'} call. Open Anonixx to answer.", db,
          {"type": "call_incoming", "call_id": str(call["_id"]), "connection_id": body.connection_id,
           "url": f"/chat/{body.connection_id}?call={call['_id']}"}, "call")

    return {
        **_token_reply(call, uid), "kind": "direct", "video": body.video, "status": "ringing",
        "ring_seconds": RING_SECONDS, "other": {"user_id": callee_id, **names.get(callee_id, {})},
    }


@router.post("/{call_id}/accept")
async def accept_direct_call(
    call_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    call = await _load(call_id, db)
    if call.get("kind") != "direct" or call.get("callee_id") != current_user_id:
        raise HTTPException(status_code=403, detail="This call isn't for you.")
    await _expire_rings(db)
    uid = _new_uid()
    claimed = await db["drop_calls"].find_one_and_update(
        {"_id": call["_id"], "status": "ringing"},
        {"$set": {"status": "active", "answered_at": _now(), "guest_user_ids": [current_user_id],
                  f"uids.{current_user_id}": uid}},
    )
    if not claimed:
        raise HTTPException(status_code=410, detail="This call has ended.")
    # The Room may have closed while it rang.
    conn = await db["drop_connections"].find_one({"_id": ObjectId(call["connection_id"])}, {"removed_at": 1})
    if not conn or conn.get("removed_at") or await is_blocked_between(db, call["host_user_id"], current_user_id):
        await db["drop_calls"].update_one({"_id": call["_id"]}, {"$set": {"status": "ended", "ended_at": _now()}})
        raise HTTPException(status_code=410, detail="This call has ended.")
    await _emit("call_accepted", {"call_id": call_id}, [call["host_user_id"]])
    names = await _people(db, [call["host_user_id"]])
    return {
        **_token_reply(call, uid), "kind": "direct", "video": call.get("video", False), "status": "active",
        "other": {"user_id": call["host_user_id"], **names.get(call["host_user_id"], {})},
    }


@router.post("/{call_id}/decline")
async def decline_direct_call(
    call_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    call = await _load(call_id, db)
    if call.get("kind") != "direct" or call.get("callee_id") != current_user_id:
        raise HTTPException(status_code=403, detail="This call isn't for you.")
    res = await db["drop_calls"].update_one(
        {"_id": call["_id"], "status": "ringing"}, {"$set": {"status": "declined", "ended_at": _now()}},
    )
    if res.modified_count:
        await _emit("call_declined", {"call_id": call_id}, [call["host_user_id"]])
    return {"declined": True}


# ==================== SHARED ====================

@router.post("/{call_id}/leave")
async def leave_call(
    call_id:          str,
    current_user_id:  str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    call = await _load(call_id, db)
    if call["status"] not in ("active", "ringing"):
        return {"message": "Already ended."}
    if call.get("kind") == "direct":
        if current_user_id not in (call["host_user_id"], call["callee_id"]):
            raise HTTPException(status_code=403, detail="Not your call.")
        return await _end_call(call, db, by=current_user_id)

    if current_user_id == call["host_user_id"]:
        return await _end_call(call, db, by=current_user_id)

    await db["drop_calls"].update_one(
        {"_id": call["_id"]},
        {"$pull": {"guest_user_ids": current_user_id}},
    )
    await _emit("drop_call_participants", {"call_id": call_id}, [call["host_user_id"]])
    return {"message": "Left the call."}


@router.post("/{call_id}/end")
async def end_call(
    call_id:          str,
    current_user_id:  str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    call = await _load(call_id, db)
    if call.get("kind") == "direct":
        if current_user_id not in (call["host_user_id"], call["callee_id"]):
            raise HTTPException(status_code=403, detail="Not your call.")
    elif call["host_user_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Only the host can end this call.")
    return await _end_call(call, db, by=current_user_id)


async def _end_call(call: dict, db, by: Optional[str] = None) -> dict:
    """Ends the call only. Connections and messages are never touched here."""
    was_ringing = call.get("status") == "ringing"
    new_status = "cancelled" if was_ringing else "ended"
    res = await db["drop_calls"].update_one(
        {"_id": call["_id"], "status": {"$in": ["active", "ringing"]}},
        {"$set": {"status": new_status, "ended_at": _now(), "ended_by": by}},
    )
    if not res.modified_count:
        return {"message": "Already ended."}
    cid = str(call["_id"])
    others = [u for u in _participant_ids(call) if u != by]
    if call.get("kind") == "direct" and was_ringing:
        await _emit("call_cancelled", {"call_id": cid}, others)
        names = await _people(db, [call["host_user_id"]])
        _push(call["callee_id"], "Missed call",
              f"{names.get(call['host_user_id'], {}).get('name', 'Someone')} tried to call you.", db,
              {"type": "call_missed", "url": f"/chat/{call['connection_id']}"}, "call")
    else:
        await _emit("drop_call_ended", {"call_id": cid}, others)
    return {"message": "Call ended."}


@router.post("/{call_id}/renew")
async def renew_token(
    call_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """A fresh token for someone still in the call (Agora warns ~30s before expiry)."""
    call = await _load(call_id, db)
    if call["status"] != "active" or current_user_id not in _participant_ids(call):
        raise HTTPException(status_code=410, detail="This call has ended.")
    uid = (call.get("uids") or {}).get(current_user_id)
    if not uid:
        raise HTTPException(status_code=410, detail="This call has ended.")
    return {"token": _generate_token(call["channel"], uid)}


@router.get("/live")
async def live_calls(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """The Live tab: my open session, sessions I can join, and my ringing/active direct calls."""
    await _expire_rings(db)
    hosting = await db["drop_calls"].find_one({"host_user_id": current_user_id, "status": "active", **GROUP})
    host_ids = [c["sender_id"] async for c in db["drop_connections"].find(
        {"unlocker_id": current_user_id, "removed_at": None}, {"sender_id": 1})]
    sessions = []
    if host_ids:
        async for call in db["drop_calls"].find({"host_user_id": {"$in": list(set(host_ids))}, "status": "active", **GROUP}):
            if _can_see_session(call, current_user_id) and not await is_blocked_between(db, call["host_user_id"], current_user_id):
                sessions.append(call)
    direct = await db["drop_calls"].find({
        "kind": "direct", "status": {"$in": ["ringing", "active"]},
        "$or": [{"host_user_id": current_user_id}, {"callee_id": current_user_id}],
    }).to_list(20)

    people = await _people(db, [c["host_user_id"] for c in sessions] + [current_user_id]
                           + [u for c in direct for u in (c["host_user_id"], c["callee_id"])])

    def fmt_session(c):
        return {**_format_call(c), "host": {"user_id": c["host_user_id"], **people.get(c["host_user_id"], {})},
                "joined": current_user_id in c.get("guest_user_ids", [])}

    def fmt_direct(c):
        other = c["callee_id"] if c["host_user_id"] == current_user_id else c["host_user_id"]
        return {**_format_call(c), "connection_id": c.get("connection_id"),
                "incoming": c["callee_id"] == current_user_id,
                "other": {"user_id": other, **people.get(other, {})}}

    return {
        "hosting": fmt_session(hosting) if hosting else None,
        "sessions": [fmt_session(c) for c in sessions],
        "direct": [fmt_direct(c) for c in direct],
    }


def _mine(user_id: str) -> dict:
    return {
        "$or": [{"host_user_id": user_id}, {"callee_id": user_id}, {f"uids.{user_id}": {"$exists": True}}],
        "hidden_for": {"$ne": user_id},
    }


@router.get("/history")
async def call_history(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """The Calls tab log: my 1-to-1 calls (in, out, missed, declined) and sessions I hosted or
    joined, newest first."""
    await _expire_rings(db)
    calls = await db["drop_calls"].find(_mine(current_user_id)).sort("started_at", -1).to_list(80)
    people = await _people(db, [u for c in calls for u in (c["host_user_id"], c.get("callee_id"))])
    out = []
    for c in calls:
        direct = c.get("kind") == "direct"
        outgoing = c["host_user_id"] == current_user_id
        status = c["status"]
        started = _aware(c["started_at"])
        ended = _aware(c.get("ended_at"))
        answered = _aware(c.get("answered_at"))
        if direct:
            other = c["callee_id"] if outgoing else c["host_user_id"]
            begin = answered
        else:
            other = c["host_user_id"]
            begin = started
        seconds = int((ended - begin).total_seconds()) if ended and begin else None
        out.append({
            "id": str(c["_id"]),
            "kind": "direct" if direct else "group",
            "video": c.get("video", not direct),
            "status": status,
            "direction": ("outgoing" if outgoing else "incoming") if direct else ("hosted" if outgoing else "joined"),
            # Missed = rang for me and I never picked up.
            "missed": direct and not outgoing and status in ("missed", "cancelled"),
            "started_at": started.isoformat(),
            "duration_seconds": seconds,
            "connection_id": c.get("connection_id"),
            "guest_count": len(c.get("uids") or {}) - 1 if not direct else None,
            "other": None if (not direct and outgoing) else {"user_id": other, **people.get(other, {})},
        })
    return {"calls": out}


@router.post("/history/clear")
async def clear_call_history(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Clear my call log (calls still running are kept). Only hides them for me."""
    q = _mine(current_user_id)
    q["status"] = {"$nin": ["ringing", "active"]}
    res = await db["drop_calls"].update_many(q, {"$addToSet": {"hidden_for": current_user_id}})
    return {"cleared": res.modified_count}


@router.get("/{call_id}")
async def call_details(
    call_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Who's in a call, for the participant list (host, guests, and their Agora uids)."""
    call = await _load(call_id, db)
    allowed = current_user_id in _participant_ids(call) or (
        call.get("kind") != "direct" and _can_see_session(call, current_user_id)
        and await _is_unlocked_guest(call["host_user_id"], current_user_id, db)
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Not your call.")
    ids = _participant_ids(call)
    if call.get("kind") == "direct" and call["status"] == "ringing":
        ids = [call["host_user_id"]]
    people = await _people(db, ids)
    uids = call.get("uids") or {}
    return {
        **_format_call(call),
        "is_host": current_user_id == call["host_user_id"],
        "participants": [
            {"user_id": u, "uid": uids.get(u), "is_host": u == call["host_user_id"], **people.get(u, {"name": "Anonymous"})}
            for u in ids
        ],
    }


async def drop_user_from_calls(a: str, b: str, db) -> None:
    """After a removal or block between a and b: end their direct calls and take each out of
    the other's group session. Used by drops.close_connections_between / remove_from_room."""
    async for call in db["drop_calls"].find({
        "kind": "direct", "status": {"$in": ["ringing", "active"]},
        "$or": [{"host_user_id": a, "callee_id": b}, {"host_user_id": b, "callee_id": a}],
    }):
        await _end_call(call, db, by=a)
    for host, guest in ((a, b), (b, a)):
        call = await db["drop_calls"].find_one({"host_user_id": host, "status": "active", **GROUP})
        if call and guest in (call.get("guest_user_ids") or []) + (call.get("invited_user_ids") or []):
            await db["drop_calls"].update_one(
                {"_id": call["_id"]},
                # Never shrink invited_user_ids: an emptied list would open the session to everyone.
                {"$pull": {"guest_user_ids": guest}, "$addToSet": {"removed_user_ids": guest}},
            )
            await _emit("drop_call_removed", {"call_id": str(call["_id"])}, [guest])
