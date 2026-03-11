from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from bson import ObjectId
import random
from app.database import get_database
from app.dependencies import get_current_user_id, get_optional_user_id

router = APIRouter(prefix="/posts", tags=["Posts"])

AVAILABLE_TOPICS = [
    "relationships", "anxiety", "depression", "self_growth",
    "school_career", "family", "lgbtq", "addiction",
    "sleep", "identity", "wins", "friendship",
    "financial", "health", "general"
]

HEAVY_TOPICS = {"depression", "anxiety", "addiction", "self_harm"}
LIGHT_TOPICS  = {"wins", "self_growth", "friendship", "general"}


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


class PushTokenRequest(BaseModel):
    token: str


# ==================== HELPERS ====================

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def get_time_ago(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = now_utc() - dt
    if delta.days > 365:
        return f"{delta.days // 365}y ago"
    elif delta.days > 30:
        return f"{delta.days // 30}mo ago"
    elif delta.days > 0:
        return f"{delta.days}d ago"
    elif delta.seconds > 3600:
        return f"{delta.seconds // 3600}h ago"
    elif delta.seconds > 60:
        return f"{delta.seconds // 60}m ago"
    return "just now"


def is_heavy(post) -> bool:
    return bool(HEAVY_TOPICS & set(post.get("topics", [])))


def is_light(post) -> bool:
    return bool(LIGHT_TOPICS & set(post.get("topics", [])))


def interleave_by_emotion(posts: list) -> list:
    heavy = [p for p in posts if is_heavy(p)]
    light  = [p for p in posts if not is_heavy(p)]
    result = []
    heavy_streak = 0

    for post in posts:
        if is_heavy(post):
            if heavy_streak >= 2 and light:
                result.append(light.pop(0))
                heavy_streak = 0
            result.append(post)
            heavy_streak += 1
        else:
            result.append(post)
            heavy_streak = 0

    return result


async def batch_format_posts(posts: list, current_user_id: Optional[str], db) -> list:
    post_ids_obj = [p["_id"] for p in posts]
    post_ids_str = [str(p["_id"]) for p in posts]

    thread_counts = {}
    async for item in db["post_threads"].aggregate([
        {"$match": {"post_id": {"$in": post_ids_str}}},
        {"$group": {"_id": "$post_id", "count": {"$sum": 1}}}
    ]):
        thread_counts[item["_id"]] = item["count"]

    async for item in db["threads"].aggregate([
        {"$match": {"post_id": {"$in": post_ids_obj}}},
        {"$group": {"_id": "$post_id", "count": {"$sum": 1}}}
    ]):
        key = str(item["_id"])
        thread_counts[key] = thread_counts.get(key, 0) + item["count"]

    saved_set = set()
    liked_set = set()

    if current_user_id:
        async for s in db["saved_posts"].find({
            "post_id": {"$in": post_ids_str},
            "user_id": current_user_id
        }):
            saved_set.add(s["post_id"])

        async for p in db["posts"].find(
            {"_id": {"$in": post_ids_obj}, "liked_by": current_user_id},
            {"_id": 1}
        ):
            liked_set.add(str(p["_id"]))

    formatted = []
    for post in posts:
        pid = str(post["_id"])
        formatted.append({
            "id": pid,
            "content": post["content"],
            "is_anonymous": post.get("is_anonymous", True),
            "anonymous_name": post.get("anonymous_name"),
            "topics": post.get("topics", []),
            "images": post.get("images", []),
            "video_url": post.get("video_url"),
            "audio_url": post.get("audio_url"),
            "thread_count": thread_counts.get(pid, 0),
            "views_count": post.get("views_count", 0),
            "saves_count": post.get("saves_count", 0),
            "likes_count": post.get("likes_count", 0),
            "is_liked": pid in liked_set,
            "is_saved": pid in saved_set,
            "created_at": post["created_at"].isoformat(),
            "time_ago": get_time_ago(post["created_at"]),
            "is_own_post": post["user_id"] == current_user_id if current_user_id else False,
            "type": "post"
        })

    return formatted


async def get_behavioral_interests(user_id: str, db) -> dict:
    doc = await db["user_affinities"].find_one({"user_id": user_id})
    if doc:
        return doc.get("affinities", {})
    return {}


async def update_affinity(user_id: str, topics: list, action: str, db):
    weights = {"like": 3, "save": 2, "comment": 1}
    weight = weights.get(action, 1)

    if not topics:
        return

    inc_fields = {f"affinities.{t}": weight for t in topics if t in AVAILABLE_TOPICS}
    if not inc_fields:
        return

    await db["user_affinities"].update_one(
        {"user_id": user_id},
        {"$inc": inc_fields, "$set": {"updated_at": now_utc()}},
        upsert=True
    )


async def track_streak(user_id: str, db) -> dict:
    today = now_utc().date().isoformat()
    doc = await db["user_streaks"].find_one({"user_id": user_id})

    if not doc:
        await db["user_streaks"].insert_one({
            "user_id": user_id,
            "streak": 1,
            "last_visit": today,
            "longest_streak": 1,
            "created_at": now_utc()
        })
        return {"streak": 1, "is_new_day": True, "message": "Welcome to Anonixx 🌱"}

    last_visit = doc.get("last_visit")
    current_streak = doc.get("streak", 1)
    longest = doc.get("longest_streak", 1)

    if last_visit == today:
        return {"streak": current_streak, "is_new_day": False, "message": None}

    yesterday = (now_utc() - timedelta(days=1)).date().isoformat()

    if last_visit == yesterday:
        new_streak = current_streak + 1
        new_longest = max(longest, new_streak)
        streak_messages = {
            2:  "2 days in a row 🔥",
            3:  "3 days straight. You're building something.",
            7:  "One week. This space is yours now 🌟",
            14: "Two weeks of showing up 💪",
            30: "30 days. You belong here 🏆",
        }
        message = streak_messages.get(new_streak, f"{new_streak} days in a row 🔥" if new_streak % 7 == 0 else None)
        await db["user_streaks"].update_one(
            {"user_id": user_id},
            {"$set": {"streak": new_streak, "last_visit": today, "longest_streak": new_longest}}
        )
        return {"streak": new_streak, "is_new_day": True, "message": message}
    else:
        await db["user_streaks"].update_one(
            {"user_id": user_id},
            {"$set": {"streak": 1, "last_visit": today}}
        )
        return {"streak": 1, "is_new_day": True, "message": None}


async def send_push_notification(user_id: str, title: str, body: str, db):
    try:
        doc = await db["push_tokens"].find_one({"user_id": user_id})
        if not doc:
            return
        token = doc.get("token")
        if not token or not token.startswith("ExponentPushToken"):
            return
        import httpx
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://exp.host/--/api/v2/push/send",
                json={"to": token, "title": title, "body": body, "sound": "default", "data": {}},
                headers={"Content-Type": "application/json"},
                timeout=5.0
            )
    except Exception as e:
        print(f"⚠️ Push notification failed: {e}")


