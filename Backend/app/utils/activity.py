"""Activity feed behind the notification center.

Likes, comment likes, gifts and live joins on the same target collapse into one row for a day
("Ana and 4 others liked your confession"); everything else is one row per event.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from bson import ObjectId

logger = logging.getLogger(__name__)

COLLECTION = "activity"
GROUP_WINDOW = timedelta(hours=24)
RETENTION_DAYS = 90

CATEGORY = {
    "like": "likes",
    "comment_like": "likes",
    "comment": "comments",
    "reply": "comments",
    "mention": "mentions",
    "linkup_in": "linkups",
    "linkup_accepted": "linkups",
    "linkup_mutual": "linkups",
    "linkup_declined": "linkups",
    "linkup_short": "linkups",
    "coins": "coins",
    "gift": "lives",
    "live_join": "lives",
    "live_started": "lives",
    "live_payout": "lives",
    "confession_for_you": "system",
    "system": "system",
}
CATEGORIES = ("likes", "comments", "mentions", "linkups", "coins", "lives", "system")

GROUPED = {"like", "comment_like", "gift", "live_join"}
SUM_PER_EVENT = {"gift"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _emit(user_id: str) -> None:
    try:
        from app.sio import sio
        await sio.emit("activity_new", {}, room=f"user_{user_id}")
    except Exception:
        pass


async def record(
    db,
    user_id: Optional[str],
    kind: str,
    *,
    actor_id: Optional[str] = None,
    text: Optional[str] = None,
    title: Optional[str] = None,
    drop_id: Optional[str] = None,
    comment_id: Optional[str] = None,
    live_id: Optional[str] = None,
    url: Optional[str] = None,
    coins: int = 0,
) -> None:
    """Add an item to a user's activity. Never raises: a failed write must not break the action."""
    if not user_id or kind not in CATEGORY or (actor_id and actor_id == user_id):
        return
    try:
        col = db[COLLECTION]
        now = _now()
        target = comment_id or drop_id or live_id
        group = f"{kind}:{target}" if kind in GROUPED and target else None

        if group and actor_id:
            recent = {"user_id": user_id, "group": group, "updated_at": {"$gte": now - GROUP_WINDOW}}
            fresh = {"$set": {"updated_at": now, "read": False, "last_actor_id": actor_id}}
            if kind in SUM_PER_EVENT:
                res = await col.update_one(recent, {**fresh, "$addToSet": {"actor_ids": actor_id}, "$inc": {"coins": coins}})
            else:
                res = await col.update_one(
                    {**recent, "actor_ids": {"$ne": actor_id}},
                    {**fresh, "$push": {"actor_ids": actor_id}, "$inc": {"coins": coins}},
                )
                if not res.matched_count and await col.find_one(recent, {"_id": 1}):
                    return
            if res.matched_count:
                await _emit(user_id)
                return

        await col.insert_one({
            "user_id": user_id,
            "kind": kind,
            "category": CATEGORY[kind],
            "group": group,
            "actor_ids": [actor_id] if actor_id else [],
            "last_actor_id": actor_id,
            "title": title,
            "text": (text or "")[:160] or None,
            "drop_id": drop_id,
            "comment_id": comment_id,
            "live_id": live_id,
            "url": url,
            "coins": coins,
            "read": False,
            "created_at": now,
            "updated_at": now,
        })
        await _emit(user_id)
    except Exception as e:
        logger.warning("activity.record failed for %s (%s): %s", user_id, kind, e)


async def record_many(db, user_ids: Iterable[str], kind: str, **kw) -> None:
    for uid in set(user_ids):
        await record(db, uid, kind, **kw)


async def unread_count(db, user_id: str) -> int:
    return await db[COLLECTION].count_documents({"user_id": user_id, "read": False})


async def ensure_indexes(db) -> None:
    col = db[COLLECTION]
    await col.create_index([("user_id", 1), ("updated_at", -1)])
    await col.create_index([("user_id", 1), ("category", 1), ("updated_at", -1)])
    await col.create_index([("user_id", 1), ("read", 1)])
    await col.create_index([("user_id", 1), ("group", 1), ("updated_at", -1)])
    await col.create_index("created_at", expireAfterSeconds=RETENTION_DAYS * 86400)


def oid(value: Optional[str]) -> Optional[ObjectId]:
    try:
        return ObjectId(value) if value else None
    except Exception:
        return None
