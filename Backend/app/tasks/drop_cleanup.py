"""
app/tasks/drop_cleanup.py

Async background worker — deletes drops whose post-unlock grace window has
passed, along with the feed post each one mirrors into.

Lifecycle rules this enforces (see drops.py's UNLOCKED_GRACE_DAYS):
  • A drop with expires_at = None has never been unlocked. It never expires
    and this worker never touches it.
  • The first unlock sets expires_at = now + 7 days (14 for premium posters).
    Once that passes, the drop and its mirrored post are removed.

What deliberately survives: drop_connections and drop_messages. People paid
to open those chats, and the connection copies the confession text and names
onto itself, so a conversation stays readable after its drop is gone.
drop_unlocks rows also stay, as the payment receipt.

Lifecycle
  Started during FastAPI app startup (lifespan) as an asyncio background
  task, same pattern as app/tasks/circle_ad_cleanup.py. Shuts down cleanly
  on app teardown.
"""

import asyncio
import logging
from datetime import datetime, timezone

from bson import ObjectId

from app.database import get_database

log = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 60 * 60   # hourly — grace windows run in days
BATCH_LIMIT = 500                 # cap per sweep so one pass can't run long


def _now() -> datetime:
    return datetime.now(timezone.utc)


class DropCleanupWorker:
    """
        worker = DropCleanupWorker()
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
        self._task    = asyncio.create_task(self._loop(), name="drop_cleanup_worker")
        log.info("DropCleanupWorker started (poll every %ds)", POLL_INTERVAL_SECONDS)

    async def stop(self):
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        log.info("DropCleanupWorker stopped.")

    async def _loop(self):
        while self._running:
            try:
                await self.sweep()
            except Exception:
                log.exception("DropCleanupWorker: unhandled sweep error")
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    async def sweep(self) -> int:
        """Delete drops past their grace window plus their mirrored posts.
        Returns how many drops were removed."""
        db = await get_database()

        # Two independent guards, both required:
        #   unlock_count > 0  — the product rule is "deleted a week after its
        #     first unlock", so an un-unlocked drop is never eligible however
        #     old it is. This also protects drops created under the previous
        #     24h-expiry scheme, which still carry a long-past expires_at but
        #     were never unlocked: without it, deploying this worker would
        #     wipe them on its very first sweep.
        #   $ne: None      — a null expires_at means the clock never started,
        #     and Mongo sorts null below any date, so $lte alone would match.
        expired = await db["drops"].find(
            {
                "expires_at":   {"$ne": None, "$lte": _now()},
                "unlock_count": {"$gt": 0},
            },
            {"_id": 1},
        ).limit(BATCH_LIMIT).to_list(None)

        if not expired:
            return 0

        drop_ids = [d["_id"] for d in expired]
        drop_id_strs = [str(_id) for _id in drop_ids]

        # Mirrored feed posts carry source_drop_id back to their drop.
        mirrored = await db["posts"].find(
            {"source_drop_id": {"$in": drop_id_strs}}, {"_id": 1},
        ).to_list(None)
        post_ids = [p["_id"] for p in mirrored]
        post_id_strs = [str(_id) for _id in post_ids]

        await db["drops"].delete_many({"_id": {"$in": drop_ids}})

        if post_ids:
            # Same sub-collection cleanup DELETE /posts/{id} performs, so a
            # swept post doesn't leave orphaned threads/saves/views behind.
            await db["posts"].delete_many({"_id": {"$in": post_ids}})
            await db["post_threads"].delete_many({"post_id": {"$in": post_id_strs}})
            await db["threads"].delete_many({"post_id": {"$in": post_ids}})
            await db["saved_posts"].delete_many({"post_id": {"$in": post_id_strs}})
            await db["post_views"].delete_many({"post_id": {"$in": post_ids}})

        # Pending requests against a drop that no longer exists can never be
        # accepted — clear them so they stop showing in owners' inboxes.
        await db["drop_unlock_requests"].delete_many({
            "status": "pending",
            "$or": [
                {"target_type": "drop", "target_id": {"$in": drop_id_strs}},
                {"target_type": "post", "target_id": {"$in": post_id_strs}},
            ],
        })

        log.info(
            "DropCleanupWorker: removed %d drop(s) and %d mirrored post(s)",
            len(drop_ids), len(post_ids),
        )
        return len(drop_ids)


# ── Singleton ────────────────────────────────────────────────────
drop_cleanup_worker = DropCleanupWorker()
