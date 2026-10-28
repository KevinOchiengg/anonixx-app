"""What a viewer may be shown, for every discovery surface: active and not moderated, still
in its discovery window, allowed by content mode, and no blocks either way."""
from datetime import datetime
from typing import Optional

from bson import ObjectId

from app.utils.content_mode import mature_allowed, SAFE_FILTER

# Old drops may not carry these fields at all, so the conditions are written
# to let a missing field through.
VISIBLE = {"moderation_status": {"$nin": ["flagged", "hidden"]}, "is_active": {"$ne": False}}


def fresh(now: datetime) -> dict:
    """Not past its discovery window. Only hookups have one (live_until)."""
    return {"$or": [{"live_until": None}, {"live_until": {"$gt": now}}]}


async def viewer_context(db, viewer_id: Optional[str], mode_header: Optional[str]) -> dict:
    """Everything eligibility needs about the viewer, fetched once per request."""
    user = None
    hidden: set[str] = set()
    if viewer_id and ObjectId.is_valid(viewer_id):
        user = await db["users"].find_one(
            {"_id": ObjectId(viewer_id)},
            {"blocked_user_ids": 1, "age_verified": 1, "is_admin": 1,
             "location_country": 1, "location_county": 1, "location_sub_county": 1},
        )
        hidden.update((user or {}).get("blocked_user_ids") or [])
        async for u in db["users"].find({"blocked_user_ids": viewer_id}, {"_id": 1}):
            hidden.add(str(u["_id"]))
    return {
        "viewer_id": viewer_id if user else None,
        "user": user,
        "hidden_ids": list(hidden),
        "mature": mature_allowed(mode_header, user),
    }


def eligible(ctx: dict, now: datetime) -> list:
    """Conditions to AND into any discovery query."""
    conds = [VISIBLE, fresh(now)]
    if not ctx["mature"]:
        conds.append(SAFE_FILTER)
    if ctx["hidden_ids"]:
        conds.append({"sender_id": {"$nin": ctx["hidden_ids"]}})
    return conds
