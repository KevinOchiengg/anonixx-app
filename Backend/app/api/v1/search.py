"""Search across all drops (videos, photos, audio, confessions, hookups), plus taps, saved
searches, and the admin tools: blocked searches, synonyms, unmet searches and quality stats."""
import hashlib
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.database import get_database
from app.dependencies import get_current_user_id, get_optional_user_id, require_scope
from app.utils import search_engine as se
from app.utils import search_lexicon as lex
from app.utils.discovery import eligible, viewer_context
from app.utils.search_safety import blocked, flag

router = APIRouter(prefix="/search", tags=["Search"])

MAX_SAVED = 20


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _viewer_key(request: Request, user_id: Optional[str]) -> Optional[str]:
    if user_id:
        return user_id
    device = request.headers.get("X-Device-Id") or ""
    return "device:" + hashlib.sha256(device.encode()).hexdigest()[:24] if device else None


def _oid(value: str) -> ObjectId:
    if not ObjectId.is_valid(value or ""):
        raise HTTPException(400, "Invalid ID.")
    return ObjectId(value)


@router.get("")
async def search(
    request: Request,
    q: str = Query("", max_length=120),
    kind: Optional[str] = Query(None),          # hookup | confession
    media: Optional[str] = Query(None),         # video | audio | photo | text
    since: Optional[str] = Query(None),         # today | week | month
    topic: Optional[str] = Query(None),
    cursor: Optional[str] = Query(None),
    x_content_mode: Optional[str] = Header(None, alias="X-Content-Mode"),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db=Depends(get_database),
):
    from app.api.v1.drops import batch_format_drops

    viewer = _viewer_key(request, current_user_id)
    query = q.strip()
    if query and (term := blocked(query)):
        await flag(db, query, term, viewer)
        return {"results": [], "has_more": False, "cursor": None, "query_id": None}

    ctx = await viewer_context(db, current_user_id, x_content_mode)
    now = _now()
    skip = int(cursor) if cursor and cursor.isdigit() else 0

    # Hookup details ("woman 30 Kenya") are read directly, never rewritten by the AI step.
    ai = await se.ai_understand(db, query) if query and not skip and not se.who(query)["filters"] else None
    if ai:
        kind = kind or (ai["kind"] if ai["kind"] != "any" else None)
        media = media or (ai["media_type"] if ai["media_type"] != "any" else None)
        since = since or (ai["date_range"] if ai["date_range"] != "any" else None)
        query = ai["query"] or query
    elif query and not skip:
        u = await se.understand(db, query)
        kind = kind or u["kind"]
        since = since or u["since"]

    if not query and not (kind or media or since or topic):
        return {"results": [], "has_more": False, "cursor": None, "query_id": None}

    conds = eligible(ctx, now) + se.filters(kind, media, since, topic, now)
    arm = se.variant(viewer)
    ranked = await se.search(db, conds, query, viewer, arm)
    page = ranked[skip:skip + se.PAGE]
    has_more = len(ranked) > skip + se.PAGE

    query_id = None
    if not skip and q.strip():
        res = await db["search_events"].insert_one({
            "type": "search", "q": se.norm(q), "viewer_key": viewer, "n": len(ranked), "arm": arm,
            "filters": {"kind": kind, "media": media, "since": since, "topic": topic}, "at": now,
        })
        query_id = str(res.inserted_id)
    return {
        "results": await batch_format_drops(page, ctx["viewer_id"], db),
        "has_more": has_more,
        "cursor": str(skip + se.PAGE) if has_more else None,
        "query_id": query_id,
        "filters": {"kind": kind, "media": media, "since": since, "topic": topic},
    }


class TapRequest(BaseModel):
    query_id: str
    drop_id: str
    position: int = Field(0, ge=0, le=500)
    action: str = "open"      # open | like | watch_done


@router.post("/tap", status_code=204)
async def tap(
    body: TapRequest,
    request: Request,
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db=Depends(get_database),
):
    if body.action not in ("open", "like", "watch_done"):
        raise HTTPException(400, "Unknown action.")
    ev = await db["search_events"].find_one({"_id": _oid(body.query_id), "type": "search"}, {"q": 1, "at": 1})
    if not ev or not ObjectId.is_valid(body.drop_id):
        return None
    await db["search_events"].insert_one({
        "type": "tap", "query_id": body.query_id, "q": ev["q"], "drop_id": body.drop_id,
        "position": body.position, "action": body.action,
        "viewer_key": _viewer_key(request, current_user_id), "at": _now(),
    })
    return None


