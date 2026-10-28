"""Deletes drops whose post-unlock grace period has passed, with their comments, saves and
views. Never-unlocked drops are never deleted. Chats, messages and unlock receipts are kept."""

import asyncio
import logging
from datetime import datetime, timezone


from app.database import get_database
from app.utils import stream

log = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 60 * 60   # hourly — grace windows run in days
BATCH_LIMIT = 500                 # cap per sweep so one pass can't run long


def _now() -> datetime:
    return datetime.now(timezone.utc)


class DropCleanupWorker:

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
        """Delete drops past their grace window plus their comments/saves/views.
        Returns how many drops were removed."""
        db = await get_database()

        # Only unlocked drops with a past expires_at (null means the clock never started).
        expired = await db["drops"].find(
            {
                "expires_at":   {"$ne": None, "$lte": _now()},
                "unlock_count": {"$gt": 0},
            },
            {"_id": 1, "stream_uid": 1},
        ).limit(BATCH_LIMIT).to_list(None)

        if not expired:
            return 0

        drop_ids = [d["_id"] for d in expired]
        drop_id_strs = [str(_id) for _id in drop_ids]

        await db["drops"].delete_many({"_id": {"$in": drop_ids}})
        for d in expired:
            await stream.delete_video(d.get("stream_uid"))

        # Same sub-collection cleanup DELETE /drops/{id} performs, so a
        # swept drop doesn't leave orphaned threads/saves/views behind.
        await db["drop_threads"].delete_many({"drop_id": {"$in": drop_id_strs}})
        await db["saved_drops"].delete_many({"drop_id": {"$in": drop_id_strs}})
        await db["drop_views"].delete_many({"drop_id": {"$in": drop_id_strs}})

        # Pending requests against a drop that no longer exists can never be
        # accepted — clear them so they stop showing in owners' inboxes.
        await db["drop_unlock_requests"].delete_many({
            "status": "pending",
            "target_type": "drop",
            "target_id": {"$in": drop_id_strs},
        })

        log.info("DropCleanupWorker: removed %d drop(s)", len(drop_ids))
        return len(drop_ids)


# ── Singleton ────────────────────────────────────────────────────
drop_cleanup_worker = DropCleanupWorker()
