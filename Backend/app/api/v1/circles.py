"""
circles.py — Anonixx Circles

A Circle is an admin-curated content feed with a topic. Circle admins post
multi-media content (free or coin-gated); anyone can browse and comment;
users follow the circles that resonate with them. Regular (non-admin) users
can buy ad slots that promote one of their own main-feed Drops into a
circle's feed.

Roles:
  CREATOR → owns the circle, posts, manages admins, cannot be removed
  ADMIN   → posts content, moderates ads, approved by the creator

Collections:
  circles              — circle entity
  circle_members       — admin role assignments (creator_id lives on the circle doc itself)
  circle_follows       — who follows which circle (free, no coins)
  circle_posts         — admin-authored content, coin-unlockable per item
  circle_post_unlocks  — who has paid to unlock which post
  circle_comments      — user comments on a post (text/photo/GIF/voice note)
  circle_ads           — regular-user-bought ad slots promoting their own Drops
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from bson import ObjectId
import re
from app.core.security import get_current_user
from app.database import get_database
from app.models.user import User
from app.utils.coin_service import debit_coins, credit_coins
from app.utils.contact_filter import contains_contact_info, CONTACT_INFO_ERROR

router = APIRouter(prefix="/circles", tags=["circles"])

ROLE_CREATOR = "creator"
ROLE_ADMIN   = "admin"

# Content-type categories — what a circle mostly posts. Keep in sync with
# Frontend/src/constants/circleCategories.js.
CIRCLE_CATEGORIES = {
    "photos", "videos", "audio", "confessions", "music", "comedy", "art", "spicy",
}

MAX_VOICE_COMMENT_SECONDS = 30   # 30 seconds — hold-to-record, WhatsApp style


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def oid(id_str: str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


def fmt_id(doc: dict) -> str:
    return str(doc["_id"])


async def get_circle_or_404(db, circle_id: str) -> dict:
    circle = await db.circles.find_one({"_id": oid(circle_id), "is_active": True})
    if not circle:
        raise HTTPException(status_code=404, detail="This circle no longer exists.")
    return circle


async def get_member_doc(db, circle_id: str, user_id: str) -> Optional[dict]:
    """Admin-role assignments only — plain following isn't tracked here."""
    return await db.circle_members.find_one({
        "circle_id": circle_id,
        "user_id":   user_id,
    })


async def get_follow_doc(db, circle_id: str, user_id: str) -> Optional[dict]:
    return await db.circle_follows.find_one({
        "circle_id": circle_id,
        "user_id":   user_id,
    })


async def count_circles_with_new_content(db, user_id: str) -> int:
    """How many of this user's followed circles have a post since they last viewed it.

    last_viewed_at defaults to followed_at when unset (never viewed yet).
    """
    follows = await db.circle_follows.find({"user_id": user_id}).to_list(None)
    if not follows:
        return 0

    active_circle_ids = set()
    async for c in db.circles.find(
        {"_id": {"$in": [oid(f["circle_id"]) for f in follows]}, "is_active": True},
        {"_id": 1},
    ):
        active_circle_ids.add(str(c["_id"]))

    thresholds = {
        f["circle_id"]: f.get("last_viewed_at", f["followed_at"])
        for f in follows
        if f["circle_id"] in active_circle_ids
    }
    if not thresholds:
        return 0

    min_cutoff = min(thresholds.values())
    new_posts = await db.circle_posts.find({
        "circle_id": {"$in": list(thresholds.keys())},
        "created_at": {"$gt": min_cutoff},
    }).to_list(None)

    circles_with_new = {
        p["circle_id"] for p in new_posts if p["created_at"] > thresholds[p["circle_id"]]
    }
    return len(circles_with_new)


async def assert_creator(circle: dict, user_id: str):
    if str(circle.get("creator_id", "")) != str(user_id):
        raise HTTPException(status_code=403, detail="Only the creator can do this.")


