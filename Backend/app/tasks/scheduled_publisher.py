"""
Publishes admin drops that were scheduled for later.

A scheduled drop lives in `scheduled_drops` (the create payload, media
already uploaded) until its time comes, then goes through the normal
create_drop path — so notifications, the socials queue and the teaser card
all happen at the real publish moment, not when it was written.

Two things drive it: a loop that checks every minute while the server is
up, and a nudge from feed requests (`nudge`). The second matters on a host
that sleeps when idle (Render free tier): the first visitor after the
scheduled time wakes the server, and their feed load publishes what's due.
Each drop is claimed atomically (pending -> publishing) before it's
created, so overlapping runs never publish it twice.
"""
import asyncio
import logging
import time
from datetime import datetime, timezone

log = logging.getLogger(__name__)

CHECK_EVERY = 60          # seconds between loop checks
NUDGE_MIN_GAP = 20        # seconds between feed-triggered checks

_task: asyncio.Task | None = None
_last_nudge = 0.0


async def publish_due_drops(db) -> int:
    # Imported here: drops.py imports this module's callers, not the reverse.
    from app.api.v1.drops import create_drop, CreateDropRequest

    published = 0
    while True:
        now = datetime.now(timezone.utc)
        job = await db["scheduled_drops"].find_one_and_update(
            {"status": "pending", "publish_at": {"$lte": now}},
            {"$set": {"status": "publishing", "claimed_at": now}},
            sort=[("publish_at", 1)],
        )
        if not job:
            return published
        try:
            result = await create_drop(CreateDropRequest(**job["drop"]), job["admin_id"], db)
            await db["scheduled_drops"].update_one(
                {"_id": job["_id"]},
                {"$set": {"status": "published", "published_at": now, "drop_id": result.get("id")}},
            )
            published += 1
        except Exception as e:
            detail = getattr(e, "detail", None) or str(e)
            log.warning("scheduled drop %s failed to publish: %s", job["_id"], detail)
            await db["scheduled_drops"].update_one(
                {"_id": job["_id"]},
                {"$set": {"status": "failed", "error": str(detail)[:300]}},
            )


def nudge(db) -> None:
    """Fire-and-forget check from a request path, at most every NUDGE_MIN_GAP."""
    global _last_nudge
    if time.monotonic() - _last_nudge < NUDGE_MIN_GAP:
        return
    _last_nudge = time.monotonic()
    asyncio.create_task(_safe(db))


async def _safe(db):
    try:
        await publish_due_drops(db)
    except Exception as e:
        log.warning("scheduled publish check failed: %s", e)


async def _loop():
    from app.database import get_database
    while True:
        await _safe(await get_database())
        await asyncio.sleep(CHECK_EVERY)


async def start():
    global _task
    if _task is None:
        _task = asyncio.create_task(_loop())


async def stop():
    global _task
    if _task:
        _task.cancel()
        _task = None
