from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
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


async def format_post(post, current_user_id: Optional[str], db):
    """Format a post with all necessary data"""

    # Check if user saved this post (only if authenticated)
    is_saved = False
    if current_user_id:
        is_saved = await db["saved_posts"].find_one({
            "post_id": str(post["_id"]),
            "user_id": current_user_id
        }) is not None

    # Check if user liked this post (only if authenticated)
    is_liked = current_user_id in post.get("liked_by", []) if current_user_id else False

    # Get thread count
    thread_count = await db["post_threads"].count_documents({
        "post_id": str(post["_id"])
    })

    topics = post.get("topics", [])

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
        "likes_count": post.get("likes_count", 0),
        "is_liked": is_liked,
        "is_saved": is_saved,
        "created_at": post["created_at"].isoformat(),
        "time_ago": get_time_ago(post["created_at"]),
        "is_own_post": post["user_id"] == current_user_id if current_user_id else False,
        "type": "post"
    }

    # Add private impact for poster (only if authenticated and is own post)
    if current_user_id and post["user_id"] == current_user_id:
        formatted_post["private_impact"] = {
            "saves": post.get("saves_count", 0),
            "likes": post.get("likes_count", 0),
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
        "thread_count": 0,
        "views_count": 0,
        "saves_count": 0,
        "liked_by": [],
        "likes_count": 0,
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
    authorization: str = Header(None),
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


# ==================== LIKE ENDPOINTS ====================

@router.post("/{post_id}/like")
async def like_post(
    post_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Like a post"""
    print(f"🔵 User {current_user_id} liking post {post_id}")

    # Check if post exists
    try:
        post = await db["posts"].find_one({"_id": ObjectId(post_id)})
    except:
        post = await db["posts"].find_one({"_id": post_id})

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Check if already liked
    liked_by = post.get("liked_by", [])
    if current_user_id in liked_by:
        return {
            "message": "Already liked",
            "liked": True,
            "likes_count": post.get("likes_count", 0)
        }

    # Add like
    try:
        await db["posts"].update_one(
            {"_id": ObjectId(post_id)},
            {
                "$push": {"liked_by": current_user_id},
                "$inc": {"likes_count": 1}
            }
        )
    except:
        await db["posts"].update_one(
            {"_id": post_id},
            {
                "$push": {"liked_by": current_user_id},
                "$inc": {"likes_count": 1}
            }
        )

    new_likes_count = post.get("likes_count", 0) + 1

    print(f"✅ Like added. Total likes: {new_likes_count}")

    return {
        "message": "Post liked",
        "liked": True,
        "likes_count": new_likes_count
    }


@router.delete("/{post_id}/like")
async def unlike_post(
    post_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Unlike a post"""
    print(f"🔵 User {current_user_id} unliking post {post_id}")

    # Check if post exists
    try:
        post = await db["posts"].find_one({"_id": ObjectId(post_id)})
    except:
        post = await db["posts"].find_one({"_id": post_id})

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Check if not liked
    liked_by = post.get("liked_by", [])
    if current_user_id not in liked_by:
        return {
            "message": "Not liked",
            "liked": False,
            "likes_count": post.get("likes_count", 0)
        }

    # Remove like
    try:
        await db["posts"].update_one(
            {"_id": ObjectId(post_id)},
            {
                "$pull": {"liked_by": current_user_id},
                "$inc": {"likes_count": -1}
            }
        )
    except:
        await db["posts"].update_one(
            {"_id": post_id},
            {
                "$pull": {"liked_by": current_user_id},
                "$inc": {"likes_count": -1}
            }
        )

    new_likes_count = max(0, post.get("likes_count", 1) - 1)

    print(f"✅ Like removed. Total likes: {new_likes_count}")

    return {
        "message": "Post unliked",
        "liked": False,
        "likes_count": new_likes_count
    }


# ==================== SAVE ENDPOINTS ====================

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


# ==================== THREAD/COMMENT ENDPOINTS ====================

@router.post("/{post_id}/thread")
async def add_to_thread(
    post_id: str,
    data: dict,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Add reply to thread - requires authentication"""
    try:
        print(f"🔵 Adding to thread: {post_id}")
        print(f"🔍 User ID: {current_user_id}")
        print(f"🔍 Content: {data.get('content')}")

        content = data.get("content")
        if not content or not content.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Content is required"
            )

        # Check if post exists
        post = await db["posts"].find_one({"_id": ObjectId(post_id)})
        if not post:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Post not found"
            )

        # Check thread limit
        thread_count = await db["threads"].count_documents({"post_id": ObjectId(post_id)})
        if thread_count >= 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Thread limit reached (maximum 2 replies)"
            )

        # Get user
        user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Create thread reply
        thread_doc = {
            "post_id": ObjectId(post_id),
            "user_id": ObjectId(current_user_id),
            "content": content.strip(),
            "anonymous_name": user.get("anonymous_name", "Anonymous User"),
            "depth": 0,
            "created_at": datetime.utcnow()
        }

        result = await db["threads"].insert_one(thread_doc)

        # Update post thread count
        await db["posts"].update_one(
            {"_id": ObjectId(post_id)},
            {"$inc": {"thread_count": 1}}
        )

        thread_closed = thread_count + 1 >= 2

        print(f"✅ Thread reply added: {result.inserted_id}")

        return {
            "message": "Reply added successfully",
            "thread_id": str(result.inserted_id),
            "thread_closed": thread_closed
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Add thread error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/{post_id}/thread")
async def get_thread(
    post_id: str,
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db = Depends(get_database)
):
    """Get thread replies - guests can view, auth shows ownership"""
    try:
        print(f"🔵 Getting thread for post {post_id}")
        print(f"🔍 User ID: {current_user_id or 'Guest'}")

        post = await db["posts"].find_one({"_id": ObjectId(post_id)})

        if not post:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Post not found"
            )

        # Get all thread replies
        threads = []
        thread_docs = await db["threads"].find(
            {"post_id": ObjectId(post_id)}
        ).sort("created_at", 1).to_list(None)

        for thread in thread_docs:
            threads.append({
                "id": str(thread["_id"]),
                "content": thread["content"],
                "anonymous_name": thread["anonymous_name"],
                "created_at": thread["created_at"].isoformat(),
                "time_ago": get_time_ago(thread["created_at"]),
                "depth": thread.get("depth", 0),
                "is_own_reply": str(thread["user_id"]) == current_user_id if current_user_id else False
            })

        # Check if thread is closed
        is_closed = len(thread_docs) >= 2

        return {
            "threads": threads,
            "is_closed": is_closed,
            "thread_count": len(threads)
        }

    except Exception as e:
        print(f"❌ Get thread error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ==================== VIEW TRACKING ====================

@router.post("/{post_id}/view")
async def view_post(
    post_id: str,
    current_user_id: Optional[str] = Depends(get_optional_user_id),
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


# ==================== TOPICS ====================

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
