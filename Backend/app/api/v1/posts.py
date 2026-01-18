from fastapi import APIRouter, Depends, HTTPException, Query, Header  # ✅ Add Header
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from bson import ObjectId
import random
from app.database import get_database
from app.dependencies import get_current_user_id, get_optional_user_id

router = APIRouter(prefix="/posts", tags=["Posts"])

# Available topics/categories
AVAILABLE_TOPICS = [
    "relationships", "anxiety", "depression", "self_growth",
    "school_career", "family", "lgbtq", "addiction",
    "sleep", "identity", "wins", "friendship",
    "financial", "health", "general"
]

# Response types
RESPONSE_TYPES = {
    "felt_this": "I felt this",
    "not_alone": "You're not alone",
    "hear_you": "I hear you",
    "holding_with_you": "Holding this with you",
    "sending_strength": "Sending strength",
    "this_matters": "This matters"
}


# ==================== REQUEST MODELS ====================

class CreatePostRequest(BaseModel):
    content: str
    is_anonymous: bool = True
    topics: List[str] = []
    images: List[str] = []
    video_url: Optional[str] = None
    audio_url: Optional[str] = None


class ThreadReplyRequest(BaseModel):
    content: str


class ResponseRequest(BaseModel):
    type: str


# ==================== HELPER FUNCTIONS ====================

def get_time_ago(dt: datetime) -> str:
    """Convert datetime to 'time ago' string"""
    delta = datetime.utcnow() - dt
    
    if delta.days > 365:
        years = delta.days // 365
        return f"{years}y ago"
    elif delta.days > 30:
        months = delta.days // 30
        return f"{months}mo ago"
    elif delta.days > 0:
        return f"{delta.days}d ago"
    elif delta.seconds > 3600:
        hours = delta.seconds // 3600
        return f"{hours}h ago"
    elif delta.seconds > 60:
        minutes = delta.seconds // 60
        return f"{minutes}m ago"
    else:
        return "just now"


async def format_post(post, current_user_id: str, db):
    """Format a post with all necessary data"""
    # Check if user has responded
    user_response = await db["post_responses"].find_one({
        "post_id": str(post["_id"]),
        "user_id": current_user_id
    })
    
    # Check if user saved this post
    is_saved = await db["saved_posts"].find_one({
        "post_id": str(post["_id"]),
        "user_id": current_user_id
    }) is not None
    
    # Get thread count
    thread_count = await db["post_threads"].count_documents({
        "post_id": str(post["_id"])
    })
    
    # Get response counts
    response_counts = post.get("responses", {})
    total_responses = sum(response_counts.values())
    
    # Determine contextual responses based on topics
    topics = post.get("topics", [])
    is_heavy = any(t in ["depression", "anxiety", "addiction", "self_harm"] for t in topics)
    
    if is_heavy:
        response_options = ["felt_this", "not_alone"]
    elif "wins" in topics or "self_growth" in topics:
        response_options = ["this_matters", "sending_strength"]
    else:
        response_options = ["felt_this", "hear_you"]
    
    formatted_post = {
        "id": str(post["_id"]),
        "content": post["content"],
        "is_anonymous": post.get("is_anonymous", True),
        "anonymous_name": post.get("anonymous_name"),
        "topics": topics,
        "images": post.get("images", []),
        "video_url": post.get("video_url"),
        "audio_url": post.get("audio_url"),
        "thread_count": thread_count,
        "views_count": post.get("views_count", 0),
        "saves_count": post.get("saves_count", 0),
        "user_response": user_response.get("type") if user_response else None,
        "is_saved": is_saved,
        "response_options": response_options,
        "created_at": post["created_at"].isoformat(),
        "time_ago": get_time_ago(post["created_at"]),
        "is_own_post": post["user_id"] == current_user_id,
        "type": "post"
    }
    
    # Add private impact for poster
    if post["user_id"] == current_user_id:
        formatted_post["private_impact"] = {
            "total_responses": total_responses,
            "response_breakdown": response_counts,
            "saves": post.get("saves_count", 0),
            "threads": thread_count
        }
    
    return formatted_post


# ==================== ENDPOINTS ====================

