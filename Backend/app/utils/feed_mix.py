"""
Interleaves the two kinds of drops in the feed: media drops (video / photo /
voice, posted by admins) and text confessions (posted by users). The feed
shows MEDIA_RUN media drops, then one text confession, and repeats. Each
stream is paged newest-first with its own position, carried in one cursor,
so nothing is skipped or repeated. When one stream runs dry the other fills
the remaining slots.

Local first: when the viewer's country is known, the text stream is split in
two — confessions from their country ("l") and from everywhere else ("g") —
and text slots take LOCAL_RUN local ones for every global one. Nothing is
filtered out: when local runs dry, global fills in (and vice versa). Media
drops are mostly Anonixx's own, aimed by explicit location targeting, so
they stay one stream.

Cursor format:  "m=<iso>|<oid>;t=<iso>|<oid>;p=<n>"  (+ "l=", "g=", "q=" when local first)
  m= / t= / l= / g= omitted -> that stream has not started; "END" -> exhausted
  p            -> position inside the repeating media/text pattern
  q            -> position inside the local/global text pattern
A legacy single cursor ("<iso>|<oid>") is read as both streams at that point.
"""
import random
from datetime import datetime, timedelta
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException

MEDIA_RUN = 3
PATTERN = ["m"] * MEDIA_RUN + ["t"]
LOCAL_RUN = 2
TEXT_PATTERN = ["l"] * LOCAL_RUN + ["g"]
STREAMS = ("m", "t", "l", "g")

_MEDIA = {"$or": [
    {"media_url": {"$nin": [None, ""]}},
    {"images.0": {"$exists": True}},
]}
_TEXT = {"$and": [
    {"media_url": {"$in": [None, ""]}},
    {"images.0": {"$exists": False}},
]}
_STREAM_FILTER = {"m": _MEDIA, "t": _TEXT}


def is_media_drop(drop: dict) -> bool:
    return bool(drop.get("media_url")) or bool(drop.get("images"))


def _pos(raw: str):
    ts, oid = raw.rsplit("|", 1)
    return datetime.fromisoformat(ts), ObjectId(oid)


def _parse(cursor: Optional[str]) -> dict:
    state: dict = {"m": None, "t": None, "l": None, "g": None, "p": 0, "q": 0}
    if not cursor:
        return state
    try:
        if "=" not in cursor:
            legacy = _pos(cursor)
            state["m"] = state["t"] = legacy
            return state
        for part in cursor.split(";"):
            key, _, val = part.partition("=")
            if key in STREAMS:
                state[key] = "END" if val == "END" else _pos(val)
            elif key == "p":
                state["p"] = int(val) % len(PATTERN)
            elif key == "q":
                state["q"] = int(val) % len(TEXT_PATTERN)
        return state
    except Exception:
        raise HTTPException(status_code=400, detail="Bad cursor.")


def _encode_pos(pos) -> str:
    return "END" if pos == "END" else f"{pos[0].isoformat()}|{pos[1]}"


def _encode(state: dict) -> str:
    parts = []
    for k in STREAMS:
        if state.get(k) is not None:
            parts.append(f"{k}={_encode_pos(state[k])}")
    parts.append(f"p={state['p']}")
    if state.get("q"):
        parts.append(f"q={state['q']}")
    return ";".join(parts)


def _stream_filter(kind: str, country: Optional[str]) -> dict:
    if kind == "l":
        return {"$and": [_TEXT, {"feed_country": country}]}
    if kind == "g":
        return {"$and": [_TEXT, {"feed_country": {"$ne": country}}]}   # $ne also matches untagged drops
    return _STREAM_FILTER[kind]


def _stream_query(base: dict, kind: str, pos, country: Optional[str] = None) -> dict:
    conds = [c for c in (base, _stream_filter(kind, country)) if c]
    if pos:
        dt, oid = pos
        conds.append({"$or": [
            {"created_at": {"$lt": dt}},
            {"created_at": dt, "_id": {"$lt": oid}},
        ]})
    return conds[0] if len(conds) == 1 else {"$and": conds}


