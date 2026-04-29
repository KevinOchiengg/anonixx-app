from fastapi import APIRouter, Depends, HTTPException, Query, Header
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from bson import ObjectId
import httpx
import random

from app.database import get_database
from app.dependencies import get_current_user_id, get_optional_user_id
from app.config import settings
from app.utils.coin_service import debit_coins
from app.utils.notifications import send_push_notification as _notify

router = APIRouter(prefix="/drops", tags=["Drops"])

DROP_PRICE_USD = 2.00
REVEAL_PRICE_USD = 1.00
GROUP_DROP_PRICE_USD = 3.00
CARD_EXPIRY_HOURS = 24
NIGHT_MODE_START = 22  # 10pm
NIGHT_MODE_END = 3     # 3am

CATEGORIES = [
    # Social
    "love", "fun", "adventure", "friendship", "spicy",
    # Emotional / situational
    "carrying this alone", "starting over", "need stability",
    "open to connection", "just need to be heard",
]

# Categories that surface in the "Open to Connect" dedicated section
CONNECTION_CATEGORIES = {"open to connection", "need stability", "carrying this alone", "starting over"}

# ==================== REQUEST MODELS ====================

VALID_INTENTS = [
    "open to connection",   # ready to meet someone
    "just need to be heard", # wants empathy, not necessarily romance
    "looking for something real", # serious intent
    "late night thoughts",  # reflective, no specific need
]

class CreateDropRequest(BaseModel):
    confession: Optional[str] = None
    category: str = "love"
    is_group: bool = False
    group_size: Optional[int] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None  # "image" | "video" | "voice"
    target_user_id: Optional[str] = None  # private targeted drop
    intent: Optional[str] = None  # what the sender is open to

    # Drop spec upgrade fields
    theme: Optional[str] = None                  # "cinematic-coral", etc.
    mood_tag: Optional[str] = None               # "longing", "restless", …
    tease_mode: Optional[bool] = False           # cut confession mid-thought
    intensity: Optional[str] = None              # "soft" | "heavy" | "devastating"
    recognition_hint: Optional[str] = None       # one word, directed drops only
    publisher_opt_in: Optional[bool] = False     # share anonymously on Anonixx social
    duration_seconds: Optional[float] = None     # voice drops
    waveform_data: Optional[List[float]] = None  # voice drops
    inspired_by_post_id: Optional[str] = None   # feed post that triggered this drop
    # AI refinement — set when the user accepted a suggested refinement
    ai_refined:      Optional[bool] = False
    ai_refined_mode: Optional[str]  = None      # "holding_back" | "distill" | "find_words"


class RefineConfessionRequest(BaseModel):
    confession: str
    mode: str  # "holding_back" | "distill" | "find_words"


class ReactToDropRequest(BaseModel):
    reaction: str  # text reaction per spec section 8 (e.g. "That hit me.")


class MpesaUnlockRequest(BaseModel):
    phone_number: str  # format: 2547XXXXXXXX


class StripeUnlockRequest(BaseModel):
    payment_method_id: str


class MpesaRevealRequest(BaseModel):
    phone_number: str


class StripeRevealRequest(BaseModel):
    payment_method_id: str


class RenewDropRequest(BaseModel):
    drop_id: str


class CardImageRequest(BaseModel):
    card_image_url: str


class PublishDropRequest(BaseModel):
    # Double-consent publish flow — the frontend always sends confirmed=True
    # on the final tap of DropsPublishScreen step 2.
    confirmed: bool = True


class ReportDropRequest(BaseModel):
    reason: str                          # short enum-ish reason
    note: Optional[str] = None           # optional free-text detail


# ==================== SPEC CONSTANTS ====================

# Drop themes — mirrors DROP_THEMES in the frontend (DropCardRenderer.jsx).
# Tier-2 themes are never published and are 18+ gated.
TIER_1_THEMES = {
    "cinematic-coral", "ember-love", "ocean-ache", "twilight-blush",
    "graphite-rose", "paperback-ivory", "midnight-rain", "goldleaf",
}
TIER_2_THEMES = {
    "bruised-plum", "oxblood", "after-dark", "velvet-ash",
    "nocturne-indigo", "smoked-gold",
}
VALID_THEMES = TIER_1_THEMES | TIER_2_THEMES

VALID_MOOD_TAGS = {
    "longing", "restless", "tender", "bitter", "hopeful",
    "ashamed", "dangerous", "quiet", "unsent", "reckless",
}

VALID_INTENSITIES = {"soft", "heavy", "devastating"}

# Section 8 — six text reactions. Anything else is rejected.
VALID_REACTIONS = {
    "That hit me.",
    "I think I know who this is.",
    "This feels like you.",
    "I'm not ready to respond.",
    "Say more.",
    "I needed to read this.",
}

# Section 14 — daily drop cap for free tier. Premium users bypass.
DAILY_DROP_LIMIT_FREE = 3

# Section 19 — valid report reasons.
VALID_REPORT_REASONS = {
    "abuse", "doxxing", "self-harm-concern", "spam", "explicit", "other",
}


