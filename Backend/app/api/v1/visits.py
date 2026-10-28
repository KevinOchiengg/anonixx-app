"""Anonymous website analytics: POST /track (from Web/lib/track.ts) and the super-admin
Visitors, Live and country views.

Privacy: a visitor is a random browser id, never tied to an account. No IPs, referrer host
only, search text reduced to known terms. Events kept 180 days, visitors a year. Bots and
Do-Not-Track browsers are skipped.
"""
import json
import re
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlparse

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from app.database import get_database
from app.dependencies import require_super_admin
from app.utils import geoip
from app.utils.countries import NAME_BY_CODE, known_country

router = APIRouter(tags=["Visitors"])

EVENTS = "site_events"
VISITORS = "site_visitors"
EVENT_TYPES = {"view", "leave", "click", "search", "signup", "login", "exp"}
EXP_RE = re.compile(r"^[a-z0-9_]{3,40}$")
MAX_EVENTS_PER_BATCH = 25
MAX_BODY_BYTES = 16_000
ID_RE = re.compile(r"^[a-z0-9]{8,40}$")
CC_RE = re.compile(r"^[A-Z]{2}$")
DROP_PATH = re.compile(r"^/drop/([0-9a-f]{24})")
BOT_RE = re.compile(
    r"bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|facebookexternalhit|"
    r"whatsapp|telegram|discord|embedly|curl|wget|python-|httpx|axios|node-fetch|go-http",
    re.I,
)
LIVE_MINUTES = 5

# Per-IP budget so one script can't flood the collection. In memory: resets on a
# restart, and Render runs a single instance, which is all this needs.
RATE_WINDOW = 60
RATE_MAX = 120
_hits: dict[str, list[float]] = defaultdict(list)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt):
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _rate_ok(ip: str) -> bool:
    t = time.monotonic()
    hits = [h for h in _hits[ip] if t - h < RATE_WINDOW]
    if len(hits) >= RATE_MAX:
        _hits[ip] = hits
        return False
    hits.append(t)
    _hits[ip] = hits
    if len(_hits) > 5000:   # forget idle addresses
        for k in [k for k, v in _hits.items() if not v or t - v[-1] > RATE_WINDOW]:
            _hits.pop(k, None)
    return True


def _device(ua: str) -> tuple[str, str]:
    u = ua.lower()
    if "ipad" in u or "tablet" in u:
        device = "tablet"
    elif "mobi" in u or "android" in u or "iphone" in u:
        device = "mobile"
    else:
        device = "desktop"
    if "edg/" in u:
        browser = "Edge"
    elif "opr/" in u or "opera" in u:
        browser = "Opera"
    elif "samsungbrowser" in u:
        browser = "Samsung"
    elif "firefox" in u or "fxios" in u:
        browser = "Firefox"
    elif "chrome" in u or "crios" in u:
        browser = "Chrome"
    elif "safari" in u:
        browser = "Safari"
    else:
        browser = "Other"
    return device, browser


def _clip(v, n: int) -> Optional[str]:
    if not isinstance(v, str):
        return None
    v = re.sub(r"\s+", " ", v).strip()
    return v[:n] or None


def _path(v) -> Optional[str]:
    p = _clip(v, 200)
    if not p or not p.startswith("/"):
        return None
    return p.split("?")[0].split("#")[0] or "/"


def _ref_host(v) -> Optional[str]:
    r = _clip(v, 300)
    if not r:
        return None
    try:
        host = (urlparse(r).hostname or "").lower()
    except Exception:
        return None
    host = host[4:] if host.startswith("www.") else host
    if not host or host.endswith("anonixx.com") or host in ("localhost", "127.0.0.1"):
        return None
    return host[:100]


