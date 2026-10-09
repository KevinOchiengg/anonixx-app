"""
notifications.py — bottom-nav badge counts.

One aggregate endpoint so the client can refresh all tab badges (Messages,
Requests) in a single round trip instead of two. Each count is computed by
its own domain module (drops/unlock_requests) and just summed up here.
"""

from fastapi import APIRouter, Depends

from app.database import get_database
from app.dependencies import get_current_user_id
from app.api.v1.drops import get_unread_message_counts
from app.api.v1.unlock_requests import count_pending_incoming

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/badge-counts")
async def badge_counts(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    messages        = sum((await get_unread_message_counts(db, current_user_id)).values())
    unlock_requests = await count_pending_incoming(db, current_user_id)

    return {
        "messages": messages,
        "unlock_requests": unlock_requests,
    }