# ==================== HELPERS ====================

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_aware(dt: datetime) -> datetime:
    """Make a datetime timezone-aware (UTC) if it isn't already."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def is_night_mode() -> bool:
    hour = now_utc().hour
    return hour >= NIGHT_MODE_START or hour < NIGHT_MODE_END


def get_expiry() -> datetime:
    return now_utc() + timedelta(hours=CARD_EXPIRY_HOURS)


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


def get_time_left(expires_at: datetime) -> str:
    delta = _ensure_aware(expires_at) - now_utc()
    if delta.total_seconds() <= 0:
        return "expired"
    hours = int(delta.total_seconds() // 3600)
    minutes = int((delta.total_seconds() % 3600) // 60)
    if hours > 0:
        return f"{hours}h {minutes}m left"
    return f"{minutes}m left"


async def update_vibe_score(user_id: str, action: str, db):
    """
    Vibe score events:
    - card_created: +2
    - card_unlocked: +5 (someone paid to connect with you)
    - reaction_received: +1
    - reveal_completed: +3
    - streak_day: +2
    """
    weights = {
        "card_created": 2,
        "card_unlocked": 5,
        "reaction_received": 1,
        "reveal_completed": 3,
        "streak_day": 2,
    }
    points = weights.get(action, 0)
    if points == 0:
        return

    await db["vibe_scores"].update_one(
        {"user_id": user_id},
        {
            "$inc": {"score": points, f"events.{action}": 1},
            "$set": {"updated_at": now_utc()}
        },
        upsert=True
    )


async def send_push_notification(user_id: str, title: str, body: str, db):
    try:
        doc = await db["push_tokens"].find_one({"user_id": user_id})
        if not doc:
            return
        token = doc.get("token")
        if not token or not token.startswith("ExponentPushToken"):
            return
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://exp.host/--/api/v2/push/send",
                json={"to": token, "title": title, "body": body, "sound": "default"},
                headers={"Content-Type": "application/json"},
                timeout=5.0
            )
    except Exception as e:
        print(f"⚠️ Push notification failed: {e}")


async def trigger_mpesa_stk(phone: str, amount: float, account_ref: str, description: str) -> dict:
    """
    Trigger M-Pesa STK Push. Returns { success, checkout_request_id, error }
    """
    try:
        import base64
        from datetime import datetime as dt

        timestamp = dt.now().strftime("%Y%m%d%H%M%S")
        shortcode = settings.MPESA_SHORTCODE
        passkey = settings.MPESA_PASSKEY
        password = base64.b64encode(f"{shortcode}{passkey}{timestamp}".encode()).decode()

        # Select correct Safaricom base URL based on environment
        mpesa_base = (
            "https://sandbox.safaricom.co.ke"
            if settings.MPESA_ENVIRONMENT == "sandbox"
            else "https://api.safaricom.co.ke"
        )

        # Get access token
        async with httpx.AsyncClient() as client:
            auth_res = await client.get(
                f"{mpesa_base}/oauth/v1/generate?grant_type=client_credentials",
                auth=(settings.MPESA_CONSUMER_KEY, settings.MPESA_CONSUMER_SECRET),
                timeout=10.0
            )
            token_data   = auth_res.json()
            access_token = token_data.get("access_token")
            if not access_token:
                print(f"⚠️ M-Pesa access token failed | status={auth_res.status_code} body={token_data}")
                return {"success": False, "error": "Failed to get M-Pesa access token"}

            stk_res = await client.post(
                f"{mpesa_base}/mpesa/stkpush/v1/processrequest",
                headers={"Authorization": f"Bearer {access_token}"},
                json={
                    "BusinessShortCode": shortcode,
                    "Password": password,
                    "Timestamp": timestamp,
                    "TransactionType": "CustomerPayBillOnline",
                    "Amount": int(amount * 130),  # USD to KES approx
                    "PartyA": phone,
                    "PartyB": shortcode,
                    "PhoneNumber": phone,
                    "CallBackURL": f"{settings.BASE_URL}/api/v1/drops/mpesa/callback",
                    "AccountReference": account_ref,
                    "TransactionDesc": description,
                },
                timeout=15.0
            )
            data = stk_res.json()
            print(f"📲 STK Push response | status={stk_res.status_code} body={data}")
            if data.get("ResponseCode") == "0":
                return {"success": True, "checkout_request_id": data.get("CheckoutRequestID")}
            safaricom_error = (
                data.get("errorMessage")
                or data.get("ResponseDescription")
                or "STK push failed"
            )
            return {"success": False, "error": safaricom_error, "raw": data}

    except Exception as e:
        print(f"⚠️ M-Pesa STK error: {e}")
        return {"success": False, "error": str(e)}


# ==================== HELPERS ============================

def _media_preview_url(media_url: Optional[str], media_type: Optional[str]) -> Optional[str]:
    """
    Returns a static image URL suitable for og:image.
    - Images: use the URL as-is (already a Cloudinary image URL).
    - Videos: transform the Cloudinary video URL into a JPG thumbnail
      by injecting 'w_1200,h_630,c_fill,so_0' and swapping the extension.
    """
    if not media_url:
        return None
    if media_type == "image":
        return media_url
    if media_type == "video":
        # Cloudinary video URL → poster frame thumbnail
        # e.g. .../video/upload/v123/folder/file.mp4
        #   →  .../video/upload/w_1200,h_630,c_fill,so_0/v123/folder/file.jpg
        import re
        url = re.sub(
            r"(/video/upload/)(v\d+/)?",
            lambda m: f"{m.group(1)}w_1200,h_630,c_fill,so_0/{m.group(2) or ''}",
            media_url,
            count=1,
        )
        # swap extension to .jpg
        url = re.sub(r"\.\w+$", ".jpg", url)
        return url
    return None


# ==================== CREATE DROP ========================

@router.post("")
async def create_drop(
    data: CreateDropRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Create a confession card. Authenticated users only."""
    if data.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Category must be one of: {', '.join(CATEGORIES)}")

    if not data.confession and not data.media_url:
        raise HTTPException(status_code=400, detail="Provide a confession text or attach an image/video")

    if data.confession and len(data.confession.strip()) == 0:
        raise HTTPException(status_code=400, detail="Confession cannot be empty")

    if data.confession and len(data.confession) > 280:
        # Spec section 3 bumped the card cap from 200 → 280 chars.
        raise HTTPException(status_code=400, detail="Confession must be 280 characters or less")

    if data.media_url and data.media_type not in ("image", "video", "voice"):
        raise HTTPException(status_code=400, detail="media_type must be 'image', 'video', or 'voice'")

    if data.is_group and (not data.group_size or data.group_size < 2 or data.group_size > 10):
        raise HTTPException(status_code=400, detail="Group size must be between 2 and 10")

    # Validate target user if specified
    if data.target_user_id:
        if data.target_user_id == current_user_id:
            raise HTTPException(status_code=400, detail="You cannot send a drop to yourself")
        if not ObjectId.is_valid(data.target_user_id):
            raise HTTPException(status_code=400, detail="Invalid target user")
        target_exists = await db["users"].find_one(
            {"_id": ObjectId(data.target_user_id)}, {"_id": 1}
        )
        if not target_exists:
            raise HTTPException(status_code=404, detail="Target user not found")

    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # ── Spec upgrade field validation (sections 11, 13, 16) ─────
    theme = (data.theme or "cinematic-coral").strip()
    if theme not in VALID_THEMES:
        raise HTTPException(status_code=400, detail="Unknown theme")

    mood_tag = (data.mood_tag or "longing").strip().lower()
    if mood_tag not in VALID_MOOD_TAGS:
        raise HTTPException(status_code=400, detail="Unknown mood tag")

    intensity = (data.intensity or "heavy").strip().lower()
    if intensity not in VALID_INTENSITIES:
        raise HTTPException(status_code=400, detail="intensity must be soft, heavy, or devastating")

    # Tier 2 themes (After Dark) are 18+ only and never published on social.
    # Server-side gate: deny-by-default — a user must have an explicit
    # truthy `age_verified` on their user doc. Absence counts as "no".
    # The frontend locks the UI at DropsComposeScreen, this is belt-and-
    # suspenders for API callers that bypass the client.
    is_tier2 = theme in TIER_2_THEMES
    if is_tier2 and not bool(user.get("age_verified")):
        raise HTTPException(
            status_code=403,
            detail="After Dark themes are 18+. Verify your age in Settings to unlock.",
        )

    # One-word recognition hint (section 11)
    recognition_hint = None
    if data.recognition_hint:
        parts = data.recognition_hint.strip().split()
        if parts:
            recognition_hint = parts[0].lower()[:16]

    # Publisher opt-in is forced off for Tier 2 themes regardless of client input.
    publisher_opt_in = bool(data.publisher_opt_in) and not is_tier2

    # ── Daily drop limit (section 14) ───────────────────────────
    is_premium = bool(user.get("is_premium") or user.get("premium_active"))
    if not is_premium:
        start_of_day = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
        drops_today = await db["drops"].count_documents({
            "sender_id": current_user_id,
            "created_at": {"$gte": start_of_day},
        })
        if drops_today >= DAILY_DROP_LIMIT_FREE:
            raise HTTPException(
                status_code=429,
                detail=f"Daily drop limit reached ({DAILY_DROP_LIMIT_FREE}). Come back tomorrow or upgrade to Premium.",
            )

    night = is_night_mode()
    price = GROUP_DROP_PRICE_USD if data.is_group else DROP_PRICE_USD

    drop = {
        "_id": ObjectId(),
        "sender_id": current_user_id,
        "sender_anonymous_name": user.get("anonymous_name", "Anonymous"),
        "confession": data.confession.strip() if data.confession else None,
        "media_url": data.media_url or None,
        "media_type": data.media_type or None,
        "category": data.category,
        "is_group": data.is_group,
        "group_size": data.group_size if data.is_group else None,
        "price": price,
        "expires_at": get_expiry(),
        "is_active": True,
        "is_night_mode": night,
        "unlock_count": 0,
        "admirer_count": 0,
        "reactions": [],
        "card_image_url": _media_preview_url(data.media_url, data.media_type),
        "target_user_id": data.target_user_id or None,
        "intent": data.intent if data.intent in VALID_INTENTS else None,
        "created_at": now_utc(),

        # ── Drop spec upgrade fields ──────────────────────────
        "theme": theme,
        "mood_tag": mood_tag,
        "tease_mode": bool(data.tease_mode),
        "intensity": intensity,
        "recognition_hint": recognition_hint,
        "publisher_opt_in": publisher_opt_in,
        "tier": 2 if is_tier2 else 1,
        "published_at": None,            # set by POST /drops/:id/publish
        "duration_seconds": float(data.duration_seconds) if data.duration_seconds else None,
        "waveform_data": (data.waveform_data or None) if data.media_type == "voice" else None,
        "inspired_by_post_id": data.inspired_by_post_id or None,
        "reaction_counts": {r: 0 for r in VALID_REACTIONS},
        "report_count": 0,
        "moderation_status": "visible",   # "visible" | "flagged" | "hidden"
        # All drops are always public in the marketplace.
        # target_user_id means "also deliver to this inbox" — not "private only".
        "is_marketplace": True,
        # AI refinement metadata — used to surface the ✦ disclosure marker
        "ai_refined":      bool(data.ai_refined),
        "ai_refined_mode": data.ai_refined_mode or None,
    }

    await db["drops"].insert_one(drop)

    # Increment the all-time inspired_drop_count on the originating feed post.
    # This counter never decrements — drops expiring doesn't erase the social proof.
    if data.inspired_by_post_id:
        try:
            from bson import ObjectId as _ObjId
            post = await db["posts"].find_one_and_update(
                {"_id": _ObjId(data.inspired_by_post_id)},
                {"$inc": {"inspired_drop_count": 1}},
                return_document=True,
            )
            # Notify the original post author — but never notify the user about
            # their own action (they're the one resonating).
            if post and post.get("user_id") and post["user_id"] != current_user_id:
                await _notify(
                    user_id     = post["user_id"],
                    template_key= "drop_resonated",
                    db          = db,
                    extra_data  = {
                        "post_id": data.inspired_by_post_id,
                        "drop_id": str(drop["_id"]),
                    },
                )
        except Exception:
            pass  # invalid id or post deleted — don't fail the drop creation

    # Notify target user privately — they see no sender identity
    if data.target_user_id:
        await send_push_notification(
            data.target_user_id,
            "Someone has a confession for you 👀",
            "They said something they couldn't say out loud. Tap to see it.",
            db,
        )

    # Update vibe score
    await update_vibe_score(current_user_id, "card_created", db)

    # Update confession streak
    await _update_confession_streak(current_user_id, db)

    drop_id = str(drop["_id"])

    preview = data.confession.strip() if data.confession else ("📷 image drop" if data.media_type == "image" else "🎥 video drop")
    return {
        "id": drop_id,
        "share_link": f"{settings.BASE_URL}/api/v1/drops/{drop_id}/open",
        "share_text": f"{preview}\n\n— unlock to connect 👀\n{settings.BASE_URL}/api/v1/drops/{drop_id}/open",
        "expires_at": drop["expires_at"].isoformat(),
        "time_left": get_time_left(drop["expires_at"]),
        "is_night_mode": night,
        "price": price,
        "message": "Your card is live. Share it anywhere. 🔥",
    }


async def _update_confession_streak(user_id: str, db):
    today = now_utc().date().isoformat()
    doc = await db["confession_streaks"].find_one({"user_id": user_id})

    if not doc:
        await db["confession_streaks"].insert_one({
            "user_id": user_id,
            "streak": 1,
            "last_confession": today,
            "longest_streak": 1,
            "created_at": now_utc()
        })
        await update_vibe_score(user_id, "streak_day", db)
        return

    last = doc.get("last_confession")
    if last == today:
        return

    yesterday = (now_utc() - timedelta(days=1)).date().isoformat()
    current = doc.get("streak", 1)
    longest = doc.get("longest_streak", 1)

    if last == yesterday:
        new_streak = current + 1
        await db["confession_streaks"].update_one(
            {"user_id": user_id},
            {"$set": {
                "streak": new_streak,
                "last_confession": today,
                "longest_streak": max(longest, new_streak)
            }}
        )
        await update_vibe_score(user_id, "streak_day", db)
    else:
        await db["confession_streaks"].update_one(
            {"user_id": user_id},
            {"$set": {"streak": 1, "last_confession": today}}
        )


# ==================== MARKETPLACE ====================

