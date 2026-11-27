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

# Member ads ("campaigns"): paid per view from a budget held up front.
COINS_PER_1000   = 50
MIN_BUDGET       = 50
MIN_ACCOUNT_DAYS = 7
MEMBER_CTAS      = {"Link Up", "Visit my Room", "See more"}
GENDERS          = {"male", "female", "nonbinary"}


def views_for(coins: int) -> int:
    return coins * 1000 // COINS_PER_1000


def coins_for(views: int) -> int:
    return -(-views * COINS_PER_1000 // 1000)


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


def _age(dob) -> Optional[int]:
    try:
        d = datetime.fromisoformat(str(dob)[:10]).date()
    except (TypeError, ValueError):
        return None
    today = now_utc().date()
    return today.year - d.year - ((today.month, today.day) < (d.month, d.day))


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
    gender = age = None
    if current_user_id and ObjectId.is_valid(current_user_id):
        me = await db["users"].find_one({"_id": ObjectId(current_user_id)}, {"gender": 1, "date_of_birth": 1, "location_country": 1}) or {}
        gender = me.get("gender") if me.get("gender") in GENDERS else None
        age = _age(me.get("date_of_birth"))
        country = country or me.get("location_country")
    query["$and"].append({"$or": [{"countries": {"$exists": False}}, {"countries": []}, *([{"countries": country}] if country else [])]})
    query["$and"].append({"$or": [{"genders": {"$exists": False}}, {"genders": []}, *([{"genders": gender}] if gender else [])]})
    query["$and"].append({"$or": [{"age_min": None}, *([{"age_min": {"$lte": age}}] if age else [])]})
    query["$and"].append({"$or": [{"age_max": None}, *([{"age_max": {"$gte": age}}] if age else [])]})
    query["$and"].append({"$or": [{"paused_until": None}, {"paused_until": {"$lte": now}}]})

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
    if data.type == "seen":
        await _bill_view(db, ad_id, viewer)
    await db["ad_events"].insert_one({"ad_id": ad_id, "viewer": viewer, "type": data.type, "at": now_utc()})
    return None


async def _bill_view(db, ad_id: str, viewer: Optional[str]) -> None:
    """A member ad pays for one view per person per day, from its budget. The budget used up,
    it finishes; the day's cap used up, it rests until tomorrow."""
    ad = await db["feed_ads"].find_one({"_id": ObjectId(ad_id), "ad_type": "sponsored", "views_cap": {"$exists": True}, "status": "approved"})
    if not ad:
        return
    now = now_utc()
    if viewer and await db["ad_events"].count_documents(
        {"ad_id": ad_id, "viewer": viewer, "type": "seen", "at": {"$gte": now - timedelta(days=1)}}, limit=1,
    ):
        return
    today = now.date().isoformat()
    day_views = (ad.get("day_views") or 0) + 1 if ad.get("day") == today else 1
    billed = (ad.get("views_billed") or 0) + 1
    update: dict = {"views_billed": billed, "day": today, "day_views": day_views}
    if billed >= ad["views_cap"]:
        update["status"] = "finished"
    elif ad.get("day_cap") and day_views >= ad["day_cap"]:
        update["paused_until"] = datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    await db["feed_ads"].update_one({"_id": ad["_id"]}, {"$set": update})


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
    ad = await db["feed_ads"].find_one_and_delete({"_id": _oid(ad_id)})
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
    refund = 0
    if ad.get("ad_type") == "sponsored" and ad.get("created_by") and ad.get("status") in ("approved", "pending_review"):
        paid = ad.get("budget_coins") or ad.get("coins_paid") or 0
        refund = max(0, paid - coins_for(ad.get("views_billed") or 0)) if ad.get("views_cap") else paid
        if refund:
            await credit_coins(db=db, user_id=ad["created_by"], amount=refund, reason="feed_ad_refund",
                               description="Ad removed by Anonixx, unused budget", meta={"ad_id": ad_id})
    await audit(db, admin_id, "ad.delete", "ad", ad_id)
    return {"id": ad_id, "deleted": True, "refunded": refund}


# ==================== MEMBER ADS ====================

class CampaignBody(BaseModel):
    target_type:  str                                  # "drop" | "room"
    drop_id:      Optional[str] = None
    title:        str = Field(..., max_length=900)
    media_url:    Optional[str] = None
    media_type:   str = "image"
    cover_url:    Optional[str] = None
    cta:          str = "See more"
    countries:    list[str] = []
    genders:      list[str] = []
    age_min:      Optional[int] = Field(None, ge=18, le=99)
    age_max:      Optional[int] = Field(None, ge=18, le=99)
    budget_coins: int = Field(..., ge=MIN_BUDGET, le=100000)
    daily_coins:  Optional[int] = Field(None, ge=10, le=100000)


async def _can_advertise(db, user_id: str) -> dict:
    user = await db["users"].find_one({"_id": ObjectId(user_id)}, {"created_at": 1, "age_verified": 1, "coin_balance": 1, "is_active": 1})
    if not user or user.get("is_active") is False:
        raise HTTPException(status_code=404, detail="Account not found.")
    created = user.get("created_at")
    if isinstance(created, str):
        try:
            created = datetime.fromisoformat(created.replace("Z", "+00:00"))
        except ValueError:
            created = None
    if isinstance(created, datetime) and created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if not user.get("age_verified"):
        raise HTTPException(status_code=403, detail={"code": "age_required", "message": "Confirm you're 18+ to run ads."})
    if not created or now_utc() - created < timedelta(days=MIN_ACCOUNT_DAYS):
        raise HTTPException(status_code=403, detail={"code": "too_new", "message": f"Accounts can run ads after {MIN_ACCOUNT_DAYS} days."})
    return user


@router.get("/campaigns/rules")
async def campaign_rules(current_user_id: str = Depends(get_current_user_id), db = Depends(get_database)):
    """Prices and whether this account can advertise yet."""
    try:
        await _can_advertise(db, current_user_id)
        reason = None
    except HTTPException as e:
        reason = e.detail.get("message") if isinstance(e.detail, dict) else str(e.detail)
    return {"coins_per_1000": COINS_PER_1000, "min_budget": MIN_BUDGET, "ctas": sorted(MEMBER_CTAS),
            "can_advertise": reason is None, "reason": reason}


@router.post("/campaigns", status_code=201)
async def create_campaign(data: CampaignBody, current_user_id: str = Depends(get_current_user_id), db = Depends(get_database)):
    """A member ad: the budget is held now, an admin reviews it, and it pays per view as it runs.
    Rejected, every coin comes back; stopped early, the unused coins come back."""
    await _can_advertise(db, current_user_id)
    title = data.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Write what your ad says.")
    if data.cta not in MEMBER_CTAS:
        raise HTTPException(status_code=400, detail="Pick one of the buttons.")
    if data.media_type not in AD_MEDIA_TYPES:
        raise HTTPException(status_code=400, detail="That media type isn't supported.")
    if data.age_min and data.age_max and data.age_min > data.age_max:
        raise HTTPException(status_code=400, detail="The youngest age has to be under the oldest.")
    from app.utils.contact_filter import contains_contact_info
    if contains_contact_info(title):
        raise HTTPException(status_code=400, detail="Ads can't carry phone numbers, emails or handles.")

    if data.target_type == "drop":
        if not data.drop_id or not ObjectId.is_valid(data.drop_id):
            raise HTTPException(status_code=400, detail="Pick one of your drops.")
        drop = await db["drops"].find_one({"_id": ObjectId(data.drop_id), "sender_id": current_user_id, "is_active": True})
        if not drop:
            raise HTTPException(status_code=400, detail="Pick one of your own live drops.")
        link_url = f"anonixx://drop/{data.drop_id}"
        media_url = data.media_url or drop.get("media_url") or (drop.get("images") or [None])[0]
        media_type = data.media_type if data.media_url else ("video" if drop.get("media_type") == "video" else "image") if media_url else "image"
        cover_url = data.cover_url or (drop.get("cover_url") if not data.media_url else None)
    elif data.target_type == "room":
        link_url = f"anonixx://room/{current_user_id}"
        media_url, media_type, cover_url = data.media_url, data.media_type, data.cover_url
    else:
        raise HTTPException(status_code=400, detail="Promote a drop or your Room.")

    try:
        await debit_coins(db=db, user_id=current_user_id, amount=data.budget_coins, reason="feed_ad",
                          description=f"Ad budget, about {views_for(data.budget_coins):,} views", meta={})
    except ValueError as e:
        if "Insufficient" in str(e):
            raise HTTPException(status_code=402, detail={"code": "coins_short", "cost": data.budget_coins,
                                                         "message": f"You need {data.budget_coins} coins for this budget."})
        raise HTTPException(status_code=404, detail="Account not found.")

    now = now_utc()
    doc = {
        "created_by": current_user_id, "ad_type": "sponsored", "status": "pending_review", "created_at": now,
        "title": title, "link_url": link_url, "media_url": media_url, "media_type": media_type, "cover_url": cover_url,
        "cta": data.cta, "target_type": data.target_type, "drop_id": data.drop_id if data.target_type == "drop" else None,
        "countries": sorted({c.strip() for c in data.countries if c.strip()})[:50],
        "genders": sorted({g for g in data.genders if g in GENDERS}),
        "age_min": data.age_min, "age_max": data.age_max, "platforms": [],
        "coins_paid": data.budget_coins, "budget_coins": data.budget_coins,
        "views_cap": views_for(data.budget_coins), "views_billed": 0,
        "day_cap": views_for(data.daily_coins) if data.daily_coins else None, "paused_until": None,
        "expires_at": None, "starts_at": None, "active": True,
    }
    res = await db["feed_ads"].insert_one(doc)
    return {"id": str(res.inserted_id), "status": "pending_review", "coins_held": data.budget_coins,
            "views": doc["views_cap"]}


def _mine(ad: dict, st: dict) -> dict:
    spent = coins_for(ad.get("views_billed") or 0)
    return {
        **format_ad(ad),
        "target_type": ad.get("target_type"), "drop_id": ad.get("drop_id"),
        "countries": ad.get("countries") or [], "genders": ad.get("genders") or [],
        "age_min": ad.get("age_min"), "age_max": ad.get("age_max"),
        "budget_coins": ad.get("budget_coins") or ad.get("coins_paid") or 0,
        "spent_coins": min(spent, ad.get("budget_coins") or spent), "views_billed": ad.get("views_billed") or 0,
        "views_cap": ad.get("views_cap"), "active": ad.get("active", True) is not False,
        "views": st["seen"], "taps": st["tap"], "likes": st["like"],
        "tap_rate": round(st["tap"] / st["seen"] * 100, 1) if st["seen"] else 0.0,
    }


@router.get("/mine")
async def my_ads(current_user_id: str = Depends(get_current_user_id), db = Depends(get_database)):
    ads = await db["feed_ads"].find({"created_by": current_user_id, "ad_type": "sponsored"}).sort("created_at", -1).limit(50).to_list(50)
    stats = await _stats(db, [str(a["_id"]) for a in ads])
    return {"ads": [_mine(a, stats[str(a["_id"])]) for a in ads]}


class MinePatch(BaseModel):
    active: bool


@router.patch("/mine/{ad_id}")
async def pause_my_ad(ad_id: str, data: MinePatch, current_user_id: str = Depends(get_current_user_id), db = Depends(get_database)):
    res = await db["feed_ads"].update_one(
        {"_id": _oid(ad_id), "created_by": current_user_id, "status": {"$in": ["approved", "pending_review"]}},
        {"$set": {"active": data.active}},
    )
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Ad not found")
    return {"id": ad_id, "active": data.active}


@router.post("/mine/{ad_id}/stop")
async def stop_my_ad(ad_id: str, current_user_id: str = Depends(get_current_user_id), db = Depends(get_database)):
    """Ends the ad for good and returns the coins it hadn't spent."""
    ad = await db["feed_ads"].find_one_and_update(
        {"_id": _oid(ad_id), "created_by": current_user_id, "status": {"$in": ["approved", "pending_review"]}},
        {"$set": {"status": "ended", "active": False, "ended_at": now_utc()}},
    )
    if not ad:
        raise HTTPException(status_code=404, detail="This ad has already ended.")
    budget = ad.get("budget_coins") or 0
    refund = max(0, budget - coins_for(ad.get("views_billed") or 0)) if ad.get("views_cap") else 0
    if refund:
        await credit_coins(db=db, user_id=current_user_id, amount=refund, reason="feed_ad_refund",
                           description="Ad stopped, unused budget", meta={"ad_id": ad_id})
    return {"id": ad_id, "status": "ended", "refunded": refund}
