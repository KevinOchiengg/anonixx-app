"""Main-feed ads. "house" ads are Anonixx promos (admin, free); "sponsored" ads are bought
by members per hour, reviewed before showing, and refunded if rejected. Expired ads are
filtered out on read."""
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from datetime import datetime, timezone, timedelta
from typing import Optional
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id, get_optional_user_id
from app.utils.coin_service import debit_coins, credit_coins

from app.dependencies import require_scope, require_super_admin
from app.utils.audit import audit
from app.utils.countries import country_from_header
router = APIRouter(prefix="/ads", tags=["Feed Ads"])

AD_COINS_PER_HOUR = 5
MAX_AD_HOURS      = 24 * 14
AD_MEDIA_TYPES    = {"image", "video", "gif", "audio"}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class AdCreate(BaseModel):
    title:          str
    media_url:      Optional[str] = None
    media_type:     str = "image"          # "image" | "video" | "gif" | "audio"
    # An ad can point at one of your own drops (opens its Link Up) or, for house ads, a URL.
    drop_id:        Optional[str] = None
    link_url:       Optional[str] = None
    duration_hours: int


PLATFORMS        = {"web", "app"}
DAILY_CAP        = 3                   # times one person sees the same ad per day
EVENT_TYPES      = {"seen", "tap", "hide", "like", "unlike"}
DEFAULT_CTA      = "Check it out"


def _iso(v):
    return v.isoformat() if isinstance(v, datetime) else None


def format_ad(ad: dict) -> dict:
    return {
        "id":         str(ad["_id"]),
        "title":      ad["title"],
        "media_url":  ad.get("media_url"),
        "media_type": ad.get("media_type", "image"),
        "cover_url":  ad.get("cover_url"),
        "link_url":   ad["link_url"],
        "cta":        ad.get("cta") or DEFAULT_CTA,
        "adult":      bool(ad.get("adult")),
        "ad_type":    ad.get("ad_type", "sponsored"),
        "status":     ad.get("status", "approved"),
        "expires_at": _iso(ad.get("expires_at")),
        "created_at": ad["created_at"].isoformat(),
    }


def _viewer(user_id: Optional[str], device_id: Optional[str]) -> Optional[str]:
    if user_id:
        return f"u:{user_id}"
    if isinstance(device_id, str) and 8 <= len(device_id) <= 80:
        return f"d:{device_id}"
    return None


def _oid(ad_id: str) -> ObjectId:
    if not ObjectId.is_valid(ad_id):
        raise HTTPException(status_code=404, detail="Ad not found")
    return ObjectId(ad_id)


async def ensure_indexes(db) -> None:
    await db["ad_events"].create_index("at", expireAfterSeconds=180 * 86400, background=True)
    await db["ad_events"].create_index([("ad_id", 1), ("type", 1)], background=True)
    await db["ad_events"].create_index([("viewer", 1), ("type", 1), ("at", -1)], background=True)