@router.get("/marketplace")
async def get_marketplace(
    category: Optional[str] = Query(None),
    is_group: Optional[bool] = Query(None),
    night_only: Optional[bool] = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, le=50),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db = Depends(get_database)
):
    """Browse active confession cards."""
    # All drops with is_marketplace: True are public.
    # Drops with target_user_id set are ALSO in the marketplace —
    # target_user_id only means "deliver to this person's inbox too."
    # Legacy drops (before is_marketplace field existed) that have
    # target_user_id: None are also included via the $or.
    query = {
        "is_active": True,
        "expires_at": {"$gt": now_utc()},
        "$or": [
            {"is_marketplace": True},
            {"target_user_id": None},   # backward compat for older drops
        ],
        # Hide flagged/hidden content from the public feed (section 19).
        "moderation_status": {"$nin": ["flagged", "hidden"]},
    }

    if category and category in CATEGORIES:
        query["category"] = category
    if is_group is not None:
        query["is_group"] = is_group
    if night_only:
        query["is_night_mode"] = True

    total = await db["drops"].count_documents(query)

    cursor = db["drops"].find(query).sort("created_at", -1).skip(skip).limit(limit)
    drops = []

    async for drop in cursor:
        drop_id = str(drop["_id"])

        # Check if current user already unlocked
        already_unlocked = False
        if current_user_id:
            unlock = await db["drop_unlocks"].find_one({
                "drop_id": drop_id,
                "unlocker_id": current_user_id
            })
            already_unlocked = unlock is not None

        drops.append({
            "id": drop_id,
            "confession": drop.get("confession"),
            "media_url": drop.get("media_url"),
            "media_type": drop.get("media_type"),
            "card_image_url": drop.get("card_image_url"),
            "category": drop["category"],
            "is_group": drop["is_group"],
            "group_size": drop.get("group_size"),
            "price": drop["price"],
            "is_night_mode": drop.get("is_night_mode", False),
            "unlock_count": drop.get("unlock_count", 0),
            "admirer_count": drop.get("admirer_count", 0),
            "reactions": drop.get("reactions", [])[-5:],
            "time_left": get_time_left(drop["expires_at"]),
            "time_ago": get_time_ago(drop["created_at"]),
            "created_at": drop["created_at"].isoformat() if drop.get("created_at") else None,
            "already_unlocked": already_unlocked,
            "intent": drop.get("intent"),

            # ── Drop spec upgrade surface ────────────────────
            "theme":       drop.get("theme", "cinematic-coral"),
            "mood_tag":    drop.get("mood_tag"),
            "tease_mode":  bool(drop.get("tease_mode")),
            "intensity":   drop.get("intensity"),
            "tier":        drop.get("tier", 1),
            "duration_seconds": drop.get("duration_seconds"),
            "waveform_data":    drop.get("waveform_data"),
            # Inspired-by attribution
            "inspired_by_post_id": drop.get("inspired_by_post_id"),
            # AI refinement disclosure
            "ai_refined":          bool(drop.get("ai_refined", False)),
        })

    return {
        "drops": drops,
        "total": total,
        "has_more": skip + limit < total,
    }


# ==================== AI CONFESSION REFINEMENT ====================

@router.post("/refine")
async def refine_confession_endpoint(
    data: RefineConfessionRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    """
    AI-assisted confession refinement.

    Accepts raw text + an emotional mode; returns a refined version alongside
    the original so the frontend can render a side-by-side comparison.
    The user decides which version to post. If they accept the refinement the
    drop is stamped with ai_refined=True and ai_refined_mode=<mode>.

    Modes:
      holding_back  — removes the filter, surfaces suppressed emotion
      distill       — cuts to the single most powerful feeling
      find_words    — reconstructs with more emotional precision
    """
    from app.utils.ai_refine import refine_confession, MODES

    if data.mode not in MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown mode '{data.mode}'. Choose from: {', '.join(MODES.keys())}",
        )
    if not data.confession.strip():
        raise HTTPException(status_code=400, detail="Confession cannot be empty.")

    refined = await refine_confession(data.confession.strip(), data.mode)
    if refined is None:
        raise HTTPException(
            status_code=503,
            detail="Refinement is unavailable right now. Your words are good as they are.",
        )

    return {
        "original":   data.confession.strip(),
        "refined":    refined,
        "mode":       data.mode,
        "mode_label": MODES[data.mode]["label"],
    }


# ==================== INSPIRATION THREAD ====================

@router.get("/inspired-by/{post_id}")
async def get_inspired_drops(
    post_id: str,
    skip:  int = Query(0, ge=0),
    limit: int = Query(20, le=50),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db = Depends(get_database),
):
    """
    Return all active drops that were inspired by a specific feed post.
    Used by InspirationThreadScreen to render the confession + its reply drops.
    Also returns the originating post for header context.
    """
    # Fetch originating feed post for header context
    origin_post = None
    try:
        from bson import ObjectId as _ObjId
        raw = await db["posts"].find_one({"_id": _ObjId(post_id)})
        if raw:
            origin_post = {
                "id":         post_id,
                "content":    raw.get("content", ""),
                "time_ago":   get_time_ago(raw["created_at"]) if raw.get("created_at") else "",
                "anonymous_name": raw.get("anonymous_name", "Anonymous"),
                "topics":     raw.get("topics", []),
            }
    except Exception:
        pass  # invalid id or post deleted — thread still shows without header

    query = {
        "inspired_by_post_id": post_id,
        "is_active":           True,
        "expires_at":          {"$gt": now_utc()},
        "moderation_status":   {"$nin": ["flagged", "hidden"]},
    }

    total  = await db["drops"].count_documents(query)
    cursor = db["drops"].find(query).sort("created_at", -1).skip(skip).limit(limit)

    drops = []
    async for drop in cursor:
        drop_id = str(drop["_id"])
        already_unlocked = False
        if current_user_id:
            unlock = await db["drop_unlocks"].find_one({
                "drop_id":    drop_id,
                "unlocker_id": current_user_id,
            })
            already_unlocked = unlock is not None

        drops.append({
            "id":              drop_id,
            "confession":      drop.get("confession"),
            "media_url":       drop.get("media_url"),
            "media_type":      drop.get("media_type"),
            "card_image_url":  drop.get("card_image_url"),
            "category":        drop["category"],
            "price":           drop["price"],
            "is_night_mode":   drop.get("is_night_mode", False),
            "unlock_count":    drop.get("unlock_count", 0),
            "reactions":       drop.get("reactions", [])[-3:],
            "time_left":       get_time_left(drop["expires_at"]),
            "time_ago":        get_time_ago(drop["created_at"]),
            "already_unlocked": already_unlocked,
            "theme":           drop.get("theme", "cinematic-coral"),
            "mood_tag":        drop.get("mood_tag"),
            "intensity":       drop.get("intensity"),
            "tier":            drop.get("tier", 1),
        })

    return {
        "origin_post":  origin_post,
        "drops":        drops,
        "total":        total,
        "has_more":     skip + limit < total,
    }


# ==================== OPEN TO CONNECT SECTION ====================

@router.get("/marketplace/open-to-connect")
async def get_open_to_connect(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, le=20),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db = Depends(get_database)
):
    """
    Dedicated section for drops from people open to real connection.
    Surfaces drops with connection-oriented categories or explicit intent.
    """
    query = {
        "is_active": True,
        "expires_at": {"$gt": now_utc()},
        "target_user_id": None,
        "$or": [
            {"category": {"$in": list(CONNECTION_CATEGORIES)}},
            {"intent": {"$in": VALID_INTENTS[:3]}},  # open to connection, need to be heard, looking for something real
        ]
    }
    if current_user_id:
        query["sender_id"] = {"$ne": current_user_id}

    drops = []
    async for drop in db["drops"].find(query).sort("created_at", -1).skip(skip).limit(limit):
        drop_id = str(drop["_id"])
        already_unlocked = False
        if current_user_id:
            unlock = await db["drop_unlocks"].find_one({"drop_id": drop_id, "unlocker_id": current_user_id})
            already_unlocked = unlock is not None
        drops.append({
            "id":             drop_id,
            "confession":     drop.get("confession"),
            "media_url":      drop.get("media_url"),
            "media_type":     drop.get("media_type"),
            "card_image_url": drop.get("card_image_url"),
            "category":       drop["category"],
            "intent":         drop.get("intent"),
            "price":          drop["price"],
            "is_night_mode":  drop.get("is_night_mode", False),
            "unlock_count":   drop.get("unlock_count", 0),
            "reactions":      drop.get("reactions", [])[-5:],
            "time_left":      get_time_left(drop["expires_at"]),
            "time_ago":       get_time_ago(drop["created_at"]),
            "already_unlocked": already_unlocked,
        })

    return {"drops": drops, "has_more": len(drops) == limit}


# ==================== DROP LANDING (deep link) ====================

