"""
Interleaves the two kinds of drops in the feed: media drops (video / photo /
voice, posted by admins) and text confessions (posted by users). The feed
shows MEDIA_RUN media drops, then one text confession, and repeats. Each
stream is paged newest-first with its own position, carried in one cursor,
so nothing is skipped or repeated. When one stream runs dry the other fills
the remaining slots.

Cursor format:  "m=<iso>|<oid>;t=<iso>|<oid>;p=<n>"
  m= / t= omitted -> that stream has not started; "END" -> exhausted
  p            -> position inside the repeating pattern
A legacy single cursor ("<iso>|<oid>") is read as both streams at that point.
"""
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException

MEDIA_RUN = 3
PATTERN = ["m"] * MEDIA_RUN + ["t"]

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
    state: dict = {"m": None, "t": None, "p": 0}
    if not cursor:
        return state
    try:
        if "=" not in cursor:
            legacy = _pos(cursor)
            state["m"] = state["t"] = legacy
            return state
        for part in cursor.split(";"):
            key, _, val = part.partition("=")
            if key in ("m", "t"):
                state[key] = "END" if val == "END" else _pos(val)
            elif key == "p":
                state["p"] = int(val) % len(PATTERN)
        return state
    except Exception:
        raise HTTPException(status_code=400, detail="Bad cursor.")


def _encode_pos(pos) -> str:
    return "END" if pos == "END" else f"{pos[0].isoformat()}|{pos[1]}"


def _encode(state: dict) -> str:
    parts = []
    for k in ("m", "t"):
        if state[k] is not None:
            parts.append(f"{k}={_encode_pos(state[k])}")
    parts.append(f"p={state['p']}")
    return ";".join(parts)


def _stream_query(base: dict, kind: str, pos) -> dict:
    conds = [c for c in (base, _STREAM_FILTER[kind]) if c]
    if pos:
        dt, oid = pos
        conds.append({"$or": [
            {"created_at": {"$lt": dt}},
            {"created_at": dt, "_id": {"$lt": oid}},
        ]})
    return conds[0] if len(conds) == 1 else {"$and": conds}


async def fetch_mixed(db, base_query: dict, limit: int, cursor: Optional[str]):
    """Returns (rows, next_cursor, has_more) for one page of the mixed feed."""
    state = _parse(cursor)
    buf: dict = {}
    for kind in ("m", "t"):
        if state[kind] == "END":
            buf[kind] = []
            continue
        buf[kind] = await db["drops"].find(_stream_query(base_query, kind, state[kind])) \
            .sort([("created_at", -1), ("_id", -1)]).limit(limit + 1).to_list(None)

    fetched = {k: len(v) for k, v in buf.items()}
    taken: dict = {"m": [], "t": []}
    rows: list = []
    p = state["p"]
    while len(rows) < limit:
        want = PATTERN[p % len(PATTERN)]
        other = "t" if want == "m" else "m"
        kind = want if buf[want] else other if buf[other] else None
        if kind is None:
            break
        row = buf[kind].pop(0)
        taken[kind].append(row)
        rows.append(row)
        p += 1

    has_more = bool(buf["m"] or buf["t"])
    nxt = {"m": state["m"], "t": state["t"], "p": p % len(PATTERN)}
    for kind in ("m", "t"):
        if taken[kind]:
            last = taken[kind][-1]
            nxt[kind] = (last["created_at"], last["_id"])
        if not buf[kind] and fetched[kind] <= limit:
            nxt[kind] = "END"
    return rows, (_encode(nxt) if has_more else None), has_more


def reslot(page: list, shuffled: list) -> list:
    """Keep the media/text rhythm of `page` while using the order of `shuffled`
    (affinity ordering) inside each kind."""
    pools = {True: [d for d in shuffled if is_media_drop(d)],
             False: [d for d in shuffled if not is_media_drop(d)]}
    return [pools[is_media_drop(d)].pop(0) for d in page]
