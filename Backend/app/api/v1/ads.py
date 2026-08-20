"""
api/v1/ads.py — Main-feed ads.

Two kinds, one collection (feed_ads):
  house      — admin/AI-bot only, free, auto-approved. Anonixx's own promos.
  sponsored  — any member can buy a slot, priced by how long it runs
               (same per-hour coin rate as Circles ads). Goes to
               "pending_review" first — unlike a circle's own audience,
               the main feed reaches everyone, so a human approves it
               before it's shown. Rejected requests are refunded.

Expiry is enforced the same way as Circles ads: a read-time filter plus
opportunistic delete, no scheduler required.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from typing import Optional
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id, get_optional_user_id, require_admin
from app.utils.coin_service import debit_coins, credit_coins

router = APIRouter(prefix="/ads", tags=["Feed Ads"])

AD_COINS_PER_HOUR = 5
MAX_AD_HOURS      = 24 * 14
DEFAULT_FEED_AD_FREQUENCY = 8   # one ad every N posts — admin-configurable via /admin/ads/frequency
AD_MEDIA_TYPES    = {"image", "video", "gif", "audio"}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class AdCreate(BaseModel):
    title:          str
    media_url:      Optional[str] = None
    media_type:     str = "image"          # "image" | "video" | "gif" | "audio"
    # Point the ad at one of your own Drops instead of a raw URL — the tap
    # takes a viewer straight into the existing unlock flow for that Drop,
    # which is what actually gets them into your chat interface. link_url
    # stays available as a fallback (admin/house ads only need it).
    drop_id:        Optional[str] = None
    link_url:       Optional[str] = None
    duration_hours: int


def format_ad(ad: dict) -> dict:
    return {
        "id":         str(ad["_id"]),
        "title":      ad["title"],
        "media_url":  ad.get("media_url"),
        "media_type": ad.get("media_type", "image"),
        "link_url":   ad["link_url"],
        "ad_type":    ad.get("ad_type", "sponsored"),
        "status":     ad.get("status", "approved"),
        "expires_at": ad["expires_at"].isoformat() if ad.get("expires_at") else None,
        "created_at": ad["created_at"].isoformat(),
    }


@router.get("/my-drops")
async def list_my_drops_for_ad(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Feeds the Drop picker in CreateAdScreen — only *your own*, still-active
    Drops are valid ad targets, so a viewer who taps the ad lands somewhere
    that's actually still unlockable."""
    cursor = db["drops"].find(
        {"sender_id": current_user_id, "is_active": True, "expires_at": {"$gt": now_utc()}},
        {"confession": 1, "media_type": 1, "created_at": 1},
    ).sort("created_at", -1).limit(25)

    return {"drops": [
        {
            "id": str(d["_id"]),
            "confession": (d.get("confession") or "")[:120],
            "media_type": d.get("media_type"),
        }
        async for d in cursor
    ]}