@router.get("/{drop_id}/landing")
async def get_drop_landing(
    drop_id: str,
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db = Depends(get_database)
):
    """
    Called when someone taps a shared card link.
    Returns the drop info for the landing screen.
    """
    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except:
        raise HTTPException(status_code=404, detail="Drop not found")

    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    is_expired = _ensure_aware(drop["expires_at"]) < now_utc() or not drop.get("is_active", True)

    # Track admirer (anonymous view)
    if current_user_id and current_user_id != drop["sender_id"]:
        existing = await db["admirer_logs"].find_one({
            "drop_id": drop_id,
            "viewer_id": current_user_id
        })
        if not existing:
            await db["admirer_logs"].insert_one({
                "drop_id": drop_id,
                "drop_sender_id": drop["sender_id"],
                "viewer_id": current_user_id,
                "viewed_at": now_utc()
            })
            await db["drops"].update_one(
                {"_id": ObjectId(drop_id)},
                {"$inc": {"admirer_count": 1}}
            )
            # Notify sender
            admirer_count = drop.get("admirer_count", 0) + 1
            if admirer_count in [3, 5, 10, 25, 50]:
                await send_push_notification(
                    drop["sender_id"],
                    f"{admirer_count} people are curious 👀",
                    "Your confession card is getting attention.",
                    db
                )
            await update_vibe_score(drop["sender_id"], "reaction_received", db)

    # Stamp read_at for the targeted recipient the first time they open
    # the landing. Idempotent: $setOnInsert preserves the original timestamp
    # so the unread pulse in DropsInboxScreen.ReceivedDropItem quiets once
    # and stays quiet even if they re-open later.
    if (
        current_user_id
        and drop.get("target_user_id")
        and current_user_id == drop.get("target_user_id")
        and current_user_id != drop["sender_id"]
    ):
        await db["drop_inbox_reads"].update_one(
            {"drop_id": drop_id, "viewer_id": current_user_id},
            {"$setOnInsert": {
                "drop_id":   drop_id,
                "viewer_id": current_user_id,
                "sender_id": drop["sender_id"],
                "read_at":   now_utc(),
            }},
            upsert=True,
        )

    # Check if already unlocked
    already_unlocked = False
    if current_user_id:
        unlock = await db["drop_unlocks"].find_one({
            "drop_id": drop_id,
            "unlocker_id": current_user_id
        })
        already_unlocked = unlock is not None

    # Is the viewer the author of the post that inspired this drop?
    # If so, they get a free unlock — surface this so the frontend can
    # show "Connect free" instead of the payment options.
    is_origin_author = False
    if current_user_id and not already_unlocked and not (current_user_id == drop.get("sender_id")):
        origin_post_id = drop.get("inspired_by_post_id")
        if origin_post_id:
            try:
                origin_post = await db["posts"].find_one({"_id": ObjectId(origin_post_id)})
                if origin_post and origin_post.get("user_id") == current_user_id:
                    is_origin_author = True
            except Exception:
                pass

    # What reaction (if any) has the viewer already sent? (section 8)
    user_reaction = None
    if current_user_id:
        my_react = await db["drop_reactions"].find_one({
            "drop_id": drop_id,
            "reactor_id": current_user_id,
        })
        if my_react and my_react.get("reaction") in VALID_REACTIONS:
            user_reaction = my_react["reaction"]

    # Concurrent readers — "N are looking too" presence (section 12).
    # Count distinct viewers who looked in the last 5 minutes.
    five_min_ago = now_utc() - timedelta(minutes=5)
    readers_now = await db["admirer_logs"].count_documents({
        "drop_id":   drop_id,
        "viewed_at": {"$gte": five_min_ago},
    })
    # Subtract the current viewer from "others looking too" count.
    if current_user_id:
        readers_now = max(0, readers_now - 1)

    return {
        "id":               drop_id,
        "confession":       drop.get("confession"),
        "media_url":        drop.get("media_url"),
        "media_type":       drop.get("media_type"),
        "category":         drop["category"],
        "is_group":         drop["is_group"],
        "group_size":       drop.get("group_size"),
        "price":            drop["price"],
        "is_night_mode":    drop.get("is_night_mode", False),
        "is_expired":       is_expired,
        "time_left":        get_time_left(drop["expires_at"]) if not is_expired else "expired",
        "unlock_count":     drop.get("unlock_count", 0),
        "admirer_count":    drop.get("admirer_count", 0),
        "reactions":        drop.get("reactions", []),
        "reaction_counts":  drop.get("reaction_counts", {r: 0 for r in VALID_REACTIONS}),
        "user_reaction":    user_reaction,
        "readers_now":      readers_now,
        "already_unlocked":    already_unlocked,
        "is_own_drop":         current_user_id == drop["sender_id"] if current_user_id else False,
        "is_origin_author":    is_origin_author,
        "origin_unlock_cost":  ORIGIN_AUTHOR_UNLOCK_COST if is_origin_author else None,
        "inspired_by_post_id": drop.get("inspired_by_post_id"),
        "time_ago":         get_time_ago(drop["created_at"]),
        "created_at":       drop["created_at"].isoformat() if drop.get("created_at") else None,

        # ── Drop spec upgrade surface ────────────────────────
        "theme":             drop.get("theme", "cinematic-coral"),
        "mood_tag":          drop.get("mood_tag"),
        "tease_mode":        bool(drop.get("tease_mode")),
        "intensity":         drop.get("intensity"),
        # Hint is only shown to the target, never to random marketplace viewers.
        "recognition_hint":  drop.get("recognition_hint") if (
            not drop.get("target_user_id")
            or current_user_id == drop.get("target_user_id")
        ) else None,
        "tier":              drop.get("tier", 1),
        "published_at":      drop["published_at"].isoformat() if drop.get("published_at") else None,
        "duration_seconds":  drop.get("duration_seconds"),
        "waveform_data":     drop.get("waveform_data"),
        "moderation_status": drop.get("moderation_status", "visible"),
    }


# ==================== CARD IMAGE ====================

@router.patch("/{drop_id}/card-image")
async def set_card_image(
    drop_id: str,
    data: CardImageRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Attach a Cloudinary card-image URL to an existing drop (owner only)."""
    if not ObjectId.is_valid(drop_id):
        raise HTTPException(status_code=400, detail="Invalid drop ID")
    result = await db["drops"].update_one(
        {"_id": ObjectId(drop_id), "sender_id": current_user_id},
        {"$set": {"card_image_url": data.card_image_url}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Drop not found or not yours")
    return {"ok": True}


# ==================== OPEN / DEEP LINK REDIRECT ====================

@router.get("/{drop_id}/open", response_class=HTMLResponse)
async def open_drop_redirect(drop_id: str, db = Depends(get_database)):
    """
    HTTPS redirect page shared to social platforms.
    When tapped, browser opens and immediately redirects to the deep link.
    Messaging apps (WhatsApp, iMessage, Telegram) render https:// as tappable links.
    """
    deep_link     = f"anonixx://drop/{drop_id}"
    store_ios     = "https://apps.apple.com/app/anonixx"
    store_android = "https://play.google.com/store/apps/details?id=com.anonixx.app"
    # Android Intent URL — prevents "Couldn't reach the server" error in Chrome
    # Falls back to Play Store if app not installed
    from urllib.parse import quote
    fallback      = quote(store_android, safe='')
    android_intent = f"intent://drop/{drop_id}#Intent;scheme=anonixx;package=com.anonixx.app;S.browser_fallback_url={fallback};end"

    # Pull drop data for og tags
    card_image_url = ""
    og_title       = "Someone dropped an anonymous confession"
    og_description = "Open Anonixx to see what they couldn't say out loud."

    if ObjectId.is_valid(drop_id):
        drop_doc = await db["drops"].find_one(
            {"_id": ObjectId(drop_id)},
            {"card_image_url": 1, "confession": 1, "media_type": 1},
        )
        if drop_doc:
            card_image_url = drop_doc.get("card_image_url") or ""
            confession     = drop_doc.get("confession") or ""
            media_type     = drop_doc.get("media_type") or ""
            if confession:
                # truncate to 100 chars for og:description
                snippet        = confession[:100] + ("…" if len(confession) > 100 else "")
                og_description = f'"{snippet}"'
            elif media_type == "image":
                og_description = "An anonymous image drop. Tap to see it."
            elif media_type == "video":
                og_description = "An anonymous video drop. Tap to see it."

    open_url = f"{settings.BASE_URL}/api/v1/drops/{drop_id}/open"

    if card_image_url:
        img_type = "video/mp4" if card_image_url.endswith(".mp4") else "image/jpeg"
        og_image_tags = f"""  <meta property="og:image"        content="{card_image_url}">
  <meta property="og:image:secure_url" content="{card_image_url}">
  <meta property="og:image:type"   content="{img_type}">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:image"       content="{card_image_url}">"""
    else:
        og_image_tags = ""

    # Build confession/media content block
    if confession:
        content_block = f'<p class="confession">{confession}</p>'
    elif card_image_url:
        content_block = f'<img src="{card_image_url}" alt="Drop" class="drop-media">'
    else:
        content_block = '<p class="confession" style="color:rgba(255,255,255,0.2);font-style:italic;">something anonymous…</p>'

    # Short domain for the link row baked into card
    open_domain = open_url.replace("https://", "").replace("http://", "")

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:type"        content="website">
  <meta property="og:url"         content="{open_url}">
  <meta property="og:site_name"   content="Anonixx">
  <meta property="og:title"       content="{og_title}">
  <meta property="og:description" content="{og_description}">
  <meta name="description"        content="{og_description}">
  <meta name="twitter:title"      content="{og_title}">
  <meta name="twitter:description" content="{og_description}">
{og_image_tags}
  <title>{og_title} · Anonixx</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{
      background: #0b0f18; color: #EAEAF0;
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      min-height: 100vh; padding: 24px;
    }}

    /* ── The card — matches TextCard in ShareCardScreen.jsx ── */
    .card {{
      position: relative; overflow: hidden;
      background: linear-gradient(135deg, #12151f 0%, #0c0f18 55%, #111420 100%);
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.04);
      padding: 32px 28px 28px;
      max-width: 420px; width: 100%;
      box-shadow: 0 24px 64px rgba(0,0,0,0.85);
    }}

    /* Ghost " — background texture */
    .ghost-quote {{
      position: absolute; top: -28px; left: 10px;
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 200px; line-height: 200px;
      color: rgba(255,255,255,0.03);
      pointer-events: none; user-select: none;
    }}

    /* "someone said this" label */
    .secret-tag {{
      font-size: 10px; color: rgba(255,99,74,0.60);
      letter-spacing: 2.5px; text-transform: uppercase;
      font-style: italic; margin-bottom: 14px;
      font-family: 'DM Sans', sans-serif;
    }}

    /* Short red accent line */
    .accent-line {{
      width: 36px; height: 1.5px;
      background: #FF634A; opacity: 0.7;
      margin-bottom: 22px;
    }}

    /* Confession text */
    .confession {{
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 22px; font-style: italic;
      color: #E8E8EE; line-height: 1.72;
      letter-spacing: 0.3px; margin-bottom: 28px;
    }}

    /* Media drop */
    .drop-media {{
      width: 100%; border-radius: 10px;
      display: block; margin-bottom: 28px;
    }}

    /* Tension break — right-leaning partial line */
    .tension-line {{
      width: 62%; height: 1px;
      background: rgba(255,255,255,0.08);
      margin-left: auto; margin-bottom: 18px;
    }}

    /* Footer row */
    .footer-row {{
      display: flex; justify-content: space-between;
      align-items: center; margin-bottom: 22px;
    }}
    .anon-tag {{
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 11px; font-style: italic;
      color: rgba(255,255,255,0.38); letter-spacing: 0.5px;
    }}

    /* Brand signature */
    .brand-sig {{
      font-size: 10px; color: rgba(255,255,255,0.20);
      letter-spacing: 5px; font-style: italic;
      text-align: right; margin-bottom: 14px;
      font-family: 'DM Sans', sans-serif;
    }}

    /* Link row baked into card */
    .link-row {{
      display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
    }}
    .link-dot {{
      width: 5px; height: 5px; border-radius: 50%;
      background: rgba(255,99,74,0.55); flex-shrink: 0;
    }}
    .link-text {{
      font-size: 9px; color: rgba(255,99,74,0.65);
      letter-spacing: 0.4px; font-style: italic;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      font-family: 'DM Sans', sans-serif;
    }}

    /* ── Below-card actions ── */
    .actions {{
      max-width: 420px; width: 100%; margin-top: 20px;
    }}
    .status {{
      font-size: 13px; color: rgba(255,255,255,0.35);
      text-align: center; font-style: italic;
      margin-bottom: 0; font-family: 'DM Sans', sans-serif;
    }}
    .btn {{
      display: block; background: #FF634A; color: #fff;
      padding: 15px 24px; border-radius: 12px; text-align: center;
      text-decoration: none; font-weight: 700; font-size: 15px;
      margin-bottom: 10px; letter-spacing: 0.3px; cursor: pointer;
      border: none; width: 100%;
      font-family: 'DM Sans', sans-serif;
      box-shadow: 0 4px 20px rgba(255,99,74,0.35);
    }}
    .btn-ghost {{
      display: block; color: rgba(255,255,255,0.35);
      padding: 12px 24px; border-radius: 12px; text-align: center;
      text-decoration: none; font-size: 13px;
      border: 1px solid rgba(255,255,255,0.08);
      font-family: 'DM Sans', sans-serif;
    }}
    #download-section {{ display: none; }}
  </style>
  <script>
    var isAndroid = /android/i.test(navigator.userAgent);
    var isIOS     = /iphone|ipad|ipod/i.test(navigator.userAgent);

    // Detect if the app opened — browser loses focus when OS switches to the app
    var appOpened = false;
    document.addEventListener('visibilitychange', function() {{
      if (document.hidden) appOpened = true;
    }});
    window.addEventListener('blur', function() {{ appOpened = true; }});
    window.addEventListener('pagehide', function() {{ appOpened = true; }});

    function tryOpenApp() {{
      if (isAndroid) {{
        window.location.href = "{android_intent}";
        setTimeout(function() {{ if (!appOpened) showDownload(); }}, 2500);
      }} else if (isIOS) {{
        window.location.href = "{deep_link}";
        setTimeout(function() {{ if (!appOpened) showDownload(); }}, 1500);
      }} else {{
        showDownload();
      }}
    }}

    function showDownload() {{
      document.getElementById('status').style.display = 'none';
      document.getElementById('download-section').style.display = 'block';
    }}

    window.addEventListener('load', function() {{ setTimeout(tryOpenApp, 400); }});
  </script>
