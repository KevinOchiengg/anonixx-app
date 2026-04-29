from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from bson import ObjectId
import asyncio
import random
import math
import re
import time as _time
from app.database import get_database
from app.dependencies import get_current_user_id, get_optional_user_id
from app.config import settings

# ── Simple in-process TTL cache for expensive count query ─────
_post_count_cache: dict = {"value": 0, "ts": 0.0}
_POST_COUNT_TTL = 120   # refresh every 2 minutes

router = APIRouter(prefix="/posts", tags=["Posts"])

AVAILABLE_TOPICS = [
    "relationships", "anxiety", "depression", "self_growth",
    "school_career", "family", "lgbtq", "addiction",
    "sleep", "identity", "wins", "friendship",
    "financial", "health", "grief", "loneliness", "trauma",
    # kept for backwards-compat with existing posts
    "general"
]

HEAVY_TOPICS = {"depression", "anxiety", "addiction", "self_harm", "grief", "trauma"}
LIGHT_TOPICS  = {"wins", "self_growth", "friendship"}


# ==================== REQUEST MODELS ====================

class PollOptionInput(BaseModel):
    text: str

class PollInput(BaseModel):
    question: str
    options: List[str]  # 2–4 items

class CreatePostRequest(BaseModel):
    content: str
    is_anonymous: bool = True
    topics: List[str] = []
    images: List[str] = []
    video_url: Optional[str] = None
    audio_url: Optional[str] = None
    poll: Optional[PollInput] = None