@router.get("/my-drops")
async def list_my_drops_for_ad(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Your own active drops, the only valid ad targets."""
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
    platform: Optional[str] = Query(None),
    adult_ok: bool = Query(False),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    x_country: Optional[str] = Header(None, alias="X-Country"),
    db = Depends(get_database),
):
    """Ads for the feed: live, for this platform and country, 18+ only when the viewer said
    they are 18+, and none this person hid or already saw DAILY_CAP times today."""
    now = now_utc()
    # Premium perk: an ad-free feed. Enforced here rather than client-side so
    # it holds regardless of which app build is asking.
    if current_user_id:
        from app.api.v1.drops import is_premium_user_id
        if await is_premium_user_id(current_user_id, db):
            return {"ads": []}

    query: dict = {
        "status": "approved",
        "active": {"$ne": False},
        "$and": [
            {"$or": [{"expires_at": None}, {"expires_at": {"$gt": now}}]},
            {"$or": [{"starts_at": None}, {"starts_at": {"$lte": now}}]},
        ],
    }
    if platform in PLATFORMS:
        query["$and"].append({"$or": [{"platforms": {"$exists": False}}, {"platforms": []}, {"platforms": platform}]})
    if not adult_ok:
        query["adult"] = {"$ne": True}
    country = country_from_header(x_country)
    query["$and"].append({"$or": [{"countries": {"$exists": False}}, {"countries": []}, *([{"countries": country}] if country else [])]})

    viewer = _viewer(current_user_id, x_device_id)
    if viewer:
        day = now - timedelta(days=1)
        hidden = await db["ad_events"].distinct("ad_id", {"viewer": viewer, "type": "hide"})
        seen = await db["ad_events"].aggregate([
            {"$match": {"viewer": viewer, "type": "seen", "at": {"$gte": day}}},
            {"$group": {"_id": "$ad_id", "n": {"$sum": 1}}},
            {"$match": {"n": {"$gte": DAILY_CAP}}},
        ]).to_list(None)
        skip = [ObjectId(i) for i in {*hidden, *(r["_id"] for r in seen)} if ObjectId.is_valid(i)]
        if skip:
            query["_id"] = {"$nin": skip}

    cursor = db["feed_ads"].find(query).sort("created_at", -1).limit(limit)
    return {"ads": [format_ad(a) async for a in cursor]}


class AdEvent(BaseModel):
    type: str


@router.post("/{ad_id}/event", status_code=204)
async def record_ad_event(
    ad_id: str,
    data: AdEvent,
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    db = Depends(get_database),
):
    if data.type not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Unknown ad event")
    _oid(ad_id)
    viewer = _viewer(current_user_id, x_device_id)
    if data.type in ("hide", "like", "unlike") and not viewer:
        return None
    if data.type == "unlike":
        await db["ad_events"].delete_many({"ad_id": ad_id, "viewer": viewer, "type": "like"})
        return None
    if data.type in ("hide", "like") and await db["ad_events"].count_documents({"ad_id": ad_id, "viewer": viewer, "type": data.type}, limit=1):
        return None
    await db["ad_events"].insert_one({"ad_id": ad_id, "viewer": viewer, "type": data.type, "at": now_utc()})
    return None


@router.get("/{ad_id}/go", include_in_schema=False)
async def open_ad(ad_id: str, v: Optional[str] = Query(None, max_length=80), db = Depends(get_database)):
    """Counts the tap, then sends the viewer on to the advertiser."""
    ad = await db["feed_ads"].find_one({"_id": _oid(ad_id)}, {"link_url": 1})
    url = (ad or {}).get("link_url") or ""
    if not url.startswith(("https://", "http://")):
        raise HTTPException(status_code=404, detail="Ad not found")
    await db["ad_events"].insert_one({"ad_id": ad_id, "viewer": f"d:{v}" if v else None, "type": "tap", "at": now_utc()})
    return RedirectResponse(url, status_code=302)


# ==================== ADMIN ====================

@router.get("/admin/pending")
async def list_pending_ads(
    admin_id: str = Depends(require_scope("content")),
    db = Depends(get_database),
):
    cursor = db["feed_ads"].find({"status": "pending_review"}).sort("created_at", 1)
    return {"ads": [format_ad(a) async for a in cursor]}


@router.patch("/admin/{ad_id}/approve")
async def approve_ad(
    ad_id: str,
    admin_id: str = Depends(require_scope("content")),
    db = Depends(get_database),
):
    try:
        oid = ObjectId(ad_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ad ID")
    result = await db["feed_ads"].update_one({"_id": oid}, {"$set": {"status": "approved"}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ad not found")
    await audit(db, admin_id, "ad.approve", "ad", ad_id)
    return {"id": ad_id, "status": "approved"}


@router.patch("/admin/{ad_id}/reject")
async def reject_ad(
    ad_id: str,
    admin_id: str = Depends(require_scope("content")),
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

    await audit(db, admin_id, "ad.reject", "ad", ad_id)
    return {"id": ad_id, "status": "rejected", "refunded": coins_paid}


class AdminAdBody(BaseModel):
    title:      str = Field(..., max_length=900)
    link_url:   str = Field(..., max_length=2000)
    media_url:  Optional[str] = None
    media_type: str = "image"
    cover_url:  Optional[str] = None
    cta:        Optional[str] = Field(None, max_length=30)
    adult:      bool = False
    platforms:  list[str] = []
    countries:  list[str] = []
    starts_at:  Optional[datetime] = None
    ends_at:    Optional[datetime] = None
    active:     bool = True


class AdminAdPatch(BaseModel):
    title:      Optional[str] = Field(None, max_length=900)
    link_url:   Optional[str] = Field(None, max_length=2000)
    media_url:  Optional[str] = None
    media_type: Optional[str] = None
    cover_url:  Optional[str] = None
    cta:        Optional[str] = Field(None, max_length=30)
    adult:      Optional[bool] = None
    platforms:  Optional[list[str]] = None
    countries:  Optional[list[str]] = None
    starts_at:  Optional[datetime] = None
    ends_at:    Optional[datetime] = None
    active:     Optional[bool] = None


def _clean_ad(fields: dict) -> dict:
    out = dict(fields)
    if "title" in out:
        out["title"] = (out["title"] or "").strip()
        if not out["title"]:
            raise HTTPException(status_code=400, detail="Write the ad's caption.")
    if "link_url" in out:
        url = (out["link_url"] or "").strip()
        if not url.startswith(("https://", "http://", "anonixx://")):
            raise HTTPException(status_code=400, detail="The link has to start with https://")
        out["link_url"] = url
    if out.get("media_type") is not None and out["media_type"] not in AD_MEDIA_TYPES:
        raise HTTPException(status_code=400, detail=f"media_type must be one of: {', '.join(sorted(AD_MEDIA_TYPES))}")
    if out.get("platforms") is not None:
        out["platforms"] = sorted({p for p in out["platforms"] if p in PLATFORMS})
    if out.get("countries") is not None:
        out["countries"] = sorted({c.strip() for c in out["countries"] if isinstance(c, str) and c.strip()})[:50]
    if "cta" in out:
        out["cta"] = (out["cta"] or "").strip() or None
    for k in ("starts_at", "ends_at"):
        v = out.get(k)
        if isinstance(v, datetime) and v.tzinfo is None:
            out[k] = v.replace(tzinfo=timezone.utc)
    if "ends_at" in out:
        out["expires_at"] = out.pop("ends_at")
    return out


async def _stats(db, ids: list) -> dict:
    rows = await db["ad_events"].aggregate([
        {"$match": {"ad_id": {"$in": ids}}},
        {"$group": {"_id": {"a": "$ad_id", "t": "$type"}, "n": {"$sum": 1}}},
    ]).to_list(None)
    out: dict = {i: {"seen": 0, "tap": 0, "hide": 0, "like": 0} for i in ids}
    for r in rows:
        if r["_id"]["t"] in out.get(r["_id"]["a"], {}):
            out[r["_id"]["a"]][r["_id"]["t"]] = r["n"]
    return out


@router.get("/admin/all")
async def list_all_ads(admin_id: str = Depends(require_super_admin), db = Depends(get_database)):
    """Every ad with its numbers: views, taps, tap rate, likes, hides."""
    ads = await db["feed_ads"].find({"status": {"$ne": "rejected"}}).sort("created_at", -1).limit(200).to_list(200)
    stats = await _stats(db, [str(a["_id"]) for a in ads])
    now = now_utc()
    out = []
    for a in ads:
        st = stats[str(a["_id"])]
        exp = a.get("expires_at")
        if isinstance(exp, datetime) and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        out.append({
            **format_ad(a),
            "platforms": a.get("platforms") or [],
            "countries": a.get("countries") or [],
            "starts_at": _iso(a.get("starts_at")),
            "active":    a.get("active", True) is not False,
            "ended":     bool(exp and exp <= now),
            "views": st["seen"], "taps": st["tap"], "likes": st["like"], "hides": st["hide"],
            "tap_rate": round(st["tap"] / st["seen"] * 100, 1) if st["seen"] else 0.0,
        })
    return {"ads": out}


@router.post("/admin", status_code=201)
async def create_admin_ad(data: AdminAdBody, admin_id: str = Depends(require_super_admin), db = Depends(get_database)):
    doc = _clean_ad(data.model_dump())
    doc.update({"created_by": admin_id, "ad_type": "house", "status": "approved", "created_at": now_utc()})
    res = await db["feed_ads"].insert_one(doc)
    await audit(db, admin_id, "ad.create", "ad", str(res.inserted_id))
    return {"id": str(res.inserted_id)}


@router.patch("/admin/{ad_id}")
async def edit_admin_ad(ad_id: str, data: AdminAdPatch, admin_id: str = Depends(require_super_admin), db = Depends(get_database)):
    fields = _clean_ad(data.model_dump(exclude_unset=True))
    if not fields:
        return {"id": ad_id}
    res = await db["feed_ads"].update_one({"_id": _oid(ad_id)}, {"$set": fields})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Ad not found")
    await audit(db, admin_id, "ad.edit", "ad", ad_id)
    return {"id": ad_id}


@router.delete("/admin/{ad_id}")
async def delete_admin_ad(ad_id: str, admin_id: str = Depends(require_super_admin), db = Depends(get_database)):
    res = await db["feed_ads"].delete_one({"_id": _oid(ad_id)})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Ad not found")
    await audit(db, admin_id, "ad.delete", "ad", ad_id)
    return {"id": ad_id, "deleted": True}