async def assert_creator_or_admin(db, circle: dict, user_id: str):
    if str(circle.get("creator_id", "")) == str(user_id):
        return
    m = await get_member_doc(db, fmt_id(circle), user_id)
    if not m or m.get("role") != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Only the creator or admins can do this.")


async def assert_regular_user(db, circle: dict, user_id: str):
    """Ad slots are for regular users only — not the circle's own creator/admins."""
    if str(circle.get("creator_id", "")) == str(user_id):
        raise HTTPException(status_code=403, detail="Circle admins can't buy ad slots in their own circle.")
    m = await get_member_doc(db, fmt_id(circle), user_id)
    if m and m.get("role") == ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Circle admins can't buy ad slots in their own circle.")


def member_range_label(count: int) -> str:
    if count < 5:   return "Intimate"
    if count < 20:  return "Small"
    if count < 50:  return "Growing"
    if count < 100: return "Active"
    return "Thriving"


def format_circle(circle: dict, admin_doc: Optional[dict], is_following: bool, user_id: str) -> dict:
    count      = circle.get("follower_count", 0)
    is_creator = str(circle.get("creator_id", "")) == str(user_id)
    role       = ROLE_CREATOR if is_creator else (ROLE_ADMIN if admin_doc else None)
    return {
        "id":             fmt_id(circle),
        "name":           circle["name"],
        "bio":            circle.get("bio", ""),
        "category":       circle.get("category"),
        "aura_color":     circle.get("aura_color", "#FF634A"),
        "avatar_emoji":   circle.get("avatar_emoji", "🎭"),
        "avatar_url":     circle.get("avatar_url"),
        "banner_url":     circle.get("banner_url"),
        "facebook_url":   circle.get("facebook_url"),
        "instagram_url":  circle.get("instagram_url"),
        "snapchat_url":   circle.get("snapchat_url"),
        "follower_count": count,
        "member_range":   member_range_label(count),
        "is_creator":     is_creator,
        "is_admin":       role == ROLE_ADMIN,
        "is_following":   is_following,
        "role":           role,
        "created_at":     circle.get("created_at", _now()).isoformat(),
    }


# ─── Request models ───────────────────────────────────────────────────────────

class CircleCreate(BaseModel):
    name:         str
    bio:          str
    category:     str
    aura_color:   str = "#FF634A"
    avatar_emoji: Optional[str] = "🎭"
    avatar_url:   Optional[str] = None
    banner_url:   Optional[str] = None
    facebook_url:  Optional[str] = None
    instagram_url: Optional[str] = None
    snapchat_url:  Optional[str] = None


# ─── Create circle ────────────────────────────────────────────────────────────

@router.post("/create", status_code=201)
async def create_circle(
    data:         CircleCreate,
    current_user: User = Depends(get_current_user),
):
    # Circles are curated by the Anonixx team (or its AI bot account) only —
    # not user-created. Regular users follow and consume, they don't open one.
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Only Anonixx admins can create circles.")

    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Your circle needs a name.")
    if not data.bio.strip():
        raise HTTPException(status_code=400, detail="Tell people what your circle is about.")
    if not data.category:
        raise HTTPException(status_code=400, detail="Choose a category.")
    if data.category not in CIRCLE_CATEGORIES:
        raise HTTPException(status_code=400, detail="That's not a valid category.")

    db  = await get_database()
    now = _now()

    result = await db.circles.insert_one({
        "name":           data.name.strip(),
        "bio":            data.bio.strip(),
        "category":       data.category,
        "aura_color":     data.aura_color,
        "avatar_emoji":   data.avatar_emoji or "🎭",
        "avatar_url":     data.avatar_url,
        "banner_url":     data.banner_url,
        "facebook_url":   data.facebook_url,
        "instagram_url":  data.instagram_url,
        "snapchat_url":   data.snapchat_url,
        "creator_id":     str(current_user.id),
        "follower_count": 0,
        "is_active":      True,
        "created_at":     now,
        "updated_at":     now,
    })
    circle_id = str(result.inserted_id)

    return {"id": circle_id, "message": "Your circle is alive."}


# ─── Browse circles ───────────────────────────────────────────────────────────

