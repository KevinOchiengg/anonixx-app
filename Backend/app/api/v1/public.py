"""
Public, unauthenticated read API for the website (Web/) — server-rendered
pages, the sitemap and the guest feed. Only `general` posts are ever served
here; `mature` posts need a signed-in, age-verified user via /drops/*.
"""
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import get_database
from app.api.v1.drops import batch_format_drops
from app.utils.content_mode import SAFE_FILTER

router = APIRouter(prefix="/public", tags=["Public"])

SITEMAP_PAGE_SIZE = 5000
_LIVE = {"is_active": True, "moderation_status": "visible"}


def _public_post(post: dict) -> dict:
    # Guests never see per-viewer state.
    for k in ("is_liked", "is_saved", "is_own_post", "user_id"):
        post.pop(k, None)
    return post


@router.get("/feed")
async def public_feed(
    cursor: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=20),
    db = Depends(get_database),
):
    query: dict = {**_LIVE, **SAFE_FILTER}
    if cursor:
        try:
            ts, oid = cursor.rsplit("|", 1)
            dt = datetime.fromisoformat(ts)
            query = {"$and": [query, {"$or": [
                {"created_at": {"$lt": dt}},
                {"created_at": dt, "_id": {"$lt": ObjectId(oid)}},
            ]}]}
        except Exception:
            raise HTTPException(status_code=400, detail="Bad cursor.")

    rows = await db["drops"].find(query).sort([("created_at", -1), ("_id", -1)]).limit(limit + 1).to_list(None)
    page = rows[:limit]
    has_more = len(rows) > limit
    next_cursor = f"{page[-1]['created_at'].isoformat()}|{page[-1]['_id']}" if page and has_more else None

    posts = [_public_post(p) for p in await batch_format_drops(page, None, db)]
    return {"posts": posts, "next_cursor": next_cursor, "has_more": has_more}


@router.get("/drops/{drop_id}")
async def public_drop(drop_id: str, db = Depends(get_database)):
    if not ObjectId.is_valid(drop_id):
        raise HTTPException(status_code=404, detail="Drop not found")
    drop = await db["drops"].find_one({"_id": ObjectId(drop_id), **_LIVE})
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")
    if drop.get("sensitivity") == "mature":
        # The page renders a sign-in / 18+ gate and is marked noindex.
        return {"restricted": True, "id": drop_id}
    formatted = await batch_format_drops([drop], None, db)
    if not formatted:
        raise HTTPException(status_code=404, detail="Drop not found")
    return {"restricted": False, "post": _public_post(formatted[0])}


@router.get("/sitemap")
async def public_sitemap(page: int = Query(0, ge=0), db = Depends(get_database)):
    query = {**_LIVE, **SAFE_FILTER}
    total = await db["drops"].count_documents(query)
    rows = await db["drops"].find(query, {"_id": 1, "created_at": 1}) \
        .sort([("created_at", -1), ("_id", -1)]) \
        .skip(page * SITEMAP_PAGE_SIZE).limit(SITEMAP_PAGE_SIZE).to_list(None)
    return {
        "total": total,
        "pages": max(1, -(-total // SITEMAP_PAGE_SIZE)),
        "items": [
            {"id": str(r["_id"]), "lastmod": r["created_at"].isoformat()}
            for r in rows if r.get("created_at")
        ],
    }