# ==================== ENDPOINTS ====================

@router.post("/push-token")
async def register_push_token(
    data: PushTokenRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    await db["push_tokens"].update_one(
        {"user_id": current_user_id},
        {"$set": {"token": data.token, "updated_at": now_utc()}},
        upsert=True
    )
    return {"message": "Push token registered"}


@router.post("")
async def create_post(
    data: CreatePostRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    valid_topics = [t for t in data.topics if t in AVAILABLE_TOPICS] or ["general"]

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
        "created_at": now_utc(),
    }

    await db["posts"].insert_one(post_data)
    return {"id": str(post_data["_id"]), "message": "Your words might help someone tonight."}


@router.get("/calm-feed")
async def get_calm_feed(
    session_posts: int = Query(0, ge=0),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db = Depends(get_database)
):
    current_user_id = None

    if authorization:
        try:
            from jose import jwt
            from app.config import settings
            token = authorization.replace("Bearer ", "")
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            current_user_id = payload.get("sub")
        except Exception as e:
            print(f"⚠️ Guest token: {e}")

    SESSION_LIMIT = 50
    BATCH_SIZE = 10

    if session_posts >= SESSION_LIMIT:
        return {
            "posts": [],
            "message": "session_limit",
            "has_more": False,
            "session_posts": session_posts,
            "is_guest": current_user_id is None
        }

    posts_to_load = min(BATCH_SIZE, SESSION_LIMIT - session_posts)

    streak_info = None
    if current_user_id:
        streak_info = await track_streak(current_user_id, db)

    # Count total posts for accurate has_more
    total_posts = await db["posts"].count_documents({})

    # Reliable pagination with skip/limit, newest first
    posts = await db["posts"].find({}) \
        .sort("created_at", -1) \
        .skip(session_posts) \
        .limit(posts_to_load) \
        .to_list(None)

    posts = interleave_by_emotion(posts)
    formatted_posts = await batch_format_posts(posts, current_user_id, db)

    final_feed = []
    divider_texts = [
        "keep scrolling.",
        "someone typed this at 3am.",
        "real people. real weight.",
        "say something if it hits.",
        "you've thought this too.",
        "nobody said this out loud before.",
        "this is what people actually feel.",
    ]

    heavy_run = 0
    for i, post in enumerate(formatted_posts):
        if HEAVY_TOPICS & set(post.get("topics", [])):
            heavy_run += 1
        else:
            heavy_run = 0

        final_feed.append(post)

        if heavy_run >= 2 and i + 1 < len(formatted_posts):
            final_feed.append({"type": "mood_balancer", "text": "not everything is heavy. but most of it is."})
            heavy_run = 0

        if (i + 1) % 5 == 0 and i + 1 < len(formatted_posts):
            final_feed.append({"type": "divider", "text": random.choice(divider_texts)})

    new_session_posts = session_posts + len(posts)
    has_more = new_session_posts < total_posts and new_session_posts < SESSION_LIMIT

    return {
        "posts": final_feed,
        "has_more": has_more,
        "session_posts": new_session_posts,
        "is_guest": current_user_id is None,
        "streak": streak_info,
    }


# ==================== LIKE ====================

@router.post("/{post_id}/like")
async def like_post(
    post_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        post = await db["posts"].find_one({"_id": ObjectId(post_id)})
    except:
        raise HTTPException(status_code=404, detail="Post not found")

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    liked_by = post.get("liked_by", [])
    if current_user_id in liked_by:
        return {"message": "Already liked", "liked": True, "likes_count": post.get("likes_count", 0)}

    await db["posts"].update_one(
        {"_id": ObjectId(post_id)},
        {"$push": {"liked_by": current_user_id}, "$inc": {"likes_count": 1}}
    )

    await update_affinity(current_user_id, post.get("topics", []), "like", db)

    if post["user_id"] != current_user_id:
        await send_push_notification(
            post["user_id"],
            "Someone felt your words ❤️",
            "A confession you shared just got a like.",
            db
        )

    return {"message": "Post liked", "liked": True, "likes_count": post.get("likes_count", 0) + 1}


@router.delete("/{post_id}/like")
async def unlike_post(
    post_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        post = await db["posts"].find_one({"_id": ObjectId(post_id)})
    except:
        raise HTTPException(status_code=404, detail="Post not found")

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    liked_by = post.get("liked_by", [])
    if current_user_id not in liked_by:
        return {"message": "Not liked", "liked": False, "likes_count": post.get("likes_count", 0)}

    await db["posts"].update_one(
        {"_id": ObjectId(post_id)},
        {"$pull": {"liked_by": current_user_id}, "$inc": {"likes_count": -1}}
    )

    return {"message": "Post unliked", "liked": False, "likes_count": max(0, post.get("likes_count", 1) - 1)}


# ==================== SAVE ====================

@router.post("/{post_id}/save")
async def save_post(
    post_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    existing = await db["saved_posts"].find_one({"post_id": post_id, "user_id": current_user_id})

    if existing:
        await db["saved_posts"].delete_one({"_id": existing["_id"]})
        try:
            await db["posts"].update_one({"_id": ObjectId(post_id)}, {"$inc": {"saves_count": -1}})
        except:
            pass
        return {"message": "Post removed from saved", "saved": False}

    await db["saved_posts"].insert_one({
        "_id": ObjectId(),
        "post_id": post_id,
        "user_id": current_user_id,
        "created_at": now_utc()
    })
    try:
        post = await db["posts"].find_one({"_id": ObjectId(post_id)})
        await db["posts"].update_one({"_id": ObjectId(post_id)}, {"$inc": {"saves_count": 1}})
        if post:
            await update_affinity(current_user_id, post.get("topics", []), "save", db)
    except:
        pass

    return {"message": "Saved to your collection", "saved": True}


@router.get("/saved")
async def get_saved_posts(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    saved_cursor = db["saved_posts"].find({"user_id": current_user_id}).sort("created_at", -1)
    saved_posts = []

    async for saved in saved_cursor:
        try:
            post = await db["posts"].find_one({"_id": ObjectId(saved["post_id"])})
        except:
            continue

        if post:
            saved_at = saved["created_at"]
            if saved_at.tzinfo is None:
                saved_at = saved_at.replace(tzinfo=timezone.utc)
            saved_posts.append({
                "id": str(post["_id"]),
                "content": post["content"],
                "topics": post.get("topics", []),
                "saved_at": saved_at.isoformat(),
                "saved_days_ago": (now_utc() - saved_at).days
            })

    return {"saved_posts": saved_posts, "total": len(saved_posts)}


# ==================== THREADS / COMMENTS ====================

@router.post("/{post_id}/thread")
async def add_to_thread(
    post_id: str,
    data: dict,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    content = data.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Content is required")

    try:
        post = await db["posts"].find_one({"_id": ObjectId(post_id)})
    except:
        raise HTTPException(status_code=404, detail="Post not found")

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    thread_doc = {
        "post_id": ObjectId(post_id),
        "user_id": ObjectId(current_user_id),
        "content": content,
        "anonymous_name": user.get("anonymous_name", "Anonymous"),
        "depth": 0,
        "created_at": now_utc()
    }

    result = await db["threads"].insert_one(thread_doc)
    await db["posts"].update_one({"_id": ObjectId(post_id)}, {"$inc": {"thread_count": 1}})

    await update_affinity(current_user_id, post.get("topics", []), "comment", db)

    if post["user_id"] != current_user_id:
        await send_push_notification(
            post["user_id"],
            "Someone responded to a thought like yours 💬",
            "A confession you shared just got a reply.",
            db
        )

    return {
        "id": str(result.inserted_id),
        "content": content,
        "anonymous_name": user.get("anonymous_name", "Anonymous"),
        "time_ago": "just now",
        "message": "Reply added",
    }


@router.get("/{post_id}/thread")
async def get_thread(
    post_id: str,
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db = Depends(get_database)
):
    try:
        post = await db["posts"].find_one({"_id": ObjectId(post_id)})
    except:
        raise HTTPException(status_code=404, detail="Post not found")

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    thread_docs = await db["threads"].find(
        {"post_id": ObjectId(post_id)}
    ).sort("created_at", -1).to_list(None)

    threads = [{
        "id": str(t["_id"]),
        "content": t["content"],
        "anonymous_name": t["anonymous_name"],
        "created_at": t["created_at"].isoformat(),
        "time_ago": get_time_ago(t["created_at"]),
        "depth": t.get("depth", 0),
        "is_own_reply": str(t["user_id"]) == current_user_id if current_user_id else False
    } for t in thread_docs]

    return {"threads": threads, "thread_count": len(threads)}


# ==================== VIEW TRACKING ====================

@router.post("/{post_id}/view")
async def view_post(
    post_id: str,
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db = Depends(get_database)
):
    try:
        await db["posts"].update_one({"_id": ObjectId(post_id)}, {"$inc": {"views": 1}})
        if current_user_id:
            await db["post_views"].update_one(
                {"post_id": ObjectId(post_id), "user_id": ObjectId(current_user_id)},
                {"$set": {"post_id": ObjectId(post_id), "user_id": ObjectId(current_user_id), "viewed_at": now_utc()}},
                upsert=True
            )
    except Exception as e:
        print(f"⚠️ View tracking skipped: {e}")
    return {"status": "success"}


# ==================== TOPICS ====================

@router.get("/topics")
async def get_available_topics():
    return {
        "topics": [
            {"id": "relationships", "name": "💔 Relationships", "emoji": "💔"},
            {"id": "anxiety",       "name": "😰 Anxiety",       "emoji": "😰"},
            {"id": "depression",    "name": "😢 Depression",    "emoji": "😢"},
            {"id": "self_growth",   "name": "💪 Self-Growth",   "emoji": "💪"},
            {"id": "school_career", "name": "🎓 School/Career", "emoji": "🎓"},
            {"id": "family",        "name": "👨‍👩‍👧‍👦 Family",        "emoji": "👨‍👩‍👧‍👦"},
            {"id": "lgbtq",         "name": "🏳️‍🌈 LGBTQ+",       "emoji": "🏳️‍🌈"},
            {"id": "addiction",     "name": "💊 Addiction",     "emoji": "💊"},
            {"id": "sleep",         "name": "😴 Sleep",         "emoji": "😴"},
            {"id": "identity",      "name": "🎭 Identity",      "emoji": "🎭"},
            {"id": "wins",          "name": "🎉 Wins",          "emoji": "🎉"},
            {"id": "friendship",    "name": "🤝 Friendship",    "emoji": "🤝"},
            {"id": "financial",     "name": "💰 Financial",     "emoji": "💰"},
            {"id": "health",        "name": "🏥 Health",        "emoji": "🏥"},
        ]
    }
