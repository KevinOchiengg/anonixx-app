"""Search and discovery.

NEAR: fresh Link Ups and discoverable Rooms by place (close by, area, country, anywhere).
STORIES: confessions by latest, unanswered, trending, topic, mood or keyword.

Privacy: only places people chose; no counts or distances; a narrow filter is never widened
silently; place hopping is rate limited; every query goes through utils/discovery.eligible.
"""
import base64
import hashlib
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request

from app.database import get_database
from app.dependencies import get_optional_user_id, require_scope
from app.utils import search_lexicon as lex
from app.utils.discovery import eligible, viewer_context
from app.utils.location import LOCATION_LEVELS  # noqa: F401  (documented levels)

router = APIRouter(prefix="/discover", tags=["Discover"])

SCOPES = ("close", "area", "country", "anywhere")
# The finest level each scope filters on. "Somewhere else" on the client is just
# another place at one of these scopes.
SCOPE_LEVELS = {"close": ["country", "county", "sub_county"], "area": ["country", "county"], "country": ["country"]}
LISTINGS = ("discoverable", "limited", "private")
DEFAULT_LISTING = "limited"
EXCLUDED_INTENTS = ["the-exchange"]   # under legal review; kept out of Near
PAGE = 12
STORY_WINDOW_DAYS = 90
TRENDING_DAYS = 7
TRENDING_MIN_POSTS = 6     # below this many engaged posts there's no honest "trending"
TRENDING_MIN_SCORE = 3


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Near ranking: reorders owners within a page by responsiveness; never hides anyone.
RESPONSE_WINDOW_DAYS = 30
OVERLOAD_PENDING = 8      # this many knocks waiting: let others be seen first for now
SLOW_MIN_KNOCKS = 6       # need this much history before "rarely answers" can apply
SLOW_RATE = 0.25          # answered / (answered + went unanswered)


async def _owner_signals(db, owner_ids: list, now: datetime) -> dict:
    """{owner: {pending, answered, unanswered}} from the last RESPONSE_WINDOW_DAYS of knocks."""
    if not owner_ids:
        return {}
    since = now - timedelta(days=RESPONSE_WINDOW_DAYS)
    out = {o: {"pending": 0, "answered": 0, "unanswered": 0} for o in owner_ids}
    async for r in db["drop_unlock_requests"].find(
        {"owner_id": {"$in": owner_ids}, "created_at": {"$gte": since}},
        {"owner_id": 1, "status": 1, "expires_at": 1},
    ):
        sig = out.get(r["owner_id"])
        if sig is None:
            continue
        st = r.get("status")
        exp = r.get("expires_at")
        lapsed = bool(exp) and _aware(exp) <= now
        if st in ("accepted", "declined", "accepting"):
            sig["answered"] += 1
        elif st == "expired" or (st == "pending" and lapsed):
            sig["unanswered"] += 1
        elif st == "pending":
            sig["pending"] += 1
    return out


def rank_tier(open_now: bool, sig: Optional[dict]) -> int:
    """0 open and keeping up, 1 swamped or rarely answers, 2 on a break."""
    if not open_now:
        return 2
    sig = sig or {}
    seen = sig.get("answered", 0) + sig.get("unanswered", 0)
    if sig.get("pending", 0) >= OVERLOAD_PENDING:
        return 1
    if seen >= SLOW_MIN_KNOCKS and sig.get("answered", 0) / seen < SLOW_RATE:
        return 1
    return 0


# ── Measurement: daily counters only (exposure per owner, request/empty/latency per surface).
async def _record(db, surface: str, owners: list, n_results: int, loose: bool, ms: float) -> None:
    import asyncio
    now = _now()
    day = now.strftime("%Y-%m-%d")
    at = now.replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        if owners:   # at most one page (PAGE owners)
            await asyncio.gather(*[
                db["discover_impressions"].update_one(
                    {"_id": f"{day}:{o}"}, {"$inc": {"n": 1}, "$setOnInsert": {"day": day, "owner_id": o, "at": at}}, upsert=True)
                for o in dict.fromkeys(owners)
            ])
        await db["discover_stats"].update_one(
            {"_id": f"{day}:{surface}"},
            {"$inc": {"requests": 1, "zero": int(n_results == 0), "loose": int(loose), "ms_total": round(ms, 1)},
             "$max": {"ms_max": round(ms, 1)}, "$setOnInsert": {"day": day, "surface": surface, "at": at}},
            upsert=True,
        )
    except Exception:
        pass   # measurement never breaks discovery