@router.get("/")
async def list_circles(
    skip:     int = Query(0, ge=0),
    limit:    int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    q:        Optional[str] = Query(None, description="Search by name or bio"),
    current_user: User = Depends(get_current_user),
):
    db    = await get_database()
    query: dict = {"is_active": True}
    if category:
        query["category"] = category
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"name": rx}, {"bio": rx}]

    circles = (
        await db.circles.find(query)
        .sort([("follower_count", -1), ("created_at", -1)])
        .skip(skip)
        .limit(limit)
        .to_list(None)
    )

    result = []
    for c in circles:
        cid = fmt_id(c)
        m   = await get_member_doc(db, cid, str(current_user.id))
        f   = await get_follow_doc(db, cid, str(current_user.id))
        result.append(format_circle(c, m, f is not None, str(current_user.id)))

    return {"circles": result, "has_more": len(result) == limit}


# ─── My circles ───────────────────────────────────────────────────────────────

@router.get("/my/created")
async def my_created(current_user: User = Depends(get_current_user)):
    db      = await get_database()
    circles = await db.circles.find({
        "creator_id": str(current_user.id),
        "is_active":  True,
    }).to_list(None)

    result = []
    for c in circles:
        m = await get_member_doc(db, fmt_id(c), str(current_user.id))
        f = await get_follow_doc(db, fmt_id(c), str(current_user.id))
        result.append(format_circle(c, m, f is not None, str(current_user.id)))
    return {"circles": result}


@router.get("/my/following")
async def my_following(current_user: User = Depends(get_current_user)):
    db      = await get_database()
    follows = await db.circle_follows.find({
        "user_id": str(current_user.id),
    }).to_list(None)

    result = []
    for flw in follows:
        c = await db.circles.find_one({"_id": oid(flw["circle_id"]), "is_active": True})
        if c:
            m = await get_member_doc(db, fmt_id(c), str(current_user.id))
            result.append(format_circle(c, m, True, str(current_user.id)))
    return {"circles": result}


# ─── Circle detail ────────────────────────────────────────────────────────────

