"""
app/api/v1/publisher.py

Publisher admin endpoints — manage the TikTok publishing queue.

All routes require authentication (any logged-in user for now;
you can tighten this to admin-only by adding a role check in the dependency).

Routes
  GET  /publisher/queue              list queue with optional status filter
  GET  /publisher/queue/{id}         single item detail
  POST /publisher/queue/{id}/retry   reset a failed entry back to "queued"
  POST /publisher/queue/{id}/reject  permanently reject an entry
  GET  /publisher/stats              aggregate counts by status
  POST /publisher/trigger            manually fire one worker batch (dev/admin)
  GET  /publisher/tiktok/status/{publish_id}  poll TikTok for a post's live status
"""

from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import get_database
from app.dependencies import get_current_user_id
from app.tasks.publisher_worker import publisher_worker
from app.services.tiktok_publisher    import tiktok_publisher
from app.services.facebook_publisher  import facebook_publisher
from app.services.instagram_publisher import instagram_publisher

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
    _       = Depends(get_current_user_id),
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


# ── Single item ───────────────────────────────────────────────────
@router.get("/queue/{item_id}")
async def get_queue_item(
    item_id: str,
    db       = Depends(get_database),
    _        = Depends(get_current_user_id),
):
    """Get full detail for a single queue entry."""
    try:
        doc = await db["publisher_queue"].find_one({"_id": ObjectId(item_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid item ID.")
    if not doc:
        raise HTTPException(status_code=404, detail="Queue item not found.")
    return _fmt(doc)


# ── Force retry ───────────────────────────────────────────────────
@router.post("/queue/{item_id}/retry")
async def retry_queue_item(
    item_id: str,
    db       = Depends(get_database),
    _        = Depends(get_current_user_id),
):
    """
    Reset a failed (or permanently failed) entry back to 'queued'
    so the worker will pick it up on the next cycle.
    """
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid item ID.")

    result = await db["publisher_queue"].update_one(
        {"_id": oid, "status": {"$in": ["failed", "failed_permanent", "rejected"]}},
        {"$set": {
            "status":        "queued",
            "retry_count":   0,
            "next_retry_at": None,
            "error":         None,
        }},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Item is not in a retryable state.")
    return {"message": "Item reset to queued. Worker will pick it up shortly."}


# ── Reject ────────────────────────────────────────────────────────
@router.post("/queue/{item_id}/reject")
async def reject_queue_item(
    item_id: str,
    db       = Depends(get_database),
    _        = Depends(get_current_user_id),
):
    """Permanently reject an entry — it will never be posted."""
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid item ID.")

    result = await db["publisher_queue"].update_one(
        {"_id": oid, "status": {"$nin": ["posted"]}},
        {"$set": {"status": "rejected", "rejected_at": _now()}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Item cannot be rejected (already posted or not found).")
    return {"message": "Entry rejected and will not be published."}


# ── Stats ─────────────────────────────────────────────────────────
@router.get("/stats")
async def publisher_stats(
    db = Depends(get_database),
    _  = Depends(get_current_user_id),
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
    _  = Depends(get_current_user_id),
):
    """
    Manually fire one worker batch cycle.
    Useful for testing or when you need to flush the queue immediately
    without waiting for the next poll interval.
    """
    await publisher_worker.process_batch()
    return {"message": "Worker batch triggered. Check /publisher/queue for results."}


# ── Platform status checks ────────────────────────────────────────
@router.get("/tiktok/status/{publish_id}")
async def get_tiktok_post_status(
    publish_id: str,
    _           = Depends(get_current_user_id),
):
    """
    Poll TikTok directly for the live publish status of a submitted post.

    publish_id is stored in publisher_queue.platforms.tiktok.publish_id

    Possible statuses: PROCESSING_UPLOAD | SEND_TO_USER_INBOX | FAILED | PUBLISHED
    """
    try:
        result = await tiktok_publisher.get_post_status(publish_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return result


@router.get("/health")
async def publisher_health(_= Depends(get_current_user_id)):
    """
    Show which social platforms are currently configured and ready.
    Useful to verify credentials are set before going live.
    """
    return {
        "tiktok":    tiktok_publisher.is_configured(),
        "facebook":  facebook_publisher.is_configured(),
        "instagram": instagram_publisher.is_configured(),
    }
