"""
app/tasks/publisher_worker.py

Async background worker — processes `publisher_queue` and dispatches
approved drops to every configured social platform simultaneously:
  • TikTok   (app/services/tiktok_publisher.py)
  • Facebook  (app/services/facebook_publisher.py)
  • Instagram (app/services/instagram_publisher.py)

Lifecycle
  Started during FastAPI app startup (lifespan) as an asyncio background task.
  Polls every POLL_INTERVAL_SECONDS. Shuts down cleanly on app teardown.

Per-platform dispatch rules
  text   → TikTok ✓  Facebook ✓  Instagram SKIPPED (no text-only post API)
  image  → TikTok ✓  Facebook ✓  Instagram ✓
  video  → TikTok ✓  Facebook ✓  Instagram ✓ (posted as Reel)

Overall queue status after processing
  "posted"   — at least one platform succeeded, none failed
  "partial"  — at least one platform succeeded, at least one failed
  "failed"   — ALL platforms failed              → retried with backoff
  "failed_permanent" — all platforms failed after MAX_RETRIES attempts

Per-platform results are stored under `platforms` key in the queue document:
  {
    "tiktok":    { "status": "posted",   "publish_id": "v_pub~..." },
    "facebook":  { "status": "posted",   "post_id": "123_456" },
    "instagram": { "status": "skipped",  "reason": "text-only..." }
    -- or on failure --
    "tiktok":    { "status": "failed",   "error": "..." },
  }
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta

from app.database import get_database
from app.services.tiktok_publisher    import tiktok_publisher
from app.services.facebook_publisher  import facebook_publisher
from app.services.instagram_publisher import instagram_publisher, PlatformSkipped

log = logging.getLogger(__name__)

# ── Tuning ───────────────────────────────────────────────────────
POLL_INTERVAL_SECONDS = 30
BATCH_SIZE            = 5
MAX_RETRIES           = 3
RETRY_DELAYS          = [300, 900, 3600]   # 5 min → 15 min → 1 h


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Worker class ─────────────────────────────────────────────────
class PublisherWorker:
    """
    Manages the publisher background task.

        worker = PublisherWorker()
        await worker.start()   # called in app lifespan startup
        ...
        await worker.stop()    # called in app lifespan shutdown
    """

    def __init__(self):
        self._task:    asyncio.Task | None = None
        self._running: bool                = False

    # ── Lifecycle ─────────────────────────────────────────────────
    async def start(self):
        if self._running:
            return
        self._running = True
        self._task    = asyncio.create_task(self._loop(), name="publisher_worker")
        log.info("PublisherWorker started (poll every %ds)", POLL_INTERVAL_SECONDS)

    async def stop(self):
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        log.info("PublisherWorker stopped.")

    # ── Main loop ─────────────────────────────────────────────────
    async def _loop(self):
        while self._running:
            try:
                await self.process_batch()
            except Exception:
                log.exception("PublisherWorker: unhandled poll error")
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    # ── Batch (also exposed to /publisher/trigger) ────────────────
    async def process_batch(self):
        """
        Fetch up to BATCH_SIZE eligible queue entries and dispatch each
        as an independent asyncio task.
        """
        db  = await get_database()
        now = _now()

        entries = await (
            db["publisher_queue"]
            .find({
                "$or": [
                    {"status": "queued"},
                    {
                        "status":        "failed",
                        "retry_count":   {"$lt": MAX_RETRIES},
                        "next_retry_at": {"$lte": now},
                    },
                ]
            })
            .sort("submitted_at", 1)
            .limit(BATCH_SIZE)
            .to_list(length=BATCH_SIZE)
        )

        if not entries:
            return

        log.info("PublisherWorker: dispatching %d entries", len(entries))

        for entry in entries:
            asyncio.create_task(
                self._process_entry(entry),
                name=f"pub_{entry['_id']}",
            )

    # ── Single entry ──────────────────────────────────────────────
    async def _process_entry(self, entry: dict):
        db  = await get_database()
        eid = entry["_id"]

        # Atomic lock — prevents double-processing across concurrent tasks.
        locked = await db["publisher_queue"].update_one(
            {"_id": eid, "status": {"$in": ["queued", "failed"]}},
            {"$set": {"status": "processing", "processing_started_at": _now()}},
        )
        if locked.modified_count == 0:
            return   # another task already claimed this entry

        try:
            platform_results, platform_errors = await self._dispatch_all(entry)

            # Determine overall status.
            if platform_results and not platform_errors:
                overall = "posted"
            elif platform_results and platform_errors:
                overall = "partial"   # some succeeded — content is live, don't retry
            else:
                # Every platform errored — raise so the retry logic below fires.
                raise RuntimeError(
                    "; ".join(f"{p}: {e}" for p, e in platform_errors.items())
                )

            await db["publisher_queue"].update_one(
                {"_id": eid},
                {"$set": {
                    "status":       overall,
                    "platforms":    {**platform_results, **{
                        p: {"status": "failed", "error": e}
                        for p, e in platform_errors.items()
                    }},
                    "processed_at": _now(),
                    "error":        None,
                }},
            )
            log.info(
                "PublisherWorker: drop %s → %s  (platforms: %s)",
                entry.get("drop_id"),
                overall,
                list(platform_results.keys()),
            )

        except Exception as exc:
            retry_count  = entry.get("retry_count", 0) + 1
            exhausted    = retry_count >= MAX_RETRIES
            delay        = RETRY_DELAYS[min(retry_count - 1, len(RETRY_DELAYS) - 1)]
            next_retry   = None if exhausted else _now() + timedelta(seconds=delay)
            final_status = "failed_permanent" if exhausted else "failed"

            await db["publisher_queue"].update_one(
                {"_id": eid},
                {"$set": {
                    "status":        final_status,
                    "error":         str(exc),
                    "retry_count":   retry_count,
                    "next_retry_at": next_retry,
                    "processed_at":  _now(),
                }},
            )
            log.warning(
                "PublisherWorker: drop %s failed (attempt %d/%d): %s",
                entry.get("drop_id"), retry_count, MAX_RETRIES, exc,
            )

    # ── Fan-out to all platforms ──────────────────────────────────
    async def _dispatch_all(
        self,
        entry: dict,
    ) -> tuple[dict, dict]:
        """
        Try all configured platforms concurrently.

        Returns
            platform_results  dict  — platforms that succeeded or were skipped
            platform_errors   dict  — platforms that raised an error
        """
        media_type = (entry.get("media_type") or "text").lower()
        confession = entry.get("confession") or ""
        category   = entry.get("category")   or "love"
        media_url  = entry.get("media_url")

        # Build coroutines for each configured platform.
        coros: dict[str, object] = {}

        if tiktok_publisher.is_configured():
            coros["tiktok"] = self._call_tiktok(media_type, confession, category, media_url)

        if facebook_publisher.is_configured():
            coros["facebook"] = self._call_facebook(media_type, confession, category, media_url)

        if instagram_publisher.is_configured():
            coros["instagram"] = self._call_instagram(media_type, confession, category, media_url)

        if not coros:
            raise RuntimeError(
                "No social platforms are configured. "
                "Set at least one of TIKTOK_ACCESS_TOKEN / FACEBOOK_PAGE_ACCESS_TOKEN "
                "in your .env file."
            )

        # Run all platforms concurrently.
        results = await asyncio.gather(*coros.values(), return_exceptions=True)

        platform_results: dict = {}
        platform_errors:  dict = {}

        for platform, result in zip(coros.keys(), results):
            if isinstance(result, PlatformSkipped):
                platform_results[platform] = {
                    "status": "skipped",
                    "reason": str(result),
                }
            elif isinstance(result, Exception):
                platform_errors[platform] = str(result)
                log.warning(
                    "PublisherWorker: %s failed for drop %s: %s",
                    platform, entry.get("drop_id"), result,
                )
            else:
                platform_results[platform] = {**result, "status": "posted"}

        return platform_results, platform_errors

    # ── Platform-specific dispatchers ────────────────────────────
    async def _call_tiktok(
        self, media_type: str, confession: str, category: str, media_url: str | None
    ):
        if media_type == "video":
            if not media_url:
                raise ValueError("Video drop missing media_url.")
            return await tiktok_publisher.post_video(
                video_url=media_url, confession=confession, category=category,
            )
        if media_type == "image":
            if not media_url:
                raise ValueError("Image drop missing media_url.")
            return await tiktok_publisher.post_image(
                image_url=media_url, confession=confession, category=category,
            )
        # text
        if not confession.strip():
            raise ValueError("Text drop has no confession content.")
        return await tiktok_publisher.post_text(confession=confession, category=category)

    async def _call_facebook(
        self, media_type: str, confession: str, category: str, media_url: str | None
    ):
        if media_type == "video":
            if not media_url:
                raise ValueError("Video drop missing media_url.")
            return await facebook_publisher.post_video(
                video_url=media_url, confession=confession, category=category,
            )
        if media_type == "image":
            if not media_url:
                raise ValueError("Image drop missing media_url.")
            return await facebook_publisher.post_image(
                image_url=media_url, confession=confession, category=category,
            )
        # text
        if not confession.strip():
            raise ValueError("Text drop has no confession content.")
        return await facebook_publisher.post_text(confession=confession, category=category)

    async def _call_instagram(
        self, media_type: str, confession: str, category: str, media_url: str | None
    ):
        if media_type == "video":
            if not media_url:
                raise ValueError("Video drop missing media_url.")
            return await instagram_publisher.post_video(
                video_url=media_url, confession=confession, category=category,
            )
        if media_type == "image":
            if not media_url:
                raise ValueError("Image drop missing media_url.")
            return await instagram_publisher.post_image(
                image_url=media_url, confession=confession, category=category,
            )
        # text — Instagram does not support text-only posts
        return await instagram_publisher.post_text(confession=confession, category=category)


# ── Singleton ────────────────────────────────────────────────────
publisher_worker = PublisherWorker()
