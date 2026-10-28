"""Social publishing queue: list, stats and manual trigger (admin), plus which platforms are set up."""

from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, Query

from app.database import get_database
from app.dependencies import get_current_user_id, require_admin
from app.tasks.publisher_worker import publisher_worker
from app.services.tiktok_publisher    import tiktok_publisher
from app.services.facebook_publisher  import facebook_publisher
from app.services.instagram_publisher import instagram_publisher
from app.services.telegram_publisher  import telegram_publisher

from app.dependencies import require_scope
router = APIRouter(prefix="/publisher", tags=["publisher"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fmt(doc: dict) -> dict:
    """Serialize ObjectId → str and normalise datetimes."""
    doc["id"] = str(doc.pop("_id"))
    for key in ("submitted_at", "processed_at", "next_retry_at", "processing_started_at", "rejected_at"):
        val = doc.get(key)
        if isinstance(val, datetime):
            doc[key] = val.isoformat()
    return doc


# ── Queue list ────────────────────────────────────────────────────
@router.get("/queue")
async def list_queue(
    status: Optional[str] = Query(
        None,
        description="Filter by status: queued | processing | posted | failed | failed_permanent | rejected",
    ),
    limit:  int = Query(50, ge=1, le=200),
    skip:   int = Query(0,  ge=0),
    db      = Depends(get_database),
    _       = Depends(require_scope("content")),
):
    """List publisher queue entries, newest first."""
    query = {}
    if status:
        query["status"] = status

    cursor = (
        db["publisher_queue"]
        .find(query)
        .sort("submitted_at", -1)
        .skip(skip)
        .limit(limit)
    )
    items = await cursor.to_list(length=limit)
    total = await db["publisher_queue"].count_documents(query)

    return {
        "items": [_fmt(i) for i in items],
        "total": total,
        "skip":  skip,
        "limit": limit,
    }


# ── Stats ─────────────────────────────────────────────────────────
@router.get("/stats")
async def publisher_stats(
    db = Depends(get_database),
    _  = Depends(require_scope("content")),
):
    """Aggregate queue counts by status — useful for a publisher dashboard."""
    pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    rows     = await db["publisher_queue"].aggregate(pipeline).to_list(length=20)
    counts   = {row["_id"]: row["count"] for row in rows}

    return {
        "queued":           counts.get("queued",           0),
        "processing":       counts.get("processing",       0),
        "posted":           counts.get("posted",           0),
        "failed":           counts.get("failed",           0),
        "failed_permanent": counts.get("failed_permanent", 0),
        "rejected":         counts.get("rejected",         0),
        "total":            sum(counts.values()),
    }


# ── Manual trigger ────────────────────────────────────────────────
@router.post("/trigger")
async def trigger_worker_batch(
    _  = Depends(require_scope("content")),
):
    """Run one publishing batch now."""
    await publisher_worker.process_batch()
    return {"message": "Worker batch triggered. Check /publisher/queue for results."}


@router.get("/health")
async def publisher_health(_= Depends(get_current_user_id)):
    """Which social platforms have credentials set."""
    return {
        "tiktok":    tiktok_publisher.is_configured(),
        "facebook":  facebook_publisher.is_configured(),
        "instagram": instagram_publisher.is_configured(),
        "telegram":  telegram_publisher.is_configured(),
    }