class VoteRequest(BaseModel):
    option_index: int

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
    diff = int((now_utc() - dt).total_seconds())
    if diff < 60:       return "just now"
    if diff < 3600:     return f"{diff // 60}m ago"
    if diff < 86400:    return f"{diff // 3600}h ago"
    if diff < 604800:   return f"{diff // 86400}d ago"
    if diff < 2592000:  return f"{diff // 604800}w ago"
    if diff < 31536000: return f"{diff // 2592000} months ago"
    return dt.strftime("%b %Y")


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

    # inspired_drop_count is stored directly on the post document as an
    # all-time counter (incremented when a drop is created, never decremented).
    # No aggregation needed here — the field is read off each post below.

    saved_set = set()
    liked_set = set()
    voted_map: dict[str, int] = {}  # post_id -> option_index

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

        async for v in db["poll_votes"].find({
            "post_id": {"$in": post_ids_str},
            "user_id": current_user_id
        }):
            voted_map[v["post_id"]] = v["option_index"]

    formatted = []
    for post in posts:
        pid = str(post["_id"])
        raw_poll = post.get("poll")
        poll_out = None
        if raw_poll:
            voted_option = voted_map.get(pid)
            options_out = []
            total = raw_poll.get("total_votes", 0)
            for i, opt in enumerate(raw_poll.get("options", [])):
                votes = opt.get("votes", 0)
                options_out.append({
                    "text": opt["text"],
                    "votes": votes if voted_option is not None else None,
                    "percent": round(votes / total * 100) if total > 0 and voted_option is not None else None,
                })
            poll_out = {
                "question": raw_poll["question"],
                "options": options_out,
                "total_votes": total,
                "ends_at": raw_poll.get("ends_at"),
                "voted_option": voted_option,
                "expired": raw_poll.get("ends_at") is not None and raw_poll["ends_at"] < now_utc().isoformat(),
            }
        content = post.get("content") or ""
        created_at = post.get("created_at")
        has_media = bool(post.get("images") or post.get("video_url") or post.get("audio_url"))
        if (not content and not has_media) or not created_at:
            continue
        created_at_iso = created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at)
        formatted.append({
            "id": pid,
            "content": content,
            "is_anonymous": post.get("is_anonymous", True),
            "anonymous_name": post.get("anonymous_name"),
            "topics": post.get("topics", []),
            "images": post.get("images", []),
            "video_url": post.get("video_url"),
            "audio_url": post.get("audio_url"),
            "poll": poll_out,
            "thread_count": thread_counts.get(pid, 0),
            "views_count": post.get("views_count", 0),
            "saves_count": post.get("saves_count", 0),
            "likes_count": post.get("likes_count", 0),
            "is_liked": pid in liked_set,
            "is_saved": pid in saved_set,
            "created_at": created_at_iso,
            "time_ago": get_time_ago(created_at),
            "is_own_post": post.get("user_id") == current_user_id if current_user_id else False,
            # All-time counter — stored on the post doc, never decrements when drops expire
            "inspired_drop_count": post.get("inspired_drop_count", 0),
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


# ==================== FEED SCORING ====================

# Maps vibe tags (user profile) → topic categories (post metadata)
_VIBE_TO_TOPIC: dict[str, str] = {
    "raising kids alone":    "family",
    "starting over":         "self_growth",
    "been through a lot":    "trauma",
    "healing in progress":   "self_growth",
    "carrying a lot":        "anxiety",
    "still standing":        "self_growth",
    "lost right now":        "depression",
    "rebuilding myself":     "self_growth",
    "need someone steady":   "relationships",
    "looking for something real": "relationships",
    "just need to be heard": "loneliness",
    "open to connection":    "relationships",
    "not looking for games": "relationships",
    "no rush":               "relationships",
    "emotionally available": "relationships",
    "blunt but caring":      "relationships",
    "soft but strong":       "self_growth",
    "overthinks everything": "anxiety",
    "here for the long run": "relationships",
    "ready to try again":    "relationships",
}


def _score_post(
    post: dict,
    user_vibe_topics: set[str],
    user_affinities: dict[str, float],
    now: datetime,
) -> float:
    """
    Returns a relevance score for a single post.

    Weights (approximate ceiling):
      vibe overlap   — 40 pts per matching topic  (signal: "this is for someone like me")
      affinity       — up to 30 pts per topic      (signal: "you've engaged with this before")
      recency        — up to 25 pts                (decays linearly over 7 days)
      engagement     — up to 15 pts (log-scaled)   (signal: "others found it worth reacting to")
    """
    score = 0.0
    post_topics = set(post.get("topics", []))

    # 1. Vibe-tag overlap (high weight)
    for topic in user_vibe_topics & post_topics:
        score += 40

    # 2. Behavioural affinity (medium-high weight, capped per topic)
    for topic in post_topics:
        score += min(user_affinities.get(topic, 0) * 2, 30)

    # 3. Recency decay — full score at 0 h, linear to 0 at 168 h (7 days)
    created_at = post.get("created_at")
    if created_at:
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        age_hours = (now - created_at).total_seconds() / 3600
        score += 25 * max(0.0, 1.0 - age_hours / 168)

    # 4. Engagement — log-scaled so viral posts don't dominate
    engagement = (
        post.get("likes_count", 0)
        + post.get("saves_count", 0) * 1.5
        + post.get("thread_count", 0) * 2
    )
    score += min(math.log1p(engagement) * 3, 15)

    return score


def _weighted_shuffle(
    posts: list,
    user_vibe_topics: set[str],
    user_affinities: dict[str, float],
) -> list:
    """
    Score every post, bucket into three tiers, shuffle within each tier,
    then concatenate: high → medium → low.

    Tier thresholds (roughly):
      high   ≥ 50  — strong vibe/affinity match or very recent + engaged
      medium 20–49 — some overlap or moderately recent
      low    < 20  — cold / old / unseen territory (still gets shown for serendipity)
    """
    now = datetime.now(timezone.utc)
    scored = [
        (_score_post(p, user_vibe_topics, user_affinities, now), p)
        for p in posts
    ]

    high   = [p for s, p in scored if s >= 50]
    medium = [p for s, p in scored if 20 <= s < 50]
    low    = [p for s, p in scored if s < 20]

    random.shuffle(high)
    random.shuffle(medium)
    random.shuffle(low)

    return high + medium + low


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

    poll_data = None
    if data.poll:
        options = [o.strip() for o in data.poll.options if o.strip()]
        if len(options) < 2 or len(options) > 4:
            raise HTTPException(status_code=400, detail="Poll requires 2–4 options.")
        if not data.poll.question.strip():
            raise HTTPException(status_code=400, detail="Poll question cannot be empty.")
        poll_data = {
            "question": data.poll.question.strip(),
            "options": [{"text": o, "votes": 0} for o in options],
            "ends_at": (now_utc() + timedelta(hours=24)).isoformat(),
            "total_votes": 0,
        }

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
        "poll": poll_data,
        "thread_count": 0,
        "views_count": 0,
        "saves_count": 0,
        "liked_by": [],
        "likes_count": 0,
        "created_at": now_utc(),
    }

    await db["posts"].insert_one(post_data)
    return {"id": str(post_data["_id"]), "message": "Your words might help someone tonight."}


@router.get("/search")
async def search_posts(
    q:      str = Query(..., min_length=1, description="Search query"),
    filter: str = Query("all", description="all | recent | popular"),
    limit:  int = Query(20, le=50, ge=1),
    skip:   int = Query(0, ge=0),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db = Depends(get_database),
):
    """Full-text search across post content, name, and topics. Case-insensitive."""
    query = q.strip()
    if not query:
        return {"results": [], "total": 0, "query": q}

    # Escape special regex characters so literal text is always matched
    safe_query = re.escape(query)
    rx = {"$regex": safe_query, "$options": "i"}

    base_filter: dict = {
        "$or": [
            {"content":          rx},
            {"anonymous_name":   rx},
            {"topics":           rx},
        ]
    }

    if filter == "recent":
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        base_filter["created_at"] = {"$gte": cutoff}

    sort_key = "likes_count" if filter == "popular" else "created_at"

    total = await db["posts"].count_documents(base_filter)
    raw   = await db["posts"].find(base_filter) \
                .sort(sort_key, -1) \
                .skip(skip) \
                .limit(limit) \
                .to_list(limit)

    results = await batch_format_posts(raw, current_user_id, db)
    return {"results": results, "total": total, "query": query, "filter": filter}


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
    user_vibe_topics: set[str] = set()
    user_affinities: dict[str, float] = {}

    if current_user_id:
        # Run all three user-data lookups concurrently instead of sequentially
        async def _fetch_user_doc():
            return await db["users"].find_one(
                {"_id": ObjectId(current_user_id)}, {"vibe_tags": 1}
            )

        streak_info, user_doc, user_affinities = await asyncio.gather(
            track_streak(current_user_id, db),
            _fetch_user_doc(),
            get_behavioral_interests(current_user_id, db),
        )

        if user_doc:
            for tag in user_doc.get("vibe_tags", []):
                mapped = _VIBE_TO_TOPIC.get(tag)
                if mapped:
                    user_vibe_topics.add(mapped)

    # Cached total-post count (avoids a full-collection scan on every request)
    now_ts = _time.monotonic()
    if now_ts - _post_count_cache["ts"] > _POST_COUNT_TTL:
        _post_count_cache["value"] = await db["posts"].count_documents({})
        _post_count_cache["ts"]    = now_ts
    total_posts = _post_count_cache["value"]

    # Fetch pool — 3× batch size (min 30) gives good shuffle variety at half the old cost
    POOL_SIZE = max(30, posts_to_load * 3)
    pool = await db["posts"].find({}) \
        .sort("created_at", -1) \
        .skip(session_posts) \
        .limit(POOL_SIZE) \
        .to_list(None)

    # Weighted shuffle — relevance-tiered but randomised within each tier
    shuffled = _weighted_shuffle(pool, user_vibe_topics, user_affinities)

    # Slice to the requested batch size, then apply emotion interleaving
    posts = shuffled[:posts_to_load]
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


# ==================== POLL VOTE ====================

@router.post("/{post_id}/vote")
async def vote_on_poll(
    post_id: str,
    data: VoteRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        oid = ObjectId(post_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post ID.")

    post = await db["posts"].find_one({"_id": oid})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")

    poll = post.get("poll")
    if not poll:
        raise HTTPException(status_code=400, detail="This post has no poll.")

    if poll.get("ends_at") and poll["ends_at"] < now_utc().isoformat():
        raise HTTPException(status_code=400, detail="This poll has ended.")

    options = poll.get("options", [])
    if data.option_index < 0 or data.option_index >= len(options):
        raise HTTPException(status_code=400, detail="Invalid option.")

    existing = await db["poll_votes"].find_one({"post_id": post_id, "user_id": current_user_id})
    if existing:
        raise HTTPException(status_code=400, detail="You've already voted on this poll.")

    await db["poll_votes"].insert_one({
        "post_id": post_id,
        "user_id": current_user_id,
        "option_index": data.option_index,
        "created_at": now_utc(),
    })

    await db["posts"].update_one(
        {"_id": oid},
        {
            "$inc": {
                f"poll.options.{data.option_index}.votes": 1,
                "poll.total_votes": 1,
            }
        }
    )

    updated_post = await db["posts"].find_one({"_id": oid})
    updated_poll = updated_post["poll"]
    total = updated_poll["total_votes"]
    options_out = [
        {
            "text": o["text"],
            "votes": o.get("votes", 0),
            "percent": round(o.get("votes", 0) / total * 100) if total > 0 else 0,
        }
        for o in updated_poll["options"]
    ]

    return {
        "voted_option": data.option_index,
        "total_votes": total,
        "options": options_out,
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
    content   = data.get("content", "").strip()
    gif_url   = data.get("gif_url",   "").strip() if data.get("gif_url")   else None
    image_url = data.get("image_url", "").strip() if data.get("image_url") else None
    parent_id = data.get("parent_id")

    # Require at least one of: text, gif, or image
    if not content and not gif_url and not image_url:
        raise HTTPException(status_code=400, detail="Comment must have text, a GIF, or an image.")

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
        "post_id":        ObjectId(post_id),
        "user_id":        ObjectId(current_user_id),
        "content":        content,
        "anonymous_name": user.get("anonymous_name", "Anonymous"),
        "depth":          0,
        "created_at":     now_utc(),
    }
    if gif_url:
        thread_doc["gif_url"] = gif_url
    if image_url:
        thread_doc["image_url"] = image_url
    if parent_id:
        try:
            thread_doc["parent_id"] = ObjectId(parent_id)
        except:
            pass

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

    response = {
        "id":             str(result.inserted_id),
        "content":        content,
        "anonymous_name": user.get("anonymous_name", "Anonymous"),
        "time_ago":       "just now",
        "likes_count":    0,
        "liked_by_me":    False,
        "replies":        [],
        "message":        "Reply added",
    }
    if gif_url:
        response["gif_url"] = gif_url
    if image_url:
        response["image_url"] = image_url
    return response


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
    ).sort("created_at", 1).to_list(None)

    def fmt(t):
        d = {
            "id":             str(t["_id"]),
            "content":        t.get("content", ""),
            "anonymous_name": t.get("anonymous_name", "Anonymous"),
            "created_at":     t["created_at"].isoformat(),
            "time_ago":       get_time_ago(t["created_at"]),
            "depth":          t.get("depth", 0),
            "likes_count":    t.get("likes_count", 0),
            "liked_by_me":    current_user_id in t.get("liked_by", []) if current_user_id else False,
            "is_own_reply":   str(t["user_id"]) == current_user_id if current_user_id else False,
            "replies":        [],
        }
        if t.get("gif_url"):
            d["gif_url"] = t["gif_url"]
        if t.get("image_url"):
            d["image_url"] = t["image_url"]
        return d

    by_id = {str(t["_id"]): fmt(t) for t in thread_docs}
    top   = []
    for t_raw in thread_docs:
        tid = str(t_raw["_id"])
        pid = t_raw.get("parent_id")
        if pid and str(pid) in by_id:
            by_id[str(pid)]["replies"].append(by_id[tid])
        else:
            top.append(by_id[tid])

    top.sort(key=lambda x: x["created_at"], reverse=True)

    return {"threads": top, "thread_count": len(top)}


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


# ==================== EDIT / DELETE ====================

class EditPostRequest(BaseModel):
    content: str


@router.patch("/{post_id}")
async def edit_post(
    post_id: str,
    data: EditPostRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    if not data.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty.")

    try:
        oid = ObjectId(post_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post ID.")

    post = await db["posts"].find_one({"_id": oid})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    if post["user_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="You can only edit your own posts.")

    await db["posts"].update_one(
        {"_id": oid},
        {"$set": {"content": data.content.strip(), "edited_at": now_utc()}}
    )
    return {"message": "Post updated."}


@router.delete("/{post_id}")
async def delete_post(
    post_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        oid = ObjectId(post_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post ID.")

    post = await db["posts"].find_one({"_id": oid})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    if post["user_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="You can only delete your own posts.")

    # Cascade delete
    await db["posts"].delete_one({"_id": oid})
    await db["post_threads"].delete_many({"post_id": post_id})
    await db["threads"].delete_many({"post_id": oid})
    await db["saved_posts"].delete_many({"post_id": post_id})
    await db["post_views"].delete_many({"post_id": oid})

    return {"message": "Post deleted."}


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


# ==================== OPEN / DEEP LINK REDIRECT ====================

@router.get("/{post_id}/open", response_class=HTMLResponse)
async def open_post_redirect(post_id: str):
    """HTTPS redirect page for shared confession posts — makes links tappable in WhatsApp."""
    deep_link = f"anonixx://confession/{post_id}"
    store_ios = "https://apps.apple.com/app/anonixx"

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:type"      content="website">
  <meta property="og:url"       content="{settings.BASE_URL}/api/v1/posts/{post_id}/open">
  <meta property="og:site_name" content="Anonixx">
  <title>Opening Anonixx…</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{
      background: #0b0f18; color: #EAEAF0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 24px;
    }}
    .card {{
      background: #151924; border-radius: 16px;
      border-left: 2px solid #FF634A;
      padding: 32px 28px; max-width: 380px; width: 100%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }}
    .logo {{ color: #FF634A; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 6px; }}
    .tagline {{ color: #9A9AA3; font-size: 13px; margin-bottom: 24px; font-style: italic; }}
    .message {{ color: #EAEAF0; font-size: 15px; line-height: 1.6; margin-bottom: 28px; }}
    .btn {{
      display: block; background: #FF634A; color: #fff;
      padding: 14px 24px; border-radius: 10px; text-align: center;
      text-decoration: none; font-weight: 700; font-size: 15px; margin-bottom: 12px;
    }}
    .btn-ghost {{
      display: block; color: #9A9AA3;
      padding: 12px 24px; border-radius: 10px; text-align: center;
      text-decoration: none; font-size: 13px; border: 1px solid rgba(255,255,255,0.08);
    }}
  </style>
  <script>
    window.location.href = "{deep_link}";
    setTimeout(function() {{
      document.getElementById('content').style.display = 'block';
    }}, 2000);
  </script>
</head>
<body>
  <div class="card" id="content" style="display:none">
    <div class="logo">anonixx</div>
    <div class="tagline">your truth, no name required.</div>
    <div class="message">Someone shared an anonymous confession. Open Anonixx to read it.</div>
    <a class="btn" href="{deep_link}">Open in Anonixx</a>
    <a class="btn-ghost" href="{store_ios}">Get the app →</a>
  </div>
</body>
</html>"""
    return HTMLResponse(content=html)
