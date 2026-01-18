from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id

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