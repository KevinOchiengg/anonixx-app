from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timedelta
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id

router = APIRouter(prefix="/impact", tags=["Impact"])


@router.get("/dashboard")
async def get_impact_dashboard(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get user's impact dashboard - how they've helped others"""
    
    # Get time ranges
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    
    # Count posts created
    posts_count = await db["posts"].count_documents({
        "user_id": current_user_id
    })
    
    posts_this_week = await db["posts"].count_documents({
        "user_id": current_user_id,
        "created_at": {"$gte": week_ago}
    })
    
    posts_this_month = await db["posts"].count_documents({
        "user_id": current_user_id,
        "created_at": {"$gte": month_ago}
    })
    
    # Get responses given to others
    responses_given = await db["post_responses"].count_documents({
        "user_id": current_user_id
    })
    
    responses_this_week = await db["post_responses"].count_documents({
        "user_id": current_user_id,
        "created_at": {"$gte": week_ago}
    })
    
    responses_this_month = await db["post_responses"].count_documents({
        "user_id": current_user_id,
        "created_at": {"$gte": month_ago}
    })
    
    # Get responses received on user's posts
    user_posts = await db["posts"].find({"user_id": current_user_id}).to_list(None)
    post_ids = [str(p["_id"]) for p in user_posts]
    
    responses_received = await db["post_responses"].count_documents({
        "post_id": {"$in": post_ids}
    })
    
    # Get saves on user's posts
    saves_received = sum([p.get("saves_count", 0) for p in user_posts])
    
    # Get thread participation
    threads_created = await db["post_threads"].count_documents({
        "user_id": current_user_id
    })
    
    # Calculate impact score
    impact_score = (
        (responses_given * 2) +  # Giving support counts double
        (posts_count * 3) +      # Posting counts triple
        (threads_created * 1)    # Thread participation
    )
    
    return {
        "all_time": {
            "posts_shared": posts_count,
            "people_supported": responses_given,
            "responses_received": responses_received,
            "saves_received": saves_received,
            "threads_participated": threads_created,
            "impact_score": impact_score
        },
        "this_month": {
            "posts_shared": posts_this_month,
            "people_supported": responses_this_month
        },
        "this_week": {
            "posts_shared": posts_this_week,
            "people_supported": responses_this_week
        },
        "milestones": get_milestones(impact_score, posts_count, responses_given)
    }


def get_milestones(score, posts, responses):
    """Calculate milestone achievements"""
    milestones = []
    
    if posts >= 1:
        milestones.append({"name": "First Share", "icon": "✨", "achieved": True})
    if posts >= 10:
        milestones.append({"name": "Voice Heard", "icon": "🗣️", "achieved": True})
    if posts >= 50:
        milestones.append({"name": "Regular Contributor", "icon": "⭐", "achieved": True})
    
    if responses >= 1:
        milestones.append({"name": "First Support", "icon": "🤝", "achieved": True})
    if responses >= 25:
        milestones.append({"name": "Caring Soul", "icon": "💜", "achieved": True})
    if responses >= 100:
        milestones.append({"name": "Compassion Champion", "icon": "🏆", "achieved": True})
    
    if score >= 50:
        milestones.append({"name": "Impact Maker", "icon": "🌟", "achieved": True})
    if score >= 200:
        milestones.append({"name": "Community Pillar", "icon": "💎", "achieved": True})
    
    return milestones