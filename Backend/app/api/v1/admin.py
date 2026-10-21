from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId

from app.database import get_database
from app.dependencies import require_admin, require_super_admin, is_super_admin_user
from app.utils.coin_service import credit_coins
from app.api.v1.drops import PROMO_KINDS, PROMO_HOURS
from app.utils import stream

router = APIRouter(prefix="/admin", tags=["Admin"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Request Models ───────────────────────────────────────────

class CoinAdjustRequest(BaseModel):
    amount: int   # positive = credit, negative = debit
    reason: str


async def _guard_target(db, admin_id: str, target_id: str, action: str) -> ObjectId:
    """Validate a target user for a destructive action: valid id, exists,
    not yourself, never a super admin, and only a super admin may act on
    another admin."""
    if target_id == admin_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot {action} yourself")
    try:
        oid = ObjectId(target_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID")
    target = await db["users"].find_one({"_id": oid}, {"is_admin": 1, "email": 1})
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if is_super_admin_user(target):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Super admins cannot be modified")
    if target.get("is_admin"):
        actor = await db["users"].find_one({"_id": ObjectId(admin_id)}, {"is_admin": 1, "email": 1})
        if not is_super_admin_user(actor or {}):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a super admin can do this to an admin")
    return oid


@router.get("/me", summary="Caller's admin role")
async def admin_me(admin_id: str = Depends(require_admin), db=Depends(get_database)):
    user = await db["users"].find_one({"_id": ObjectId(admin_id)}, {"email": 1, "is_admin": 1})
    sup = is_super_admin_user(user or {})
    return {"is_admin": True, "is_super_admin": sup, "role": "super_admin" if sup else "admin"}


# ─── Stats ────────────────────────────────────────────────────

@router.get("/stats", summary="Platform overview — users, content, revenue")
async def get_stats(
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    now             = _now()
    thirty_days_ago = now - timedelta(days=30)
    today_start     = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_users    = await db["users"].count_documents({})
    active_users   = await db["users"].count_documents({"last_login": {"$gte": thirty_days_ago}})
    banned_users   = await db["users"].count_documents({"is_active": False})
    verified_users = await db["users"].count_documents({"is_verified": True})
    premium_users  = await db["users"].count_documents({"is_premium": True})
    admin_count    = await db["users"].count_documents({"is_admin": True})

    collections = await db.list_collection_names()
    total_drops = await db["drops"].count_documents({}) if "drops" in collections else 0
    drops_today = await db["drops"].count_documents({"created_at": {"$gte": today_start}}) if "drops" in collections else 0

    total_revenue = 0.0
    if "payments" in collections:
        async for p in db["payments"].find({"status": "completed"}, {"amount": 1}):
            total_revenue += float(p.get("amount", 0))

    open_support = len(await db["support_messages"].distinct(
        "user_id", {"sender": "user", "read_by_admin": False}
    )) if "support_messages" in collections else 0
    pending_refunds = await db["refund_requests"].count_documents({"status": "pending"}) if "refund_requests" in collections else 0

    total_coin_txns = await db["coin_transactions"].count_documents({}) if "coin_transactions" in collections else 0

    return {
        "users": {
            "total":            total_users,
            "active_last_30d":  active_users,
            "banned":           banned_users,
            "verified":         verified_users,
            "premium":          premium_users,
            "admins":           admin_count,
        },
        "content": {
            "total_drops": total_drops,
            "drops_today": drops_today,
        },
        "support": {
            "open_conversations": open_support,
            "pending_refunds":    pending_refunds,
        },
        "financials": {
            "total_revenue_usd":       round(total_revenue, 2),
            "total_coin_transactions": total_coin_txns,
        },
    }


# ─── User Management ──────────────────────────────────────────

@router.get("/users", summary="List users — paginated, searchable")
async def list_users(
    skip:   int            = Query(0,  ge=0),
    limit:  int            = Query(20, ge=1, le=100),
    search: Optional[str]  = Query(None, description="Filter by email, username, or anonymous name"),
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    query = {}
    if search:
        query["$or"] = [
            {"email":          {"$regex": search, "$options": "i"}},
            {"username":       {"$regex": search, "$options": "i"}},
            {"anonymous_name": {"$regex": search, "$options": "i"}},
        ]

    total  = await db["users"].count_documents(query)
    cursor = db["users"].find(query, {"password": 0}).sort("created_at", -1).skip(skip).limit(limit)

    users = []
    async for u in cursor:
        users.append({
            "id":             str(u["_id"]),
            "email":          u.get("email"),
            "username":       u.get("username"),
            "anonymous_name": u.get("anonymous_name"),
            "is_active":      u.get("is_active", True),
            "is_admin":       u.get("is_admin", False),
            "is_super_admin": is_super_admin_user(u),
            "is_verified":    u.get("is_verified", False),
            "is_premium":     u.get("is_premium", False),
            "coin_balance":   u.get("coin_balance", 0),
            "created_at":     u["created_at"].isoformat() if u.get("created_at") else None,
            "last_login":     u["last_login"].isoformat() if u.get("last_login") else None,
        })

    return {"total": total, "skip": skip, "limit": limit, "users": users}


@router.get("/users/{user_id}", summary="Full user profile + activity summary")
async def get_user(
    user_id: str,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID")

    user = await db["users"].find_one({"_id": oid}, {"password": 0})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    collections  = await db.list_collection_names()
    drop_count   = await db["drops"].count_documents({"sender_id": user_id})
    report_count = await db["reports"].count_documents({"reported_user_id": user_id}) if "reports" in collections else 0

    return {
        "id":             str(user["_id"]),
        "email":          user.get("email"),
        "username":       user.get("username"),
        "anonymous_name": user.get("anonymous_name"),
        "display_name":   user.get("display_name"),
        "bio":            user.get("bio"),
        "gender":         user.get("gender"),
        "interests":      user.get("interests", []),
        "is_active":      user.get("is_active", True),
        "is_admin":       user.get("is_admin", False),
        "is_verified":    user.get("is_verified", False),
        "is_premium":     user.get("is_premium", False),
        "coin_balance":   user.get("coin_balance", 0),
        "created_at":     user["created_at"].isoformat() if user.get("created_at") else None,
        "last_login":     user["last_login"].isoformat() if user.get("last_login") else None,
        "drop_count":     drop_count,
        "report_count":   report_count,
    }


@router.patch("/users/{user_id}/ban", summary="Toggle ban — sets is_active false/true")
async def toggle_ban(
    user_id:  str,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    oid = await _guard_target(db, admin_id, user_id, "ban")

    user = await db["users"].find_one({"_id": oid}, {"is_active": 1})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    new_status = not user.get("is_active", True)
    await db["users"].update_one(
        {"_id": oid},
        {"$set": {"is_active": new_status, "updated_at": _now()}},
    )
    return {
        "user_id":  user_id,
        "is_active": new_status,
        "action":    "unbanned" if new_status else "banned",
    }


@router.patch("/users/{user_id}/verify", summary="Toggle verified badge")
async def toggle_verify(
    user_id:  str,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID")

    user = await db["users"].find_one({"_id": oid}, {"is_verified": 1})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    new_status = not user.get("is_verified", False)
    await db["users"].update_one(
        {"_id": oid},
        {"$set": {"is_verified": new_status, "updated_at": _now()}},
    )
    return {"user_id": user_id, "is_verified": new_status}


@router.patch("/users/{user_id}/admin", summary="Grant or revoke admin role")
async def toggle_admin_role(
    user_id:  str,
    admin_id: str = Depends(require_super_admin),
    db=Depends(get_database),
):
    oid = await _guard_target(db, admin_id, user_id, "change the admin role of")

    user = await db["users"].find_one({"_id": oid}, {"is_admin": 1})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    new_status = not user.get("is_admin", False)
    await db["users"].update_one(
        {"_id": oid},
        {"$set": {"is_admin": new_status, "updated_at": _now()}},
    )
    return {"user_id": user_id, "is_admin": new_status}


@router.delete("/users/{user_id}", summary="Permanently delete a user and their content (super admin)")
async def delete_user(
    user_id:  str,
    admin_id: str = Depends(require_super_admin),
    db=Depends(get_database),
):
    oid = await _guard_target(db, admin_id, user_id, "delete")

    drops = await db["drops"].delete_many({"sender_id": user_id})
    await db["drop_unlocks"].delete_many({"$or": [{"user_id": user_id}, {"unlocker_id": user_id}]})
    await db["drop_connections"].delete_many({"$or": [{"user_id": user_id}, {"sender_id": user_id}]})
    await db["support_messages"].delete_many({"user_id": user_id})
    await db["refund_requests"].delete_many({"user_id": user_id})
    await db["users"].delete_one({"_id": oid})

    return {"deleted": user_id, "drops_deleted": drops.deleted_count}


@router.post("/users/{user_id}/coins", summary="Manually credit or debit coins (positive = credit, negative = debit)")
async def adjust_coins(
    user_id:  str,
    data:     CoinAdjustRequest,
    admin_id: str = Depends(require_super_admin),
    db=Depends(get_database),
):
    if data.amount == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Amount cannot be zero")

    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID")

    user = await db["users"].find_one({"_id": oid}, {"coin_balance": 1})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    if data.amount > 0:
        await credit_coins(db, user_id, data.amount, "admin_adjustment", data.reason)
    else:
        result = await db["users"].find_one_and_update(
            {"_id": oid, "coin_balance": {"$gte": abs(data.amount)}},
            {"$inc": {"coin_balance": data.amount}},
            return_document=True,
            projection={"coin_balance": 1},
        )
        if not result:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Insufficient balance. User has {user.get('coin_balance', 0)} coins.",
            )
        await db["coin_transactions"].insert_one({
            "user_id":     user_id,
            "amount":      data.amount,
            "type":        "admin_adjustment",
            "description": data.reason,
            "created_at":  _now(),
        })

    updated = await db["users"].find_one({"_id": oid}, {"coin_balance": 1})
    return {
        "user_id":     user_id,
        "adjustment":  data.amount,
        "new_balance": updated.get("coin_balance", 0),
    }


# ─── Content Moderation ───────────────────────────────────────

@router.get("/moderation-queue", summary="Drops flagged or hidden by user reports — awaiting review")
async def get_moderation_queue(
    skip:     int = Query(0,  ge=0),
    limit:    int = Query(20, ge=1, le=100),
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    """
    Reporting a Drop (POST /drops/{drop_id}/report) auto-flags it at 3
    reports, or hides it immediately for self-harm-concern — but until now
    nothing ever surfaced that queue for a human to actually act on.
    """
    query  = {"moderation_status": {"$in": ["flagged", "hidden"]}}
    total  = await db["drops"].count_documents(query)
    cursor = (
        db["drops"].find(query)
        .sort("flagged_at", -1)
        .skip(skip)
        .limit(limit)
    )

    drops = []
    async for d in cursor:
        drops.append({
            "id":                str(d["_id"]),
            "sender_id":         d.get("sender_id"),
            "confession":        (d.get("confession") or "")[:200],
            "media_type":        d.get("media_type"),
            "report_count":      d.get("report_count", 0),
            "moderation_status": d.get("moderation_status"),
            "flagged_at":        d["flagged_at"].isoformat() if d.get("flagged_at") else None,
            "created_at":        d["created_at"].isoformat() if d.get("created_at") else None,
        })

    return {"total": total, "skip": skip, "limit": limit, "drops": drops}


@router.get("/drops", summary="Browse all posts — paginated, searchable")
async def list_drops(
    skip:   int           = Query(0,  ge=0),
    limit:  int           = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Filter by confession text"),
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    query = {}
    if search:
        query["confession"] = {"$regex": search, "$options": "i"}

    total  = await db["drops"].count_documents(query)
    cursor = db["drops"].find(query).sort("created_at", -1).skip(skip).limit(limit)

    drops = []
    async for d in cursor:
        drops.append({
            "id":                str(d["_id"]),
            "sender_id":         d.get("sender_id"),
            "author":            d.get("sender_anonymous_name"),
            "is_admin_drop":     d.get("is_admin_drop", False),
            "confession":        (d.get("confession") or "")[:200],
            # full text only where the dashboard can edit it, so an edit never starts from the cut-off preview
            "confession_full":   (d.get("confession") or "") if d.get("is_admin_drop") else None,
            "promo_kind":        d.get("promo_kind") if d.get("promo_until") and _aware(d["promo_until"]) > _now() else None,
            "promo_until":       _aware(d["promo_until"]).isoformat() if d.get("promo_until") else None,
            "media_type":        d.get("media_type"),
            "report_count":      d.get("report_count", 0),
            "moderation_status": d.get("moderation_status"),
            "created_at":        d["created_at"].isoformat() if d.get("created_at") else None,
        })

    return {"total": total, "skip": skip, "limit": limit, "drops": drops}


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _drop_oid(raw: str) -> ObjectId:
    try:
        return ObjectId(raw)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid ID")


class AdminEditDropRequest(BaseModel):
    confession: str


@router.patch("/drops/{drop_id}", summary="Edit the text of a post made by an admin (users' posts stay untouchable)")
async def edit_admin_drop(
    drop_id:  str,
    data:     AdminEditDropRequest,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    text = data.confession.strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Post text cannot be empty")
    if len(text) > 500:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Post text must be 500 characters or fewer")

    try:
        oid = ObjectId(drop_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid drop ID")

    drop = await db["drops"].find_one({"_id": oid}, {"is_admin_drop": 1})
    if not drop:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drop not found")
    if not drop.get("is_admin_drop"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only posts made by admins can be edited")

    await db["drops"].update_one(
        {"_id": oid},
        {"$set": {"confession": text, "edited_at": _now(), "edited_by": admin_id}},
    )
    return {"drop_id": drop_id, "confession": text}


class PromoteRequest(BaseModel):
    kind:  str   # "pin" | "boost"
    hours: int   # 6, 24, 72 or 168


@router.patch("/drops/{drop_id}/promote", summary="Pin or boost an admin post in the feed for a while")
async def promote_drop(
    drop_id:  str,
    data:     PromoteRequest,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    if data.kind not in PROMO_KINDS or data.hours not in PROMO_HOURS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pick pin or boost, for 6 hours, 1, 3 or 7 days")
    oid = _drop_oid(drop_id)
    drop = await db["drops"].find_one({"_id": oid}, {"is_admin_drop": 1})
    if not drop:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drop not found")
    if not drop.get("is_admin_drop"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only posts made by admins can be pinned or boosted")
    until = _now() + timedelta(hours=data.hours)
    await db["drops"].update_one(
        {"_id": oid},
        {"$set": {"promo_kind": data.kind, "promo_until": until, "promoted_by": admin_id}},
    )
    return {"drop_id": drop_id, "promo_kind": data.kind, "promo_until": until.isoformat()}


@router.delete("/drops/{drop_id}/promote", summary="Stop pinning/boosting a post")
async def unpromote_drop(
    drop_id:  str,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    result = await db["drops"].update_one(
        {"_id": _drop_oid(drop_id)}, {"$set": {"promo_kind": None, "promo_until": None}},
    )
    if result.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drop not found")
    return {"drop_id": drop_id, "promo_kind": None}


# ─── Scheduled drops ──────────────────────────────────────────
# The Post Studio uploads the media straight away and parks the create
# payload here; app/tasks/scheduled_publisher.py publishes it on time.
#
# Video drops on Cloudflare Stream come through here too, even when posted
# "now": the job sits in status "processing" while Stream encodes, cuts and
# watermarks the clip (app/utils/stream.py), then turns "pending" and
# publishes at publish_at — or straight away when none was given.

MAX_SCHEDULE_DAYS = 60
MIN_STREAM_CLIP = 1


class StreamJob(BaseModel):
    uid:   str             # the original upload
    start: float = 0       # the window to keep, in the original's seconds
    end:   Optional[float] = None


class ScheduleRequest(BaseModel):
    publish_at: Optional[datetime] = None   # None = as soon as the video is ready
    drop:       dict
    stream:     Optional[StreamJob] = None


class RescheduleRequest(BaseModel):
    publish_at: datetime


def _check_publish_at(when: datetime) -> datetime:
    when = _aware(when)
    if when < _now() + timedelta(minutes=1):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pick a time at least a minute from now")
    if when > _now() + timedelta(days=MAX_SCHEDULE_DAYS):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You can schedule up to {MAX_SCHEDULE_DAYS} days ahead")
    return when


def _scheduled_out(s: dict) -> dict:
    d = s.get("drop") or {}
    return {
        "id":           str(s["_id"]),
        "status":       s.get("status"),
        "publish_at":   _aware(s["publish_at"]).isoformat() if s.get("publish_at") else None,
        "display_name": d.get("display_name") or None,
        "confession":   (d.get("confession") or "")[:200],
        "media_type":   "image" if d.get("images") else d.get("media_type") or ("poll" if d.get("poll") else None),
        "thumb":        d.get("cover_url") or (d.get("images") or [None])[0] or (d.get("media_url") if d.get("media_type") == "image" else None),
        "promo_kind":   d.get("promo_kind"),
        "drop_id":      s.get("drop_id"),
        "error":        s.get("error"),
    }


@router.post("/scheduled", summary="Schedule an admin drop to publish later")
async def schedule_drop(
    data:     ScheduleRequest,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    from app.api.v1.drops import CreateDropRequest, clean_video_edit, MAX_CLIP_SECONDS
    if not data.publish_at and not data.stream:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pick a time to publish it")
    when = _check_publish_at(data.publish_at) if data.publish_at else None
    try:
        req = CreateDropRequest(**data.drop)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That post isn't complete. Check it and try again")
    if not (req.confession or req.media_url or req.images or req.poll or data.stream):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Add something to post")
    if data.stream:
        if not stream.is_configured():
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Video uploads to Stream aren't switched on yet")
        end = data.stream.end
        if end is not None and not (MIN_STREAM_CLIP <= end - data.stream.start <= MAX_CLIP_SECONDS + 0.5):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Videos play for 1 second to 3 minutes. Trim it again")
        req.media_type = "video"
        req.media_url = None        # filled in with the clip's playback URL once it's ready
    else:
        clean_video_edit(req.video_edit)   # surface trim/overlay problems now, not at publish time

    doc = {
        "admin_id":   admin_id,
        "drop":       req.model_dump(exclude_none=True),
        "publish_at": when,
        "status":     "processing" if data.stream else "pending",
        "created_at": _now(),
    }
    if data.stream:
        doc["stream"] = {"uid": data.stream.uid, "start": max(0.0, data.stream.start), "end": data.stream.end, "clip_uid": None}
    res = await db["scheduled_drops"].insert_one(doc)
    doc["_id"] = res.inserted_id
    return _scheduled_out(doc)


@router.get("/scheduled/{schedule_id}", summary="One scheduled drop (the Post Studio polls this while a video finishes)")
async def get_scheduled(
    schedule_id: str,
    admin_id:    str = Depends(require_admin),
    db=Depends(get_database),
):
    from app.tasks.scheduled_publisher import publish_due_drops
    oid = _drop_oid(schedule_id)
    # Someone is watching this one: move it along now rather than on the next loop tick.
    await publish_due_drops(db)
    job = await db["scheduled_drops"].find_one({"_id": oid})
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scheduled drop not found")
    return _scheduled_out(job)


@router.get("/scheduled", summary="Upcoming scheduled drops, plus recent ones that published or failed")
async def list_scheduled(
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    upcoming = await db["scheduled_drops"].find({"status": {"$in": ["processing", "pending", "publishing"]}}).sort("publish_at", 1).to_list(200)
    recent = await db["scheduled_drops"].find({"status": {"$in": ["published", "failed"]}}).sort("publish_at", -1).to_list(20)
    return {"upcoming": [_scheduled_out(s) for s in upcoming], "recent": [_scheduled_out(s) for s in recent]}


@router.patch("/scheduled/{schedule_id}", summary="Move a scheduled drop to a new time")
async def reschedule_drop(
    schedule_id: str,
    data:        RescheduleRequest,
    admin_id:    str = Depends(require_admin),
    db=Depends(get_database),
):
    when = _check_publish_at(data.publish_at)
    res = await db["scheduled_drops"].update_one(
        {"_id": _drop_oid(schedule_id), "status": {"$in": ["pending", "processing"]}}, {"$set": {"publish_at": when}},
    )
    if res.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That drop isn't waiting to publish any more")
    return {"id": schedule_id, "publish_at": when.isoformat()}


@router.post("/scheduled/{schedule_id}/publish-now", summary="Publish a scheduled drop immediately")
async def publish_scheduled_now(
    schedule_id: str,
    admin_id:    str = Depends(require_admin),
    db=Depends(get_database),
):
    from app.tasks.scheduled_publisher import publish_due_drops
    oid = _drop_oid(schedule_id)
    # a video still processing gets "as soon as it's ready"
    res = await db["scheduled_drops"].update_one(
        {"_id": oid, "status": {"$in": ["pending", "processing"]}}, {"$set": {"publish_at": _now()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That drop isn't waiting to publish any more")
    await publish_due_drops(db)
    return _scheduled_out(await db["scheduled_drops"].find_one({"_id": oid}))


@router.delete("/scheduled/{schedule_id}", summary="Cancel a scheduled drop")
async def cancel_scheduled(
    schedule_id: str,
    admin_id:    str = Depends(require_admin),
    db=Depends(get_database),
):
    job = await db["scheduled_drops"].find_one_and_delete(
        {"_id": _drop_oid(schedule_id), "status": {"$in": ["processing", "pending", "failed"]}},
    )
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That drop isn't waiting to publish any more")
    # A cancelled video shouldn't keep costing Stream storage.
    s = job.get("stream") or {}
    await stream.delete_video(s.get("uid"))
    await stream.delete_video(s.get("clip_uid") or (job.get("drop") or {}).get("stream_uid"))
    return {"cancelled": schedule_id}


@router.patch("/drops/{drop_id}/dismiss", summary="Clear a drop from the moderation queue without deleting it")
async def dismiss_flagged_drop(
    drop_id:  str,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    try:
        oid = ObjectId(drop_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid drop ID")

    result = await db["drops"].update_one(
        {"_id": oid},
        {"$set": {"moderation_status": "reviewed", "reviewed_at": _now(), "reviewed_by": admin_id}},
    )
    if result.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drop not found")

    return {"drop_id": drop_id, "moderation_status": "reviewed"}


@router.delete("/drops/{drop_id}", summary="Force-delete a flagged drop (admin override, cascades)")
async def force_delete_drop(
    drop_id:  str,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    try:
        oid = ObjectId(drop_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid drop ID")

    gone = await db["drops"].find_one_and_delete({"_id": oid}, {"stream_uid": 1})
    if not gone:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drop not found")

    await stream.delete_video(gone.get("stream_uid"))
    await db["drop_unlocks"].delete_many({"drop_id": drop_id})
    await db["drop_connections"].delete_many({"drop_id": drop_id})

    return {"deleted": drop_id}


# ─── Revenue ──────────────────────────────────────────────────

@router.get("/revenue", summary="Revenue breakdown by payment method")
async def get_revenue(
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    collections = await db.list_collection_names()
    if "payments" not in collections:
        return {"total_usd": 0.0, "by_method": {}}

    pipeline = [
        {"$match": {"status": "completed"}},
        {"$group": {
            "_id":   "$payment_method",
            "total": {"$sum": "$amount"},
            "count": {"$sum": 1},
        }},
    ]

    breakdown = {}
    total = 0.0
    async for row in db["payments"].aggregate(pipeline):
        method = row["_id"] or "unknown"
        breakdown[method] = {
            "total_usd": round(float(row["total"]), 2),
            "count":     row["count"],
        }
        total += float(row["total"])

    return {"total_usd": round(total, 2), "by_method": breakdown}


@router.get("/timeseries", summary="Daily signups, drops and coin activity for charts")
async def get_timeseries(
    days:     int = Query(30, ge=7, le=90),
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    now   = _now()
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    labels = [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days)]
    collections = await db.list_collection_names()

    async def daily(name: str, match: Optional[dict] = None) -> list:
        if name not in collections:
            return [0] * days
        pipeline = [
            {"$match": {"created_at": {"$gte": start}, **(match or {})}},
            {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}}, "n": {"$sum": 1}}},
        ]
        counts = {row["_id"]: row["n"] async for row in db[name].aggregate(pipeline)}
        return [counts.get(d, 0) for d in labels]

    return {
        "labels":       labels,
        "signups":      await daily("users"),
        "drops":        await daily("drops"),
        "transactions": await daily("coin_transactions"),
    }


# ─── Coin Transactions ────────────────────────────────────────

@router.get("/coins/transactions", summary="Recent coin transactions — all users")
async def list_coin_transactions(
    skip:     int = Query(0,  ge=0),
    limit:    int = Query(20, ge=1, le=100),
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    collections = await db.list_collection_names()
    if "coin_transactions" not in collections:
        return {"total": 0, "transactions": []}

    total  = await db["coin_transactions"].count_documents({})
    cursor = db["coin_transactions"].find({}).sort("created_at", -1).skip(skip).limit(limit)

    txns = []
    async for t in cursor:
        txns.append({
            "id":          str(t["_id"]),
            "user_id":     t.get("user_id"),
            "amount":      t.get("amount"),
            "type":        t.get("type"),
            "description": t.get("description"),
            "created_at":  t["created_at"].isoformat() if t.get("created_at") else None,
        })

    return {"total": total, "skip": skip, "limit": limit, "transactions": txns}


# ─── Bootstrap ────────────────────────────────────────────────

@router.post(
    "/bootstrap",
    summary="Promote a user to the first admin — only works when zero admins exist",
    description=(
        "One-time operation. Pass the `user_id` of the account you want to make admin. "
        "Once an admin exists this endpoint permanently returns 403 — "
        "use `PATCH /admin/users/{id}/admin` to promote additional admins."
    ),
)
async def bootstrap_admin(
    user_id: str,
    db=Depends(get_database),
):
    admin_count = await db["users"].count_documents({"is_admin": True})
    if admin_count > 0:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "An admin already exists. Bootstrap is disabled.",
        )

    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID")

    result = await db["users"].update_one(
        {"_id": oid},
        {"$set": {"is_admin": True, "updated_at": _now()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    return {"message": "First admin created.", "user_id": user_id}
