"""
unlock_requests.py — owner-approval gate in front of confession unlocks.

Unlocking a confession (post or drop) used to be instant: pay coins, get a
chat connection, no say from the confession's owner. This module turns it
into a request the owner must Accept (or Accept All, per-confession) before
any coins move and before a chat connection exists.

Data model — one row per attempt in `drop_unlock_requests`:
    target_type   "post" | "drop"       — posts and their mirrored drops are
                                            different Mongo documents with
                                            different ids; never conflate them
    target_id, owner_id, requester_id, requester_anonymous_name,
    confession_snippet, payment_method ("coins" only for now — see
    create_unlock_request), status ("pending"|"accepting"|"accepted"|
    "declined"|"cancelled"|"expired"), connection_id, created_at,
    responded_at, expires_at

Resolved rows are kept (not deleted) so a decline isn't a dead end — the
requester can send a fresh request later, and the owner's review screen
keeps a little history. No coin escrow exists or is needed: nothing is
charged until accept.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta, timezone
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id
from app.utils.coin_service import debit_coins
from app.api.v1.drops import CARD_EXPIRY_HOURS, _ensure_aware, send_push_notification
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

class CreateUnlockRequestBody(BaseModel):
    target_type: str            # "post" | "drop"
    target_id: str
    payment_method: str = "coins"
    # Optional — a photo or short video the requester chooses to attach so
    # the owner has some idea who they'd be accepting. Never required to
    # unlock; uploaded client-side via the existing /upload/sign flow first,
    # this just carries the resulting URL.
    media_url: Optional[str] = None
    media_type: Optional[str] = None       # "image" | "video"
    media_duration: Optional[float] = None  # seconds, video only


class AcceptAllBody(BaseModel):
    target_type: str
    target_id: str


# ==================== HELPERS ====================

async def _resolve_target(target_type: str, target_id: str, db) -> dict:
    """Returns {doc, owner_id, expires_at, confession_snippet} for a post or
    drop. Posts have no stored expiry — one is computed here from
    CARD_EXPIRY_HOURS and frozen onto the request at creation time."""
    if target_type == "post":
        try:
            doc = await db["posts"].find_one({"_id": ObjectId(target_id)})
        except Exception:
            doc = None
        if not doc:
            raise HTTPException(status_code=404, detail="Drop not found.")
        return {
            "doc": doc,
            "owner_id": doc["user_id"],
            "expires_at": doc["created_at"] + timedelta(hours=CARD_EXPIRY_HOURS),
            "confession_snippet": (doc.get("content") or "")[:140],
        }

    if target_type == "drop":
        try:
            doc = await db["drops"].find_one({"_id": ObjectId(target_id)})
        except Exception:
            doc = None
        if not doc:
            raise HTTPException(status_code=404, detail="Drop not found.")
        return {
            "doc": doc,
            "owner_id": doc["sender_id"],
            "expires_at": _ensure_aware(doc["expires_at"]),
            "confession_snippet": (doc.get("confession") or "")[:140],
        }

    raise HTTPException(status_code=400, detail="target_type must be 'post' or 'drop'.")


async def _create_connection_for_target(target_type: str, target_id: str, target_doc: dict, requester_id: str, db) -> str:
    if target_type == "post":
        from app.api.v1.posts import _create_post_connection
        return await _create_post_connection(target_id, target_doc, requester_id, db)
    from app.api.v1.drops import _create_drop_connection
    return await _create_drop_connection(target_id, target_doc, requester_id, db)


async def _charge_and_complete(req: dict, target_doc: dict, db) -> str:
    """The actual coins-move-now step, run only once a request is accepted.
    Raises ValueError on insufficient coins — caller reverts the request to
    pending rather than losing or auto-declining it."""
    target_type  = req["target_type"]
    target_id    = req["target_id"]
    requester_id = req["requester_id"]

    if target_type == "post":
        from app.api.v1.posts import _complete_post_unlock
        await _complete_post_unlock(target_doc, requester_id, db)
    else:
        from app.api.v1.drops import (
            COINS_UNLOCK_COST, ORIGIN_AUTHOR_UNLOCK_COST, _complete_unlock,
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
        cost = ORIGIN_AUTHOR_UNLOCK_COST if is_origin_author else COINS_UNLOCK_COST

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
        claimed["requester_id"], "Request accepted 🎉", "You can now chat.", db,
    )
    return {"error": None, "connection_id": connection_id}


# ==================== ENDPOINTS ====================

@router.post("", status_code=201)
async def create_unlock_request(
    data: CreateUnlockRequestBody,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    if data.target_type not in ("post", "drop"):
        raise HTTPException(status_code=400, detail="target_type must be 'post' or 'drop'.")
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

    target = await _resolve_target(data.target_type, data.target_id, db)
    doc, owner_id, expires_at, snippet = (
        target["doc"], target["owner_id"], target["expires_at"], target["confession_snippet"],
    )

    if owner_id == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot unlock your own confession.")
    if expires_at < now_utc():
        raise HTTPException(status_code=400, detail="This confession has expired.")

    existing_unlock = await db["drop_unlocks"].find_one({
        "drop_id": data.target_id, "unlocker_id": current_user_id,
    })
    if existing_unlock:
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

    requester = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    requester_name = requester.get("anonymous_name", "Anonymous") if requester else "Anonymous"

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
        "Someone wants to unlock your confession 🔓",
        "Review their request to decide if you want to chat.",
        db,
    )

    return {"request_id": request_id, "status": "pending", "expires_at": expires_at.isoformat()}


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

    requests = []
    async for r in db["drop_unlock_requests"].find(query).sort([("target_id", 1), ("created_at", 1)]):
        requests.append({
            "id": str(r["_id"]),
            "target_type": r["target_type"],
            "target_id": r["target_id"],
            "confession_snippet": r.get("confession_snippet", ""),
            "requester_id": r["requester_id"],
            "requester_anonymous_name": r.get("requester_anonymous_name", "Anonymous"),
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
        "No coins were charged. You can try requesting again later.", db,
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
