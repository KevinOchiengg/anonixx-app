"""Bottom-nav badge counts and the activity feed behind the notification center."""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.database import get_database
from app.dependencies import get_current_user_id
from app.api.v1.drops import get_unread_message_counts
from app.api.v1.unlock_requests import count_pending_incoming
from app.utils import activity

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
    activity_unread = await activity.unread_count(db, current_user_id)

    return {
        "messages": messages,
        "unlock_requests": unlock_requests,   # pending knocks at my door
        "missed_calls": missed_calls,
        # Everything waiting in Rooms: unread messages, knocks and missed calls.
        "rooms": messages + unlock_requests + missed_calls,
        "activity": activity_unread,
    }


# ─── Activity ───────────────────────────────────────────────────

ACTIONS = {
    "like": "liked your confession",
    "comment_like": "liked your comment",
    "comment": "commented on your confession",
    "reply": "replied to your comment",
    "mention": "mentioned you in a comment",
    "linkup_in": "linked up with you",
    "linkup_accepted": "let you in. The Room is open",
    "linkup_mutual": "knocked back. It's mutual",
    "linkup_short": "wants to let you in. Top up to get inside",
    "linkup_request": "wants in. Let them in or decline",
    "gift": "sent you gifts",
    "live_join": "joined your live",
    "live_started": "is live now",
}


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


async def _people(db, ids: set) -> dict:
    from app.api.v1.auth import _public_gender
    oids = [o for o in (activity.oid(i) for i in ids) if o]
    if not oids:
        return {}
    rows = db["users"].find({"_id": {"$in": oids}}, {"anonymous_name": 1, "avatar_url": 1, "gender": 1})
    return {
        str(u["_id"]): {"id": str(u["_id"]), "name": u.get("anonymous_name") or "Someone",
                        "avatar_url": u.get("avatar_url"), "gender": _public_gender(u)}
        async for u in rows
    }


async def _drops(db, ids: set) -> dict:
    oids = [o for o in (activity.oid(i) for i in ids) if o]
    if not oids:
        return {}
    rows = db["drops"].find({"_id": {"$in": oids}}, {"confession": 1, "media_url": 1, "media_type": 1, "cover_url": 1})
    out = {}
    async for d in rows:
        image = d.get("cover_url") or (d.get("media_url") if d.get("media_type") == "image" else None)
        out[str(d["_id"])] = {"id": str(d["_id"]), "image": image, "media_type": d.get("media_type"),
                              "snippet": (d.get("confession") or "")[:80] or None}
    return out


def _target_url(row: dict) -> Optional[str]:
    if row.get("url"):
        return row["url"]
    if row.get("drop_id"):
        return f"/drop/{row['drop_id']}"
    if row.get("live_id"):
        return f"/lives/{row['live_id']}"
    return None


@router.get("/activity")
async def list_activity(
    category: Optional[str] = Query(None, max_length=20),
    before: Optional[str] = Query(None, max_length=64),
    limit: int = Query(30, ge=1, le=50),
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    query: dict = {"user_id": current_user_id}
    if category and category != "all":
        if category not in activity.CATEGORIES:
            raise HTTPException(status_code=400, detail="Unknown category.")
        query["category"] = category
    if before:
        try:
            query["updated_at"] = {"$lt": datetime.fromisoformat(before.replace("Z", "+00:00"))}
        except ValueError:
            raise HTTPException(status_code=400, detail="Bad cursor.")

    rows = await db[activity.COLLECTION].aggregate([
        {"$match": query},
        {"$sort": {"updated_at": -1}},
        {"$limit": limit + 1},
        {"$addFields": {"count": {"$size": "$actor_ids"}, "actor_ids": {"$slice": ["$actor_ids", -2]}}},
    ]).to_list(length=limit + 1)
    more = len(rows) > limit
    rows = rows[:limit]

    people = await _people(db, {a for r in rows for a in r.get("actor_ids", [])})
    drops = await _drops(db, {r["drop_id"] for r in rows if r.get("drop_id")})

    items = []
    for r in rows:
        actors = [people[a] for a in reversed(r.get("actor_ids", [])) if a in people]
        items.append({
            "id": str(r["_id"]),
            "kind": r["kind"],
            "category": r["category"],
            "actors": actors,
            "count": r.get("count", 0),
            "action": ACTIONS.get(r["kind"]),
            "title": r.get("title"),
            "text": r.get("text"),
            "coins": r.get("coins") or 0,
            "drop": drops.get(r.get("drop_id") or ""),
            "url": _target_url(r),
            "read": bool(r.get("read")),
            "at": _iso(r.get("updated_at")),
        })
    return {
        "items": items,
        "next": items[-1]["at"] if more and items else None,
        "unread": await activity.unread_count(db, current_user_id),
    }


@router.get("/activity/unread")
async def activity_unread(current_user_id: str = Depends(get_current_user_id), db = Depends(get_database)):
    return {"unread": await activity.unread_count(db, current_user_id)}


class ReadBody(BaseModel):
    category: Optional[str] = None


@router.post("/activity/read")
async def mark_activity_read(
    body: ReadBody,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    query: dict = {"user_id": current_user_id, "read": False}
    if body.category and body.category != "all":
        query["category"] = body.category
    res = await db[activity.COLLECTION].update_many(query, {"$set": {"read": True}})
    return {"updated": res.modified_count}