@router.get("/{circle_id}")
async def get_circle(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    m      = await get_member_doc(db, circle_id, str(current_user.id))
    f      = await get_follow_doc(db, circle_id, str(current_user.id))
    return format_circle(circle, m, f is not None, str(current_user.id))


# ─── Follow / unfollow ────────────────────────────────────────────────────────

@router.post("/{circle_id}/follow")
async def follow_circle(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)

    if str(circle.get("creator_id", "")) == str(current_user.id):
        raise HTTPException(status_code=400, detail="You already own this circle.")

    existing = await get_follow_doc(db, circle_id, str(current_user.id))
    if existing:
        return {"message": "You're already following this circle.", "first_follow": False}

    is_first_ever = await db.circle_follows.count_documents({"user_id": str(current_user.id)}) == 0

    await db.circle_follows.insert_one({
        "circle_id":   circle_id,
        "user_id":     str(current_user.id),
        "followed_at": _now(),
    })
    await db.circles.update_one(
        {"_id": oid(circle_id)},
        {"$inc": {"follower_count": 1}}
    )
    return {"message": "You're following this circle.", "first_follow": is_first_ever}


@router.post("/{circle_id}/unfollow")
async def unfollow_circle(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)

    existing = await get_follow_doc(db, circle_id, str(current_user.id))
    if not existing:
        raise HTTPException(status_code=400, detail="You're not following this circle.")

    await db.circle_follows.delete_one({"_id": existing["_id"]})
    await db.circles.update_one(
        {"_id": oid(circle_id)},
        {"$inc": {"follower_count": -1}}
    )
    return {"message": "You've unfollowed the circle."}


# ─── Admin management ─────────────────────────────────────────────────────────

@router.post("/{circle_id}/admins/{user_id}")
async def elevate_to_admin(
    circle_id:    str,
    user_id:      str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator(circle, str(current_user.id))

    if str(user_id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="You're already the creator.")

    target_user = await db.users.find_one({"_id": oid(user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    await db.circle_members.update_one(
        {"circle_id": circle_id, "user_id": user_id},
        {
            "$set": {"role": ROLE_ADMIN, "elevated_at": _now()},
            "$setOnInsert": {"circle_id": circle_id, "user_id": user_id},
        },
        upsert=True,
    )
    return {"message": "They're now an admin of this circle."}


@router.delete("/{circle_id}/admins/{user_id}")
async def remove_admin(
    circle_id:    str,
    user_id:      str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator(circle, str(current_user.id))

    m = await get_member_doc(db, circle_id, user_id)
    if not m or m.get("role") != ROLE_ADMIN:
        raise HTTPException(status_code=404, detail="Admin not found.")

    await db.circle_members.delete_one({"_id": m["_id"]})
    return {"message": "Admin role removed."}


@router.get("/{circle_id}/admins")
async def list_admins(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db = await get_database()
    await get_circle_or_404(db, circle_id)

    admins = await db.circle_members.find({
        "circle_id": circle_id,
        "role":      ROLE_ADMIN,
    }).to_list(None)

    return {
        "admins": [
            {"user_id": a["user_id"], "elevated_at": a.get("elevated_at")}
            for a in admins
        ]
    }


# ─── Delete circle ────────────────────────────────────────────────────────────

@router.delete("/{circle_id}")
async def delete_circle(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator(circle, str(current_user.id))

    await db.circles.update_one(
        {"_id": oid(circle_id)},
        {"$set": {"is_active": False, "deleted_at": _now()}}
    )
    return {"message": "Your circle has dissolved."}


# ==================== CONTENT FEED ====================
# Posts inside a circle — admin/circle-admin only to create, coin-unlockable
# per item (blurred until paid). Visible to anyone browsing the circle;
# following is a personalization relation, not a paywall.

class CirclePostCreate(BaseModel):
    caption:        str = ""
    images:         List[str] = []
    video_url:      Optional[str] = None
    audio_url:      Optional[str] = None
    audio_duration: Optional[int] = None
    file_url:       Optional[str] = None
    file_name:      Optional[str] = None
    unlock_price:   int = 0   # coins; 0 = free to view


def format_circle_post(post: dict, unlocked: bool) -> dict:
    locked = post.get("unlock_price", 0) > 0 and not unlocked
    return {
        "id":             fmt_id(post),
        "caption":        post.get("caption", ""),
        # Blurred posts never leak media to an unpaid viewer.
        "images":         [] if locked else post.get("images", []),
        "video_url":      None if locked else post.get("video_url"),
        "audio_url":      None if locked else post.get("audio_url"),
        "audio_duration": None if locked else post.get("audio_duration"),
        "file_url":       None if locked else post.get("file_url"),
        "file_name":      None if locked else post.get("file_name"),
        "unlock_price":   post.get("unlock_price", 0),
        "locked":         locked,
        "comment_count":  post.get("comment_count", 0),
        "created_at":     post["created_at"].isoformat(),
    }


@router.post("/{circle_id}/posts", status_code=201)
async def create_circle_post(
    circle_id:    str,
    data:         CirclePostCreate,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator_or_admin(db, circle, str(current_user.id))

    has_media = bool(data.images or data.video_url or data.audio_url or data.file_url)
    if not data.caption.strip() and not has_media:
        raise HTTPException(status_code=400, detail="Add a caption or attach media.")
    if data.unlock_price < 0:
        raise HTTPException(status_code=400, detail="unlock_price can't be negative.")

    now = _now()
    result = await db.circle_posts.insert_one({
        "circle_id":      circle_id,
        "created_by":     str(current_user.id),
        "caption":        data.caption.strip(),
        "images":         data.images,
        "video_url":      data.video_url,
        "audio_url":      data.audio_url,
        "audio_duration": data.audio_duration,
        "file_url":       data.file_url,
        "file_name":      data.file_name,
        "unlock_price":   data.unlock_price,
        "comment_count":  0,
        "created_at":     now,
    })
    return {"id": str(result.inserted_id), "message": "Posted to the circle."}


@router.get("/{circle_id}/posts")
async def list_circle_posts(
    circle_id:    str,
    skip:         int = Query(0, ge=0),
    limit:        int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)

    # Viewing a circle's feed marks it seen — only for followers, since
    # browsing isn't the same as following (see module docstring).
    follow = await get_follow_doc(db, circle_id, str(current_user.id))
    if follow:
        await db.circle_follows.update_one(
            {"_id": follow["_id"]},
            {"$set": {"last_viewed_at": _now()}}
        )

    cursor = db.circle_posts.find({"circle_id": circle_id}).sort("created_at", -1).skip(skip).limit(limit)
    posts  = [p async for p in cursor]

    unlocked_ids = set()
    if posts:
        unlocks = db.circle_post_unlocks.find({
            "circle_id": circle_id,
            "user_id":   str(current_user.id),
            "post_id":   {"$in": [fmt_id(p) for p in posts]},
        })
        unlocked_ids = {u["post_id"] async for u in unlocks}

    return {
        "posts": [format_circle_post(p, fmt_id(p) in unlocked_ids) for p in posts],
        "total": await db.circle_posts.count_documents({"circle_id": circle_id}),
    }


@router.post("/{circle_id}/posts/{post_id}/unlock")
async def unlock_circle_post(
    circle_id:    str,
    post_id:      str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)

    post = await db.circle_posts.find_one({"_id": oid(post_id), "circle_id": circle_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")

    price = post.get("unlock_price", 0)
    if price <= 0:
        return format_circle_post(post, True)

    existing = await db.circle_post_unlocks.find_one({
        "circle_id": circle_id, "post_id": post_id, "user_id": str(current_user.id),
    })
    if existing:
        return format_circle_post(post, True)

    try:
        await debit_coins(
            db=db, user_id=str(current_user.id), amount=price,
            reason="circle_post_unlock", description="Unlocked circle content",
            meta={"circle_id": circle_id, "post_id": post_id},
        )
    except ValueError as e:
        if "Insufficient" in str(e):
            raise HTTPException(status_code=402, detail=f"Not enough coins. You need {price} coins to unlock.")
        raise HTTPException(status_code=404, detail="User not found.")

    await db.circle_post_unlocks.insert_one({
        "circle_id": circle_id,
        "post_id":   post_id,
        "user_id":   str(current_user.id),
        "unlocked_at": _now(),
    })
    return format_circle_post(post, True)


# ==================== COMMENTS ====================
# Anyone can comment on a circle post — text, a photo, a GIF, or a voice
# note capped at 3 minutes (enforced here even though the client also caps
# recording length, since nothing upstream can be trusted to have done that).

class CircleCommentCreate(BaseModel):
    content:        str = ""
    image_url:      Optional[str] = None
    gif_url:        Optional[str] = None
    voice_url:      Optional[str] = None
    voice_duration: Optional[int] = None   # seconds, from the upload response


def format_circle_comment(c: dict, current_user_id: Optional[str] = None) -> dict:
    return {
        "id":             fmt_id(c),
        "user_id":        c["user_id"],
        "anonymous_name": c.get("anonymous_name", "Anonymous"),
        "content":        c.get("content", ""),
        "image_url":      c.get("image_url"),
        "gif_url":        c.get("gif_url"),
        "voice_url":      c.get("voice_url"),
        "voice_duration": c.get("voice_duration"),
        "created_at":     c["created_at"].isoformat(),
        "is_own":         current_user_id is not None and c["user_id"] == current_user_id,
    }


@router.post("/{circle_id}/posts/{post_id}/comments", status_code=201)
async def create_circle_comment(
    circle_id:    str,
    post_id:      str,
    data:         CircleCommentCreate,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    await get_circle_or_404(db, circle_id)

    post = await db.circle_posts.find_one({"_id": oid(post_id), "circle_id": circle_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")

    content = data.content.strip()
    if not content and not data.image_url and not data.gif_url and not data.voice_url:
        raise HTTPException(status_code=400, detail="Comment must have text, a photo, a GIF, or a voice note.")
    if data.voice_url and (data.voice_duration or 0) > MAX_VOICE_COMMENT_SECONDS:
        raise HTTPException(
            status_code=400,
            detail=f"Voice notes can't be longer than {MAX_VOICE_COMMENT_SECONDS} seconds."
        )
    if contains_contact_info(content):
        raise HTTPException(status_code=400, detail=CONTACT_INFO_ERROR)

    now = _now()
    doc = {
        "circle_id":      circle_id,
        "circle_post_id": post_id,
        "user_id":        str(current_user.id),
        "anonymous_name": current_user.anonymous_name or "Anonymous",
        "content":        content,
        "image_url":      data.image_url,
        "gif_url":        data.gif_url,
        "voice_url":      data.voice_url,
        "voice_duration": data.voice_duration,
        "created_at":     now,
    }
    result   = await db.circle_comments.insert_one(doc)
    doc["_id"] = result.inserted_id

    await db.circle_posts.update_one(
        {"_id": oid(post_id)},
        {"$inc": {"comment_count": 1}}
    )
    return format_circle_comment(doc, str(current_user.id))


@router.get("/{circle_id}/posts/{post_id}/comments")
async def list_circle_comments(
    circle_id:    str,
    post_id:      str,
    skip:         int = Query(0, ge=0),
    limit:        int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    db = await get_database()
    await get_circle_or_404(db, circle_id)

    cursor = db.circle_comments.find({
        "circle_id": circle_id, "circle_post_id": post_id,
    }).sort("created_at", 1).skip(skip).limit(limit)

    current_user_id = str(current_user.id)
    return {"comments": [format_circle_comment(c, current_user_id) async for c in cursor]}


# ─── Linkup (unlock a comment author) ────────────────────────────────────────
# Mirrors posts.py's _create_post_connection / _complete_post_unlock so
# app/api/v1/unlock_requests.py can treat a circle comment as just another
# unlock target — same drop_unlocks/drop_connections collections, so
# DropChatScreen opens the resulting chat with no changes on its end.

async def _create_circle_comment_connection(comment_id: str, comment: dict, unlocker_id: str, db) -> str:
    existing_conn = await db["drop_connections"].find_one({
        "drop_id": comment_id, "unlocker_id": unlocker_id,
    })
    if existing_conn:
        await db["drop_unlocks"].update_one(
            {"drop_id": comment_id, "unlocker_id": unlocker_id},
            {"$set": {"connection_id": str(existing_conn["_id"])}},
        )
        return str(existing_conn["_id"])

    unlocker      = await db["users"].find_one({"_id": oid(unlocker_id)})
    unlocker_name = unlocker.get("anonymous_name", "Anonymous") if unlocker else "Anonymous"
    sender_name   = comment.get("anonymous_name") or "Anonymous"

    conn = {
        "_id":                     ObjectId(),
        "drop_id":                 comment_id,
        "sender_id":               comment["user_id"],
        "sender_anonymous_name":   sender_name,
        "unlocker_id":             unlocker_id,
        "unlocker_anonymous_name": unlocker_name,
        "confession":              comment.get("content", ""),
        "message_count":           0,
        "created_at":              _now(),
        "last_message_at":         _now(),
    }
    await db["drop_connections"].insert_one(conn)
    connection_id = str(conn["_id"])

    await db["drop_unlocks"].update_one(
        {"drop_id": comment_id, "unlocker_id": unlocker_id},
        {"$set": {"connection_id": connection_id, "sender_anonymous_name": sender_name}},
    )
    return connection_id


async def _complete_circle_comment_unlock(comment: dict, requester_id: str, db) -> None:
    from app.api.v1.drops import unlock_cost_for, unlock_reward_for, CASH_TO_COIN_RATE, send_push_notification
    comment_id = str(comment["_id"])

    cost = await unlock_cost_for(requester_id, db)
    await debit_coins(
        db=db, user_id=requester_id, amount=cost,
        reason="circle_comment_reveal", description="Unlocked a circle commenter",
        meta={"comment_id": comment_id},
    )

    # Same flat reward Drops/posts pay — a hook, not a cut of what was paid.
    reward = await unlock_reward_for(comment["user_id"], db)
    try:
        await credit_coins(
            db=db, user_id=comment["user_id"], amount=reward,
            reason="drop_unlock_reward",
            description=f"+{reward} coins — someone unlocked your comment",
            meta={"comment_id": comment_id, "unlock_cost_coins": cost, "reward_coins": reward},
        )
    except ValueError:
        pass  # author account missing — don't fail the unlocker's flow over it

    await db["drop_unlocks"].insert_one({
        "_id":                    ObjectId(),
        "drop_id":                comment_id,
        "unlocker_id":            requester_id,
        "sender_id":              comment["user_id"],
        "method":                 "coins",
        "amount":                 cost / CASH_TO_COIN_RATE,
        "sender_anonymous_name":  comment.get("anonymous_name") or "Anonymous",
        "created_at":             _now(),
    })

    await send_push_notification(
        comment["user_id"],
        "Someone unlocked your comment 🔓",
        "Someone just paid to connect with you.",
        db,
    )


# ==================== ADS ====================
# Regular (non-admin) users can buy an ad slot in a circle's feed that
# promotes one of their own Drops — priced by how long it runs. New ads
# land as "pending" and only reach the feed once the circle's creator/admin
# approves them. The duration clock starts at approval, not purchase, so
# review time never eats into what the buyer paid for. Physical cleanup of
# expired ads is a real scheduled job (see app/tasks/circle_ad_cleanup.py),
# not a read-time filter.

AD_COINS_PER_HOUR = 5
MAX_AD_HOURS      = 24 * 14   # 2 weeks

AD_STATUS_PENDING  = "pending"
AD_STATUS_APPROVED = "approved"
AD_STATUS_REJECTED = "rejected"


class CircleAdCreate(BaseModel):
    drop_id:        str    # one of the buyer's own Drops, promoted into the circle feed
    duration_hours: int


async def format_circle_ad(db, ad: dict) -> dict:
    # The ad stores the raw drops._id (same convention as
    # Backend/app/api/v1/ads.py's main-feed ads) — the preview and the
    # tap-through target both resolve directly against the drop itself.
    drop = await db.drops.find_one({"_id": oid(ad["drop_id"])})
    return {
        "id":              fmt_id(ad),
        "drop_id":         ad["drop_id"],
        "preview_caption": (drop.get("confession") or "")[:140] if drop else None,
        "preview_image":   drop.get("media_url") if drop and drop.get("media_type") == "image" else None,
        "status":          ad.get("status", AD_STATUS_APPROVED),
        "duration_hours":  ad.get("duration_hours"),
        "coins_spent":     ad.get("coins_spent", 0),
        "expires_at":      ad["expires_at"].isoformat() if ad.get("expires_at") else None,
        "created_at":      ad["created_at"].isoformat(),
    }


@router.post("/{circle_id}/ads", status_code=201)
async def create_circle_ad(
    circle_id:    str,
    data:         CircleAdCreate,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_regular_user(db, circle, str(current_user.id))

    try:
        drop = await db.drops.find_one({"_id": oid(data.drop_id), "sender_id": str(current_user.id)})
    except Exception:
        drop = None
    if not drop:
        raise HTTPException(status_code=404, detail="Pick one of your own Drops to link this ad to.")
    if data.duration_hours <= 0 or data.duration_hours > MAX_AD_HOURS:
        raise HTTPException(status_code=400, detail=f"Duration must be between 1 and {MAX_AD_HOURS} hours.")

    cost = data.duration_hours * AD_COINS_PER_HOUR
    try:
        await debit_coins(
            db=db, user_id=str(current_user.id), amount=cost,
            reason="circle_ad", description=f"Ad in {circle['name']} for {data.duration_hours}h",
            meta={"circle_id": circle_id, "drop_id": data.drop_id},
        )
    except ValueError as e:
        if "Insufficient" in str(e):
            raise HTTPException(status_code=402, detail=f"Not enough coins. You need {cost} coins for {data.duration_hours}h.")
        raise HTTPException(status_code=404, detail="User not found.")

    now = _now()
    result = await db.circle_ads.insert_one({
        "circle_id":      circle_id,
        "created_by":     str(current_user.id),
        "drop_id":        data.drop_id,
        "status":         AD_STATUS_PENDING,
        "duration_hours": data.duration_hours,
        "coins_spent":    cost,
        "created_at":     now,
        "expires_at":     None,
    })
    return {
        "id": str(result.inserted_id), "coins_spent": cost,
        "message": "Ad submitted — it'll go live once the circle's admin approves it.",
    }


@router.get("/{circle_id}/ads")
async def list_circle_ads(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    """Feed-facing list — approved and still running only."""
    db = await get_database()
    await get_circle_or_404(db, circle_id)

    now = _now()
    cursor = db.circle_ads.find({
        "circle_id": circle_id,
        "status":    AD_STATUS_APPROVED,
        "expires_at": {"$gt": now},
    }).sort("created_at", -1)
    return {"ads": [await format_circle_ad(db, a) async for a in cursor]}


@router.get("/{circle_id}/ads/mine")
async def list_my_circle_ads(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    """Lets a user track the ads they've submitted — pending/approved/rejected."""
    db = await get_database()
    await get_circle_or_404(db, circle_id)

    cursor = db.circle_ads.find(
        {"circle_id": circle_id, "created_by": str(current_user.id)}
    ).sort("created_at", -1)
    return {"ads": [await format_circle_ad(db, a) async for a in cursor]}


@router.get("/{circle_id}/ads/pending")
async def list_pending_circle_ads(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    """Moderation queue — creator/admin only."""
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator_or_admin(db, circle, str(current_user.id))

    cursor = db.circle_ads.find(
        {"circle_id": circle_id, "status": AD_STATUS_PENDING}
    ).sort("created_at", 1)
    return {"ads": [await format_circle_ad(db, a) async for a in cursor]}


@router.post("/{circle_id}/ads/{ad_id}/approve")
async def approve_circle_ad(
    circle_id:    str,
    ad_id:        str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator_or_admin(db, circle, str(current_user.id))

    ad = await db.circle_ads.find_one({"_id": oid(ad_id), "circle_id": circle_id})
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found.")
    if ad.get("status") != AD_STATUS_PENDING:
        raise HTTPException(status_code=400, detail="This ad has already been reviewed.")

    now        = _now()
    expires_at = now + timedelta(hours=ad["duration_hours"])
    await db.circle_ads.update_one(
        {"_id": ad["_id"]},
        {"$set": {"status": AD_STATUS_APPROVED, "approved_at": now, "expires_at": expires_at}},
    )
    return {"message": "Ad approved and live.", "expires_at": expires_at.isoformat()}


@router.post("/{circle_id}/ads/{ad_id}/reject")
async def reject_circle_ad(
    circle_id:    str,
    ad_id:        str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator_or_admin(db, circle, str(current_user.id))

    ad = await db.circle_ads.find_one({"_id": oid(ad_id), "circle_id": circle_id})
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found.")
    if ad.get("status") != AD_STATUS_PENDING:
        raise HTTPException(status_code=400, detail="This ad has already been reviewed.")

    await db.circle_ads.update_one(
        {"_id": ad["_id"]},
        {"$set": {"status": AD_STATUS_REJECTED, "rejected_at": _now()}},
    )
    await credit_coins(
        db=db, user_id=ad["created_by"], amount=ad.get("coins_spent", 0),
        reason="circle_ad_refund", description=f"Ad rejected in {circle['name']} — refunded",
        meta={"circle_id": circle_id, "ad_id": str(ad["_id"])},
    )
    return {"message": "Ad rejected and coins refunded."}