@router.post("", status_code=201)
async def create_ad(
    data: AdCreate,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    if not data.title.strip():
        raise HTTPException(status_code=400, detail="Give your ad a title.")
    if data.media_type not in AD_MEDIA_TYPES:
        raise HTTPException(status_code=400, detail=f"media_type must be one of: {', '.join(AD_MEDIA_TYPES)}")
    if data.duration_hours <= 0 or data.duration_hours > MAX_AD_HOURS:
        raise HTTPException(status_code=400, detail=f"Duration must be between 1 and {MAX_AD_HOURS} hours.")

    link_url = None
    if data.drop_id:
        try:
            drop = await db["drops"].find_one({"_id": ObjectId(data.drop_id), "sender_id": current_user_id})
        except Exception:
            drop = None
        if not drop:
            raise HTTPException(status_code=400, detail="Pick one of your own Drops to link this ad to.")
        link_url = f"anonixx://drop/{data.drop_id}"
    elif data.link_url and data.link_url.strip():
        link_url = data.link_url.strip()
    else:
        raise HTTPException(status_code=400, detail="Link this ad to one of your Drops, or add a link for it to point to.")

    user = await db["users"].find_one({"_id": ObjectId(current_user_id)}, {"is_admin": 1})
    is_admin = bool(user and user.get("is_admin"))

    now = now_utc()
    doc = {
        "created_by":  current_user_id,
        "title":       data.title.strip(),
        "media_url":   data.media_url,
        "media_type":  data.media_type,
        "link_url":    link_url,
        "created_at":  now,
        "expires_at":  now + timedelta(hours=data.duration_hours),
    }

    if is_admin:
        # House ad — free, live immediately.
        doc["ad_type"] = "house"
        doc["status"]  = "approved"
        result = await db["feed_ads"].insert_one(doc)
        return {"id": str(result.inserted_id), "message": "House ad is live.", "status": "approved"}

    # Sponsored — pay up front, wait for a human to approve before it
    # reaches the whole feed's audience.
    cost = data.duration_hours * AD_COINS_PER_HOUR
    try:
        await debit_coins(
            db=db, user_id=current_user_id, amount=cost,
            reason="feed_ad", description=f"Feed ad for {data.duration_hours}h",
            meta={},
        )
    except ValueError as e:
        if "Insufficient" in str(e):
            raise HTTPException(status_code=402, detail=f"Not enough coins. You need {cost} coins for {data.duration_hours}h.")
        raise HTTPException(status_code=404, detail="User not found.")

    doc["ad_type"] = "sponsored"
    doc["status"]  = "pending_review"
    doc["coins_paid"] = cost
    result = await db["feed_ads"].insert_one(doc)
    return {"id": str(result.inserted_id), "coins_spent": cost, "message": "Submitted for review.", "status": "pending_review"}


@router.get("/active")
async def list_active_ads(
    limit: int = Query(10, ge=1, le=30),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db = Depends(get_database),
):
    now = now_utc()
    await db["feed_ads"].delete_many({"expires_at": {"$lte": now}})

    cursor = db["feed_ads"].find({
        "status": "approved",
        "expires_at": {"$gt": now},
    }).sort("created_at", -1).limit(limit)

    return {"ads": [format_ad(a) async for a in cursor]}


@router.get("/mine")
async def list_my_ads(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    cursor = db["feed_ads"].find({"created_by": current_user_id}).sort("created_at", -1)
    return {"ads": [format_ad(a) async for a in cursor]}


# ==================== ADMIN ====================

@router.get("/admin/pending")
async def list_pending_ads(
    admin_id: str = Depends(require_admin),
    db = Depends(get_database),
):
    cursor = db["feed_ads"].find({"status": "pending_review"}).sort("created_at", 1)
    return {"ads": [format_ad(a) async for a in cursor]}


@router.patch("/admin/{ad_id}/approve")
async def approve_ad(
    ad_id: str,
    admin_id: str = Depends(require_admin),
    db = Depends(get_database),
):
    try:
        oid = ObjectId(ad_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ad ID")
    result = await db["feed_ads"].update_one({"_id": oid}, {"$set": {"status": "approved"}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ad not found")
    return {"id": ad_id, "status": "approved"}


@router.patch("/admin/{ad_id}/reject")
async def reject_ad(
    ad_id: str,
    admin_id: str = Depends(require_admin),
    db = Depends(get_database),
):
    try:
        oid = ObjectId(ad_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ad ID")

    ad = await db["feed_ads"].find_one({"_id": oid})
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")

    await db["feed_ads"].update_one({"_id": oid}, {"$set": {"status": "rejected"}})

    coins_paid = ad.get("coins_paid", 0)
    if coins_paid and ad.get("created_by"):
        try:
            await credit_coins(
                db=db, user_id=ad["created_by"], amount=coins_paid,
                reason="feed_ad_refund", description="Ad rejected — refund",
                meta={"ad_id": ad_id},
            )
        except ValueError:
            pass

    return {"id": ad_id, "status": "rejected", "refunded": coins_paid}