@router.post("")
async def create_post(
    data: CreatePostRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Create a new post/confession"""
    print(f"🔵 Creating post for user: {current_user_id}")
    
    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Validate topics
    valid_topics = [t for t in data.topics if t in AVAILABLE_TOPICS]
    if not valid_topics and data.topics:
        valid_topics = ["general"]
    
    post_data = {
        "_id": ObjectId(),
        "user_id": current_user_id,
        "content": data.content,
        "is_anonymous": data.is_anonymous,
        "anonymous_name": user.get("anonymous_name") if data.is_anonymous else None,
        "topics": valid_topics,
        "images": data.images,
        "video_url": data.video_url,
        "audio_url": data.audio_url,
        "responses": {},
        "thread_count": 0,
        "views_count": 0,
        "saves_count": 0,
        "created_at": datetime.utcnow(),
    }
    
    await db["posts"].insert_one(post_data)
    
    print(f"✅ Post created: {str(post_data['_id'])}")
    
    return {
        "id": str(post_data["_id"]),
        "message": "Your words might help someone tonight."
    }


@router.get("/calm-feed")
async def get_calm_feed(
    session_posts: int = Query(0, ge=0),
    authorization: str = Header(None),  # ✅ Make auth OPTIONAL
    db = Depends(get_database)
):
    """
    Calm feed with intentional pacing
    🌟 NOW PUBLIC - No login required to browse!
    
    If user is logged in, personalize based on interests
    If guest, show general feed
    """
    # Try to get user ID from token (may be None for guests)
    current_user_id = None
    
    if authorization:
        try:
            from jose import jwt
            from app.config import settings
            
            token = authorization.replace("Bearer ", "")
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            current_user_id = payload.get("sub")
            print(f"🔵 Authenticated user: {current_user_id}")
        except Exception as e:
            print(f"⚠️ Invalid token, continuing as guest: {e}")
            current_user_id = None
    
    is_guest = current_user_id is None
    
    if is_guest:
        print(f"👤 Guest user browsing feed - session posts: {session_posts}")
    else:
        print(f"✅ Logged in user browsing - session posts: {session_posts}")
    
    # Check if user needs a break
    if session_posts >= 20:
        return {
            "posts": [],
            "message": "session_limit",
            "copy": "You've read enough for now.",
            "has_more": True,
            "is_guest": is_guest
        }
    
    interests = []
    
    # Get user interests if logged in
    if current_user_id:
        user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
        if user:
            interests = user.get("interests", [])
            print(f"📌 User interests: {interests}")
    
    # Determine how many posts to load
    posts_to_load = min(10, 20 - session_posts)
    
    # Algorithm: 70% interests, 30% discovery (or all general for guests)
    interest_count = int(posts_to_load * 0.7) if interests else 0
    discovery_count = posts_to_load - interest_count
    
    posts = []
    
    # Get posts matching interests (only if logged in with interests)
    if interests and interest_count > 0:
        interest_posts_cursor = db["posts"].aggregate([
            {"$match": {"topics": {"$in": interests}}},
            {"$sample": {"size": interest_count * 2}},
            {"$limit": interest_count}
        ])
        async for post in interest_posts_cursor:
            posts.append(post)
    
    # Get discovery posts (or all posts for guests)
    if discovery_count > 0:
        match_query = {"topics": {"$nin": interests}} if interests else {}
        discovery_posts_cursor = db["posts"].aggregate([
            {"$match": match_query},
            {"$sample": {"size": discovery_count * 2}},
            {"$limit": discovery_count}
        ])
        async for post in discovery_posts_cursor:
            posts.append(post)
    
    print(f"✅ Found {len(posts)} posts")
    
    # Randomize order
    random.shuffle(posts)
    
    # Format posts with mood balancing
    formatted_posts = []
    heavy_count = 0
    
    for i, post in enumerate(posts):
        formatted_post = await format_post(post, current_user_id, db)
        
        # Track heavy content
        is_heavy = any(t in ["depression", "anxiety", "addiction", "self_harm"] for t in post.get("topics", []))
        if is_heavy:
            heavy_count += 1
        
        formatted_posts.append(formatted_post)
        
        # Insert divider every 5 posts
        if (i + 1) % 5 == 0 and (i + 1) < len(posts):
            divider_texts = [
                "Take your time.",
                "Breathe.",
                "You don't need to respond.",
                "These are real people.",
                "You're not alone in this."
            ]
            formatted_posts.append({
                "type": "divider",
                "text": random.choice(divider_texts)
            })
        
        # Mood balancing
        if heavy_count >= 3 and (i + 1) < len(posts):
            formatted_posts.append({
                "type": "mood_balancer",
                "text": "Here's something lighter."
            })
            heavy_count = 0
    
    return {
        "posts": formatted_posts,
        "has_more": session_posts + len(posts) < 20,
        "session_posts": session_posts + len(posts),
        "is_guest": is_guest
    }


@router.post("/{post_id}/respond")
async def respond_to_post(
    post_id: str,
    data: ResponseRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """
    Respond to a post emotionally
    """
    if data.type not in RESPONSE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid response type")
    
    print(f"🔵 User {current_user_id} responding to post {post_id} with {data.type}")
    
    existing = await db["post_responses"].find_one({
        "post_id": post_id,
        "user_id": current_user_id
    })
    
    if existing:
        old_type = existing["type"]
        
        await db["post_responses"].update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "type": data.type,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        try:
            await db["posts"].update_one(
                {"_id": ObjectId(post_id)},
                {
                    "$inc": {
                        f"responses.{old_type}": -1,
                        f"responses.{data.type}": 1
                    }
                }
            )
        except:
            await db["posts"].update_one(
                {"_id": post_id},
                {
                    "$inc": {
                        f"responses.{old_type}": -1,
                        f"responses.{data.type}": 1
                    }
                }
            )
        
        return {"message": "Response updated", "type": data.type}
    else:
        await db["post_responses"].insert_one({
            "_id": ObjectId(),
            "post_id": post_id,
            "user_id": current_user_id,
            "type": data.type,
            "created_at": datetime.utcnow()
        })
        
        try:
            await db["posts"].update_one(
                {"_id": ObjectId(post_id)},
                {"$inc": {f"responses.{data.type}": 1}}
            )
        except:
            await db["posts"].update_one(
                {"_id": post_id},
                {"$inc": {f"responses.{data.type}": 1}}
            )
        
        print(f"✅ Response recorded")
        
        return {"message": "Quiet acknowledgment sent", "type": data.type}


@router.delete("/{post_id}/respond")
async def remove_response(
    post_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Remove your response from a post"""
    existing = await db["post_responses"].find_one({
        "post_id": post_id,
        "user_id": current_user_id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="No response found")
    
    await db["post_responses"].delete_one({"_id": existing["_id"]})
    
    try:
        await db["posts"].update_one(
            {"_id": ObjectId(post_id)},
            {"$inc": {f"responses.{existing['type']}": -1}}
        )
    except:
        await db["posts"].update_one(
            {"_id": post_id},
            {"$inc": {f"responses.{existing['type']}": -1}}
        )
    
    return {"message": "Response removed"}


@router.post("/{post_id}/save")
async def save_post(
    post_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Save a post to your collection"""
    existing = await db["saved_posts"].find_one({
        "post_id": post_id,
        "user_id": current_user_id
    })
    
    if existing:
        await db["saved_posts"].delete_one({"_id": existing["_id"]})
        
        try:
            await db["posts"].update_one(
                {"_id": ObjectId(post_id)},
                {"$inc": {"saves_count": -1}}
            )
        except:
            await db["posts"].update_one(
                {"_id": post_id},
                {"$inc": {"saves_count": -1}}
            )
        
        return {"message": "Post removed from saved", "saved": False}
    else:
        await db["saved_posts"].insert_one({
            "_id": ObjectId(),
            "post_id": post_id,
            "user_id": current_user_id,
            "created_at": datetime.utcnow()
        })
        
        try:
            await db["posts"].update_one(
                {"_id": ObjectId(post_id)},
                {"$inc": {"saves_count": 1}}
            )
        except:
            await db["posts"].update_one(
                {"_id": post_id},
                {"$inc": {"saves_count": 1}}
            )
        
        return {"message": "Saved to your collection", "saved": True}


@router.get("/saved")
async def get_saved_posts(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get all saved posts"""
    saved_cursor = db["saved_posts"].find({
        "user_id": current_user_id
    }).sort("created_at", -1)
    
    saved_posts = []
    async for saved in saved_cursor:
        try:
            post = await db["posts"].find_one({"_id": ObjectId(saved["post_id"])})
        except:
            post = await db["posts"].find_one({"_id": saved["post_id"]})
            
        if post:
            saved_posts.append({
                "id": str(post["_id"]),
                "content": post["content"],
                "topics": post.get("topics", []),
                "saved_at": saved["created_at"].isoformat(),
                "saved_days_ago": (datetime.utcnow() - saved["created_at"]).days
            })
    
    return {
        "saved_posts": saved_posts,
        "total": len(saved_posts)
    }


@router.post("/{post_id}/thread")
async def create_thread_reply(
    post_id: str,
    data: ThreadReplyRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Reply to a post (2-reply max)"""
    try:
        post = await db["posts"].find_one({"_id": ObjectId(post_id)})
    except:
        post = await db["posts"].find_one({"_id": post_id})
        
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    
    thread_count = await db["post_threads"].count_documents({
        "post_id": post_id
    })
    
    if thread_count >= 2:
        raise HTTPException(status_code=400, detail="Thread is closed")
    
    thread_reply = {
        "_id": ObjectId(),
        "post_id": post_id,
        "user_id": current_user_id,
        "anonymous_name": user.get("anonymous_name"),
        "content": data.content,
        "depth": thread_count,
        "created_at": datetime.utcnow()
    }
    
    await db["post_threads"].insert_one(thread_reply)
    
    try:
        await db["posts"].update_one(
            {"_id": ObjectId(post_id)},
            {"$inc": {"thread_count": 1}}
        )
    except:
        await db["posts"].update_one(
            {"_id": post_id},
            {"$inc": {"thread_count": 1}}
        )
    
    if thread_count == 1:
        message = "Thread closed - Preserved for reading"
    else:
        message = "Reply added"
    
    return {
        "id": str(thread_reply["_id"]),
        "message": message,
        "thread_closed": thread_count == 1
    }


@router.get("/{post_id}/thread")
async def get_thread_replies(
    post_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get all thread replies for a post"""
    thread_cursor = db["post_threads"].find({
        "post_id": post_id
    }).sort("created_at", 1)
    
    threads = []
    async for thread in thread_cursor:
        threads.append({
            "id": str(thread["_id"]),
            "anonymous_name": thread["anonymous_name"],
            "content": thread["content"],
            "depth": thread["depth"],
            "created_at": thread["created_at"].isoformat(),
            "time_ago": get_time_ago(thread["created_at"]),
            "is_own_reply": thread["user_id"] == current_user_id
        })
    
    return {
        "threads": threads,
        "total": len(threads),
        "is_closed": len(threads) >= 2
    }


@router.post("/{post_id}/view")
async def view_post(
    post_id: str,
    current_user_id: Optional[str] = Depends(get_optional_user_id),  # ✅ Optional
    db = Depends(get_database)
):
    """
    Track post view (anonymous or authenticated)
    """
    try:
        post = await db["posts"].find_one({"_id": ObjectId(post_id)})
        
        if not post:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Post not found"
            )
        
        # Increment view count
        await db["posts"].update_one(
            {"_id": ObjectId(post_id)},
            {"$inc": {"views": 1}}
        )
        
        # Track user view if authenticated
        if current_user_id:
            await db["post_views"].update_one(
                {
                    "post_id": ObjectId(post_id),
                    "user_id": ObjectId(current_user_id)
                },
                {
                    "$set": {
                        "post_id": ObjectId(post_id),
                        "user_id": ObjectId(current_user_id),
                        "viewed_at": datetime.utcnow()
                    }
                },
                upsert=True
            )
        
        return {"status": "success", "message": "View tracked"}
    
    except Exception as e:
        print(f"❌ View tracking error: {e}")
        # Don't fail if view tracking fails
        return {"status": "success", "message": "View tracking skipped"}


@router.get("/topics")
async def get_available_topics():
    """Get all available topics"""
    return {
        "topics": [
            {"id": "relationships", "name": "💔 Relationships", "emoji": "💔"},
            {"id": "anxiety", "name": "😰 Anxiety", "emoji": "😰"},
            {"id": "depression", "name": "😢 Depression", "emoji": "😢"},
            {"id": "self_growth", "name": "💪 Self-Growth", "emoji": "💪"},
            {"id": "school_career", "name": "🎓 School/Career", "emoji": "🎓"},
            {"id": "family", "name": "👨‍👩‍👧‍👦 Family", "emoji": "👨‍👩‍👧‍👦"},
            {"id": "lgbtq", "name": "🏳️‍🌈 LGBTQ+", "emoji": "🏳️‍🌈"},
            {"id": "addiction", "name": "💊 Addiction", "emoji": "💊"},
            {"id": "sleep", "name": "😴 Sleep", "emoji": "😴"},
            {"id": "identity", "name": "🎭 Identity", "emoji": "🎭"},
            {"id": "wins", "name": "🎉 Wins", "emoji": "🎉"},
            {"id": "friendship", "name": "🤝 Friendship", "emoji": "🤝"},
            {"id": "financial", "name": "💰 Financial", "emoji": "💰"},
            {"id": "health", "name": "🏥 Health", "emoji": "🏥"},
            {"id": "general", "name": "🌟 General", "emoji": "🌟"},
        ]
    }