async def fetch_mixed(db, base_query: dict, limit: int, cursor: Optional[str], country: Optional[str] = None):
    """Returns (rows, next_cursor, has_more) for one page of the mixed feed.
    With `country`, text slots favour confessions from that country (local first)."""
    state = _parse(cursor)
    kinds = ("m", "l", "g") if country else ("m", "t")
    buf: dict = {}
    for kind in kinds:
        if state[kind] == "END":
            buf[kind] = []
            continue
        buf[kind] = await db["drops"].find(_stream_query(base_query, kind, state[kind], country)) \
            .sort([("created_at", -1), ("_id", -1)]).limit(limit + 1).to_list(None)

    def preference(slot: str, q: int) -> list:
        text = (["l", "g"] if TEXT_PATTERN[q % len(TEXT_PATTERN)] == "l" else ["g", "l"]) if country else ["t"]
        return text + ["m"] if slot == "t" else ["m"] + text

    fetched = {k: len(v) for k, v in buf.items()}
    taken: dict = {k: [] for k in kinds}
    rows: list = []
    p, q = state["p"], state["q"]
    while len(rows) < limit:
        slot = PATTERN[p % len(PATTERN)]
        kind = next((k for k in preference(slot, q) if buf[k]), None)
        if kind is None:
            break
        row = buf[kind].pop(0)
        taken[kind].append(row)
        rows.append(row)
        p += 1
        if kind != "m":
            q += 1

    has_more = any(buf[k] for k in kinds)
    nxt = {**{k: state[k] for k in STREAMS}, "p": p % len(PATTERN), "q": q % len(TEXT_PATTERN)}
    for kind in kinds:
        if taken[kind]:
            last = taken[kind][-1]
            nxt[kind] = (last["created_at"], last["_id"])
        if not buf[kind] and fetched[kind] <= limit:
            nxt[kind] = "END"
    return rows, (_encode(nxt) if has_more else None), has_more


# ── Promoted drops (admin pin / boost) ──────────────────────────
# While a drop's promo_until is in the future it's taken out of the normal
# streams (so it's never shown twice) and placed on the first page instead:
# pinned drops at the very top, boosted ones a few slots down.
MAX_PROMOTED = 4
BOOST_SLOTS = (2, 5)


def not_promoted(now: datetime) -> dict:
    return {"$or": [{"promo_until": None}, {"promo_until": {"$lte": now}}]}


async def fetch_promoted(db, base_query: dict, now: datetime) -> list:
    live = {"promo_until": {"$gt": now}}
    query = {"$and": [base_query, live]} if base_query else live
    rows = await db["drops"].find(query).sort([("created_at", -1)]).limit(MAX_PROMOTED).to_list(None)
    return sorted(rows, key=lambda d: d.get("promo_kind") != "pin")


def splice_promoted(page: list, promoted: list) -> list:
    pinned = [d for d in promoted if d.get("promo_kind") == "pin"]
    boosted = [d for d in promoted if d.get("promo_kind") != "pin"]
    out = pinned + list(page)
    for slot, d in zip(BOOST_SLOTS, boosted):
        out.insert(min(len(pinned) + slot, len(out)), d)
    out.extend(boosted[len(BOOST_SLOTS):])
    return out


# Showcase: a first-time visitor's first page opens on a few of the best recent
# drops instead of whatever happens to be newest. Picked at random from the top
# of the pool, so different visitors (and the same one coming back) see different
# strong drops. Ranked by interactions per view once a drop has enough views to
# judge; until then by raw interactions.
SHOWCASE_COUNT = 3
SHOWCASE_POOL = 12
SHOWCASE_DAYS = 14
SHOWCASE_MIN_VIEWS = 20


def _showcase_score(d: dict) -> tuple:
    acts = (d.get("likes_count") or 0) + (d.get("thread_count") or 0) + (d.get("saves_count") or 0) + (d.get("unlock_count") or 0)
    views = d.get("views_count") or 0
    judged = views >= SHOWCASE_MIN_VIEWS
    return (judged, acts / views if judged else acts, acts)


async def fetch_showcase(db, base_query: dict, now: datetime) -> list:
    since = now - timedelta(days=SHOWCASE_DAYS)
    query = {"$and": [base_query, {"created_at": {"$gte": since}}]}
    rows = await db["drops"].find(query).sort([("likes_count", -1), ("created_at", -1)]).limit(200).to_list(None)
    # Something has to have happened on a drop for it to count as one of the best.
    rows = [d for d in rows if _showcase_score(d)[2] > 0]
    if not rows:
        return []
    pool = sorted(rows, key=_showcase_score, reverse=True)[:SHOWCASE_POOL]
    return random.sample(pool, min(SHOWCASE_COUNT, len(pool)))


def splice_showcase(page: list, showcase: list) -> list:
    """Lead with the showcase drops, then the page without repeats of them."""
    ids = {d["_id"] for d in showcase}
    return list(showcase) + [d for d in page if d["_id"] not in ids]


def reslot(page: list, shuffled: list) -> list:
    """Keep the media/text rhythm of `page` while using the order of `shuffled`
    (affinity ordering) inside each kind."""
    pools = {True: [d for d in shuffled if is_media_drop(d)],
             False: [d for d in shuffled if not is_media_drop(d)]}
    return [pools[is_media_drop(d)].pop(0) for d in page]