</head>
<body>
  <!-- The card — visually identical to TextCard in ShareCardScreen.jsx -->
  <div class="card">
    <span class="ghost-quote">&ldquo;</span>
    <p class="secret-tag">someone said this</p>
    <div class="accent-line"></div>
    {content_block}
    <div class="tension-line"></div>
    <div class="footer-row">
      <span class="anon-tag">— someone</span>
    </div>
    <p class="brand-sig">anonixx</p>
    <div class="link-row">
      <span class="link-dot"></span>
      <span class="link-text">{open_domain}</span>
    </div>
  </div>

  <!-- Below-card status / download -->
  <div class="actions">
    <p class="status" id="status">Opening Anonixx…</p>
    <div id="download-section">
      <p style="font-size:13px;color:rgba(255,255,255,0.40);text-align:center;margin-bottom:20px;font-style:italic;">
        Get the app to unlock the full drop &amp; connect anonymously
      </p>
      <a class="btn" href="{store_android}">Get it on Android ↓</a>
      <a class="btn-ghost" href="{store_ios}">Get it on iOS</a>
    </div>
  </div>
</body>
</html>"""
    return HTMLResponse(content=html)


# ==================== REACT (pre-payment) ====================

@router.post("/{drop_id}/react")
async def react_to_drop(
    drop_id: str,
    data: ReactToDropRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """
    Send exactly one text-reaction per user per drop (spec section 8).
    If the user already reacted, the new reaction *replaces* the old one —
    the frontend treats it as a toggle.

    Reactions must be one of the six canonical spec lines in VALID_REACTIONS.
    """
    reaction = data.reaction.strip()
    if reaction not in VALID_REACTIONS:
        raise HTTPException(
            status_code=400,
            detail="Reaction must be one of the six spec lines.",
        )

    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Drop not found")

    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    if drop["sender_id"] == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot react to your own drop")

    if _ensure_aware(drop["expires_at"]) < now_utc():
        raise HTTPException(status_code=400, detail="This drop has expired")

    # Atomic upsert: one reaction per user per drop. If one exists we rotate
    # the counts so the old reaction is decremented and the new one bumped.
    existing = await db["drop_reactions"].find_one({
        "drop_id": drop_id,
        "reactor_id": current_user_id,
    })

    prev_reaction = existing.get("reaction") if existing else None
    if prev_reaction == reaction:
        # Idempotent — no-op.
        return {"message": "Already sent", "reaction": reaction}

    await db["drop_reactions"].update_one(
        {"drop_id": drop_id, "reactor_id": current_user_id},
        {
            "$set": {
                "drop_id":     drop_id,
                "reactor_id":  current_user_id,
                "reaction":    reaction,
                "updated_at":  now_utc(),
            },
            "$setOnInsert": {"created_at": now_utc()},
        },
        upsert=True,
    )

    # Keep the per-reaction counts on the drop doc in sync.
    inc = {f"reaction_counts.{reaction}": 1}
    if prev_reaction and prev_reaction in VALID_REACTIONS:
        inc[f"reaction_counts.{prev_reaction}"] = -1
    await db["drops"].update_one({"_id": ObjectId(drop_id)}, {"$inc": inc})

    # Notify sender on milestone counts — only for a fresh first-time reaction.
    if not existing:
        reaction_total = await db["drop_reactions"].count_documents({"drop_id": drop_id})
        if reaction_total in (1, 5, 10, 25, 50):
            await send_push_notification(
                drop["sender_id"],
                "Someone reacted to your confession",
                f'"{reaction}" — {reaction_total} so far. People are feeling it.',
                db,
            )
        await update_vibe_score(drop["sender_id"], "reaction_received", db)

    return {"message": "Reaction sent", "reaction": reaction}


@router.delete("/{drop_id}/react")
async def unreact_to_drop(
    drop_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """
    Remove the current user's reaction on this drop ("take it back" in the UI).
    Silent-idempotent: returns 200 even if no reaction existed.
    """
    try:
        ObjectId(drop_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Drop not found")

    existing = await db["drop_reactions"].find_one_and_delete({
        "drop_id":    drop_id,
        "reactor_id": current_user_id,
    })
    if existing:
        prev = existing.get("reaction")
        if prev in VALID_REACTIONS:
            await db["drops"].update_one(
                {"_id": ObjectId(drop_id)},
                {"$inc": {f"reaction_counts.{prev}": -1}},
            )

    return {"message": "Reaction withdrawn"}


# ==================== UNLOCK — COINS ====================

COINS_UNLOCK_COST         = 30   # coins required to unlock a drop
ORIGIN_AUTHOR_UNLOCK_COST = 10   # discounted rate for the author of the inspiring post

@router.post("/{drop_id}/unlock/coins")
async def unlock_drop_coins(
    drop_id:         str,
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    """
    Unlock a drop by spending coins.
    Atomically debits 30 coins and creates the chat connection.
    """
    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Drop not found.")

    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found.")
    if drop["sender_id"] == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot unlock your own drop.")
    if _ensure_aware(drop["expires_at"]) < now_utc():
        raise HTTPException(status_code=400, detail="This drop has expired.")

    # Idempotent: already unlocked?
    existing = await db["drop_unlocks"].find_one({
        "drop_id": drop_id, "unlocker_id": current_user_id,
    })
    if existing:
        connection_id = existing.get("connection_id") or await _create_drop_connection(drop_id, drop, current_user_id, db)
        return {"already_unlocked": True, "connection_id": connection_id}

    # Origin-author discount — if this drop was inspired by a post that belongs
    # to the current user, they pay a reduced rate (10 coins instead of 30).
    # Their confession sparked the drop, so they get rewarded — but Anonixx
    # still earns from the connection.
    is_origin_author = False
    origin_post_id = drop.get("inspired_by_post_id")
    if origin_post_id:
        try:
            origin_post = await db["posts"].find_one({"_id": ObjectId(origin_post_id)})
            if origin_post and origin_post.get("user_id") == current_user_id:
                is_origin_author = True
        except Exception:
            pass

    cost = ORIGIN_AUTHOR_UNLOCK_COST if is_origin_author else COINS_UNLOCK_COST

    # Debit coins (raises ValueError on insufficient balance)
    try:
        await debit_coins(
            db          = db,
            user_id     = current_user_id,
            amount      = cost,
            reason      = "drop_reveal",
            description = (
                "Unlocked a drop inspired by your confession"
                if is_origin_author else
                "Unlocked a drop confession"
            ),
            meta        = {"drop_id": drop_id, "origin_author": is_origin_author},
        )
    except ValueError as e:
        if "Insufficient" in str(e):
            needed = cost
            raise HTTPException(
                status_code=402,
                detail=f"Not enough coins. You need {needed} coins to unlock."
            )
        raise HTTPException(status_code=404, detail="User not found.")

    # Complete unlock + create chat
    unlock_method = "origin_author_discounted" if is_origin_author else "coins"
    await _complete_unlock(drop_id, current_user_id, drop, unlock_method, db)
    connection_id = await _create_drop_connection(drop_id, drop, current_user_id, db)

    return {
        "unlocked":          True,
        "connection_id":     connection_id,
        "coins_spent":       cost,
        "origin_author":     is_origin_author,
    }


# ==================== UNLOCK — M-PESA ====================

@router.post("/{drop_id}/unlock/mpesa")
async def unlock_drop_mpesa(
    drop_id: str,
    data: MpesaUnlockRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except:
        raise HTTPException(status_code=404, detail="Drop not found")

    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    if drop["sender_id"] == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot unlock your own drop")

    if _ensure_aware(drop["expires_at"]) < now_utc():
        raise HTTPException(status_code=400, detail="This drop has expired")

    # Already unlocked?
    existing = await db["drop_unlocks"].find_one({
        "drop_id": drop_id,
        "unlocker_id": current_user_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already unlocked")

    price = drop.get("price", DROP_PRICE_USD)
    result = await trigger_mpesa_stk(
        phone=data.phone_number,
        amount=price,
        account_ref=f"DROP_{drop_id[:8].upper()}",
        description="Anonixx Drop Unlock"
    )

    if not result["success"]:
        raise HTTPException(status_code=402, detail=result.get("error", "Payment failed"))

    # Store pending unlock
    await db["drop_unlock_pending"].update_one(
        {"drop_id": drop_id, "unlocker_id": current_user_id},
        {"$set": {
            "drop_id": drop_id,
            "unlocker_id": current_user_id,
            "checkout_request_id": result["checkout_request_id"],
            "amount": price,
            "created_at": now_utc()
        }},
        upsert=True
    )

    return {
        "message": "STK push sent. Enter your M-Pesa PIN to unlock.",
        "checkout_request_id": result["checkout_request_id"],
        "amount": price,
    }


# ==================== UNLOCK — STRIPE ====================

@router.post("/{drop_id}/unlock/stripe")
async def unlock_drop_stripe(
    drop_id: str,
    data: StripeUnlockRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except:
        raise HTTPException(status_code=404, detail="Drop not found")

    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    if drop["sender_id"] == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot unlock your own drop")

    if _ensure_aware(drop["expires_at"]) < now_utc():
        raise HTTPException(status_code=400, detail="This drop has expired")

    existing = await db["drop_unlocks"].find_one({
        "drop_id": drop_id,
        "unlocker_id": current_user_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already unlocked")

    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        price = drop.get("price", DROP_PRICE_USD)

        intent = stripe.PaymentIntent.create(
            amount=int(price * 100),
            currency="usd",
            payment_method=data.payment_method_id,
            confirm=True,
            metadata={"drop_id": drop_id, "unlocker_id": current_user_id},
            automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
        )

        if intent.status == "succeeded":
            await _complete_unlock(drop_id, current_user_id, drop, "stripe", db)
            connection_id = await _create_drop_connection(drop_id, drop, current_user_id, db)
            return {
                "message": "Unlocked! You can now chat.",
                "connection_id": connection_id,
                "sender_anonymous_name": drop["sender_anonymous_name"],
            }
        else:
            raise HTTPException(status_code=402, detail="Payment not completed")

    except Exception as e:
        raise HTTPException(status_code=402, detail=str(e))


# ==================== M-PESA CALLBACK ====================

@router.post("/mpesa/callback")
async def mpesa_callback(payload: dict, db = Depends(get_database)):
    """
    Called by Safaricom after STK push completes.
    Completes the unlock if payment succeeded.
    """
    try:
        stk = payload.get("Body", {}).get("stkCallback", {})
        result_code = stk.get("ResultCode")
        checkout_request_id = stk.get("CheckoutRequestID")

        if result_code != 0:
            print(f"⚠️ M-Pesa payment failed: {stk.get('ResultDesc')}")
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        # Find pending unlock
        pending = await db["drop_unlock_pending"].find_one({
            "checkout_request_id": checkout_request_id
        })
        if not pending:
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        drop_id = pending["drop_id"]
        unlocker_id = pending["unlocker_id"]

        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
        if not drop:
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        # Already completed?
        existing = await db["drop_unlocks"].find_one({
            "drop_id": drop_id,
            "unlocker_id": unlocker_id
        })
        if not existing:
            await _complete_unlock(drop_id, unlocker_id, drop, "mpesa", db)
            await _create_drop_connection(drop_id, drop, unlocker_id, db)

        # Clean up pending
        await db["drop_unlock_pending"].delete_one({"checkout_request_id": checkout_request_id})

        # Notify unlocker
        await send_push_notification(
            unlocker_id,
            "Payment confirmed 🔓",
            "You've unlocked the confession. Start chatting now.",
            db
        )

    except Exception as e:
        print(f"⚠️ M-Pesa callback error: {e}")

    return {"ResultCode": 0, "ResultDesc": "Accepted"}


# ==================== POLL UNLOCK STATUS ====================

@router.get("/{drop_id}/unlock/status")
async def poll_unlock_status(
    drop_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Poll after M-Pesa STK push to check if payment completed."""
    unlock = await db["drop_unlocks"].find_one({
        "drop_id": drop_id,
        "unlocker_id": current_user_id
    })

    if unlock:
        return {
            "unlocked": True,
            "connection_id": unlock.get("connection_id"),
            "sender_anonymous_name": unlock.get("sender_anonymous_name"),
        }

    return {"unlocked": False}


