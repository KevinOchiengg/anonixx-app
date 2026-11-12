"""Bottom-nav badge counts (Rooms, Requests) in one call."""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.database import get_database
from app.dependencies import get_current_user_id
from app.api.v1.drops import get_unread_message_counts
from app.api.v1.unlock_requests import count_pending_incoming

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _since(calls_seen: Optional[str]) -> datetime:
    """When the user last opened the Calls tab (sent by the client); a week back if unknown."""
    fallback = datetime.now(timezone.utc) - timedelta(days=7)
    if not calls_seen:
        return fallback
    try:
        dt = datetime.fromisoformat(calls_seen.replace("Z", "+00:00"))
    except ValueError:
        return fallback
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def count_missed_calls(db, user_id: str, since: datetime) -> int:
    """1-to-1 calls that rang for me, I never picked up, newer than `since`."""
    return await db["drop_calls"].count_documents({
        "kind": "direct",
        "callee_id": user_id,
        "status": {"$in": ["missed", "cancelled"]},
        "started_at": {"$gt": since},
        "hidden_for": {"$ne": user_id},
    })


@router.get("/badge-counts")
async def badge_counts(
    calls_seen: Optional[str] = Query(None, max_length=64),
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    messages        = sum((await get_unread_message_counts(db, current_user_id)).values())
    unlock_requests = await count_pending_incoming(db, current_user_id)
    missed_calls    = await count_missed_calls(db, current_user_id, _since(calls_seen))

    return {
        "messages": messages,
        "unlock_requests": unlock_requests,   # pending knocks at my door
        "missed_calls": missed_calls,
        # Everything waiting in Rooms: unread messages, knocks and missed calls.
        "rooms": messages + unlock_requests + missed_calls,
    }