@router.post("/track", status_code=204, summary="Record anonymous site-visit events (web tracker)")
async def track(request: Request, db=Depends(get_database)):
    ua = request.headers.get("user-agent", "")
    if not ua or BOT_RE.search(ua):
        return Response(status_code=204)
    raw = await request.body()
    if len(raw) > MAX_BODY_BYTES:
        return Response(status_code=204)
    ip = geoip.client_ip(request)
    if not _rate_ok(ip):
        return Response(status_code=204)
    try:
        body = json.loads(raw or b"{}")
    except ValueError:
        return Response(status_code=204)
    if not isinstance(body, dict):
        return Response(status_code=204)
    vid, sid = body.get("vid"), body.get("sid")
    events = body.get("events")
    if not (isinstance(vid, str) and ID_RE.match(vid) and isinstance(sid, str) and ID_RE.match(sid)):
        return Response(status_code=204)
    if not isinstance(events, list) or not events:
        return Response(status_code=204)

    cc = body.get("cc") if isinstance(body.get("cc"), str) and CC_RE.match(body["cc"]) else None
    if not cc:
        cc = await geoip.country_of(ip)
    device, browser = _device(ua)
    signed_in = bool(body.get("in"))
    now = _now()

    docs = []
    for e in events[:MAX_EVENTS_PER_BATCH]:
        if not isinstance(e, dict) or e.get("t") not in EVENT_TYPES:
            continue
        path = _path(e.get("p"))
        if not path or path.startswith("/admin"):
            continue
        doc = {
            "vid": vid, "sid": sid, "type": e["t"], "path": path,
            "country": cc, "device": device, "browser": browser,
            "signed_in": signed_in, "created_at": now,
        }
        if e["t"] == "view":
            ref = _ref_host(e.get("r"))
            if ref:
                doc["ref"] = ref
            utm = e.get("u") if isinstance(e.get("u"), dict) else {}
            utm = {k: _clip(utm.get(k), 60) for k in ("source", "medium", "campaign")}
            utm = {k: v.lower() for k, v in utm.items() if v}
            if utm:
                doc["utm"] = utm
            if e.get("l"):
                doc["landing"] = True
        elif e["t"] == "leave":
            ms = e.get("ms")
            if not isinstance(ms, (int, float)) or ms < 0:
                continue
            doc["ms"] = int(min(ms, 30 * 60 * 1000))
        elif e["t"] == "click":
            target = _clip(e.get("k"), 60)
            if not target:
                continue
            doc["target"] = target
        elif e["t"] == "exp":
            key, variant = e.get("x"), _clip(e.get("v"), 20)
            if not (isinstance(key, str) and EXP_RE.match(key) and variant):
                continue
            doc["exp"], doc["variant"] = key, variant
        elif e["t"] == "search":
            q = _clip(e.get("q"), 80)
            theme = _clip(e.get("th"), 40)
            place = _clip(e.get("loc"), 80)
            if not (q or theme or place):
                continue
            if q:
                # Never the typed text: only the curated terms it matched
                # (utils/search_lexicon), or "other words".
                from app.utils.search_lexicon import parse
                terms = [c["label"].lower() for c in parse(q)["chips"]]
                doc["q"] = " · ".join(terms) if terms else "(other words)"
            if theme:
                doc["theme"] = theme
            if place:
                doc["place"] = place
            n = e.get("n")
            if isinstance(n, int):
                doc["results"] = n
        docs.append(doc)
    if not docs:
        return Response(status_code=204)

    await db[EVENTS].insert_many(docs)
    views = sum(1 for d in docs if d["type"] == "view")
    first_view = next((d for d in docs if d["type"] == "view"), None)
    existing = await db[VISITORS].find_one({"_id": vid}, {"last_sid": 1})
    inc = {"events": len(docs), "views": views}
    if not existing or existing.get("last_sid") != sid:
        inc["sessions"] = 1
    on_insert = {"first_seen": now}
    if first_view:
        on_insert["first_path"] = first_view["path"]
        if first_view.get("ref"):
            on_insert["first_ref"] = first_view["ref"]
        if first_view.get("utm"):
            on_insert["first_utm"] = first_view["utm"]
    update = {
        "$setOnInsert": on_insert,
        "$set": {"last_seen": now, "last_sid": sid, "last_path": docs[-1]["path"],
                 "country": cc, "device": device, "browser": browser},
        "$inc": inc,
    }
    if signed_in:
        update["$set"]["signed_in"] = True
    if any(d["type"] == "signup" for d in docs):
        update["$set"]["signed_up_at"] = now
    await db[VISITORS].update_one({"_id": vid}, update, upsert=True)
    return Response(status_code=204)


# ─── Admin ────────────────────────────────────────────────────────────────────

def _top(rows, n=12):
    return [{"key": r["_id"], "count": r["count"], **({"visitors": r["visitors"]} if "visitors" in r else {})}
            for r in rows if r.get("_id")][:n]


