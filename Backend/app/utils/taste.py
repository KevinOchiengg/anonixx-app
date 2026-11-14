"""Taste profile: what each viewer is into, learned from what they do with drops.

Every drop has features (its kind, format, mood, category, topics, poster). Each action adds
its weight to all of a drop's features; skips and "Not interested" take some away. Old taste
fades: values halve every HALF_LIFE_DAYS, so the feed follows what someone is into now.

Stored in user_affinities as {user_id: <viewer key>, taste: {feature: score}, taste_at}.
The viewer key is a user id, or "device:<hash>" for a guest (as in drop_views).
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

log = logging.getLogger(__name__)

WEIGHTS = {
    "knock": 4,           # knocked / asked to link up
    "like": 3,
    "watch_done": 2,      # watched (nearly) to the end
    "save": 2,
    "comment": 2,
    "share": 2,
    "watch_long": 1,      # stayed on it a while
    "skip": -1,           # swiped away within SKIP_MS
    "not_interested": -4,
}
HALF_LIFE_DAYS = 14
MAX_FEATURES = 200
SKIP_MS = 2000
LONG_MS = 8000

# Features narrow enough to pick drops by. Kind and format match most of the feed, so they
# only reorder a page (score), they don't choose it.
PICK_PREFIXES = ("cat:", "topic:", "mood:", "creator:")
PICK_TOP = 8
PICK_MIN = 2.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def drop_format(drop: dict) -> str:
    if drop.get("images") and len(drop["images"]) > 1:
        return "images"
    media = drop.get("media_type")
    if drop.get("media_url") and media in ("video", "image", "voice", "audio"):
        return "voice" if media == "audio" else media
    return "text"


def features(drop: dict) -> list:
    out = [f"kind:{drop.get('kind') or 'confession'}", f"fmt:{drop_format(drop)}"]
    if drop.get("mood_tag"):
        out.append(f"mood:{drop['mood_tag']}")
    if drop.get("category"):
        out.append(f"cat:{drop['category']}")
    out += [f"topic:{t}" for t in (drop.get("topics") or [])]
    # Official drops come from a real admin account: never learn (or leak) it as a creator.
    if drop.get("sender_id") and not drop.get("is_admin_drop"):
        out.append(f"creator:{drop['sender_id']}")
    return out


def _decayed(taste: dict, since: Optional[datetime]) -> dict:
    if not since:
        return dict(taste)
    if since.tzinfo is None:
        since = since.replace(tzinfo=timezone.utc)
    days = max(0.0, (_now() - since).total_seconds() / 86400)
    f = 0.5 ** (days / HALF_LIFE_DAYS)
    return {k: v * f for k, v in taste.items()}


async def load(db, viewer_key: Optional[str]) -> dict:
    """The viewer's taste as of now (decayed)."""
    if not viewer_key:
        return {}
    doc = await db["user_affinities"].find_one({"user_id": viewer_key}, {"taste": 1, "taste_at": 1})
    if not doc:
        return {}
    return _decayed(doc.get("taste") or {}, doc.get("taste_at"))


async def record(db, viewer_key: Optional[str], drop: Optional[dict], action: str) -> None:
    """Learn from one action on one drop. Never raises: taste is best effort."""
    w = WEIGHTS.get(action)
    if not viewer_key or not drop or not w:
        return
    if drop.get("sender_id") and drop.get("sender_id") == viewer_key:
        return   # your own drops say nothing about your taste
    try:
        taste = await load(db, viewer_key)
        for k in features(drop):
            # one poster shouldn't take over the feed: creators learn at half weight
            taste[k] = taste.get(k, 0.0) + (w / 2 if k.startswith("creator:") else w)
        kept = sorted(((k, round(v, 3)) for k, v in taste.items() if abs(v) >= 0.05), key=lambda kv: -abs(kv[1]))
        await db["user_affinities"].update_one(
            {"user_id": viewer_key},
            {"$set": {"taste": dict(kept[:MAX_FEATURES]), "taste_at": _now()}},
            upsert=True,
        )
    except Exception as e:
        log.warning("taste record skipped: %s", e)


async def record_id(db, viewer_key: Optional[str], drop_id: str, action: str) -> None:
    if not viewer_key or not ObjectId.is_valid(drop_id or ""):
        return
    drop = await db["drops"].find_one(
        {"_id": ObjectId(drop_id)},
        {"kind": 1, "media_type": 1, "media_url": 1, "images": 1, "mood_tag": 1,
         "category": 1, "topics": 1, "sender_id": 1, "is_admin_drop": 1},
    )
    await record(db, viewer_key, drop, action)


def watch_action(ms: int, duration: Optional[float]) -> Optional[str]:
    if ms < SKIP_MS:
        return "skip"
    if duration and duration > 0 and ms >= min(duration * 900, 60000):   # 90% of it, or a minute
        return "watch_done"
    if ms >= LONG_MS:
        return "watch_long"
    return None


def pick_keys(taste: dict) -> list:
    """The few features the viewer likes most, used to pick their 70%."""
    ranked = sorted(((k, v) for k, v in taste.items() if k.startswith(PICK_PREFIXES) and v >= PICK_MIN),
                    key=lambda kv: -kv[1])
    return [k for k, _ in ranked[:PICK_TOP]]


def keys_filter(keys: list) -> Optional[dict]:
    conds = []
    for k in keys:
        kind, _, val = k.partition(":")
        if not val:
            continue
        if kind == "cat":
            conds.append({"category": val})
        elif kind == "topic":
            conds.append({"topics": val})
        elif kind == "mood":
            conds.append({"mood_tag": val})
        elif kind == "creator":
            conds.append({"sender_id": val})
    return {"$or": conds} if conds else None


def score(drop: dict, taste: dict) -> float:
    """How well a drop matches the viewer's taste (any sign)."""
    return sum(taste.get(k, 0.0) for k in features(drop))
