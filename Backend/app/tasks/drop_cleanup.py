"""Deletes drops whose post-unlock grace period has passed, and hookup confessions 7 days after
they were posted (refunding Link Ups the poster never answered), with their comments, saves and
views. Chats, messages and unlock receipts are kept."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone


from app.database import get_database
from app.utils import stream

log = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 60 * 60   # hourly — grace windows run in days
HOOKUP_LIFETIME = timedelta(days=7)
HOOKUP_LIFETIME_MS = int(HOOKUP_LIFETIME.total_seconds() * 1000)
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
            try:
                from app.api.v1.unlock_requests import refund_silent_knocks
                n = await refund_silent_knocks(await get_database())
                if n:
                    log.info("Refunded %d unanswered Link Ups", n)
            except Exception:
                log.exception("DropCleanupWorker: refund sweep error")
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    async def sweep(self) -> int:
        """Delete drops past their grace window, and hookup confessions past 7 days, plus their
        comments/saves/views. Returns how many drops were removed."""
        db = await get_database()
        now = _now()

        # Hookups posted before the 7-day rule: run them the full 7 days from when they were posted.
        await db["drops"].update_many(
            {"kind": "hookup", "created_at": {"$gt": now - HOOKUP_LIFETIME}, "lifetime_7d": {"$ne": True}},
            [{"$set": {"live_until": {"$add": ["$created_at", HOOKUP_LIFETIME_MS]}, "lifetime_7d": True}}],
        )

        # Paid knocks made under the old 24-hour rule wait the full 7 days too.
        from app.api.v1.unlock_requests import REFUND_AFTER
        await db["drop_unlock_requests"].update_many(
            {"paid_in": True, "refunded": False, "refund_due_at": {"$ne": None}, "refund_7d": {"$ne": True}},
            [{"$set": {"refund_due_at": {"$add": ["$created_at", int(REFUND_AFTER.total_seconds() * 1000)]}, "refund_7d": True}}],
        )

        # Only unlocked drops with a past expires_at (null means the clock never started),
        # plus every hookup confession older than 7 days.
        expired = await db["drops"].find(
            {"$or": [
                {"expires_at": {"$ne": None, "$lte": now}, "unlock_count": {"$gt": 0}},
                {"kind": "hookup", "created_at": {"$lte": now - HOOKUP_LIFETIME}},
            ]},
            {"_id": 1, "stream_uid": 1, "paywall.full_uid": 1, "kind": 1},
        ).limit(BATCH_LIMIT).to_list(None)

        hookup_ids = [str(d["_id"]) for d in expired if d.get("kind") == "hookup"]
        if hookup_ids:
            # Coins back on every Link Up the poster never answered, before the post goes.
            from app.api.v1.unlock_requests import refund_silent_knocks
            n = await refund_silent_knocks(db, drop_ids=hookup_ids)
            if n:
                log.info("DropCleanupWorker: refunded %d Link Up(s) on expiring hookups", n)

        if not expired:
            return 0

        drop_ids = [d["_id"] for d in expired]
        drop_id_strs = [str(_id) for _id in drop_ids]

        await db["drops"].delete_many({"_id": {"$in": drop_ids}})
        for d in expired:
            await stream.delete_drop_videos(d)

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
