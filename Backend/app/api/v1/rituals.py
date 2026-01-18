from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id

router = APIRouter(prefix="/rituals", tags=["Weekly Rituals"])


class ReflectionRequest(BaseModel):
    content: str
    mood: str  # "good", "mixed", "struggling"


@router.get("/sunday-prompt")
async def get_sunday_prompt(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get Sunday reflection prompt"""
    
    # Get this week's stats
    week_ago = datetime.utcnow() - timedelta(days=7)
    
    posts_viewed = await db["posts"].count_documents({
        "user_id": {"$ne": current_user_id},
        "views_count": {"$gt": 0}
    })
    
    responses_given = await db["post_responses"].count_documents({
        "user_id": current_user_id,
        "created_at": {"$gte": week_ago}
    })
    
    posts_shared = await db["posts"].count_documents({
        "user_id": current_user_id,
        "created_at": {"$gte": week_ago}
    })
    
    # Check if already reflected this week
    last_reflection = await db["reflections"].find_one(
        {"user_id": current_user_id},
        sort=[("created_at", -1)]
    )
    
    already_reflected = False
    if last_reflection:
        days_since = (datetime.utcnow() - last_reflection["created_at"]).days
        already_reflected = days_since < 7
    
    return {
        "week_summary": {
            "posts_shared": posts_shared,
            "people_supported": responses_given,
            "connections_made": 0  # TODO: calculate
        },
        "prompt": "What moved you this week?",
        "already_reflected": already_reflected,
        "next_prompt_in_days": 7 - (datetime.utcnow().weekday()) if already_reflected else 0
    }


@router.post("/reflect")
async def submit_reflection(
    data: ReflectionRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Submit weekly reflection"""
    
    reflection = {
        "_id": ObjectId(),
        "user_id": current_user_id,
        "content": data.content,
        "mood": data.mood,
        "created_at": datetime.utcnow()
    }
    
    await db["reflections"].insert_one(reflection)
    
    return {
        "id": str(reflection["_id"]),
        "message": "Reflection saved. See you next week."
    }


@router.get("/past-reflections")
async def get_past_reflections(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get user's past reflections"""
    
    reflections_cursor = db["reflections"].find({
        "user_id": current_user_id
    }).sort("created_at", -1).limit(12)  # Last 12 weeks
    
    reflections = []
    async for ref in reflections_cursor:
        reflections.append({
            "id": str(ref["_id"]),
            "content": ref["content"],
            "mood": ref["mood"],
            "created_at": ref["created_at"].isoformat(),
            "weeks_ago": (datetime.utcnow() - ref["created_at"]).days // 7
        })
    
    return {"reflections": reflections}