async def _complete_unlock(drop_id: str, unlocker_id: str, drop: dict, method: str, db):
    """Shared unlock completion logic."""
    await db["drop_unlocks"].insert_one({
        "_id": ObjectId(),
        "drop_id": drop_id,
        "unlocker_id": unlocker_id,
        "sender_id": drop["sender_id"],
        "method": method,
        "amount": drop.get("price", DROP_PRICE_USD),
        "sender_anonymous_name": drop["sender_anonymous_name"],
        "created_at": now_utc()
    })
    await db["drops"].update_one(
        {"_id": ObjectId(drop_id)},
        {"$inc": {"unlock_count": 1}}
    )
    await update_vibe_score(drop["sender_id"], "card_unlocked", db)

    # Notify sender
    unlock_count = drop.get("unlock_count", 0) + 1
    await send_push_notification(
        drop["sender_id"],
        "Someone unlocked your confession 🔓",
        f"{unlock_count} {'person has' if unlock_count == 1 else 'people have'} connected with you.",
        db
    )


async def _create_drop_connection(drop_id: str, drop: dict, unlocker_id: str, db) -> str:
    """Create a connection (chat) between drop sender and unlocker."""
    # Check if connection already exists
    existing_conn = await db["drop_connections"].find_one({
        "drop_id": drop_id,
        "unlocker_id": unlocker_id
    })
    if existing_conn:
        # Update the unlock record with connection_id
        await db["drop_unlocks"].update_one(
            {"drop_id": drop_id, "unlocker_id": unlocker_id},
            {"$set": {"connection_id": str(existing_conn["_id"])}}
        )
        return str(existing_conn["_id"])

    unlocker = await db["users"].find_one({"_id": ObjectId(unlocker_id)})
    unlocker_name = unlocker.get("anonymous_name", "Anonymous") if unlocker else "Anonymous"

    conn = {
        "_id": ObjectId(),
        "drop_id": drop_id,
        "sender_id": drop["sender_id"],
        "sender_anonymous_name": drop["sender_anonymous_name"],
        "unlocker_id": unlocker_id,
        "unlocker_anonymous_name": unlocker_name,
        "confession": drop["confession"],
        "message_count": 0,
        "is_revealed_sender": False,
        "is_revealed_unlocker": False,
        "created_at": now_utc(),
        "last_message_at": now_utc(),
    }
    await db["drop_connections"].insert_one(conn)
    connection_id = str(conn["_id"])

    # Update unlock record
    await db["drop_unlocks"].update_one(
        {"drop_id": drop_id, "unlocker_id": unlocker_id},
        {"$set": {"connection_id": connection_id, "sender_anonymous_name": drop["sender_anonymous_name"]}}
    )

    return connection_id


# ==================== DROP CHAT ====================