def _daily_order(user_id: str, day: str) -> str:
    """A fair, stable-for-the-day order for listed Rooms (not "last edited first")."""
    return hashlib.sha1(f"{day}:{user_id}".encode()).hexdigest()


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ── rate limits (per viewer, or per IP for guests; in memory) ──
_hits: dict[str, deque] = defaultdict(deque)
_places: dict[str, deque] = defaultdict(deque)
MAX_PER_MINUTE = 90
MAX_PLACES_PER_HOUR = 30


def _limit(key: str, place_key: Optional[str] = None) -> None:
    now = time.time()
    hits = _hits[key]
    while hits and hits[0] < now - 60:
        hits.popleft()
    if len(hits) >= MAX_PER_MINUTE:
        raise HTTPException(429, "Easy. Give it a minute.")
    hits.append(now)
    if place_key:
        seen = _places[key]
        while seen and seen[0][0] < now - 3600:
            seen.popleft()
        if place_key not in {p for _, p in seen}:
            if len({p for _, p in seen}) >= MAX_PLACES_PER_HOUR:
                raise HTTPException(429, "You've hopped between a lot of places. Try again in a while.")
            seen.append((now, place_key))


def _viewer_key(request: Request, viewer_id: Optional[str]) -> str:
    return viewer_id or f"ip:{request.client.host if request.client else 'x'}"


# ── cursors ──
def _enc(created: datetime, oid) -> str:
    return base64.urlsafe_b64encode(f"{_aware(created).isoformat()}|{oid}".encode()).decode()


def _dec(cursor: Optional[str]):
    if not cursor:
        return None
    try:
        ts, oid = base64.urlsafe_b64decode(cursor.encode()).decode().split("|")
        return datetime.fromisoformat(ts), ObjectId(oid)
    except Exception:
        raise HTTPException(400, "Bad cursor.")


def _after(cur) -> dict:
    """Older than the cursor in (created_at desc, _id desc) order."""
    created, oid = cur
    return {"$or": [{"created_at": {"$lt": created}}, {"created_at": created, "_id": {"$lt": oid}}]}


def _rx(value: str) -> dict:
    import re
    return {"$regex": f"^{re.escape(value.strip())}$", "$options": "i"}


def place_filter(scope: str, place: dict, prefix: str):
    """(filter, missing_level). prefix is "location_detail." for posts and
    "location_" for users. Never falls back to a wider area on its own."""
    if scope == "anywhere":
        return None, None
    match = {}
    for level in SCOPE_LEVELS[scope]:
        val = (place.get(level) or "").strip()
        if not val:
            return None, level
        match[f"{prefix}{level}"] = _rx(val)
    return match, None


def _coarse_place(loc: Optional[dict]) -> Optional[str]:
    """What a card shows: county and country, never the estate."""
    loc = loc or {}
    parts = [p for p in (loc.get("county"), loc.get("country")) if p]
    return ", ".join(parts) or None


async def _profiles(db, owner_ids: list) -> dict:
    out = {}
    async for p in db["chat_profiles"].find(
        {"user_id": {"$in": owner_ids}},
        {"user_id": 1, "listing": 1, "knocks_open": 1, "knocks_paused_until": 1, "intro": 1, "room_theme": 1, "background_pattern": 1,
         "profile_picture_url": 1, "door_rule": 1},
    ):
        out[p["user_id"]] = p
    return out


def _room_card(owner_id: str, prof: Optional[dict], avatar: Optional[str]) -> dict:
    from app.api.v1.chat_profile import door_rule_of, room_theme_of, knocks_open_of
    prof = prof or {}
    return {
        "user_id": owner_id,
        "listing": prof.get("listing") or DEFAULT_LISTING,
        "open": knocks_open_of(prof),
        "intro": prof.get("intro"),
        "room_theme": room_theme_of(prof),
        "avatar_url": prof.get("profile_picture_url") or avatar,
        "door_rule": door_rule_of(prof),
    }


# ── parse ──
@router.get("/parse")
async def parse_query(request: Request, q: str = Query("", max_length=120),
                      current_user_id: Optional[str] = Depends(get_optional_user_id)):
    """What a typed query means: surface, chips, and the leftover keyword."""
    _limit(_viewer_key(request, current_user_id))
    return lex.parse(q)