async def _group(db, match: dict, field: str, n=12, visitors=True):
    group = {"_id": f"${field}", "count": {"$sum": 1}}
    if visitors:
        group["v"] = {"$addToSet": "$vid"}
    pipe = [{"$match": {**match, field: {"$nin": [None, ""]}}}, {"$group": group}]
    if visitors:
        pipe.append({"$project": {"count": 1, "visitors": {"$size": "$v"}}})
    pipe += [{"$sort": {"count": -1}}, {"$limit": n}]
    return _top(await db[EVENTS].aggregate(pipe).to_list(n), n)


@router.get("/admin/visitors", summary="Site visitors: traffic, sources, searches and interests (super admin)")
async def visitors_overview(
    days: int = Query(7, ge=1, le=180),
    admin_id: str = Depends(require_super_admin),
    db=Depends(get_database),
):
    now = _now()
    since = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    base = {"created_at": {"$gte": since}}
    views_m = {**base, "type": "view"}

    vids = await db[EVENTS].distinct("vid", base)
    sessions = await db[EVENTS].aggregate([
        {"$match": base},
        {"$group": {"_id": "$sid", "views": {"$sum": {"$cond": [{"$eq": ["$type", "view"]}, 1, 0]}},
                    "start": {"$min": "$created_at"}, "end": {"$max": "$created_at"}}},
    ]).to_list(None)
    n_sessions = len(sessions)
    views = sum(s["views"] for s in sessions)
    bounces = sum(1 for s in sessions if s["views"] <= 1)
    durations = [(s["end"] - s["start"]).total_seconds() for s in sessions if s["views"] > 1]
    returning = await db[VISITORS].count_documents({"_id": {"$in": vids}, "first_seen": {"$lt": since}}) if vids else 0
    live_since = now - timedelta(minutes=LIVE_MINUTES)
    live = await db[EVENTS].aggregate([
        {"$match": {"created_at": {"$gte": live_since}}},
        {"$sort": {"created_at": 1}},
        {"$group": {"_id": "$vid", "path": {"$last": "$path"}, "country": {"$last": "$country"}, "device": {"$last": "$device"}}},
    ]).to_list(200)

    # Daily series, in UTC days.
    daily = await db[EVENTS].aggregate([
        {"$match": views_m},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                    "views": {"$sum": 1}, "v": {"$addToSet": "$vid"}}},
    ]).to_list(None)
    by_day = {d["_id"]: d for d in daily}
    labels, s_visitors, s_views = [], [], []
    for i in range(days):
        day = (since + timedelta(days=i)).strftime("%Y-%m-%d")
        labels.append(day[5:])
        d = by_day.get(day)
        s_visitors.append(len(d["v"]) if d else 0)
        s_views.append(d["views"] if d else 0)

    # Time on page, by path (from "leave" events).
    dwell = await db[EVENTS].aggregate([
        {"$match": {**base, "type": "leave"}},
        # A page hidden and shown again sends more than one "leave": add them up per visit first.
        {"$group": {"_id": {"sid": "$sid", "path": "$path"}, "ms": {"$sum": "$ms"}}},
        {"$group": {"_id": "$_id.path", "avg": {"$avg": "$ms"}, "n": {"$sum": 1}}},
        {"$match": {"n": {"$gte": 2}}},
        {"$sort": {"avg": -1}}, {"$limit": 10},
    ]).to_list(10)

    # Drops people open: what content pulls them in.
    drop_rows = await db[EVENTS].aggregate([
        {"$match": {**views_m, "path": {"$regex": "^/drop/"}}},
        {"$group": {"_id": "$path", "count": {"$sum": 1}, "v": {"$addToSet": "$vid"}}},
        {"$sort": {"count": -1}}, {"$limit": 200},
    ]).to_list(200)
    ids = []
    for r in drop_rows:
        m = DROP_PATH.match(r["_id"])
        if m:
            ids.append(ObjectId(m.group(1)))
    drops = {}
    if ids:
        async for d in db["drops"].find({"_id": {"$in": ids}}, {"confession": 1, "content": 1, "kind": 1, "mood_tag": 1, "category": 1}):
            drops[str(d["_id"])] = d
    top_drops, kinds, moods = [], defaultdict(int), defaultdict(int)
    for r in drop_rows:
        m = DROP_PATH.match(r["_id"])
        d = drops.get(m.group(1)) if m else None
        kind = (d or {}).get("kind") or "confession"
        mood = (d or {}).get("mood_tag") or (d or {}).get("category")
        kinds[kind] += r["count"]
        if mood:
            moods[mood] += r["count"]
        if len(top_drops) < 10:
            text = (d or {}).get("confession") or (d or {}).get("content") or ""
            top_drops.append({
                "id": m.group(1) if m else None, "views": r["count"], "visitors": len(r["v"]),
                "kind": kind, "mood": mood,
                "teaser": (text[:110] + "…") if len(text) > 110 else (text or "(deleted or media-only)"),
            })

    # Funnel: visitors → saw signup → signed up.
    saw_signup = len(await db[EVENTS].distinct("vid", {**views_m, "path": {"$in": ["/signup", "/join"]}}))
    signups = len(await db[EVENTS].distinct("vid", {**base, "type": "signup"}))
    searchers = len(await db[EVENTS].distinct("vid", {**base, "type": "search"}))

    zero = await db[EVENTS].aggregate([
        {"$match": {**base, "type": "search", "q": {"$exists": True}, "results": 0}},
        {"$group": {"_id": "$q", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}, {"$limit": 12},
    ]).to_list(12)

    return {
        "days": days,
        "summary": {
            "visitors": len(vids),
            "new_visitors": len(vids) - returning,
            "returning_visitors": returning,
            "sessions": n_sessions,
            "views": views,
            "pages_per_session": round(views / n_sessions, 1) if n_sessions else 0,
            "bounce_rate": round(100 * bounces / n_sessions) if n_sessions else 0,
            "avg_session_seconds": round(sum(durations) / len(durations)) if durations else 0,
            "live_now": len(live),
        },
        "live": [{"vid": l["_id"], "path": l["path"], "country": l.get("country"), "device": l.get("device")} for l in live[:20]],
        "series": {"labels": labels, "visitors": s_visitors, "views": s_views},
        "pages": await _group(db, views_m, "path", 15),
        "landing": await _group(db, {**views_m, "landing": True}, "path", 10),
        "referrers": await _group(db, views_m, "ref", 10),
        "campaigns": await _group(db, views_m, "utm.campaign", 10),
        "sources": await _group(db, views_m, "utm.source", 10),
        "countries": await _group(db, views_m, "country", 15),
        "devices": await _group(db, views_m, "device", 5),
        "browsers": await _group(db, views_m, "browser", 6),
        "searches": await _group(db, {**base, "type": "search"}, "q", 20),
        "search_themes": await _group(db, {**base, "type": "search"}, "theme", 8),
        "search_places": await _group(db, {**base, "type": "search"}, "place", 10),
        "zero_result_searches": [{"key": z["_id"], "count": z["count"]} for z in zero],
        "clicks": await _group(db, {**base, "type": "click"}, "target", 15),
        "dwell": [{"key": d["_id"], "seconds": round(d["avg"] / 1000), "count": d["n"]} for d in dwell],
        "top_drops": top_drops,
        "interest_kinds": sorted([{"key": k, "count": v} for k, v in kinds.items()], key=lambda x: -x["count"]),
        "interest_moods": sorted([{"key": k, "count": v} for k, v in moods.items()], key=lambda x: -x["count"])[:10],
        "funnel": {"visitors": len(vids), "searched": searchers, "saw_signup": saw_signup, "signed_up": signups},
        "recent": [
            {
                "vid": v["_id"], "first_seen": v.get("first_seen"), "last_seen": v.get("last_seen"),
                "country": v.get("country"), "device": v.get("device"), "browser": v.get("browser"),
                "views": v.get("views", 0), "sessions": v.get("sessions", 0),
                "first_path": v.get("first_path"), "first_ref": v.get("first_ref"),
                "last_path": v.get("last_path"), "signed_up": bool(v.get("signed_up_at")),
                "signed_in": bool(v.get("signed_in")),
            }
            async for v in db[VISITORS].find({"last_seen": {"$gte": since}}).sort("last_seen", -1).limit(30)
        ],
    }


def _teaser(d) -> str:
    text = (d or {}).get("confession") or (d or {}).get("content") or ""
    return (text[:90] + "…") if len(text) > 90 else (text or "(deleted or media-only)")


@router.get("/admin/live", summary="Who is here right now: site visitors and app users (super admin)")
async def live_now(admin_id: str = Depends(require_super_admin), db=Depends(get_database)):
    """Site visitors stay anonymous (a browser id, never an account); app users
    are signed in over the socket, so they come with their account."""
    from app.websockets.events import online_users

    now = _now()
    rows = await db[EVENTS].aggregate([
        {"$match": {"created_at": {"$gte": now - timedelta(minutes=LIVE_MINUTES)}}},
        {"$sort": {"created_at": 1}},
        {"$group": {"_id": "$vid", "sid": {"$last": "$sid"}, "path": {"$last": "$path"}, "country": {"$last": "$country"},
                    "device": {"$last": "$device"}, "browser": {"$last": "$browser"}, "signed_in": {"$max": "$signed_in"},
                    "last": {"$last": "$created_at"}}},
        {"$sort": {"last": -1}}, {"$limit": 50},
    ]).to_list(50)
    sids = [r["sid"] for r in rows]
    visits = {s["_id"]: s for s in await db[EVENTS].aggregate([
        {"$match": {"sid": {"$in": sids}, "created_at": {"$gte": now - timedelta(hours=6)}}},
        {"$group": {"_id": "$sid", "start": {"$min": "$created_at"},
                    "views": {"$sum": {"$cond": [{"$eq": ["$type", "view"]}, 1, 0]}},
                    "paths": {"$addToSet": "$path"},
                    "searches": {"$addToSet": "$q"}}},
    ]).to_list(None)} if sids else {}
    people = {v["_id"]: v async for v in db[VISITORS].find(
        {"_id": {"$in": [r["_id"] for r in rows]}}, {"first_seen": 1, "sessions": 1, "first_ref": 1, "signed_up_at": 1})}
    drop_ids = {m.group(1) for s in visits.values() for p in s["paths"] if (m := DROP_PATH.match(p or ""))}
    drops = {}
    if drop_ids:
        async for d in db["drops"].find({"_id": {"$in": [ObjectId(i) for i in drop_ids]}}, {"confession": 1, "content": 1, "kind": 1, "mood_tag": 1}):
            drops[str(d["_id"])] = d
    web = []
    for r in rows:
        s = visits.get(r["sid"], {})
        p = people.get(r["_id"], {})
        opened = [m.group(1) for x in s.get("paths", []) if (m := DROP_PATH.match(x or ""))]
        web.append({
            "vid": r["_id"], "path": r["path"], "country": r.get("country"), "device": r.get("device"), "browser": r.get("browser"),
            "signed_in": bool(r.get("signed_in")), "signed_up": bool(p.get("signed_up_at")),
            "returning": (p.get("sessions") or 0) > 1, "came_from": p.get("first_ref"),
            "since": _aware(s.get("start")), "pages": s.get("views", 0),
            "drops": [{"id": i, "teaser": _teaser(drops.get(i)), "kind": (drops.get(i) or {}).get("kind"),
                       "mood": (drops.get(i) or {}).get("mood_tag")} for i in opened[:5]],
            "searches": [q for q in s.get("searches", []) if q][:5],
        })

    online = online_users()
    oids = [ObjectId(u) for u in online if ObjectId.is_valid(u)]
    users = {str(u["_id"]): u async for u in db["users"].find({"_id": {"$in": oids}}, {
        "anonymous_name": 1, "username": 1, "created_at": 1, "is_premium": 1, "is_admin": 1,
        "location_country": 1, "gender": 1, "coin_balance": 1})} if oids else {}
    paid = {}
    if oids:
        async for p in db["coin_purchases"].aggregate([
            {"$match": {"status": "completed", "user_id": {"$in": list(online)}}},
            {"$group": {"_id": "$user_id", "n": {"$sum": 1}}},
        ]):
            paid[p["_id"]] = p["n"]
    app = []
    code_of = {v: k for k, v in NAME_BY_CODE.items()}
    for uid, since in online.items():
        u = users.get(uid)
        if not u:
            continue
        seen = await db["drop_views"].count_documents({"user_id": uid, "viewed_at": {"$gte": since}}) if since else 0
        app.append({
            "user_id": uid, "name": u.get("anonymous_name") or u.get("username"),
            "country": known_country(u.get("location_country")) or u.get("location_country"),
            "cc": code_of.get(known_country(u.get("location_country")) or ""),
            "gender": u.get("gender"), "joined": _aware(u.get("created_at")), "since": since,
            "is_new": bool(u.get("created_at") and _aware(u["created_at"]) > now - timedelta(days=7)),
            "premium": bool(u.get("is_premium")), "admin": bool(u.get("is_admin")),
            "purchases": paid.get(uid, 0), "coins": u.get("coin_balance", 0), "drops_seen": seen,
        })
    app.sort(key=lambda a: a["since"] or now)
    return {"minutes": LIVE_MINUTES, "web": web, "app": app[:100], "app_total": len(app)}


@router.get("/admin/insights/country-tastes", summary="What each country opens: kinds and moods (super admin)")
async def country_tastes(
    days: int = Query(30, ge=1, le=180),
    admin_id: str = Depends(require_super_admin),
    db=Depends(get_database),
):
    """Drop opens by country, from both sides: website visitors (IP country) and
    app users (their profile country). Counted per drop open."""
    since = _now() - timedelta(days=days)
    opens: list[tuple[str, str, str]] = []   # (country, drop_id, source)

    async for r in db[EVENTS].aggregate([
        {"$match": {"type": "view", "created_at": {"$gte": since}, "path": {"$regex": "^/drop/"}, "country": {"$nin": [None, ""]}}},
        {"$group": {"_id": {"c": "$country", "p": "$path"}, "n": {"$sum": 1}}},
    ]):
        m = DROP_PATH.match(r["_id"]["p"])
        if m:
            opens += [(NAME_BY_CODE.get(r["_id"]["c"], r["_id"]["c"]), m.group(1), "web")] * r["n"]

    views = await db["drop_views"].find(
        {"viewed_at": {"$gte": since}, "user_id": {"$not": {"$regex": "^device:"}}}, {"drop_id": 1, "user_id": 1},
    ).sort("viewed_at", -1).limit(20000).to_list(None)
    uids = {ObjectId(v["user_id"]) for v in views if ObjectId.is_valid(v["user_id"])}
    where = {str(u["_id"]): known_country(u.get("location_country")) or (u.get("location_country") or "").strip().title() or None
             async for u in db["users"].find({"_id": {"$in": list(uids)}}, {"location_country": 1})} if uids else {}
    opens += [(where[v["user_id"]], v["drop_id"], "app") for v in views if where.get(v["user_id"])]

    ids = {d for _, d, _ in opens if ObjectId.is_valid(d)}
    drops = {}
    if ids:
        async for d in db["drops"].find({"_id": {"$in": [ObjectId(i) for i in ids]}}, {"confession": 1, "content": 1, "kind": 1, "mood_tag": 1, "category": 1}):
            drops[str(d["_id"])] = d

    by = defaultdict(lambda: {"opens": 0, "web": 0, "app": 0, "kinds": defaultdict(int), "moods": defaultdict(int), "drops": defaultdict(int)})
    for c, did, src in opens:
        d = drops.get(did)
        if not d:
            continue
        b = by[c]
        b["opens"] += 1
        b[src] += 1
        b["kinds"][d.get("kind") or "confession"] += 1
        mood = d.get("mood_tag") or d.get("category")
        if mood:
            b["moods"][mood] += 1
        b["drops"][did] += 1

    rows = lambda m, n: [{"key": k, "count": v} for k, v in sorted(m.items(), key=lambda x: -x[1])[:n]]
    code_of = {v: k for k, v in NAME_BY_CODE.items()}
    out = []
    for c, b in sorted(by.items(), key=lambda x: -x[1]["opens"])[:25]:
        top = max(b["drops"], key=b["drops"].get)
        out.append({
            "country": c, "cc": code_of.get(c), "opens": b["opens"], "web": b["web"], "app": b["app"],
            "kinds": rows(b["kinds"], 4), "moods": rows(b["moods"], 4),
            "top_drop": {"id": top, "opens": b["drops"][top], "teaser": _teaser(drops[top])},
        })
    return {"days": days, "countries": out}


@router.get("/admin/visitors/page", summary="One page's stats: traffic, sources, clicks, where people go next (super admin)")
async def page_detail(
    path: str = Query(..., min_length=1, max_length=200),
    days: int = Query(7, ge=1, le=180),
    admin_id: str = Depends(require_super_admin),
    db=Depends(get_database),
):
    path = _path(path)
    if not path:
        raise HTTPException(400, "Invalid path")
    now = _now()
    since = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    base = {"created_at": {"$gte": since}}
    here = {**base, "path": path}
    views_m = {**here, "type": "view"}

    views = await db[EVENTS].count_documents(views_m)
    vids = await db[EVENTS].distinct("vid", views_m)
    landings = await db[EVENTS].count_documents({**views_m, "landing": True})

    daily = await db[EVENTS].aggregate([
        {"$match": views_m},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                    "views": {"$sum": 1}, "v": {"$addToSet": "$vid"}}},
    ]).to_list(None)
    by_day = {d["_id"]: d for d in daily}
    labels, s_visitors, s_views = [], [], []
    for i in range(days):
        day = (since + timedelta(days=i)).strftime("%Y-%m-%d")
        labels.append(day[5:])
        d = by_day.get(day)
        s_visitors.append(len(d["v"]) if d else 0)
        s_views.append(d["views"] if d else 0)

    dwell = await db[EVENTS].aggregate([
        {"$match": {**here, "type": "leave"}},
        {"$group": {"_id": "$sid", "ms": {"$sum": "$ms"}}},
        {"$group": {"_id": None, "avg": {"$avg": "$ms"}}},
    ]).to_list(1)

    # Where people came from and went next, from the order of views in each visit.
    sids = await db[EVENTS].distinct("sid", views_m)
    came_from, went_to = defaultdict(int), defaultdict(int)
    exits = 0
    if sids:
        trail = defaultdict(list)
        async for e in db[EVENTS].find(
            {"sid": {"$in": sids[:2000]}, "type": "view", **base}, {"sid": 1, "path": 1, "created_at": 1}
        ).sort("created_at", 1):
            trail[e["sid"]].append(e["path"])
        for seq in trail.values():
            for i, p in enumerate(seq):
                if p != path:
                    continue
                if i > 0 and seq[i - 1] != path:
                    came_from[seq[i - 1]] += 1
                if i + 1 < len(seq):
                    if seq[i + 1] != path:
                        went_to[seq[i + 1]] += 1
                else:
                    exits += 1
    top = lambda d, n=8: [{"key": k, "count": v} for k, v in sorted(d.items(), key=lambda x: -x[1])[:n]]

    drop = None
    m = DROP_PATH.match(path)
    if m:
        d = await db["drops"].find_one({"_id": ObjectId(m.group(1))}, {"confession": 1, "content": 1, "kind": 1, "mood_tag": 1, "created_at": 1})
        if d:
            text = d.get("confession") or d.get("content") or ""
            drop = {"teaser": text[:200], "kind": d.get("kind") or "confession", "mood": d.get("mood_tag"), "created_at": d.get("created_at")}

    return {
        "path": path,
        "days": days,
        "summary": {
            "views": views,
            "visitors": len(vids),
            "landings": landings,
            "avg_seconds": round(dwell[0]["avg"] / 1000) if dwell and dwell[0].get("avg") else 0,
            "exit_rate": round(100 * exits / views) if views else 0,
        },
        "series": {"labels": labels, "visitors": s_visitors, "views": s_views},
        "referrers": await _group(db, views_m, "ref", 8),
        "countries": await _group(db, views_m, "country", 8),
        "devices": await _group(db, views_m, "device", 4),
        "clicks": await _group(db, {**here, "type": "click"}, "target", 10),
        "searches": await _group(db, {**here, "type": "search"}, "q", 10),
        "came_from": top(came_from),
        "went_to": top(went_to),
        "drop": drop,
    }


@router.get("/admin/visitors/{vid}", summary="One visitor's journey (super admin)")
async def visitor_journey(
    vid: str,
    admin_id: str = Depends(require_super_admin),
    db=Depends(get_database),
):
    if not ID_RE.match(vid):
        raise HTTPException(400, "Invalid visitor id")
    v = await db[VISITORS].find_one({"_id": vid}, {"last_sid": 0})
    if not v:
        raise HTTPException(404, "Visitor not found")
    events = await db[EVENTS].find(
        {"vid": vid},
        {"_id": 0, "vid": 0, "country": 0, "device": 0, "browser": 0},
    ).sort("created_at", -1).limit(300).to_list(300)
    v["vid"] = v.pop("_id")
    return {"visitor": v, "events": events}


async def ensure_indexes(db) -> None:
    await db[EVENTS].create_index([("created_at", 1)], expireAfterSeconds=180 * 24 * 3600, background=True)
    await db[EVENTS].create_index([("type", 1), ("created_at", -1)], background=True)
    await db[EVENTS].create_index([("vid", 1), ("created_at", -1)], background=True)
    await db[VISITORS].create_index([("last_seen", 1)], expireAfterSeconds=365 * 24 * 3600, background=True)
