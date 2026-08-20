"""
app/tasks/circle_ad_cleanup.py

Async background worker — physically deletes expired circle_ads on a
schedule, independent of read traffic. Replaces the old lazy "delete on
next read" behavior, which meant an ad quietly sitting in a rarely-viewed
circle could linger in the collection long after it stopped being live.

Lifecycle
  Started during FastAPI app startup (lifespan) as an asyncio background
  task, same pattern as app/tasks/publisher_worker.py. Shuts down cleanly
  on app teardown.
"""

import asyncio
import logging
from datetime import datetime, timezone

from app.database import get_database

log = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 15 * 60   # 15 minutes — ads run in hour+ increments, no need to poll tighter


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CircleAdCleanupWorker:
    """
        worker = CircleAdCleanupWorker()
        await worker.start()   # called in app lifespan startup
        ...
        await worker.stop()    # called in app lifespan shutdown
    """

    def __init__(self):
        self._task:    asyncio.Task | None = None
        self._running: bool                = False

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task    = asyncio.create_task(self._loop(), name="circle_ad_cleanup_worker")
        log.info("CircleAdCleanupWorker started (poll every %ds)", POLL_INTERVAL_SECONDS)

    async def stop(self):
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        log.info("CircleAdCleanupWorker stopped.")

    async def _loop(self):
        while self._running:
            try:
                await self.sweep()
            except Exception:
                log.exception("CircleAdCleanupWorker: unhandled sweep error")
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    async def sweep(self):
        db     = await get_database()
        result = await db["circle_ads"].delete_many({
            "status":     "approved",
            "expires_at": {"$lte": _now()},
        })
        if result.deleted_count:
            log.info("CircleAdCleanupWorker: removed %d expired ad(s)", result.deleted_count)


# ── Singleton ────────────────────────────────────────────────────
circle_ad_cleanup_worker = CircleAdCleanupWorker()