@router.get("/suggest")
async def suggest(request: Request, q: str = Query("", max_length=60), surface: str = Query("near"),
                  current_user_id: Optional[str] = Depends(get_optional_user_id)):
    """Typing suggestions from curated lists only (places, moods/topics, connection
    words, starter phrases). Never people, Rooms or post text."""
    _limit(_viewer_key(request, current_user_id))
    return {"suggestions": lex.suggest(q, surface if surface in ("near", "stories") else "near")}


@router.get("/topics")
async def topics():
    return {
        "moods": [{"id": m, "label": lex.TOPIC_LABELS[m]} for m in lex.MOODS],
        "topics": [{"id": t, "label": lex.TOPIC_LABELS[t]} for t in lex.STORY_TOPICS],
        "max": lex.MAX_TOPICS,
    }


# ── NEAR ──
@router.get("/near")
async def near(
    request: Request,
    scope: str = Query("area"),
    country: Optional[str] = Query(None, max_length=60),
    county: Optional[str] = Query(None, max_length=60),
    sub_county: Optional[str] = Query(None, max_length=60),
    gender: Optional[str] = Query(None),          # who the poster is: woman | man | other
    into: Optional[str] = Query(None),            # the viewer: woman | man; posts looking for them (or anyone)
    fresh: Optional[str] = Query(None),           # tonight | weekend | week
    age_min: Optional[int] = Query(None, ge=18, le=99),
    age_max: Optional[int] = Query(None, ge=18, le=99),
    hosting: Optional[str] = Query(None),         # can_host | can_travel
    open_only: bool = Query(False),
    q: Optional[str] = Query(None, max_length=80),
    loose: bool = Query(False),                   # match any keyword term (the server's own fallback)
    cursor: Optional[str] = Query(None),
    x_content_mode: Optional[str] = Header(None, alias="X-Content-Mode"),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db=Depends(get_database),
):
    """Fresh Link Ups in a place, newest first, one per Room owner. Within a page,
    owners taking knocks and keeping up come first (rank_tier)."""
    from app.api.v1.drops import batch_format_drops, HOOKUP_GENDERS, HOOKUP_LOOKING
    t0 = time.perf_counter()

    if scope not in SCOPES:
        raise HTTPException(400, "Unknown scope.")
    place = {"country": country, "county": county, "sub_county": sub_county}
    loc, missing = place_filter(scope, place, "location_detail.")
    place_key = f"{scope}:{'/'.join((place.get(l) or '').lower() for l in SCOPE_LEVELS.get(scope, []))}"
    _limit(_viewer_key(request, current_user_id), place_key)
    if missing:
        return {"results": [], "has_more": False, "cursor": None, "needs_place": missing}

    ctx = await viewer_context(db, current_user_id, x_content_mode)
    # Link Ups are adult posts: only age-verified viewers in full mode see them.
    if not ctx["mature"]:
        return {"results": [], "has_more": False, "cursor": None, "gate": "adult" if ctx["viewer_id"] else "signin"}

    now = _now()
    conds = eligible(ctx, now) + [
        {"kind": "hookup", "live_until": {"$gt": now}},
        {"is_admin_drop": {"$ne": True}},
        {"intent": {"$nin": EXCLUDED_INTENTS}},
    ]
    if ctx["viewer_id"]:
        conds.append({"sender_id": {"$ne": ctx["viewer_id"]}})
    if loc:
        conds.append(loc)
    if gender in HOOKUP_GENDERS:
        conds.append({"hookup.gender": gender})
    if into in ("woman", "man") and into in HOOKUP_LOOKING:
        conds.append({"$or": [{"hookup.looking_for": into}, {"hookup.looking_for": "anyone"}, {"hookup.looking_for": None}]})
    if fresh == "tonight":
        conds.append({"created_at": {"$gte": now - timedelta(hours=24)}})
    elif fresh == "weekend":
        conds.append({"hookup.fresh_window": "weekend"})
    elif fresh == "week":
        conds.append({"created_at": {"$gte": now - timedelta(days=7)}})
    if age_min:
        conds.append({"hookup.age": {"$gte": age_min}})
    if age_max:
        conds.append({"hookup.age": {"$lte": age_max}})
    if hosting in ("can_host", "can_travel"):
        conds.append({"hookup.guided.hosting": {"$in": [hosting, "either"]}})
    strict_kw, loose_kw = lex.keyword_filter(q or "", ["confession", "hookup.area", "tags"])

    # Owners who hid themselves from Near, or (if asked) aren't taking knocks.
    from app.api.v1.chat_profile import closed_query
    off = {"listing": "private"}
    if open_only:
        off = {"$or": [{"listing": "private"}, closed_query(now)]}
    hidden_owners = [p["user_id"] async for p in db["chat_profiles"].find(off, {"user_id": 1})]
    if hidden_owners:
        conds.append({"sender_id": {"$nin": hidden_owners}})

    cur = _dec(cursor)

    async def run(kw):
        pipeline = [
            {"$match": {"$and": conds + ([kw] if kw else [])}},
            {"$sort": {"created_at": -1, "_id": -1}},
            {"$group": {"_id": "$sender_id", "doc": {"$first": "$$ROOT"}, "n": {"$sum": 1}}},
            {"$addFields": {"doc._owner_posts": "$n"}},
            {"$replaceRoot": {"newRoot": "$doc"}},
        ]
        if cur:
            pipeline.append({"$match": _after(cur)})
        pipeline += [{"$sort": {"created_at": -1, "_id": -1}}, {"$limit": PAGE + 1}]
        return await db["drops"].aggregate(pipeline).to_list(PAGE + 1)

    used_loose = bool(loose and loose_kw)
    docs = await run(loose_kw if used_loose else strict_kw)
    if not docs and not cur and not used_loose and loose_kw:
        # Nothing has every word: fall back to any of them, and say so.
        used_loose = True
        docs = await run(loose_kw)
    has_more = len(docs) > PAGE
    docs = docs[:PAGE]

    posts = {p["id"]: p for p in await batch_format_drops(docs, ctx["viewer_id"], db)}
    profs = await _profiles(db, [d["sender_id"] for d in docs])
    signals = await _owner_signals(db, [d["sender_id"] for d in docs], now)
    results = []
    for d in docs:
        post = posts.get(str(d["_id"]))
        if not post:
            continue
        post.pop("linkup_count", None)   # per-post knock counts aren't shown in discovery
        results.append({
            "post": post,
            "place": _coarse_place(d.get("location_detail")),
            "room": _room_card(d["sender_id"], profs.get(d["sender_id"]), post.get("avatar_url")),
            "more_posts": max(0, d.get("_owner_posts", 1) - 1),
        })
    # Reorder within this page only (the cursor still follows time, so nobody is skipped).
    tier = {x["room"]["user_id"]: rank_tier(x["room"]["open"], signals.get(x["room"]["user_id"])) for x in results}
    results.sort(key=lambda x: tier[x["room"]["user_id"]])
    last = docs[-1] if docs else None
    await _record(db, "near", [x["room"]["user_id"] for x in results], len(results), used_loose, (time.perf_counter() - t0) * 1000)
    return {
        "results": results,
        "has_more": has_more,
        "cursor": _enc(last["created_at"], last["_id"]) if has_more and last else None,
        "loose": used_loose,
    }


