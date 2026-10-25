"""
unlock_requests.py — owner-approval gate in front of confession unlocks.

Unlocking a confession (drop) used to be instant: pay coins, get a chat
connection, no say from the confession's owner. This module turns it into
a request the owner must Accept (or Accept All, per-confession) before any
coins move and before a chat connection exists.

Data model — one row per attempt in `drop_unlock_requests`:
    target_type   "drop" — kept as an explicit field (rather than assumed)
                          since a prior version of this module also
                          supported "circle_comment" targets; the field
                          stays so historical rows still read correctly.
    target_id, owner_id, requester_id, requester_anonymous_name,
    confession_snippet, payment_method ("coins" only for now — see
    create_unlock_request), status ("pending"|"accepting"|"accepted"|
    "declined"|"cancelled"|"expired"), connection_id, created_at,
    responded_at, expires_at

In the product this is a Knock on someone's Room: free to send, the owner
Lets In or Declines, and the visitor's coins move only on Let In.

Resolved rows are kept (not deleted) so a decline isn't a dead end — the
requester can send a fresh request later, and the owner's review screen
keeps a little history. No coin escrow exists: nothing is charged until
accept. Sending checks the visitor can cover the cost right now, and accept
re-checks atomically (debit_coins only succeeds if the balance covers it),
so a Let In can never overdraw or double-charge.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id
from app.utils.coin_service import debit_coins
from app.api.v1.drops import _ensure_aware, send_push_notification, AGE_GATE_DETAIL
from app.utils.contact_filter import contains_contact_info, CONTACT_INFO_ERROR
from app.utils.moderation import violates_policy, MODERATION_ERROR
from app.api.v1.chat_profile import gallery_for, is_blocked_between, room_theme_of

# Pending requests now carry their own clock. They used to inherit the
# confession's expiry, but drops no longer expire until they're unlocked —
# without this a request nobody answered would sit in an owner's inbox
# forever.
REQUEST_EXPIRY_DAYS = 7
from app.websockets.unlock_requests import (
    emit_unlock_request_received,
    emit_unlock_request_accepted,
    emit_unlock_request_declined,
    emit_unlock_request_cancelled,
)

router = APIRouter(prefix="/unlock-requests", tags=["Unlock Requests"])


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


MAX_REQUEST_VIDEO_SECONDS = 30   # a quick clue, not a full drop-style upload

# A link up is a pitch, not just a button: one line plus quick-intent chips, shown
# to the poster before they accept (the sender's own Room goes along as their clue).
MAX_PITCH_CHARS = 120
INTENT_CHIPS = {"free-tonight", "can-host", "can-pick-up", "drinks-first", "just-talk", "nearby"}

class CreateUnlockRequestBody(BaseModel):
    target_type: str            # "drop" — the only target type now
    target_id: str
    payment_method: str = "coins"
    # Optional — a photo or short video the requester chooses to attach so
    # the owner has some idea who they'd be accepting. Never required to
    # unlock; uploaded client-side via the existing /upload/sign flow first,
    # this just carries the resulting URL.
    media_url: Optional[str] = None
    media_type: Optional[str] = None       # "image" | "video"
    media_duration: Optional[float] = None  # seconds, video only
    pitch: Optional[str] = None             # one line the poster reads before accepting
    intents: Optional[List[str]] = None     # from INTENT_CHIPS
    # Sent from the poster's profile/Room rather than the post itself — the only
    # way to link up on a regular confession, which has no Link up button.
    via_profile: bool = False


class AcceptAllBody(BaseModel):
    target_type: str
    target_id: str


# ==================== HELPERS ====================

async def _resolve_target(target_type: str, target_id: str, db) -> dict:
    """Returns {doc, owner_id, target_expires_at, confession_snippet}.

    `target_expires_at` is None for anything that never expires — which is
    every drop until its first unlock, and every plain feed post. It is NOT
    the request's own expiry; see REQUEST_EXPIRY_DAYS for that.
    """
    if target_type != "drop":
        raise HTTPException(status_code=400, detail="target_type must be 'drop'.")

    try:
        doc = await db["drops"].find_one({"_id": ObjectId(target_id)})
    except Exception:
        doc = None
    if not doc:
        raise HTTPException(status_code=404, detail="Drop not found.")
    exp = doc.get("expires_at")
    return {
        "doc": doc,
        "owner_id": doc["sender_id"],
        "target_expires_at": _ensure_aware(exp) if exp else None,
        "confession_snippet": (doc.get("confession") or "")[:140],
    }


async def _create_connection_for_target(target_type: str, target_id: str, target_doc: dict, requester_id: str, db) -> str:
    from app.api.v1.drops import _create_drop_connection
    return await _create_drop_connection(target_id, target_doc, requester_id, db)


async def _charge_and_complete(req: dict, target_doc: dict, db) -> str:
    """The actual coins-move-now step, run only once a request is accepted.
    Raises ValueError on insufficient coins — caller reverts the request to
    pending rather than losing or auto-declining it."""
    target_type  = req["target_type"]
    target_id    = req["target_id"]
    requester_id = req["requester_id"]

    from app.api.v1.drops import (
        ORIGIN_AUTHOR_UNLOCK_COST, _complete_unlock, unlock_cost_for,
    )

    # Origin-author discount, mirroring unlock_drop_coins — if this drop
    # was inspired by a post the requester themself wrote, they pay less.
    is_origin_author = False
    origin_post_id = target_doc.get("inspired_by_post_id")
    if origin_post_id:
        try:
            origin_post = await db["posts"].find_one({"_id": ObjectId(origin_post_id)})
            if origin_post and origin_post.get("user_id") == requester_id:
                is_origin_author = True
        except Exception:
            pass
    cost = (
        ORIGIN_AUTHOR_UNLOCK_COST if is_origin_author
        else await unlock_cost_for(requester_id, db)
    )

    if cost > 0:
        await debit_coins(
            db=db, user_id=requester_id, amount=cost, reason="drop_reveal",
            description=(
                "Unlocked a drop inspired by your confession" if is_origin_author
                else "Unlocked a drop confession"
            ),
            meta={"drop_id": target_id, "origin_author": is_origin_author},
        )
    unlock_method = "origin_author_discounted" if is_origin_author else "coins"
    await _complete_unlock(target_id, requester_id, target_doc, unlock_method, db, coin_equivalent=cost)

    return await _create_connection_for_target(target_type, target_id, target_doc, requester_id, db)


async def _accept_one(request_oid: ObjectId, owner_id: str, db) -> dict:
    """Atomically claims one pending request, charges it, and completes the
    unlock. Returns {error: None, connection_id} on success, or
    {error: "not_found"|"payment_failed", reason?}."""
    claimed = await db["drop_unlock_requests"].find_one_and_update(
        {"_id": request_oid, "owner_id": owner_id, "status": "pending", "expires_at": {"$gt": now_utc()}},
        {"$set": {"status": "accepting"}},
        return_document=True,
    )
    if not claimed:
        return {"error": "not_found"}
    if await is_blocked_between(db, owner_id, claimed["requester_id"]):
        await db["drop_unlock_requests"].update_one(
            {"_id": request_oid}, {"$set": {"status": "declined", "responded_at": now_utc()}},
        )
        return {"error": "not_found"}

    try:
        target = await _resolve_target(claimed["target_type"], claimed["target_id"], db)
        connection_id = await _charge_and_complete(claimed, target["doc"], db)
    except ValueError as e:
        await db["drop_unlock_requests"].update_one(
            {"_id": request_oid}, {"$set": {"status": "pending"}},
        )
        return {"error": "payment_failed", "reason": str(e) or "Not enough coins."}
    except Exception:
        await db["drop_unlock_requests"].update_one(
            {"_id": request_oid}, {"$set": {"status": "pending"}},
        )
        return {"error": "payment_failed", "reason": "Something went wrong completing this unlock."}

    await db["drop_unlock_requests"].update_one(
        {"_id": request_oid},
        {"$set": {"status": "accepted", "responded_at": now_utc(), "connection_id": connection_id}},
    )
    await emit_unlock_request_accepted(claimed["requester_id"], {
        "request_id": str(request_oid), "connection_id": connection_id,
    })
    await send_push_notification(
        claimed["requester_id"], "You're inside 🔥", "They let you in. The Room is open, go say something.", db,
        # Lands on the owner's Room so the visitor gets the "You're inside" moment first.
        data={"type": "linkup_accepted", "connection_id": connection_id, "room_user_id": owner_id,
              "url": f"/room/{owner_id}"},
    )
    return {"error": None, "connection_id": connection_id}


# ==================== ENDPOINTS ====================

@router.post("", status_code=201)
async def create_unlock_request(
    data: CreateUnlockRequestBody,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    if data.target_type != "drop":
        raise HTTPException(status_code=400, detail="target_type must be 'drop'.")
    if data.payment_method != "coins":
        # Stripe/M-Pesa need an off-session charge design (SetupIntent, SCA
        # fallback) that doesn't exist yet — reject cleanly instead of
        # shipping a half-working delayed charge.
        raise HTTPException(status_code=501, detail="Only coin unlocks are supported right now.")

    if data.media_url:
        if data.media_type not in ("image", "video"):
            raise HTTPException(status_code=400, detail="media_type must be 'image' or 'video'.")
        if data.media_type == "video" and (data.media_duration or 0) > MAX_REQUEST_VIDEO_SECONDS:
            raise HTTPException(
                status_code=400,
                detail=f"Video clue must be {MAX_REQUEST_VIDEO_SECONDS}s or shorter.",
            )

    pitch = (data.pitch or "").strip()[:MAX_PITCH_CHARS] or None
    if pitch and contains_contact_info(pitch):
        raise HTTPException(status_code=400, detail=CONTACT_INFO_ERROR)
    if pitch and violates_policy(pitch):
        raise HTTPException(status_code=400, detail=MODERATION_ERROR)
    intents = [i for i in dict.fromkeys(data.intents or []) if i in INTENT_CHIPS][:4]

    requester = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    if requester and not requester.get("age_verified") and not requester.get("is_admin"):
        raise HTTPException(status_code=403, detail=AGE_GATE_DETAIL)

    target = await _resolve_target(data.target_type, data.target_id, db)
    doc, owner_id, target_expires_at, snippet = (
        target["doc"], target["owner_id"], target["target_expires_at"],
        target["confession_snippet"],
    )

    if owner_id == current_user_id:
        raise HTTPException(status_code=400, detail="That's your own Room.")
    if await is_blocked_between(db, owner_id, current_user_id):
        raise HTTPException(status_code=404, detail="Room not found.")
    owner_room = await db["chat_profiles"].find_one({"user_id": owner_id}, {"knocks_open": 1}) or {}
    if owner_room.get("knocks_open") is False:
        raise HTTPException(status_code=403, detail="This Room isn't taking knocks right now.")
    if doc.get("is_admin_drop"):
        raise HTTPException(status_code=400, detail="This drop can't be unlocked.")
    if doc.get("kind") == "confession" and not data.via_profile:
        raise HTTPException(status_code=400, detail="This is a regular confession. Knock from their Room instead.")
    # None = never expires (un-unlocked drop, or a plain feed post).
    if target_expires_at is not None and target_expires_at < now_utc():
        raise HTTPException(status_code=400, detail="This confession has expired.")
    if doc.get("live_until") and _ensure_aware(doc["live_until"]) < now_utc():
        raise HTTPException(status_code=400, detail="This post has ended. Catch them on their next one.")

    # The request's own window, independent of the confession's lifetime.
    expires_at = now_utc() + timedelta(days=REQUEST_EXPIRY_DAYS)

    existing_unlock = await db["drop_unlocks"].find_one(
        {"drop_id": data.target_id, "unlocker_id": current_user_id}, sort=[("created_at", -1)],
    )
    # Someone the owner removed has to Knock again, so their old unlock
    # doesn't count as an open door.
    removed = existing_unlock and existing_unlock.get("connection_id") and await db["drop_connections"].count_documents(
        {"_id": ObjectId(existing_unlock["connection_id"]), "removed_at": {"$ne": None}},
    )
    if existing_unlock and not removed:
        connection_id = existing_unlock.get("connection_id") or await _create_connection_for_target(
            data.target_type, data.target_id, doc, current_user_id, db,
        )
        return {"already_unlocked": True, "connection_id": connection_id}

    existing_pending = await db["drop_unlock_requests"].find_one({
        "target_type": data.target_type, "target_id": data.target_id,
        "requester_id": current_user_id, "status": "pending",
    })
    if existing_pending:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "You already have a pending request for this confession.",
                "request_id": str(existing_pending["_id"]),
            },
        )

    # A Knock is free to send, but only from someone who could pay if let
    # in. Accept checks again atomically; this just stops dead-end knocks.
    from app.api.v1.drops import unlock_cost_for
    cost = await unlock_cost_for(current_user_id, db)
    if cost > 0 and (requester or {}).get("coin_balance", 0) < cost:
        raise HTTPException(
            status_code=402,
            detail=f"You need {cost} coins to knock. Nothing is charged unless they let you in.",
        )

    requester_name = requester.get("anonymous_name", "Anonymous") if requester else "Anonymous"

    # Mutual link up: they already asked to link up with you. Connect both of you
    # now, free — the "match" moment.
    mutual = await _try_mutual(data, doc, owner_id, current_user_id, requester_name, pitch, intents, db)
    if mutual:
        return mutual

    req_doc = {
        "_id": ObjectId(),
        "target_type": data.target_type,
        "target_id": data.target_id,
        "owner_id": owner_id,
        "requester_id": current_user_id,
        "requester_anonymous_name": requester_name,
        "confession_snippet": snippet,
        "payment_method": data.payment_method,
        "media_url": data.media_url,
        "media_type": data.media_type,
        "media_duration": data.media_duration,
        "pitch": pitch,
        "intents": intents,
        "status": "pending",
        "connection_id": None,
        "created_at": now_utc(),
        "responded_at": None,
        "expires_at": expires_at,
    }
    await db["drop_unlock_requests"].insert_one(req_doc)
    request_id = str(req_doc["_id"])

    await emit_unlock_request_received(owner_id, {
        "request_id": request_id, "target_type": data.target_type, "target_id": data.target_id,
        "requester_anonymous_name": requester_name,
    })
    await send_push_notification(
        owner_id,
        f"{requester_name} knocked on your Room 🔥",
        f"“{pitch}”" if pitch else "Peek through their window, then let them in or decline.",
        db,
        data={"type": "linkup_request", "request_id": request_id, "url": f"/inbox?request={request_id}"},
        category="linkup_request",
    )

    return {"request_id": request_id, "status": "pending", "expires_at": expires_at.isoformat()}


async def _try_mutual(data, doc, owner_id, requester_id, requester_name, pitch, intents, db) -> Optional[dict]:
    """If the poster already has a pending link up to the requester, accept both
    sides free. No coins move and no poster reward is credited (two accounts
    shouldn't be able to farm rewards off each other)."""
    reverse = await db["drop_unlock_requests"].find_one_and_update(
        {"owner_id": requester_id, "requester_id": owner_id, "status": "pending", "expires_at": {"$gt": now_utc()}},
        {"$set": {"status": "accepting"}},
        return_document=True,
    )
    if not reverse:
        return None
    try:
        connection_id = await _complete_free(data.target_id, requester_id, doc, db)
    except Exception:
        await db["drop_unlock_requests"].update_one({"_id": reverse["_id"]}, {"$set": {"status": "pending"}})
        return None
    now = now_utc()
    await db["drop_unlock_requests"].update_one(
        {"_id": reverse["_id"]},
        {"$set": {"status": "accepted", "responded_at": now, "connection_id": connection_id, "mutual": True}},
    )
    mine = {
        "_id": ObjectId(), "target_type": data.target_type, "target_id": data.target_id,
        "owner_id": owner_id, "requester_id": requester_id, "requester_anonymous_name": requester_name,
        "confession_snippet": (doc.get("confession") or "")[:140], "payment_method": "mutual",
        "media_url": data.media_url, "media_type": data.media_type, "media_duration": data.media_duration,
        "pitch": pitch, "intents": intents, "status": "accepted", "mutual": True,
        "connection_id": connection_id, "created_at": now, "responded_at": now,
        "expires_at": now + timedelta(days=REQUEST_EXPIRY_DAYS),
    }
    await db["drop_unlock_requests"].insert_one(mine)
    for uid, rid in ((requester_id, mine["_id"]), (owner_id, reverse["_id"])):
        await emit_unlock_request_accepted(uid, {"request_id": str(rid), "connection_id": connection_id, "mutual": True})
        await send_push_notification(
            uid, "It's mutual 🔥", "You both knocked. You're inside each other's Room, say something.", db,
            data={"type": "linkup_mutual", "connection_id": connection_id, "url": f"/chat/{connection_id}"},
        )
    return {"mutual": True, "connection_id": connection_id, "status": "accepted"}


async def _complete_free(target_id: str, requester_id: str, doc: dict, db) -> str:
    """The unlock bookkeeping without a charge or a poster reward."""
    from app.api.v1.drops import grace_days_for
    await db["drop_unlocks"].insert_one({
        "_id": ObjectId(), "drop_id": target_id, "unlocker_id": requester_id, "sender_id": doc["sender_id"],
        "method": "mutual", "amount": 0, "sender_anonymous_name": doc.get("sender_anonymous_name"),
        "created_at": now_utc(),
    })
    await db["drops"].update_one({"_id": ObjectId(target_id)}, {"$inc": {"unlock_count": 1}})
    if doc.get("kind") != "confession":   # see _complete_unlock — confessions don't expire on link up
        grace_days = await grace_days_for(doc["sender_id"], db)
        await db["drops"].update_one(
            {"_id": ObjectId(target_id), "expires_at": None},
            {"$set": {"expires_at": now_utc() + timedelta(days=grace_days)}},
        )
    return await _create_connection_for_target("drop", target_id, doc, requester_id, db)


async def count_pending_incoming(db, user_id: str) -> int:
    return await db["drop_unlock_requests"].count_documents({
        "owner_id": user_id, "status": "pending",
    })


@router.get("/incoming")
async def list_incoming_requests(
    target_type: Optional[str] = Query(None),
    target_id: Optional[str] = Query(None),
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """The owner's inbox. Pass both target_type + target_id to scope to one
    confession (drives the per-confession Accept All button); omit both for
    everything, grouped client-side by target_id."""
    query = {"owner_id": current_user_id, "status": "pending"}
    if target_type and target_id:
        query["target_type"] = target_type
        query["target_id"] = target_id

    rows = await db["drop_unlock_requests"].find(query).sort([("target_id", 1), ("created_at", 1)]).to_list(length=None)

    # Same "resume before you accept" logic as the feed avatar — the owner
    # deciding whether to accept should see who's asking, not just a name,
    # same as the requester already sees the drop's own avatar before
    # sending the request. One batch lookup for the whole inbox.
    requester_ids = {r["requester_id"] for r in rows if r.get("requester_id")}
    requester_avatars: dict[str, Optional[str]] = {}
    requester_rooms: dict[str, dict] = {}
    if requester_ids:
        valid_oids = [ObjectId(rid) for rid in requester_ids if ObjectId.is_valid(rid)]
        async for u in db["users"].find({"_id": {"$in": valid_oids}}, {"avatar_url": 1}):
            requester_avatars[str(u["_id"])] = u.get("avatar_url")
        # Their Room is their clue: gallery thumbnails right in the inbox row.
        async for cp in db["chat_profiles"].find(
            {"user_id": {"$in": list(requester_ids)}},
            {"user_id": 1, "gallery": 1, "background_pattern": 1, "profile_picture_url": 1,
             "gallery_visibility": 1, "room_theme": 1},
        ):
            # Only what the knocker shows through their own window.
            cp["gallery"] = gallery_for(cp, current_user_id, cp["user_id"], inside=False)
            requester_rooms[cp["user_id"]] = cp

    requests = []
    for r in rows:
        requests.append({
            "id": str(r["_id"]),
            "target_type": r["target_type"],
            "target_id": r["target_id"],
            "confession_snippet": r.get("confession_snippet", ""),
            "requester_id": r["requester_id"],
            "requester_anonymous_name": r.get("requester_anonymous_name", "Anonymous"),
            "requester_avatar_url": (requester_rooms.get(r.get("requester_id"), {}).get("profile_picture_url")
                                     or requester_avatars.get(r.get("requester_id"))),
            "requester_gallery": [
                {"media_url": g.get("media_url"), "media_type": g.get("media_type")}
                for g in (requester_rooms.get(r.get("requester_id"), {}).get("gallery") or [])[:3]
            ],
            "requester_background": requester_rooms.get(r.get("requester_id"), {}).get("background_pattern"),
            "requester_theme": room_theme_of(requester_rooms.get(r.get("requester_id"), {})),
            "pitch": r.get("pitch"),
            "intents": r.get("intents") or [],
            "media_url": r.get("media_url"),
            "media_type": r.get("media_type"),
            "media_duration": r.get("media_duration"),
            "created_at": r["created_at"].isoformat(),
            "expires_at": r["expires_at"].isoformat(),
        })
    return {"requests": requests}


@router.get("/sent")
async def list_sent_requests(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """The requester's own requests — lets the waiting screen recover state
    after an app restart or a missed socket event."""
    requests = []
    async for r in db["drop_unlock_requests"].find({"requester_id": current_user_id}) \
            .sort("created_at", -1).limit(50):
        requests.append({
            "id": str(r["_id"]),
            "target_type": r["target_type"],
            "target_id": r["target_id"],
            "status": r["status"],
            "connection_id": r.get("connection_id"),
            "created_at": r["created_at"].isoformat(),
            "expires_at": r["expires_at"].isoformat(),
        })
    return {"requests": requests}


@router.get("/{request_id}/status")
async def get_request_status(
    request_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Poll target for the waiting screen — sockets are primary, this is the
    fallback. Also the entire expiry mechanism: a stale pending row is only
    ever flipped to "expired" lazily, right here, on read."""
    try:
        oid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Request not found.")

    req = await db["drop_unlock_requests"].find_one({"_id": oid})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req["requester_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not your request.")

    if req["status"] == "pending" and _ensure_aware(req["expires_at"]) <= now_utc():
        flipped = await db["drop_unlock_requests"].find_one_and_update(
            {"_id": oid, "status": "pending"},
            {"$set": {"status": "expired", "responded_at": now_utc()}},
            return_document=True,
        )
        if flipped:
            req = flipped

    return {"status": req["status"], "connection_id": req.get("connection_id")}


@router.post("/{request_id}/accept")
async def accept_unlock_request(
    request_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    try:
        oid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Request not found.")

    result = await _accept_one(oid, current_user_id, db)
    if result["error"] == "not_found":
        raise HTTPException(status_code=404, detail="Request not found, already handled, or expired.")
    if result["error"] == "payment_failed":
        raise HTTPException(status_code=402, detail=result["reason"])
    return {"accepted": True, "connection_id": result["connection_id"]}


@router.post("/accept-all")
async def accept_all_unlock_requests(
    data: AcceptAllBody,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Approves everyone currently waiting on ONE confession — scoped to
    target_id, never account-wide. Never aborts the batch on one failure
    (e.g. a requester who spent their coins elsewhere in the meantime)."""
    pending = []
    async for r in db["drop_unlock_requests"].find({
        "target_type": data.target_type, "target_id": data.target_id,
        "owner_id": current_user_id, "status": "pending",
    }):
        pending.append((r["_id"], r.get("requester_anonymous_name", "Anonymous")))

    accepted_count = 0
    failed = []
    for oid, requester_name in pending:
        result = await _accept_one(oid, current_user_id, db)
        if result["error"]:
            failed.append({
                "request_id": str(oid),
                "requester_anonymous_name": requester_name,
                "reason": result.get("reason", "Could not accept."),
            })
        else:
            accepted_count += 1

    return {"accepted_count": accepted_count, "failed": failed}


@router.post("/{request_id}/decline")
async def decline_unlock_request(
    request_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    try:
        oid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Request not found.")

    req = await db["drop_unlock_requests"].find_one_and_update(
        {"_id": oid, "owner_id": current_user_id, "status": "pending"},
        {"$set": {"status": "declined", "responded_at": now_utc()}},
        return_document=True,
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found or already handled.")

    await emit_unlock_request_declined(req["requester_id"], {"request_id": request_id})
    await send_push_notification(
        req["requester_id"], "Not this time",
        "No coins were charged. You can knock again later.", db,
    )
    return {"declined": True}


@router.post("/{request_id}/cancel")
async def cancel_unlock_request(
    request_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    try:
        oid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Request not found.")

    req = await db["drop_unlock_requests"].find_one_and_update(
        {"_id": oid, "requester_id": current_user_id, "status": "pending"},
        {"$set": {"status": "cancelled", "responded_at": now_utc()}},
        return_document=True,
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found or already handled.")

    await emit_unlock_request_cancelled(req["owner_id"], {"request_id": request_id})
    return {"cancelled": True}