@router.get("/suggest")
async def suggest(q: str = Query("", max_length=60), db=Depends(get_database)):
    """Popular searches (several people, last 14 days) and topics that start with what's typed."""
    key = se.norm(q)
    since = _now() - timedelta(days=14)
    match: dict = {"type": "search", "at": {"$gte": since}, "n": {"$gt": 0}}
    if key:
        match["q"] = {"$regex": "^" + re.escape(key)}
    rows = await db["search_events"].aggregate([
        {"$match": match},
        {"$group": {"_id": "$q", "viewers": {"$addToSet": "$viewer_key"}}},
        {"$project": {"n": {"$size": "$viewers"}}},
        {"$match": {"n": {"$gte": 3}}},
        {"$sort": {"n": -1}},
        {"$limit": 6},
    ]).to_list(6)
    popular = [r["_id"] for r in rows if not blocked(r["_id"])]
    topics = [
        {"id": t, "label": lex.TOPIC_LABELS[t]} for t in (*lex.MOODS, *lex.STORY_TOPICS)
        if not key or lex.TOPIC_LABELS[t].lower().startswith(key)
    ][:8]
    return {"popular": popular, "topics": topics}


@router.get("/similar/{drop_id}")
async def similar(
    drop_id: str,
    x_content_mode: Optional[str] = Header(None, alias="X-Content-Mode"),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db=Depends(get_database),
):
    from app.api.v1.drops import batch_format_drops

    ctx = await viewer_context(db, current_user_id, x_content_mode)
    conds = eligible(ctx, _now())
    drop = await db["drops"].find_one({"$and": conds + [{"_id": _oid(drop_id)}]})
    if not drop:
        raise HTTPException(404, "Drop not found.")
    docs = await se.similar(db, conds, drop)
    return {"results": await batch_format_drops(docs, ctx["viewer_id"], db)}


# ── saved searches ──

class SavedSearch(BaseModel):
    q: str = Field("", max_length=120)
    kind: Optional[str] = None
    media: Optional[str] = None
    topic: Optional[str] = None