@router.get("/rooms")
async def rooms(
    request: Request,
    scope: str = Query("area"),
    country: Optional[str] = Query(None, max_length=60),
    county: Optional[str] = Query(None, max_length=60),
    sub_county: Optional[str] = Query(None, max_length=60),
    open_only: bool = Query(False),
    cursor: Optional[str] = Query(None),
    x_content_mode: Optional[str] = Header(None, alias="X-Content-Mode"),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db=Depends(get_database),
):
    """Rooms whose owners chose to be listed, in a place. Never private galleries,
    online status or last-seen."""
    if scope not in SCOPES:
        raise HTTPException(400, "Unknown scope.")
    place = {"country": country, "county": county, "sub_county": sub_county}
    loc, missing = place_filter(scope, place, "location_")
    place_key = f"rooms:{scope}:{'/'.join((place.get(l) or '').lower() for l in SCOPE_LEVELS.get(scope, []))}"
    _limit(_viewer_key(request, current_user_id), place_key)
    if missing:
        return {"results": [], "has_more": False, "cursor": None, "needs_place": missing}
    ctx = await viewer_context(db, current_user_id, x_content_mode)
    if not ctx["mature"]:
        return {"results": [], "has_more": False, "cursor": None, "gate": "adult" if ctx["viewer_id"] else "signin"}

    skip = 0
    if cursor:
        try:
            skip = max(0, int(cursor))
        except ValueError:
            raise HTTPException(400, "Bad cursor.")
    excluded = set(ctx["hidden_ids"]) | ({ctx["viewer_id"]} if ctx["viewer_id"] else set())
    prof_q: dict = {"listing": "discoverable", "user_id": {"$nin": list(excluded)}}
    if open_only:
        from app.api.v1.chat_profile import closed_query
        prof_q["$nor"] = [closed_query(_now())]
    profs = await db["chat_profiles"].find(prof_q).to_list(400)
    day = _now().strftime("%Y-%m-%d")
    profs.sort(key=lambda p: _daily_order(p["user_id"], day))
    ids = [ObjectId(p["user_id"]) for p in profs if ObjectId.is_valid(p["user_id"])]
    user_q: dict = {"_id": {"$in": ids}, "is_active": {"$ne": False}}
    if loc:
        user_q.update(loc)
    users = {str(u["_id"]): u async for u in db["users"].find(
        user_q, {"anonymous_name": 1, "avatar_url": 1, "location_country": 1, "location_county": 1})}
    ordered = [p for p in profs if p["user_id"] in users]
    page = ordered[skip:skip + PAGE]
    results = []
    for p in page:
        u = users[p["user_id"]]
        card = _room_card(p["user_id"], p, u.get("avatar_url"))
        card["anonymous_name"] = u.get("anonymous_name")
        card["place"] = _coarse_place({"county": u.get("location_county"), "country": u.get("location_country")})
        results.append(card)
    has_more = len(ordered) > skip + PAGE
    return {"results": results, "has_more": has_more, "cursor": str(skip + PAGE) if has_more else None}


