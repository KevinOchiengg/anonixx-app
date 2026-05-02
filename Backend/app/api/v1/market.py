"""
market.py — Anonixx Mini Market

Staff-curated paid content marketplace.

Concept:
  Admins / staff post exclusive content (videos, stories, intel, etc.).
  Each item has a free teaser shown in the feed and on social media.
  Users pay coins to unlock the full content — once unlocked, it's theirs forever.

Collections:
  market_items     — content listings (admin-controlled)
  market_unlocks   — per-user unlock records (idempotent)

Deep link:
  anonixx://market/:item_id  → MarketItemScreen

Endpoints:
  GET    /market/items                 list published items (teasers only)
  GET    /market/items/{id}            single item — full if unlocked, teaser otherwise
  POST   /market/items                 admin: create item
  PUT    /market/items/{id}            admin: edit item
  DELETE /market/items/{id}            admin: archive item (soft-delete)
  POST   /market/items/{id}/unlock     debit coins, grant access
  GET    /market/items/{id}/unlock-status   has the current user unlocked this?
  GET    /market/my-unlocks            current user's unlock history
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id, require_admin, get_optional_user_id
from app.utils.coin_service import debit_coins

router = APIRouter(prefix="/market", tags=["Market"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Pydantic models ─────────────────────────────────────────────────────────

class MarketItemCreate(BaseModel):
    title:        str
    teaser:       str                              # shown free everywhere
    full_content: str                              # paywalled
    media_url:    Optional[str]      = None        # cover image / video thumbnail
    media_type:   Optional[str]      = "text"      # "text" | "image" | "video"
    video_url:    Optional[str]      = None        # paywalled — only after unlock
    price_coins:  int                = Field(..., gt=0)
    category:     str                = "exclusive" # "exclusive" | "trending" | "leaked" | "intel"
    tags:         List[str]          = []
    publish:      bool               = True        # publish immediately or save draft


class MarketItemUpdate(BaseModel):
    title:        Optional[str]      = None
    teaser:       Optional[str]      = None
    full_content: Optional[str]      = None
    media_url:    Optional[str]      = None
    media_type:   Optional[str]      = None
    video_url:    Optional[str]      = None
    price_coins:  Optional[int]      = Field(None, gt=0)
    category:     Optional[str]      = None
    tags:         Optional[List[str]] = None
    status:       Optional[str]      = None        # "draft" | "published" | "archived"


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _user_has_unlocked(db, user_id: Optional[str], item_id: str) -> bool:
    if not user_id:
        return False
    return await db.market_unlocks.find_one({
        "user_id": user_id,
        "item_id": item_id,
    }) is not None


def _serialize(item: dict, *, full: bool) -> dict:
    """
    Always returns title, teaser, media_url, price.
    Full content + video_url are only returned when `full=True` (i.e. unlocked).
    """
    out = {
        "id":          str(item["_id"]),
        "title":       item["title"],
        "teaser":      item["teaser"],
        "media_url":   item.get("media_url"),
        "media_type":  item.get("media_type", "text"),
        "price_coins": item["price_coins"],
        "category":    item.get("category", "exclusive"),
        "tags":        item.get("tags", []),
        "views":       item.get("views", 0),
        "unlocks":     item.get("unlocks", 0),
        "status":      item.get("status", "published"),
        "published_at": (item.get("published_at") or item.get("created_at")).isoformat()
                        if item.get("published_at") or item.get("created_at") else None,
        "is_unlocked": full,
    }
    if full:
        out["full_content"] = item.get("full_content", "")
        out["video_url"]    = item.get("video_url")
    return out


# ─── Public endpoints ─────────────────────────────────────────────────────────

@router.get("/items")
async def list_market_items(
    category:        Optional[str] = Query(None),
    limit:           int           = Query(20, ge=1, le=50),
    offset:          int           = Query(0,  ge=0),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db                              = Depends(get_database),
):
    """List published market items. Teasers only — `is_unlocked` reflects the caller."""
    query = {"status": "published"}
    if category:
        query["category"] = category

    cursor = (
        db.market_items.find(query)
          .sort("published_at", -1)
          .skip(offset)
          .limit(limit)
    )
    items = await cursor.to_list(None)

    # Batch fetch unlock status for the calling user
    unlocked_ids: set[str] = set()
    if current_user_id and items:
        item_ids = [str(it["_id"]) for it in items]
        async for u in db.market_unlocks.find(
            {"user_id": current_user_id, "item_id": {"$in": item_ids}},
            {"item_id": 1},
        ):
            unlocked_ids.add(u["item_id"])

    return {
        "items": [
            _serialize(it, full=str(it["_id"]) in unlocked_ids)
            for it in items
        ],
        "limit":  limit,
        "offset": offset,
    }


@router.get("/items/{item_id}")
async def get_market_item(
    item_id:         str,
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db                              = Depends(get_database),
):
    """
    Returns the item. Full content is included only if the caller has already unlocked it.
    Increments view count once per call.
    """
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid item id.")

    item = await db.market_items.find_one_and_update(
        {"_id": oid, "status": "published"},
        {"$inc": {"views": 1}},
        return_document=True,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    full = await _user_has_unlocked(db, current_user_id, item_id)
    return _serialize(item, full=full)


@router.post("/items/{item_id}/unlock")
async def unlock_market_item(
    item_id:         str,
    current_user_id: str = Depends(get_current_user_id),
    db                  = Depends(get_database),
):
    """
    Charge the user `price_coins` and record the unlock. Idempotent —
    if already unlocked, returns the full item without re-charging.
    """
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid item id.")

    item = await db.market_items.find_one({"_id": oid, "status": "published"})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    # Already unlocked — return full content idempotently
    existing = await db.market_unlocks.find_one({
        "user_id": current_user_id,
        "item_id": item_id,
    })
    if existing:
        return {
            "already_unlocked": True,
            "item":             _serialize(item, full=True),
        }

    price = int(item.get("price_coins", 0))
    try:
        new_balance = await debit_coins(
            db          = db,
            user_id     = current_user_id,
            amount      = price,
            reason      = "market_unlock",
            description = f"Unlocked: {item['title'][:40]}",
            meta        = {"item_id": item_id, "category": item.get("category")},
        )
    except ValueError as e:
        if "Insufficient" in str(e):
            raise HTTPException(status_code=402, detail="Not enough coins.")
        raise HTTPException(status_code=404, detail="User not found.")

    # Record the unlock + bump counters
    await db.market_unlocks.insert_one({
        "user_id":     current_user_id,
        "item_id":     item_id,
        "paid_coins":  price,
        "unlocked_at": _now(),
    })
    await db.market_items.update_one(
        {"_id": oid},
        {"$inc": {"unlocks": 1}},
    )

    return {
        "already_unlocked": False,
        "spent":            price,
        "new_balance":      new_balance,
        "item":             _serialize(item, full=True),
    }


@router.get("/items/{item_id}/unlock-status")
async def market_unlock_status(
    item_id:         str,
    current_user_id: str = Depends(get_current_user_id),
    db                  = Depends(get_database),
):
    """Quick check — has the current user already unlocked this item?"""
    unlocked = await _user_has_unlocked(db, current_user_id, item_id)
    return {"is_unlocked": unlocked}


@router.get("/my-unlocks")
async def my_unlocks(
    current_user_id: str = Depends(get_current_user_id),
    db                  = Depends(get_database),
):
    """Items the current user has paid to unlock — for a 'My Library' screen."""
    unlocks = await db.market_unlocks.find(
        {"user_id": current_user_id},
    ).sort("unlocked_at", -1).to_list(None)

    if not unlocks:
        return {"items": []}

    item_ids = [ObjectId(u["item_id"]) for u in unlocks]
    items    = await db.market_items.find({"_id": {"$in": item_ids}}).to_list(None)
    by_id    = {str(it["_id"]): it for it in items}

    return {
        "items": [
            _serialize(by_id[u["item_id"]], full=True)
            for u in unlocks
            if u["item_id"] in by_id
        ],
    }


# ─── Admin endpoints ──────────────────────────────────────────────────────────

@router.post("/items", dependencies=[Depends(require_admin)])
async def create_market_item(
    data:     MarketItemCreate,
    admin_id: str = Depends(require_admin),
    db            = Depends(get_database),
):
    """Admin: create a new market item."""
    now    = _now()
    status = "published" if data.publish else "draft"
    doc    = {
        "title":         data.title.strip(),
        "teaser":        data.teaser.strip(),
        "full_content":  data.full_content.strip(),
        "media_url":     data.media_url,
        "media_type":    data.media_type,
        "video_url":     data.video_url,
        "price_coins":   data.price_coins,
        "category":      data.category,
        "tags":          data.tags,
        "status":        status,
        "views":         0,
        "unlocks":       0,
        "created_by":    admin_id,
        "created_at":    now,
        "updated_at":    now,
        "published_at":  now if status == "published" else None,
    }
    result = await db.market_items.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc, full=True)


@router.put("/items/{item_id}", dependencies=[Depends(require_admin)])
async def update_market_item(
    item_id: str,
    data:    MarketItemUpdate,
    db        = Depends(get_database),
):
    """Admin: edit an existing item. Bumps published_at if just being published."""
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid item id.")

    updates = {k: v for k, v in data.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    updates["updated_at"] = _now()
    if updates.get("status") == "published":
        existing = await db.market_items.find_one({"_id": oid}, {"published_at": 1})
        if existing and not existing.get("published_at"):
            updates["published_at"] = _now()

    result = await db.market_items.find_one_and_update(
        {"_id": oid}, {"$set": updates}, return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Item not found.")

    return _serialize(result, full=True)


@router.delete("/items/{item_id}", dependencies=[Depends(require_admin)])
async def archive_market_item(
    item_id: str,
    db        = Depends(get_database),
):
    """Admin: soft-delete an item (status → 'archived'). Existing unlocks are preserved."""
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid item id.")

    result = await db.market_items.update_one(
        {"_id": oid},
        {"$set": {"status": "archived", "updated_at": _now()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found.")

    return {"archived": True}


@router.get("/admin/items", dependencies=[Depends(require_admin)])
async def admin_list_all_items(
    db = Depends(get_database),
):
    """Admin: list all items including drafts and archived ones."""
    items = await db.market_items.find({}).sort("created_at", -1).to_list(None)
    return {"items": [_serialize(it, full=True) for it in items]}