@router.get("/connections")
async def get_drop_connections(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get all active drop chats for current user."""
    query = {
        "$or": [
            {"sender_id": current_user_id},
            {"unlocker_id": current_user_id}
        ]
    }
    connections = []
    async for conn in db["drop_connections"].find(query).sort("last_message_at", -1):
        is_sender = conn["sender_id"] == current_user_id
        other_name = conn["unlocker_anonymous_name"] if is_sender else conn["sender_anonymous_name"]

        last_msg = await db["drop_messages"].find_one(
            {"connection_id": str(conn["_id"])},
            sort=[("created_at", -1)]
        )

        connections.append({
            "id": str(conn["_id"]),
            "drop_id": conn["drop_id"],
            "confession": conn["confession"],
            "other_anonymous_name": other_name,
            "is_sender": is_sender,
            "message_count": conn.get("message_count", 0),
            "last_message": last_msg["content"] if last_msg else None,
            "last_message_at": conn["last_message_at"].isoformat(),
            "is_revealed": conn["is_revealed_sender"] if is_sender else conn["is_revealed_unlocker"],
            "other_revealed": conn["is_revealed_unlocker"] if is_sender else conn["is_revealed_sender"],
        })

    return {"connections": connections}


@router.get("/connections/{connection_id}/messages")
async def get_drop_messages(
    connection_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        conn = await db["drop_connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        raise HTTPException(status_code=404, detail="Connection not found")

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if current_user_id not in [conn["sender_id"], conn["unlocker_id"]]:
        raise HTTPException(status_code=403, detail="Access denied")

    messages = []
    async for msg in db["drop_messages"].find(
        {"connection_id": connection_id}
    ).sort("created_at", 1):
        messages.append({
            "id": str(msg["_id"]),
            "content": msg["content"],
            "sender_id": msg["sender_id"],
            "is_own": msg["sender_id"] == current_user_id,
            "time_ago": get_time_ago(msg["created_at"]),
            "created_at": msg["created_at"].isoformat(),
        })

    is_sender = conn["sender_id"] == current_user_id
    return {
        "messages": messages,
        "connection": {
            "id": connection_id,
            "confession": conn["confession"],
            "other_anonymous_name": conn["unlocker_anonymous_name"] if is_sender else conn["sender_anonymous_name"],
            "is_revealed": conn["is_revealed_sender"] if is_sender else conn["is_revealed_unlocker"],
            "other_revealed": conn["is_revealed_unlocker"] if is_sender else conn["is_revealed_sender"],
        }
    }


@router.post("/connections/{connection_id}/message")
async def send_drop_message(
    connection_id: str,
    data: dict,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    content = data.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    try:
        conn = await db["drop_connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        raise HTTPException(status_code=404, detail="Connection not found")

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if current_user_id not in [conn["sender_id"], conn["unlocker_id"]]:
        raise HTTPException(status_code=403, detail="Access denied")

    msg = {
        "_id": ObjectId(),
        "connection_id": connection_id,
        "sender_id": current_user_id,
        "content": content,
        "created_at": now_utc()
    }
    await db["drop_messages"].insert_one(msg)
    await db["drop_connections"].update_one(
        {"_id": ObjectId(connection_id)},
        {"$inc": {"message_count": 1}, "$set": {"last_message_at": now_utc()}}
    )

    # Notify other party
    other_id = conn["unlocker_id"] if current_user_id == conn["sender_id"] else conn["sender_id"]
    sender_name = conn["sender_anonymous_name"] if current_user_id == conn["sender_id"] else conn["unlocker_anonymous_name"]

    await send_push_notification(
        other_id,
        f"{sender_name} sent a message 💬",
        content[:60] + ("..." if len(content) > 60 else ""),
        db
    )

    return {
        "id": str(msg["_id"]),
        "content": content,
        "time_ago": "just now",
        "created_at": msg["created_at"].isoformat(),
    }


# ==================== REVEAL ====================

@router.post("/connections/{connection_id}/reveal/mpesa")
async def reveal_mpesa(
    connection_id: str,
    data: MpesaRevealRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        conn = await db["drop_connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        raise HTTPException(status_code=404, detail="Connection not found")

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if current_user_id not in [conn["sender_id"], conn["unlocker_id"]]:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await trigger_mpesa_stk(
        phone=data.phone_number,
        amount=REVEAL_PRICE_USD,
        account_ref=f"REVEAL_{connection_id[:8].upper()}",
        description="Anonixx Identity Reveal"
    )

    if not result["success"]:
        raise HTTPException(status_code=402, detail=result.get("error", "Payment failed"))

    await db["drop_reveal_pending"].update_one(
        {"connection_id": connection_id, "requester_id": current_user_id},
        {"$set": {
            "connection_id": connection_id,
            "requester_id": current_user_id,
            "checkout_request_id": result["checkout_request_id"],
            "created_at": now_utc()
        }},
        upsert=True
    )

    return {
        "message": "STK push sent. Enter your M-Pesa PIN to reveal.",
        "checkout_request_id": result["checkout_request_id"],
    }


@router.post("/connections/{connection_id}/reveal/stripe")
async def reveal_stripe(
    connection_id: str,
    data: StripeRevealRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        conn = await db["drop_connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        raise HTTPException(status_code=404, detail="Connection not found")

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if current_user_id not in [conn["sender_id"], conn["unlocker_id"]]:
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY

        intent = stripe.PaymentIntent.create(
            amount=int(REVEAL_PRICE_USD * 100),
            currency="usd",
            payment_method=data.payment_method_id,
            confirm=True,
            metadata={"connection_id": connection_id, "requester_id": current_user_id},
            automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
        )

        if intent.status == "succeeded":
            reveal_data = await _complete_reveal(connection_id, current_user_id, conn, db)
            return reveal_data
        else:
            raise HTTPException(status_code=402, detail="Payment not completed")

    except Exception as e:
        raise HTTPException(status_code=402, detail=str(e))


@router.post("/mpesa/reveal/callback")
async def mpesa_reveal_callback(payload: dict, db = Depends(get_database)):
    try:
        stk = payload.get("Body", {}).get("stkCallback", {})
        result_code = stk.get("ResultCode")
        checkout_request_id = stk.get("CheckoutRequestID")

        if result_code != 0:
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        pending = await db["drop_reveal_pending"].find_one({
            "checkout_request_id": checkout_request_id
        })
        if not pending:
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        connection_id = pending["connection_id"]
        requester_id = pending["requester_id"]

        conn = await db["drop_connections"].find_one({"_id": ObjectId(connection_id)})
        if conn:
            reveal_data = await _complete_reveal(connection_id, requester_id, conn, db)
            await send_push_notification(
                requester_id,
                "Identity revealed 🎭",
                f"You now know who {reveal_data.get('revealed_name', 'they')} is.",
                db
            )

        await db["drop_reveal_pending"].delete_one({"checkout_request_id": checkout_request_id})

    except Exception as e:
        print(f"⚠️ Reveal callback error: {e}")

    return {"ResultCode": 0, "ResultDesc": "Accepted"}


async def _complete_reveal(connection_id: str, requester_id: str, conn: dict, db) -> dict:
    """Complete a reveal — returns the other person's anonymous name and real first name."""
    is_sender = conn["sender_id"] == requester_id
    other_id = conn["unlocker_id"] if is_sender else conn["sender_id"]

    other_user = await db["users"].find_one({"_id": ObjectId(other_id)})
    anonymous_name = conn["unlocker_anonymous_name"] if is_sender else conn["sender_anonymous_name"]
    real_name = other_user.get("name", "").split()[0] if other_user else "Unknown"

    # Mark revealed
    field = "is_revealed_sender" if is_sender else "is_revealed_unlocker"
    await db["drop_connections"].update_one(
        {"_id": ObjectId(connection_id)},
        {"$set": {field: True}}
    )

    await db["drop_reveals"].insert_one({
        "_id": ObjectId(),
        "connection_id": connection_id,
        "requester_id": requester_id,
        "revealed_user_id": other_id,
        "created_at": now_utc()
    })

    await update_vibe_score(other_id, "reveal_completed", db)

    # Notify the person being revealed
    await send_push_notification(
        other_id,
        "Someone revealed your identity 🎭",
        "They now know your name. The mystery is gone — or just beginning.",
        db
    )

    return {
        "revealed": True,
        "anonymous_name": anonymous_name,
        "revealed_name": real_name,
        "message": f"Mystery solved. They are {real_name}.",
    }


@router.get("/connections/{connection_id}/reveal/status")
async def poll_reveal_status(
    connection_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        conn = await db["drop_connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        raise HTTPException(status_code=404, detail="Not found")

    if not conn:
        raise HTTPException(status_code=404, detail="Not found")

    is_sender = conn["sender_id"] == current_user_id
    is_revealed = conn["is_revealed_sender"] if is_sender else conn["is_revealed_unlocker"]

    if not is_revealed:
        return {"revealed": False}

    other_id = conn["unlocker_id"] if is_sender else conn["sender_id"]
    other_user = await db["users"].find_one({"_id": ObjectId(other_id)})
    real_name = other_user.get("name", "").split()[0] if other_user else "Unknown"
    anonymous_name = conn["unlocker_anonymous_name"] if is_sender else conn["sender_anonymous_name"]

    return {
        "revealed": True,
        "anonymous_name": anonymous_name,
        "revealed_name": real_name,
    }


# ==================== RENEW DROP ====================

@router.post("/{drop_id}/renew")
async def renew_drop(
    drop_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except:
        raise HTTPException(status_code=404, detail="Drop not found")

    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    if drop["sender_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not your drop")

    new_expiry = get_expiry()
    await db["drops"].update_one(
        {"_id": ObjectId(drop_id)},
        {"$set": {
            "expires_at": new_expiry,
            "is_active": True,
            "is_night_mode": is_night_mode()
        }}
    )

    return {
        "message": "Drop renewed for another 24 hours 🔥",
        "expires_at": new_expiry.isoformat(),
        "time_left": get_time_left(new_expiry),
    }


# ==================== INBOX ====================

@router.get("/inbox")
async def get_drops_inbox(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Your received unlocks + active cards summary."""
    # Active drops you sent
    active_drops = []
    async for drop in db["drops"].find({
        "sender_id": current_user_id,
        "is_active": True,
        "expires_at": {"$gt": now_utc()}
    }).sort("created_at", -1):
        drop_id = str(drop["_id"])
        # Aggregate reaction counts for sender's own dashboard.
        r_counts = drop.get("reaction_counts") or {r: 0 for r in VALID_REACTIONS}
        active_drops.append({
            "id":              drop_id,
            "confession":      drop.get("confession"),
            "media_url":       drop.get("media_url"),
            "media_type":      drop.get("media_type"),
            "card_image_url":  drop.get("card_image_url"),
            "category":        drop["category"],
            "unlock_count":    drop.get("unlock_count", 0),
            "admirer_count":   drop.get("admirer_count", 0),
            "reactions":       drop.get("reactions", []),
            "reaction_counts": r_counts,
            "time_left":       get_time_left(drop["expires_at"]),
            "is_night_mode":   drop.get("is_night_mode", False),
            "share_link":      f"{settings.BASE_URL}/api/v1/drops/{drop_id}/open",
            "created_at":      drop["created_at"].isoformat() if drop.get("created_at") else None,

            # ── Drop spec upgrade surface ────────────────────
            "theme":            drop.get("theme", "cinematic-coral"),
            "mood_tag":         drop.get("mood_tag"),
            "tease_mode":       bool(drop.get("tease_mode")),
            "intensity":        drop.get("intensity"),
            "recognition_hint": drop.get("recognition_hint"),
            "tier":             drop.get("tier", 1),
            "published_at":     drop["published_at"].isoformat() if drop.get("published_at") else None,
            "publisher_opt_in": bool(drop.get("publisher_opt_in")),
            "duration_seconds": drop.get("duration_seconds"),
            "waveform_data":    drop.get("waveform_data"),
            "moderation_status": drop.get("moderation_status", "visible"),
        })

    # Connections (chats)
    connections = []
    async for conn in db["drop_connections"].find({
        "$or": [{"sender_id": current_user_id}, {"unlocker_id": current_user_id}]
    }).sort("last_message_at", -1).limit(20):
        is_sender = conn["sender_id"] == current_user_id
        other_name = conn["unlocker_anonymous_name"] if is_sender else conn["sender_anonymous_name"]
        last_msg = await db["drop_messages"].find_one(
            {"connection_id": str(conn["_id"])},
            sort=[("created_at", -1)]
        )
        connections.append({
            "id": str(conn["_id"]),
            "confession": conn["confession"],
            "other_anonymous_name": other_name,
            "is_sender": is_sender,
            "last_message": last_msg["content"] if last_msg else None,
            "message_count": conn.get("message_count", 0),
            "is_revealed": conn["is_revealed_sender"] if is_sender else conn["is_revealed_unlocker"],
            "other_revealed": conn["is_revealed_unlocker"] if is_sender else conn["is_revealed_sender"],
        })

    return {
        "active_drops": active_drops,
        "connections": connections,
    }


# ==================== RECEIVED (targeted drops) ====================

@router.get("/received")
async def get_received_drops(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """
    Drops that were anonymously targeted at the current user.
    Sender identity is never exposed — not even after unlock.
    """
    received = []
    five_min_ago = now_utc() - timedelta(minutes=5)

    async for drop in db["drops"].find({
        "target_user_id": current_user_id,
        "is_active": True,
        "moderation_status": {"$nin": ["hidden"]},
    }).sort("created_at", -1).limit(50):
        drop_id = str(drop["_id"])

        already_unlocked = await db["drop_connections"].find_one({
            "drop_id":     drop_id,
            "unlocker_id": current_user_id,
        })

        # Unread tracking: we stamp `read_at` the first time the recipient
        # opens the landing screen. `/received` itself never consumes the
        # unread state — that's what drives the pulse in the inbox.
        inbox_read = await db["drop_inbox_reads"].find_one({
            "drop_id":   drop_id,
            "viewer_id": current_user_id,
        })
        read_at = inbox_read.get("read_at") if inbox_read else None

        # Presence: other people looking concurrently (last 5 min).
        readers_now = await db["admirer_logs"].count_documents({
            "drop_id":   drop_id,
            "viewed_at": {"$gte": five_min_ago},
            "viewer_id": {"$ne": current_user_id},
        })

        received.append({
            "id":             drop_id,
            "confession":     drop.get("confession"),
            "media_url":      drop.get("media_url"),
            "media_type":     drop.get("media_type"),
            "card_image_url": drop.get("card_image_url"),
            "category":       drop["category"],
            "is_night_mode":  drop.get("is_night_mode", False),
            "is_expired":     _ensure_aware(drop["expires_at"]) < now_utc(),
            "time_left":      get_time_left(drop["expires_at"]),
            "unlock_count":   drop.get("unlock_count", 0),
            "reactions":      drop.get("reactions", []),
            "already_unlocked": bool(already_unlocked),
            "price":          drop.get("price", 2),
            "created_at":     drop["created_at"].isoformat() if drop.get("created_at") else None,
            "sent_at":        drop["created_at"].isoformat() if drop.get("created_at") else None,
            "read_at":        read_at.isoformat() if read_at else None,
            "readers_now":    readers_now,

            # ── Drop spec upgrade surface ────────────────────
            "theme":            drop.get("theme", "cinematic-coral"),
            "mood_tag":         drop.get("mood_tag"),
            "tease_mode":       bool(drop.get("tease_mode")),
            "intensity":        drop.get("intensity"),
            "recognition_hint": drop.get("recognition_hint"),
            "tier":             drop.get("tier", 1),
            "duration_seconds": drop.get("duration_seconds"),
            "waveform_data":    drop.get("waveform_data"),
        })

    return {"received": received}


@router.post("/{drop_id}/mark-read")
async def mark_drop_read(
    drop_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """
    Stamp `read_at` on a drop the current user is the target of.
    Idempotent — first call wins, re-opens don't overwrite the timestamp.
    Silent no-op when the caller isn't the target (we never leak whether
    a drop has a target or who it is, so non-targets just get {ok: true}).
    """
    if not ObjectId.is_valid(drop_id):
        raise HTTPException(status_code=400, detail="Invalid drop ID")

    drop = await db["drops"].find_one(
        {"_id": ObjectId(drop_id)},
        {"target_user_id": 1, "sender_id": 1},
    )
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    # Only the targeted recipient can mark-read. Anyone else gets a silent
    # ok so we don't expose targeting metadata through timing/error shape.
    if (
        drop.get("target_user_id")
        and current_user_id == drop.get("target_user_id")
        and current_user_id != drop.get("sender_id")
    ):
        await db["drop_inbox_reads"].update_one(
            {"drop_id": drop_id, "viewer_id": current_user_id},
            {"$setOnInsert": {
                "drop_id":   drop_id,
                "viewer_id": current_user_id,
                "sender_id": drop["sender_id"],
                "read_at":   now_utc(),
            }},
            upsert=True,
        )

    return {"ok": True}


# ==================== VIBE SCORE ====================

@router.get("/vibe-score")
async def get_vibe_score(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    doc = await db["vibe_scores"].find_one({"user_id": current_user_id})
    score = doc.get("score", 0) if doc else 0
    events = doc.get("events", {}) if doc else {}

    # Admirer count (unique viewers of your drops)
    admirer_count = await db["admirer_logs"].count_documents({
        "drop_sender_id": current_user_id
    })

    # Confession streak
    streak_doc = await db["confession_streaks"].find_one({"user_id": current_user_id})
    streak = streak_doc.get("streak", 0) if streak_doc else 0
    longest_streak = streak_doc.get("longest_streak", 0) if streak_doc else 0

    # Vibe tier
    if score >= 500:
        tier = "Legendary 🔥"
    elif score >= 200:
        tier = "Electric ⚡"
    elif score >= 100:
        tier = "Rising 🌙"
    elif score >= 50:
        tier = "Awakening ✨"
    else:
        tier = "Fresh 🌱"

    return {
        "score": score,
        "tier": tier,
        "admirer_count": admirer_count,
        "confession_streak": streak,
        "longest_streak": longest_streak,
        "events": events,
        "next_tier_at": _next_tier(score),
    }


def _next_tier(score: int) -> int:
    tiers = [50, 100, 200, 500]
    for t in tiers:
        if score < t:
            return t
    return score


# ==================== DAILY LIMIT (section 14) ====================

@router.get("/daily-limit")
async def get_daily_limit(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """
    How many drops the current user has posted today vs the cap.
    The frontend (DropsComposeScreen) uses this to render the
    "N of 3 drops left today" strip and gate the Drop button.

    Premium users get `unlimited: true`.
    """
    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    is_premium = bool(user.get("is_premium") or user.get("premium_active"))
    if is_premium:
        return {
            "unlimited": True,
            "used":      0,
            "limit":     None,
            "left":      None,
            "resets_at": None,
        }

    start_of_day = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow     = start_of_day + timedelta(days=1)

    used = await db["drops"].count_documents({
        "sender_id": current_user_id,
        "created_at": {"$gte": start_of_day},
    })

    return {
        "unlimited": False,
        "used":      used,
        "limit":     DAILY_DROP_LIMIT_FREE,
        "left":      max(0, DAILY_DROP_LIMIT_FREE - used),
        "resets_at": tomorrow.isoformat(),
    }


# ==================== PUBLISH (section 16) ====================

@router.post("/{drop_id}/publish")
async def publish_drop(
    drop_id: str,
    data: PublishDropRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """
    Final consent for a drop to leave Anonixx and appear on the
    Anonixx Publisher social pages. The client only calls this after
    two explicit confirmations (DropsPublishScreen steps 1 + 2).

    Tier 2 drops can never be published — the server refuses.
    """
    if not data.confirmed:
        raise HTTPException(status_code=400, detail="Explicit confirmation required")

    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Drop not found")
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    if drop["sender_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Only the sender can publish this drop")

    if drop.get("tier") == 2 or drop.get("theme") in TIER_2_THEMES:
        raise HTTPException(
            status_code=400,
            detail="After Dark drops stay inside Anonixx and can never be published.",
        )

    if drop.get("moderation_status") == "hidden":
        raise HTTPException(status_code=400, detail="This drop is under review and cannot be published.")

    if drop.get("published_at"):
        return {"message": "Already published", "published_at": drop["published_at"].isoformat()}

    published_at = now_utc()
    await db["drops"].update_one(
        {"_id": ObjectId(drop_id)},
        {"$set": {
            "publisher_opt_in": True,
            "published_at":     published_at,
        }},
    )

    # Queue for TikTok publishing worker (app/tasks/publisher_worker.py).
    await db["publisher_queue"].insert_one({
        "_id":          ObjectId(),
        "drop_id":      drop_id,
        "sender_id":    current_user_id,
        "theme":        drop.get("theme"),
        "category":     drop.get("category", "love"),   # needed by TikTok caption builder
        "media_type":   drop.get("media_type"),         # text | image | video | None
        "confession":   drop.get("confession"),
        "media_url":    drop.get("media_url"),
        "submitted_at": published_at,
        "status":       "queued",                       # queued | processing | posted | failed | rejected
        "retry_count":  0,
    })

    return {
        "message":      "Published to Anonixx social queue.",
        "published_at": published_at.isoformat(),
    }


# ==================== MODERATION / REPORT (section 19) ====================

@router.post("/{drop_id}/report")
async def report_drop(
    drop_id: str,
    data: ReportDropRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """
    Flag a drop for review. One report per user per drop; 3 unique reports
    flip the drop to `moderation_status: flagged` so it's hidden from the
    marketplace while ops reviews it.

    Self-harm-concern reports bypass the threshold — we hide immediately
    and surface support resources to the reporter.
    """
    reason = (data.reason or "").strip().lower()
    if reason not in VALID_REPORT_REASONS:
        raise HTTPException(
            status_code=400,
            detail=f"reason must be one of: {', '.join(sorted(VALID_REPORT_REASONS))}",
        )

    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Drop not found")
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    # Idempotent: one report per user per drop.
    existing = await db["drop_reports"].find_one({
        "drop_id":     drop_id,
        "reporter_id": current_user_id,
    })
    if existing:
        return {"message": "Report already received. Thank you."}

    note = (data.note or "").strip()[:500] or None

    await db["drop_reports"].insert_one({
        "_id":         ObjectId(),
        "drop_id":     drop_id,
        "reporter_id": current_user_id,
        "reason":      reason,
        "note":        note,
        "created_at":  now_utc(),
    })

    # Bump the cached count on the drop doc.
    await db["drops"].update_one(
        {"_id": ObjectId(drop_id)},
        {"$inc": {"report_count": 1}},
    )

    # Self-harm-concern → hide immediately, notify ops.
    REPORT_THRESHOLD = 3
    should_hide = (reason == "self-harm-concern") or (drop.get("report_count", 0) + 1 >= REPORT_THRESHOLD)

    if should_hide and drop.get("moderation_status") != "hidden":
        await db["drops"].update_one(
            {"_id": ObjectId(drop_id)},
            {"$set": {
                "moderation_status": "flagged" if reason != "self-harm-concern" else "hidden",
                "flagged_at":        now_utc(),
            }},
        )

    # For self-harm reports, send the reporter a gentle support nudge.
    support_copy = None
    if reason == "self-harm-concern":
        support_copy = (
            "Thank you for caring enough to flag this. "
            "If you're struggling too, you can talk to someone now — we're here."
        )

    return {
        "message":      "Report received. We'll review it quickly.",
        "hidden":       bool(should_hide),
        "support_copy": support_copy,
    }