# ── STORIES ──
def _story_conds(ctx: dict, now: datetime) -> list:
    return eligible(ctx, now) + [{"kind": {"$ne": "hookup"}}, {"intent": {"$nin": EXCLUDED_INTENTS}}]


@router.get("/stories")
async def stories(
    request: Request,
    tab: str = Query("latest"),                   # latest | unanswered | trending
    topic: Optional[str] = Query(None),
    q: Optional[str] = Query(None, max_length=80),
    loose: bool = Query(False),
    cursor: Optional[str] = Query(None),
    x_content_mode: Optional[str] = Header(None, alias="X-Content-Mode"),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db=Depends(get_database),
):
    from app.api.v1.drops import batch_format_drops

    t0 = time.perf_counter()
    _limit(_viewer_key(request, current_user_id))
    if tab not in ("latest", "unanswered", "trending"):
        raise HTTPException(400, "Unknown tab.")
    ctx = await viewer_context(db, current_user_id, x_content_mode)
    now = _now()
    conds = _story_conds(ctx, now)
    pattern = lex.topic_regex(topic)
    if topic and not pattern:
        raise HTTPException(400, "Unknown topic.")
    if pattern:
        # The author's own pick first; untagged posts still match on their words.
        rx = {"$regex": pattern, "$options": "i"}
        conds.append({"$or": [{"topics": topic}, {"confession": rx}, {"tags": rx}, {"poll.question": rx}]})
    strict_kw, loose_kw = lex.keyword_filter(q or "", ["confession", "tags", "poll.question", "topics"])
    used_loose = bool(loose and loose_kw)
    kw = loose_kw if used_loose else strict_kw
    if kw and not cursor and not used_loose and loose_kw and not await db["drops"].find_one({"$and": conds + [kw]}, {"_id": 1}):
        # Nothing has every word: fall back to any of them, and say so.
        used_loose, kw = True, loose_kw
    if kw:
        conds.append(kw)

    trending_ready = None
    if tab == "unanswered":
        conds += [{"$or": [{"thread_count": {"$lte": 0}}, {"thread_count": None}]},
                  {"created_at": {"$gte": now - timedelta(days=30)}}]
    if tab == "trending":
        since = now - timedelta(days=TRENDING_DAYS)
        scored = [
            {"$match": {"$and": conds + [{"created_at": {"$gte": since}}]}},
            {"$addFields": {"_score": {"$add": [
                {"$ifNull": ["$likes_count", 0]}, {"$ifNull": ["$saves_count", 0]},
                {"$multiply": [{"$ifNull": ["$thread_count", 0]}, 2]},
            ]}}},
            {"$match": {"_score": {"$gte": TRENDING_MIN_SCORE}}},
        ]
        engaged = await db["drops"].aggregate(scored + [{"$count": "n"}]).to_list(1)
        trending_ready = bool(engaged) and engaged[0]["n"] >= TRENDING_MIN_POSTS
        if trending_ready:
            skip = int(cursor) if cursor and cursor.isdigit() else 0
            docs = await db["drops"].aggregate(
                scored + [{"$sort": {"_score": -1, "created_at": -1}}, {"$skip": skip}, {"$limit": PAGE + 1}]
            ).to_list(PAGE + 1)
            has_more = len(docs) > PAGE
            await _record(db, "stories", [], len(docs), used_loose, (time.perf_counter() - t0) * 1000)
            return {
                "results": await batch_format_drops(docs[:PAGE], ctx["viewer_id"], db),
                "has_more": has_more, "cursor": str(skip + PAGE) if has_more else None, "trending_ready": True,
                "loose": used_loose,
            }
        # Not enough real engagement yet: say so and show the latest instead.

    cur = _dec(cursor) if cursor and not cursor.isdigit() else None
    if cur:
        conds.append(_after(cur))
    docs = await db["drops"].find({"$and": conds}).sort([("created_at", -1), ("_id", -1)]).limit(PAGE + 1).to_list(PAGE + 1)
    has_more = len(docs) > PAGE
    docs = docs[:PAGE]
    last = docs[-1] if docs else None
    out = {
        "results": await batch_format_drops(docs, ctx["viewer_id"], db),
        "has_more": has_more,
        "cursor": _enc(last["created_at"], last["_id"]) if has_more and last else None,
        "loose": used_loose,
    }
    if trending_ready is not None:
        out["trending_ready"] = False
    await _record(db, "stories", [], len(out["results"]), used_loose, (time.perf_counter() - t0) * 1000)
    return out


