from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime, timezone
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id
from app.websockets.activity import emit_profile_viewed
from app.api.v1.auth import _is_adult
from app.api.v1.drops import VALID_REPORT_REASONS

router = APIRouter(prefix="/users", tags=["Users"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


FEED_LOCATION_SCOPES = {"off", "country", "county", "sub_county", "estate"}


class UpdateProfileRequest(BaseModel):
    interests: Optional[list[str]] = None
    anonymous_name: Optional[str] = None
    # Home location — powers the feed's location filter. Same 4-level shape
    # Drops already use (country -> county -> sub_county -> estate).
    location_country:    Optional[str] = None
    location_county:     Optional[str] = None
    location_sub_county: Optional[str] = None
    location_estate:     Optional[str] = None
    # "off" | "country" | "county" | "sub_county" | "estate"
    feed_location_scope: Optional[str] = None


class VerifyAgeRequest(BaseModel):
    date_of_birth: date


class ReportUserRequest(BaseModel):
    reason: str
    note: Optional[str] = None


@router.get("/me")
async def get_current_user(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get current user profile"""
    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "id":             str(user["_id"]),
        "email":          user["email"],
        "username":       user.get("username"),
        "anonymous_name": user.get("anonymous_name"),
        "avatar_url":     user.get("avatar_url"),
        "interests":      user.get("interests", []),
        "created_at":     user["created_at"].isoformat(),
        "location_country":    user.get("location_country"),
        "location_county":     user.get("location_county"),
        "location_sub_county": user.get("location_sub_county"),
        "location_estate":     user.get("location_estate"),
        "feed_location_scope": user.get("feed_location_scope") or "off",
    }


@router.put("/me")
async def update_profile(
    data: UpdateProfileRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Update user profile"""
    update_data = {}

    if data.interests is not None:
        update_data["interests"] = data.interests

    if data.anonymous_name is not None:
        update_data["anonymous_name"] = data.anonymous_name

    if data.location_country is not None:
        update_data["location_country"] = data.location_country
    if data.location_county is not None:
        update_data["location_county"] = data.location_county
    if data.location_sub_county is not None:
        update_data["location_sub_county"] = data.location_sub_county
    if data.location_estate is not None:
        update_data["location_estate"] = data.location_estate

    if data.feed_location_scope is not None:
        if data.feed_location_scope not in FEED_LOCATION_SCOPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid feed_location_scope. Choose from: {', '.join(sorted(FEED_LOCATION_SCOPES))}",
            )
        update_data["feed_location_scope"] = data.feed_location_scope

    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    user_exists = await db["users"].find_one({"_id": ObjectId(current_user_id)}, {"_id": 1})
    if not user_exists:
        raise HTTPException(status_code=404, detail="User not found")

    await db["users"].update_one(
        {"_id": ObjectId(current_user_id)},
        {"$set": update_data}
    )

    return {"message": "Profile updated successfully"}


@router.post("/me/verify-age")
async def verify_age(
    data: VerifyAgeRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """
    One-time self-attested age check for accounts created before Anonixx
    required a date of birth at signup. No-ops if already verified.
    """
    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.get("age_verified"):
        return {"age_verified": True}

    if not _is_adult(data.date_of_birth):
        raise HTTPException(status_code=400, detail="Anonixx is for adults 18+")

    await db["users"].update_one(
        {"_id": ObjectId(current_user_id)},
        {"$set": {
            "date_of_birth": data.date_of_birth.isoformat(),
            "age_verified":  True,
        }},
    )
    return {"age_verified": True}


@router.get("/me/blocked")
async def list_blocked_users(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """List the users the current account has blocked."""
    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    blocked_ids = user.get("blocked_user_ids", [])
    if not blocked_ids:
        return {"users": []}

    object_ids = [ObjectId(uid) for uid in blocked_ids]
    cursor = db["users"].find(
        {"_id": {"$in": object_ids}},
        {"_id": 1, "username": 1, "anonymous_name": 1},
    )
    users = []
    async for u in cursor:
        users.append({
            "id":             str(u["_id"]),
            "username":       u.get("username", ""),
            "anonymous_name": u.get("anonymous_name", "Anonymous"),
        })
    return {"users": users}


@router.post("/{user_id}/block")
async def block_user(
    user_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Block a user app-wide — hides their content from your feed and Drops marketplace."""
    if user_id == current_user_id:
        raise HTTPException(status_code=400, detail="You can't block yourself")
    try:
        ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    await db["users"].update_one(
        {"_id": ObjectId(current_user_id)},
        {"$addToSet": {"blocked_user_ids": user_id}},
    )
    return {"message": "User blocked"}


@router.delete("/{user_id}/block")
async def unblock_user(
    user_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Unblock a previously blocked user."""
    await db["users"].update_one(
        {"_id": ObjectId(current_user_id)},
        {"$pull": {"blocked_user_ids": user_id}},
    )
    return {"message": "User unblocked"}


@router.post("/{user_id}/report")
async def report_user(
    user_id: str,
    data: ReportUserRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """
    Report a person directly (distinct from reporting a specific Drop/post
    via POST /drops/{drop_id}/report). Feeds the admin dashboard's per-user
    report_count (GET /admin/users/{user_id}).
    """
    reason = (data.reason or "").strip().lower()
    if reason not in VALID_REPORT_REASONS:
        raise HTTPException(
            status_code=400,
            detail=f"reason must be one of: {', '.join(sorted(VALID_REPORT_REASONS))}",
        )
    try:
        ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    existing = await db["reports"].find_one({
        "reported_user_id": user_id,
        "reporter_id":       current_user_id,
    })
    if existing:
        return {"message": "Report already received. Thank you."}

    await db["reports"].insert_one({
        "_id":              ObjectId(),
        "reported_user_id": user_id,
        "reporter_id":       current_user_id,
        "reason":            reason,
        "note":              (data.note or "").strip()[:500] or None,
        "created_at":        _now(),
    })
    return {"message": "Report received. Thank you."}


@router.get("/me/moderation-history")
async def moderation_history(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """
    Drops the current user posted that have been flagged or hidden by
    moderation — powers Settings > "Report & Moderation History".
    """
    cursor = db["drops"].find(
        {
            "sender_id": current_user_id,
            "moderation_status": {"$in": ["flagged", "hidden"]},
        },
        {"confession": 1, "moderation_status": 1, "flagged_at": 1, "created_at": 1},
    ).sort("flagged_at", -1)

    items = []
    async for d in cursor:
        items.append({
            "id":                str(d["_id"]),
            "confession":        d.get("confession"),
            "moderation_status": d.get("moderation_status"),
            "flagged_at":        d["flagged_at"].isoformat() if d.get("flagged_at") else None,
        })
    return {"items": items}


@router.get("/search")
async def search_users(
    q: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """
    Search users by username OR anonymous_name for anonymous drop targeting.
    Returns id + username + anonymous_name only — no email, no sensitive data.
    Excludes the requester themselves.
    """
    q = q.strip()
    if not q:
        return {"users": []}

    regex = {"$regex": q, "$options": "i"}
    cursor = db["users"].find(
        {
            "$or": [
                {"username": regex},
                {"anonymous_name": regex},
            ],
            "_id": {"$ne": ObjectId(current_user_id)},
        },
        {"_id": 1, "username": 1, "anonymous_name": 1},
    ).limit(10)

    users = []
    async for u in cursor:
        users.append({
            "id":             str(u["_id"]),
            "username":       u.get("username", ""),
            "anonymous_name": u.get("anonymous_name", "Anonymous"),
        })

    return {"users": users}


@router.get("/{user_id}")
async def get_public_profile(
    user_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get another user's public profile. Emits profile_viewed to the target user."""
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    user = await db["users"].find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Notify the target that their profile was viewed (fire-and-forget)
    if user_id != current_user_id:
        try:
            await emit_profile_viewed(user_id, viewer_user_id=current_user_id)
        except Exception:
            pass

    return {
        "id":             str(user["_id"]),
        "username":       user.get("username"),
        "anonymous_name": user.get("anonymous_name"),
        "interests":      user.get("interests", []),
    }