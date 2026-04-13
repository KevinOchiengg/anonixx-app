from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id
from app.websockets.activity import emit_profile_viewed

router = APIRouter(prefix="/users", tags=["Users"])


class UpdateProfileRequest(BaseModel):
    interests: Optional[list[str]] = None
    anonymous_name: Optional[str] = None


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
        "id": str(user["_id"]),
        "email": user["email"],
        "username": user.get("username"),
        "anonymous_name": user.get("anonymous_name"),
        "interests": user.get("interests", []),
        "created_at": user["created_at"].isoformat()
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
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    result = await db["users"].update_one(
        {"_id": ObjectId(current_user_id)},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return {"message": "Profile updated successfully"}


@router.get("/search")
async def search_users(
    q: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """
    Search users by username for anonymous drop targeting.
    Returns id + username + anonymous_name only — no email, no sensitive data.
    Excludes the requester themselves.
    """
    q = q.strip()
    if not q:
        return {"users": []}

    cursor = db["users"].find(
        {
            "username": {"$regex": q, "$options": "i"},
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