@router.get("/surprise")
async def surprise(
    request: Request,
    x_content_mode: Optional[str] = Header(None, alias="X-Content-Mode"),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db=Depends(get_database),
):
    """One random eligible confession from the last few months."""
    from app.api.v1.drops import batch_format_drops

    _limit(_viewer_key(request, current_user_id))
    ctx = await viewer_context(db, current_user_id, x_content_mode)
    now = _now()
    conds = _story_conds(ctx, now) + [{"created_at": {"$gte": now - timedelta(days=STORY_WINDOW_DAYS)}},
                                      {"confession": {"$nin": [None, ""]}}]
    docs = await db["drops"].aggregate([{"$match": {"$and": conds}}, {"$sample": {"size": 1}}]).to_list(1)
    posts = await batch_format_drops(docs, ctx["viewer_id"], db)
    return {"post": posts[0] if posts else None}


# ── admin: is attention concentrating? is search working? ──
def _gini(values: list) -> float:
    xs = sorted(v for v in values if v > 0)
    n = len(xs)
    if n < 2:
        return 0.0
    cum = sum((i + 1) * x for i, x in enumerate(xs))
    return round((2 * cum) / (n * sum(xs)) - (n + 1) / n, 3)


@router.get("/admin/stats", summary="Discovery fairness and search quality (growth admins)")
async def discover_stats(
    days: int = Query(7, ge=1, le=30),
    admin_id: str = Depends(require_scope("growth")),
    db=Depends(get_database),
):
    since = (_now() - timedelta(days=days - 1)).strftime("%Y-%m-%d")
    per_owner: dict = defaultdict(int)
    async for d in db["discover_impressions"].find({"day": {"$gte": since}}, {"owner_id": 1, "n": 1}):
        per_owner[d["owner_id"]] += d.get("n", 0)
    counts = sorted(per_owner.values(), reverse=True)
    total = sum(counts)
    top_n = max(1, len(counts) // 10) if counts else 0
    fairness = {
        "impressions": total,
        "owners_shown": len(counts),
        "top_10pct_share": round(sum(counts[:top_n]) / total, 3) if total else None,
        "top_owner_share": round(counts[0] / total, 3) if total else None,
        "gini": _gini(counts) if total else None,
        "note": "Shares are of Near card impressions. A gini near 0 means attention is spread evenly; near 1, concentrated.",
    }
    daily = []
    async for d in db["discover_stats"].find({"day": {"$gte": since}}).sort("day", 1):
        req = d.get("requests", 0) or 1
        daily.append({
            "day": d["day"], "surface": d["surface"], "requests": d.get("requests", 0),
            "zero_rate": round(d.get("zero", 0) / req, 3), "loose_rate": round(d.get("loose", 0) / req, 3),
            "avg_ms": round(d.get("ms_total", 0) / req, 1), "max_ms": d.get("ms_max", 0),
        })
    return {"days": days, "fairness": fairness, "daily": daily}