@router.get("/saved")
async def list_saved(current_user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    rows = await db["saved_searches"].find({"user_id": current_user_id}).sort("created_at", -1).to_list(MAX_SAVED)
    return {"saved": [{"id": str(r["_id"]), "q": r["q"], "kind": r.get("kind"), "media": r.get("media"),
                       "topic": r.get("topic")} for r in rows]}


@router.post("/saved", status_code=201)
async def save_search(body: SavedSearch, current_user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    q = body.q.strip()
    if not (q or body.kind or body.media or body.topic):
        raise HTTPException(400, "Type something to save.")
    if q and blocked(q):
        raise HTTPException(400, "That search can't be saved.")
    if await db["saved_searches"].count_documents({"user_id": current_user_id}) >= MAX_SAVED:
        raise HTTPException(400, f"You can save up to {MAX_SAVED} searches. Remove one first.")
    now = _now()
    doc = {"user_id": current_user_id, "q": q, "kind": body.kind, "media": body.media, "topic": body.topic,
           "created_at": now, "checked_at": now, "notified_at": None}
    res = await db["saved_searches"].update_one(
        {"user_id": current_user_id, "q": q, "kind": body.kind, "media": body.media, "topic": body.topic},
        {"$setOnInsert": doc}, upsert=True,
    )
    return {"saved": True, "id": str(res.upserted_id) if res.upserted_id else None}


@router.delete("/saved/{saved_id}", status_code=204)
async def delete_saved(saved_id: str, current_user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    await db["saved_searches"].delete_one({"_id": _oid(saved_id), "user_id": current_user_id})
    return None


# ── admin ──

@router.get("/admin/flags")
async def admin_flags(
    reviewed: bool = Query(False),
    admin_id: str = Depends(require_scope("moderation")),
    db=Depends(get_database),
):
    rows = await db["search_flags"].find({"reviewed": reviewed}).sort("created_at", -1).limit(200).to_list(200)
    return {"flags": [{"id": str(r["_id"]), "query": r["query"], "term": r["term"],
                       "viewer": r.get("viewer_key"), "at": r["created_at"].isoformat()} for r in rows]}


@router.patch("/admin/flags/{flag_id}", status_code=204)
async def review_flag(flag_id: str, admin_id: str = Depends(require_scope("moderation")), db=Depends(get_database)):
    await db["search_flags"].update_one({"_id": _oid(flag_id)}, {"$set": {"reviewed": True, "reviewed_by": admin_id, "reviewed_at": _now()}})
    return None


class Synonym(BaseModel):
    term: str = Field(..., min_length=2, max_length=40)
    expands: list[str] = Field(default_factory=list, max_length=30)
    topics: list[str] = Field(default_factory=list, max_length=5)
    active: bool = True


def _clean_syn(body: Synonym) -> dict:
    expands = [e.strip().lower() for e in body.expands if e.strip()][:30]
    return {"term": body.term.strip().lower(), "expands": list(dict.fromkeys(expands)),
            "topics": [t for t in body.topics if t in lex.STORY_TAGS], "active": body.active}


@router.get("/admin/synonyms")
async def list_synonyms(admin_id: str = Depends(require_scope("content")), db=Depends(get_database)):
    rows = await db["search_synonyms"].find().sort("term", 1).to_list(2000)
    return {"synonyms": [{"id": str(r["_id"]), "term": r["term"], "expands": r.get("expands", []),
                          "topics": r.get("topics", []), "active": r.get("active", True)} for r in rows],
            "topics": [{"id": t, "label": lex.TOPIC_LABELS[t]} for t in (*lex.MOODS, *lex.STORY_TOPICS)]}


@router.post("/admin/synonyms", status_code=201)
async def add_synonym(body: Synonym, admin_id: str = Depends(require_scope("content")), db=Depends(get_database)):
    doc = _clean_syn(body)
    if await db["search_synonyms"].find_one({"term": doc["term"]}):
        raise HTTPException(400, "That word is already in the list. Edit it instead.")
    res = await db["search_synonyms"].insert_one({**doc, "created_at": _now(), "created_by": admin_id})
    se.clear_synonym_cache()
    return {"id": str(res.inserted_id)}


@router.put("/admin/synonyms/{syn_id}", status_code=204)
async def edit_synonym(syn_id: str, body: Synonym, admin_id: str = Depends(require_scope("content")), db=Depends(get_database)):
    await db["search_synonyms"].update_one({"_id": _oid(syn_id)}, {"$set": {**_clean_syn(body), "updated_at": _now()}})
    se.clear_synonym_cache()
    return None


@router.delete("/admin/synonyms/{syn_id}", status_code=204)
async def delete_synonym(syn_id: str, admin_id: str = Depends(require_scope("content")), db=Depends(get_database)):
    await db["search_synonyms"].delete_one({"_id": _oid(syn_id)})
    se.clear_synonym_cache()
    return None


async def unmet_searches(db, days: int = 7, limit: int = 20) -> list:
    """Searches that found nothing, or that nobody tapped a result for."""
    since = _now() - timedelta(days=days)
    rows = await db["search_events"].aggregate([
        {"$match": {"type": "search", "at": {"$gte": since}}},
        {"$lookup": {"from": "search_events", "let": {"qid": {"$toString": "$_id"}},
                     "pipeline": [{"$match": {"$expr": {"$eq": ["$query_id", "$$qid"]}}}, {"$limit": 1}],
                     "as": "taps"}},
        {"$group": {"_id": "$q", "searches": {"$sum": 1}, "viewers": {"$addToSet": "$viewer_key"},
                    "empty": {"$sum": {"$cond": [{"$eq": ["$n", 0]}, 1, 0]}},
                    "tapped": {"$sum": {"$cond": [{"$gt": [{"$size": "$taps"}, 0]}, 1, 0]}}}},
        {"$match": {"tapped": 0}},
        {"$project": {"searches": 1, "empty": 1, "people": {"$size": "$viewers"}}},
        {"$sort": {"people": -1, "searches": -1}},
        {"$limit": limit},
    ]).to_list(limit)
    return [{"q": r["_id"], "searches": r["searches"], "people": r["people"], "no_results": r["empty"] > 0}
            for r in rows if r["_id"] and not blocked(r["_id"])]


@router.get("/admin/unmet")
async def admin_unmet(days: int = Query(7, ge=1, le=90), admin_id: str = Depends(require_scope("content")), db=Depends(get_database)):
    return {"unmet": await unmet_searches(db, days)}


@router.get("/admin/stats")
async def admin_stats(days: int = Query(7, ge=1, le=90), admin_id: str = Depends(require_scope("content")), db=Depends(get_database)):
    since = _now() - timedelta(days=days)
    out = {}
    for arm in ("a", "b"):
        searches = await db["search_events"].find(
            {"type": "search", "at": {"$gte": since}, "arm": arm} if arm == "b"
            else {"type": "search", "at": {"$gte": since}, "arm": {"$ne": "b"}},
            {"n": 1, "at": 1},
        ).to_list(50000)
        if not searches:
            continue
        ids = [str(s["_id"]) for s in searches]
        first_tap: dict = {}
        async for t in db["search_events"].find({"type": "tap", "query_id": {"$in": ids}}, {"query_id": 1, "at": 1}):
            first_tap[t["query_id"]] = min(first_tap.get(t["query_id"], t["at"]), t["at"])
        waits = sorted((first_tap[str(s["_id"])] - s["at"]).total_seconds() for s in searches if str(s["_id"]) in first_tap)
        out[arm] = {
            "searches": len(searches),
            "zero_result_rate": round(sum(1 for s in searches if not s.get("n")) / len(searches), 3),
            "tap_rate": round(len(first_tap) / len(searches), 3),
            "median_seconds_to_first_tap": round(waits[len(waits) // 2], 1) if waits else None,
        }
    top = await db["search_events"].aggregate([
        {"$match": {"type": "search", "at": {"$gte": since}}},
        {"$group": {"_id": "$q", "n": {"$sum": 1}}},
        {"$sort": {"n": -1}}, {"$limit": 15},
    ]).to_list(15)
    return {
        "days": days, "arms": out,
        "top": [{"q": r["_id"], "searches": r["n"]} for r in top if not blocked(r["_id"] or "")],
        "open_flags": await db["search_flags"].count_documents({"reviewed": False}),
    }
