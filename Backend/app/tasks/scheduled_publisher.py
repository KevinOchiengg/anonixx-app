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
from datetime import datetime, timedelta, timezone

log = logging.getLogger(__name__)

CHECK_EVERY = 60          # seconds between loop checks
NUDGE_MIN_GAP = 20        # seconds between feed-triggered checks

_task: asyncio.Task | None = None
_last_nudge = 0.0


LOCK_SECONDS = 90


async def advance_video_jobs(db) -> None:
    """Moves Stream video drops along: original ready -> cut + watermark ->
    clip ready -> original deleted -> job becomes a normal pending drop."""
    from app.utils import stream
    if not stream.is_configured():
        return
    now = datetime.now(timezone.utc)
    jobs = await db["scheduled_drops"].find(
        {"status": "processing", "$or": [{"lock_until": None}, {"lock_until": {"$lt": now}}]},
    ).sort("created_at", 1).limit(10).to_list(None)
    for job in jobs:
        # claim it so overlapping runs never cut the same video twice
        claimed = await db["scheduled_drops"].find_one_and_update(
            {"_id": job["_id"], "status": "processing", "$or": [{"lock_until": None}, {"lock_until": {"$lt": now}}]},
            {"$set": {"lock_until": now + timedelta(seconds=LOCK_SECONDS)}},
        )
        if not claimed:
            continue
        try:
            await _advance(db, claimed, stream)
        except Exception as e:
            log.warning("video job %s: %s", job["_id"], e)
        finally:
            await db["scheduled_drops"].update_one({"_id": job["_id"]}, {"$set": {"lock_until": None}})


async def _advance(db, job: dict, stream) -> None:
    from app.api.v1.drops import MAX_CLIP_SECONDS
    s = job["stream"]
    jid = job["_id"]

    async def fail(reason: str):
        await db["scheduled_drops"].update_one({"_id": jid}, {"$set": {"status": "failed", "error": reason[:300]}})
        await stream.delete_video(s.get("clip_uid"))
        await stream.delete_video(s["uid"])

    if not s.get("clip_uid"):
        original = await stream.get_video(s["uid"])
        if (reason := stream.failure(original)):
            return await fail(reason)
        if not stream.is_ready(original):
            return
        duration = float(original.get("duration") or 0)
        start = min(max(0.0, float(s.get("start") or 0)), max(0.0, duration - 1))
        end = float(s.get("end") or duration)
        end = min(end, duration or end, start + MAX_CLIP_SECONDS)
        clip = await stream.create_clip(s["uid"], start, end, (job["drop"].get("confession") or "")[:80])
        await db["scheduled_drops"].update_one({"_id": jid}, {"$set": {"stream.clip_uid": clip["uid"], "stream.start": start, "stream.end": end}})
        return

    clip = await stream.get_video(s["clip_uid"])
    if (reason := stream.failure(clip)):
        return await fail(reason)
    if not stream.is_ready(clip):
        return

    drop = dict(job["drop"])
    drop["media_type"] = "video"
    drop["media_url"] = (clip.get("playback") or {}).get("hls")
    drop["stream_uid"] = s["clip_uid"]
    drop["media_download_url"] = await stream.enable_download(s["clip_uid"])
    if not drop.get("cover_url") and clip.get("thumbnail"):
        drop["cover_url"] = clip["thumbnail"]
    # The clip *is* the window now, so only the text overlays carry over.
    edit = drop.get("video_edit") or {}
    if edit.get("overlays"):
        length = float(clip.get("duration") or 0) or (float(s["end"]) - float(s["start"]))
        drop["video_edit"] = {"start": 0, "end": round(min(length, MAX_CLIP_SECONDS), 2), "overlays": edit["overlays"]}
    else:
        drop.pop("video_edit", None)
    if not drop["media_url"]:
        return await fail("Stream didn't return a playback address for the clip.")

    await stream.delete_video(s["uid"])   # the clip is all we keep
    await db["scheduled_drops"].update_one(
        {"_id": jid},
        {"$set": {"status": "pending", "drop": drop, "publish_at": job.get("publish_at") or datetime.now(timezone.utc)}},
    )


async def publish_due_drops(db) -> int:
    # Imported here: drops.py imports this module's callers, not the reverse.
    from app.api.v1.drops import create_drop, CreateDropRequest

    await advance_video_jobs(db)
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
