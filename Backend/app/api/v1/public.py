"""Public read API for the website (no login). Only `general` posts."""
import asyncio
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.database import get_database
from app.api.v1.drops import (
    batch_format_drops, live_filter, _viewer_key, _none_list, _seen_drop_ids, _fetch_for_you, _recycled_page, RECYCLE_PREFIX,
)
from app.utils import taste
from app.utils.content_mode import SAFE_FILTER
from app.utils.feed_mix import fetch_mixed, not_promoted, fetch_promoted, splice_promoted, fetch_showcase, splice_showcase
from app.tasks import scheduled_publisher
from app.utils.countries import country_from_header

router = APIRouter(prefix="/public", tags=["Public"])

SITEMAP_PAGE_SIZE = 5000
# Short text-only drops with no likes or replies are thin pages: left out of the sitemap (the web page
# marks them noindex too). Mirrors THIN_DROP_CHARS in Web/lib/api.ts.
THIN_DROP_CHARS = 80
_NOT_THIN = {"$or": [
    {"$expr": {"$gte": [{"$strLenCP": {"$trim": {"input": {"$ifNull": ["$confession", ""]}}}}, THIN_DROP_CHARS]}},
    {"media_type": {"$in": ["image", "video", "gif"]}},   # the photo or video is the content
    {"likes_count": {"$gte": 1}},
    {"thread_count": {"$gte": 1}},
]}
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
    x_country: Optional[str] = Header(None, alias="X-Country"),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    db = Depends(get_database),
):
    scheduled_publisher.nudge(db)
    now = datetime.now(timezone.utc)
    query: dict = {**_LIVE, **SAFE_FILTER, **live_filter(now)}   # finished "tonight" hookups drop out
    stream = {"$and": [query, not_promoted(now)]}
    country = country_from_header(x_country)

    # A guest with a device id gets the same feed as a member: nothing they've seen comes back,
    # and it leans toward what they watch (drops.py, utils/taste.py).
    viewer_key = _viewer_key(None, x_device_id)
    recycling = bool(cursor and cursor.startswith(RECYCLE_PREFIX))
    viewer_taste, seen = await asyncio.gather(
        taste.load(db, viewer_key),
        _seen_drop_ids(db, viewer_key) if viewer_key and not recycling else _none_list(),
    )
    if recycling:
        page, next_cursor, has_more = await _recycled_page(db, viewer_key, stream, limit, cursor)
    else:
        fresh = {"$and": [stream, {"_id": {"$nin": seen}}]} if seen else stream
        page, next_cursor, has_more = await _fetch_for_you(db, fresh, limit, cursor, country, viewer_taste)
        if not has_more and seen:
            if page:
                next_cursor, has_more = RECYCLE_PREFIX, True
            else:
                page, next_cursor, has_more = await _recycled_page(db, viewer_key, stream, limit, RECYCLE_PREFIX)
    if not cursor:
        # First page: pinned/boosted drops, and for a newcomer a rotating few of the best recent
        # ones, so their first look is strong content, not just the latest post.
        showcase, promoted = await asyncio.gather(
            fetch_showcase(db, stream, now) if not seen else _none_list(),
            fetch_promoted(db, query, now),
        )
        if showcase:
            page = splice_showcase(page, showcase)
        page = splice_promoted(page, promoted)

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
    query = {"$and": [{**_LIVE, **SAFE_FILTER}, _NOT_THIN]}
    total = await db["drops"].count_documents(query)
    rows = await db["drops"].find(query, {"_id": 1, "created_at": 1}) \
        .sort([("created_at", -1), ("_id", -1)]) \
        .skip(page * SITEMAP_PAGE_SIZE).limit(SITEMAP_PAGE_SIZE).to_list(None)
    return {
        "total": total,
        "pages": max(1, -(-total // SITEMAP_PAGE_SIZE)),
        "items": [
            # Mongo hands back naive UTC datetimes; sitemaps need the zone spelled out.
            {"id": str(r["_id"]), "lastmod": r["created_at"].replace(tzinfo=timezone.utc).isoformat()}
            for r in rows if r.get("created_at")
        ],
    }


TOPIC_PAGE_MIN = 3


@router.get("/topics")
async def public_topics(db = Depends(get_database)):
    """Moods and topics with enough safe drops to make a page (for the sitemap)."""
    from app.utils.search_lexicon import MOODS, STORY_TOPICS, TOPIC_LABELS
    out = []
    for t in (*MOODS, *STORY_TOPICS):
        n = await db["drops"].count_documents(
            {**_LIVE, **SAFE_FILTER, "kind": {"$ne": "hookup"}, "topics": t}, limit=TOPIC_PAGE_MIN,
        )
        if n >= TOPIC_PAGE_MIN:
            out.append({"id": t, "label": TOPIC_LABELS[t]})
    return {"topics": out}


@router.get("/topics/{topic}")
async def public_topic(topic: str, db = Depends(get_database)):
    """A public page of safe confessions for one mood or topic. Never mature, never hookups."""
    from app.utils.search_lexicon import STORY_TAGS, TOPIC_LABELS
    from app.utils.search_engine import engagement
    if topic not in STORY_TAGS:
        raise HTTPException(status_code=404, detail="Topic not found")
    docs = await db["drops"].find(
        {**_LIVE, **SAFE_FILTER, "kind": {"$ne": "hookup"}, "topics": topic, **_NOT_THIN},
    ).sort("created_at", -1).limit(120).to_list(120)
    docs.sort(key=lambda d: -engagement(d))
    posts = [_public_post(p) for p in await batch_format_drops(docs[:30], None, db)]
    return {"topic": topic, "label": TOPIC_LABELS[topic], "posts": posts}
