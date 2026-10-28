from fastapi import APIRouter, Depends, HTTPException, Query, Header
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from pymongo import ReturnDocument
import httpx
import random
import re
import asyncio
import math
import time

from app.database import get_database
from app.dependencies import get_current_user_id, get_optional_user_id
from app.config import settings
from app.utils.coin_service import debit_coins, credit_coins
from app.utils.location import build_location, build_feed_location_filter, build_location_search_filter
from app.utils.contact_filter import contains_contact_info, CONTACT_INFO_ERROR
from app.utils.moderation import violates_policy, MODERATION_ERROR
from app.services.confession_writer import MONEY as CLARITY_MONEY
from app.utils.content_mode import classify_sensitivity, mature_allowed, apply_content_mode
from app.utils.fingerprint import fingerprint_hash
from app.utils.feed_mix import fetch_mixed, reslot, not_promoted, fetch_promoted, splice_promoted
from app.tasks import scheduled_publisher
from app.utils import stream
from app.utils.countries import country_from_header, known_country
from app.utils.discovery import VISIBLE as DISCOVERY_VISIBLE, fresh as discovery_fresh
from app.utils.search_lexicon import clean_topics, place_from_area
from app.websockets.comments import (
    emit_new_comment, emit_comment_liked, emit_comment_pinned, emit_comment_unpinned,
)
from app.websockets.chat import emit_new_message, emit_messages_seen, emit_message_deleted

router = APIRouter(prefix="/drops", tags=["Drops"])

# @mentions in comments (plain text). The client parses them the same way.
MENTION_RE = re.compile(r'@([A-Za-z0-9_.]{2,30})')

DROP_PRICE_USD = 2.00
GROUP_DROP_PRICE_USD = 3.00

# Official drops: posted by admins as "Anonixx", free to post, never unlockable.
ADMIN_DROP_NAME = "Anonixx"
# Drops don't expire on a timer. The first unlock starts a grace period, then
# tasks/drop_cleanup.py deletes the drop. Chats keep a copy of the text.
UNLOCKED_GRACE_DAYS = 7
NIGHT_MODE_START = 22  # 10pm
NIGHT_MODE_END = 3     # 3am

# ── Economy ──────────────────────────────────────────────────────
#   post    3 coins  (poster, free for premium)
#   unlock  6 coins  (unlocker, free for premium)
#   reward  none     (see UNLOCK_REWARD_COINS)
DROP_POST_COST         = 3    # charged on BOTH /drops and /posts creation —
                              # charging only one leaves the other a free bypass
UNLOCK_REWARD_COINS    = 0    # poster reward disabled for now; raise to re-enable. flat, replaces the old percentage share

# ── Premium perks ────────────────────────────────────────────────
# Unlock cost follows the unlocker's premium; reward and grace follow the poster's.
PREMIUM_UNLOCK_COST          = 0    # vs COINS_UNLOCK_COST — premium unlocks are free
PREMIUM_UNLOCK_REWARD_COINS  = 0    # vs UNLOCK_REWARD_COINS
PREMIUM_UNLOCKED_GRACE_DAYS  = 14   # vs UNLOCKED_GRACE_DAYS (7)

# ==================== REQUEST MODELS ====================

# Confession types. Keep in sync with CARD_INTENTS in DropCardRenderer.jsx.
VALID_INTENTS = [
    "meet-me",                # "Meet Me"                — dating, real relationship
    "skeleton-in-the-closet", # "Skeleton In The Closet" — confessions, no specific audience, default
    "just-tonight",           # "Just Tonight"           — casual, no strings attached
    "the-exchange",           # "The Exchange"           — paid/transactional arrangement, 18+
]

# Older drops may still use the pre-2026-09-10 ids (scripts/migrate_intent_ids.py).

# Display labels (match CARD_INTENTS). Labels can change freely; ids can't.
INTENT_LABELS = {
    "meet-me":                "Meet Me",
    "skeleton-in-the-closet": "Skeleton In The Closet",
    "just-tonight":           "Just Tonight",
    "the-exchange":           "The Exchange",
}

class DropPollInput(BaseModel):
    question: str
    options: List[str]  # 2–4 items


class DropVoteRequest(BaseModel):
    option_index: int


HOOKUP_GENDERS = ("woman", "man", "other")
HOOKUP_LOOKING = ("woman", "man", "anyone")
HOOKUP_VIBES = ("company", "friendship", "dating", "casual", "discreet", "adventure")
# Guided answers kept on the hookup block for feed tags. The private "secret" answer isn't stored.
HOOKUP_CRAVINGS = ("warmth", "attention", "intimacy", "chemistry", "companionship")
HOOKUP_TRAITS = ("sweet", "playful", "shy", "adventurous", "affectionate", "bold", "curious", "calm")
HOOKUP_HOSTING = ("can_host", "can_travel", "either", "decide")
HOOKUP_TONES = ("vulnerable", "playful", "mysterious", "direct")


class GuidedDetails(BaseModel):
    craving: Optional[str] = None          # one of HOOKUP_CRAVINGS, or "custom"
    craving_custom: Optional[str] = None
    traits: Optional[List[str]] = None
    hosting: Optional[str] = None
    public_first: Optional[bool] = None
    tone: Optional[str] = None
    want: Optional[str] = None             # optional clarity line, "what I want"
    dont_want: Optional[str] = None        # optional clarity line, "what I don't"
    ai_generated: bool = False
    edited: bool = False


# The two clarity lines are short free text shown with the hookup (not yet
# rendered on the feed card), so they get the same gates as the confession.
CLARITY_MAX = 80


def _clean_clarity(text: Optional[str]) -> Optional[str]:
    t = re.sub(r"\s+", " ", (text or "").strip())[:CLARITY_MAX] or None
    if not t:
        return None
    if contains_contact_info(t):
        raise HTTPException(status_code=400, detail=CONTACT_INFO_ERROR)
    if violates_policy(t):
        raise HTTPException(status_code=400, detail=MODERATION_ERROR)
    if CLARITY_MONEY.search(t):
        raise HTTPException(status_code=400, detail="Leave money and gifts out of it. On Anonixx nobody pays for company.")
    return t


class HookupDetails(BaseModel):
    age: int
    gender: Optional[str] = None
    area: str
    looking_for: Optional[str] = None
    age_min: Optional[int] = None
    age_max: Optional[int] = None
    vibes: Optional[List[str]] = None
    guided: Optional[GuidedDetails] = None
    fresh_window: Optional[str] = None   # tonight | weekend | week | flexible (see FRESH_WINDOWS)


def clean_guided(g: Optional["GuidedDetails"]) -> Optional[dict]:
    if not g:
        return None
    custom = re.sub(r"\s+", " ", (g.craving_custom or "").strip())[:40] or None
    if custom and (contains_contact_info(custom) or violates_policy(custom)):
        raise HTTPException(status_code=400, detail=MODERATION_ERROR)
    craving = g.craving if g.craving in HOOKUP_CRAVINGS else ("custom" if custom else None)
    return {
        "craving": craving,
        "craving_custom": custom if craving == "custom" else None,
        "traits": [t for t in dict.fromkeys(g.traits or []) if t in HOOKUP_TRAITS][:3],
        "hosting": g.hosting if g.hosting in HOOKUP_HOSTING else None,
        "public_first": bool(g.public_first),
        "tone": g.tone if g.tone in HOOKUP_TONES else None,
        "want": _clean_clarity(g.want),
        "dont_want": _clean_clarity(g.dont_want),
        "ai_generated": bool(g.ai_generated),
        "edited": bool(g.edited),
    }


def hookup_place(hookup: Optional[dict], user: Optional[dict], x_country: Optional[str] = None) -> Optional[dict]:
    """Structured place for a hookup post sent without one (see create_drop)."""
    place = place_from_area((hookup or {}).get("area") or "")
    if place:
        return place
    user = user or {}
    if user.get("location_county") or user.get("location_country"):
        return {
            "country": known_country(user.get("location_country")) or user.get("location_country") or None,
            "county": user.get("location_county") or None,
            "sub_county": user.get("location_sub_county") or None,
            "estate": None,
        }
    country = country_from_header(x_country) or known_country(user.get("detected_country"))
    return {"country": country, "county": None, "sub_county": None, "estate": None} if country else None


def clean_hookup(h: "HookupDetails") -> dict:
    if h.age < 18 or h.age > 99:
        raise HTTPException(status_code=400, detail="You must be 18 or older to post a hookup confession.")
    area = (h.area or "").strip()[:60]
    if not area:
        raise HTTPException(status_code=400, detail="Add the area you are based in.")
    lo = h.age_min if h.age_min and h.age_min >= 18 else None
    hi = h.age_max if h.age_max and h.age_max <= 99 else None
    if lo and hi and lo > hi:
        lo, hi = hi, lo
    return {
        "age": h.age,
        "gender": h.gender if h.gender in HOOKUP_GENDERS else None,
        "area": area,
        "looking_for": h.looking_for if h.looking_for in HOOKUP_LOOKING else None,
        "age_min": lo,
        "age_max": hi,
        "vibes": [v for v in dict.fromkeys(h.vibes or []) if v in HOOKUP_VIBES][:4],
        "guided": clean_guided(h.guided),
        "fresh_window": h.fresh_window if h.fresh_window in FRESH_WINDOWS else "tonight",
    }


# How long a hookup post stays discoverable: (first run, renewal step, max). Only discovery
# ends; Rooms and chats are untouched.
FRESH_WINDOWS = {
    "tonight":  (timedelta(hours=12), timedelta(hours=12), timedelta(hours=48)),
    "weekend":  (None,                timedelta(days=3),   timedelta(days=14)),
    "week":     (timedelta(days=7),   timedelta(days=3),   timedelta(days=14)),
    "flexible": (timedelta(days=7),   timedelta(days=3),   timedelta(days=14)),
}


def fresh_until(window: Optional[str], now: datetime) -> datetime:
    """When a new hookup post in this window stops being discoverable."""
    first = FRESH_WINDOWS.get(window or "tonight", FRESH_WINDOWS["tonight"])[0]
    if first is None:   # weekend: through the end of the coming Sunday (UTC)
        days = (6 - now.weekday()) % 7
        return (now + timedelta(days=days)).replace(hour=23, minute=59, second=0, microsecond=0)
    return now + first


# Smart trim: the video is stored untouched; clients play the chosen window and text overlays.
# Admin pin/boost (placement in utils/feed_mix.py).
PROMO_KINDS = ("pin", "boost")
PROMO_HOURS = (6, 24, 72, 168)

MAX_CLIP_SECONDS = 180
MIN_CLIP_SECONDS = 1
MAX_VIDEO_OVERLAYS = 5
MAX_OVERLAY_CHARS = 80
OVERLAY_SIZES = ("s", "m", "l")
OVERLAY_STYLES = ("shadow", "dark", "coral")


class VideoOverlayInput(BaseModel):
    text: str
    x: float = 0.5   # centre, 0–1 across the frame
    y: float = 0.5   # centre, 0–1 down the frame
    size: str = "m"
    style: str = "dark"


class VideoEditInput(BaseModel):
    start: float = 0
    end: float
    overlays: List[VideoOverlayInput] = []


def clean_video_edit(edit: Optional[VideoEditInput]) -> Optional[dict]:
    """Validates a smart-trim edit and returns what gets stored (None if empty)."""
    if not edit:
        return None
    start = max(0.0, float(edit.start))
    end = float(edit.end)
    if end - start < MIN_CLIP_SECONDS:
        raise HTTPException(status_code=400, detail="A trimmed video must be at least 1 second long.")
    if end - start > MAX_CLIP_SECONDS + 0.5:
        raise HTTPException(status_code=400, detail="Videos can play for 3 minutes at most. Trim it shorter.")
    if len(edit.overlays) > MAX_VIDEO_OVERLAYS:
        raise HTTPException(status_code=400, detail=f"Up to {MAX_VIDEO_OVERLAYS} texts fit on one video.")

    overlays = []
    for o in edit.overlays:
        text = o.text.strip()[:MAX_OVERLAY_CHARS]
        if not text:
            continue
        if contains_contact_info(text):
            raise HTTPException(status_code=400, detail=CONTACT_INFO_ERROR)
        if violates_policy(text):
            raise HTTPException(status_code=400, detail=MODERATION_ERROR)
        overlays.append({
            "text":  text,
            "x":     min(1.0, max(0.0, float(o.x))),
            "y":     min(1.0, max(0.0, float(o.y))),
            "size":  o.size if o.size in OVERLAY_SIZES else "m",
            "style": o.style if o.style in OVERLAY_STYLES else "dark",
        })
    return {"start": round(start, 2), "end": round(end, 2), "overlays": overlays}


class CreateDropRequest(BaseModel):
    kind: Optional[str] = None  # "hookup" | "confession"
    hookup: Optional[HookupDetails] = None
    confession: Optional[str] = None
    is_group: bool = False
    group_size: Optional[int] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None  # "image" | "video" | "voice"
    # Extra photo on a poll or voice drop (media_url holds the main content).
    image_url: Optional[str] = None
    # Multi-image post: 2-10 photos shown as swipeable slides. images[0] is copied to media_url
    # for single-image consumers.
    images: Optional[List[str]] = None
    target_user_id: Optional[str] = None  # private targeted drop
    intent: Optional[str] = None  # what the sender is open to
    sensitivity: Optional[str] = None  # "mature" if the author marks it; the server may also upgrade it

    # Drop spec upgrade fields
    theme: Optional[str] = None                  # "desire" — only theme left
    mood_tag: Optional[str] = None               # "longing", "restless", …
    intensity: Optional[str] = None              # "soft" | "heavy" | "devastating"
    recognition_hint: Optional[str] = None       # one word, directed drops only
    # Share to Anonixx socials: None = default (auto), True = opt in, False = opt out.
    publisher_opt_in: Optional[bool] = None
    duration_seconds: Optional[float] = None     # voice drops
    waveform_data: Optional[List[float]] = None  # voice drops
    video_edit: Optional[VideoEditInput] = None  # video drops — trim window + text overlays
    cover_url: Optional[str] = None              # video drops — chosen cover frame (uploaded image)
    # Set by the Stream video pipeline (app/tasks/scheduled_publisher.py), never by a client:
    stream_uid: Optional[str] = None             # the published clip on Cloudflare Stream
    media_download_url: Optional[str] = None     # its MP4 copy, for the socials publishers
    # Admin-only extras for official drops: a track from the Sounds library
    # played over the post, and a pin/boost that lifts it in the feed.
    sound_id: Optional[str] = None
    sound_mute_original: bool = False            # video drops: play the track instead of the clip's own audio
    promo_kind: Optional[str] = None             # "pin" | "boost"
    promo_hours: Optional[int] = None

    # Location, most to least specific. Country and county come from fixed lists; the rest is free text.
    location_country:    Optional[str] = None   # e.g. "Kenya"
    location_county:     Optional[str] = None   # e.g. "Nairobi" (or state/region for non-Kenya)
    location_sub_county: Optional[str] = None   # e.g. "Westlands"
    location_estate:     Optional[str] = None   # e.g. "Kilimani"
    poll:       Optional[DropPollInput] = None   # optional attached poll
    font_style: Optional[str] = None             # "classic" | "sultry-script" | "bold-tease"
    # Admin-only search keywords: lets Anonixx content (polls, photos, voice
    # notes) be found from the search bar even when it has little or no text.
    tags: Optional[List[str]] = None
    display_name: Optional[str] = None
    # Author-picked moods/topics for Stories (utils/search_lexicon.STORY_TAGS), up to 3.
    topics: Optional[List[str]] = None


class PublishDropRequest(BaseModel):
    # Double-consent publish flow — the frontend always sends confirmed=True
    # on the final tap of DropsPublishScreen step 2.
    confirmed: bool = True


class ReportDropRequest(BaseModel):
    reason: str                          # short enum-ish reason
    note: Optional[str] = None           # optional free-text detail


# ==================== SPEC CONSTANTS ====================

# Drop themes (match DROP_THEMES in DropCardRenderer.jsx). Sharing to socials is the poster's choice.
VALID_THEMES = {"desire"}

# Mood tags: see VALID_MOOD_TAGS in the FEED section (the one set compose,
# search and affinity all use).

VALID_INTENSITIES = {"soft", "heavy", "devastating"}

# Card-text font presets — style composition on the two font families the app
# already ships (PlayfairDisplay / DMSans), not new font assets.
FONT_STYLES = {"classic", "sultry-script", "bold-tease"}

# Section 8 — six text reactions. Anything else is rejected.
VALID_REACTIONS = {
    "That hit me.",
    "I think I know who this is.",
    "This feels like you.",
    "I'm not ready to respond.",
    "Say more.",
    "I needed to read this.",
}

# Section 19 — valid report reasons.
VALID_REPORT_REASONS = {
    "abuse", "doxxing", "self-harm-concern", "spam", "explicit", "other",
}


# ==================== HELPERS ====================

def _aware(dt: datetime) -> datetime:
    # Mongo hands datetimes back naive (UTC); make them comparable with now_utc().
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _is_premium_active(user: dict) -> bool:
    """True while a premium plan is running. `is_premium` without premium_until never expires."""
    if not user.get("is_premium") and not user.get("premium_active"):
        return False
    until = user.get("premium_until")
    if not until:
        return True
    return _ensure_aware(until) > now_utc()


def _ensure_aware(dt: datetime) -> datetime:
    """Make a datetime timezone-aware (UTC) if it isn't already."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def is_premium_user_id(user_id: str, db) -> bool:
    """_is_premium_active by user id — for the perk checks below, where the
    relevant user is usually not the caller (e.g. the drop's owner)."""
    if not user_id:
        return False
    try:
        user = await db["users"].find_one(
            {"_id": ObjectId(user_id)},
            {"is_premium": 1, "premium_active": 1, "premium_until": 1},
        )
    except Exception:
        return False
    return _is_premium_active(user) if user else False


async def unlock_cost_for(user_id: str, db) -> int:
    """What this user pays to unlock — premium halves it."""
    return PREMIUM_UNLOCK_COST if await is_premium_user_id(user_id, db) else COINS_UNLOCK_COST


async def unlock_reward_for(owner_id: str, db) -> int:
    """Flat coins the owner earns per unlock (doubled for premium)."""
    return PREMIUM_UNLOCK_REWARD_COINS if await is_premium_user_id(owner_id, db) else UNLOCK_REWARD_COINS


async def grace_days_for(user_id: str, db) -> int:
    """Days a drop survives after its FIRST unlock before cleanup deletes it
    — premium gets 14 vs 7, twice the window to collect further unlocks."""
    return PREMIUM_UNLOCKED_GRACE_DAYS if await is_premium_user_id(user_id, db) else UNLOCKED_GRACE_DAYS


def is_night_mode() -> bool:
    hour = now_utc().hour
    return hour >= NIGHT_MODE_START or hour < NIGHT_MODE_END


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


async def update_vibe_score(user_id: str, action: str, db):
    """Vibe score points: card_created +2, card_unlocked +5, reaction_received +1, streak_day +2."""
    weights = {
        "card_created": 2,
        "card_unlocked": 5,
        "reaction_received": 1,
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


async def send_push_notification(user_id: str, title: str, body: str, db, data: Optional[dict] = None, category: Optional[str] = None):
    """`category` names a set of action buttons — the app registers them by id
    (e.g. "linkup_request" -> Accept), the website's sw.js reads data.actions."""
    try:
        from app.utils.notifications import send_web_push
        web_data = dict(data or {})
        if category == "linkup_request" and web_data.get("request_id"):
            web_data["actions"] = [{"action": "accept", "title": "Accept"}]
            web_data["accept_url"] = f"/inbox?accept={web_data['request_id']}"
        await send_web_push(user_id, title, body, web_data, db)
    except Exception as e:
        print(f"⚠️ Web push failed: {e}")
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
                json={"to": token, "title": title, "body": body, "sound": "default",
                      **({"data": data} if data else {}), **({"categoryId": category} if category else {})},
                headers={"Content-Type": "application/json"},
                timeout=5.0
            )
    except Exception as e:
        print(f"⚠️ Push notification failed: {e}")


# ==================== HELPERS ============================

def _media_preview_url(media_url: Optional[str], media_type: Optional[str]) -> Optional[str]:
    """Static image for og:image: the image itself, or None for videos until a card exists."""
    if not media_url:
        return None
    if media_type == "image":
        return media_url
    return None


# ==================== CREATE DROP ========================

@router.post("")
async def create_drop(
    data: CreateDropRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
    x_country: Optional[str] = Header(None, alias="X-Country"),
):
    """Create a confession card. Authenticated users only."""
    if not data.confession and not data.media_url and not data.images:
        raise HTTPException(status_code=400, detail="Provide a confession text or attach an image/video")

    if data.confession and len(data.confession.strip()) == 0:
        raise HTTPException(status_code=400, detail="Confession cannot be empty")

    if data.confession and len(data.confession) > 500:
        raise HTTPException(status_code=400, detail="Confession must be 500 characters or less")

    if contains_contact_info(data.confession):
        raise HTTPException(status_code=400, detail=CONTACT_INFO_ERROR)
    if violates_policy(data.confession, data.poll.question if data.poll else None,
                       *(data.poll.options if data.poll else [])):
        raise HTTPException(status_code=400, detail=MODERATION_ERROR)

    if data.media_url and data.media_type not in ("image", "video", "voice"):
        raise HTTPException(status_code=400, detail="media_type must be 'image', 'video', or 'voice'")

    video_edit_data = clean_video_edit(data.video_edit) if data.media_url and data.media_type == "video" else None

    images_data = None
    if data.images:
        cleaned_images = [u.strip() for u in data.images if u and u.strip()]
        if len(cleaned_images) < 2 or len(cleaned_images) > 9:
            raise HTTPException(status_code=400, detail="A multi-image post needs 2–9 photos.")
        images_data = cleaned_images

    location_detail, location_display = build_location(
        data.location_country, data.location_county, data.location_sub_county, data.location_estate,
    )

    font_style = (data.font_style or "classic").strip()
    if font_style not in FONT_STYLES:
        raise HTTPException(status_code=400, detail=f"font_style must be one of: {', '.join(FONT_STYLES)}")

    poll_data = None
    if data.poll:
        poll_options = [o.strip() for o in data.poll.options if o.strip()]
        if len(poll_options) < 2 or len(poll_options) > 4:
            raise HTTPException(status_code=400, detail="Poll requires 2–4 options.")
        if not data.poll.question.strip():
            raise HTTPException(status_code=400, detail="Poll question cannot be empty.")
        if contains_contact_info(data.poll.question) or any(contains_contact_info(o) for o in poll_options):
            raise HTTPException(status_code=400, detail=CONTACT_INFO_ERROR)
        poll_data = {
            "question": data.poll.question.strip(),
            "options": [{"text": o, "votes": 0} for o in poll_options],
            "total_votes": 0,
        }

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

    # Polls are official-only, to keep them rare in the feed.
    if data.poll and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Polls can only be posted by Anonixx.")

    # Regular users post text-only confessions. Photos/video/voice are
    # shared only after an unlock; media content in the feed is Anonixx's.
    if (data.media_url or data.images) and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Confessions are text only.")

    suspended_until = user.get("posting_suspended_until")
    if suspended_until:
        if suspended_until.tzinfo is None:
            suspended_until = suspended_until.replace(tzinfo=timezone.utc)
        if suspended_until > datetime.now(timezone.utc):
            raise HTTPException(
                status_code=403,
                detail=f"Posting suspended until {suspended_until.strftime('%B %d, %Y')} — a confession you posted was confirmed deceptive.",
            )

    # ── Spec upgrade field validation (sections 11, 13, 16) ─────
    theme = (data.theme or "desire").strip()
    if theme not in VALID_THEMES:
        raise HTTPException(status_code=400, detail="Unknown theme")

    mood_tag = (data.mood_tag or "longing").strip().lower()
    if mood_tag not in VALID_MOOD_TAGS:
        raise HTTPException(status_code=400, detail="Unknown mood tag")

    intensity = (data.intensity or "heavy").strip().lower()
    if intensity not in VALID_INTENSITIES:
        raise HTTPException(status_code=400, detail="intensity must be soft, heavy, or devastating")

    # One-word recognition hint (section 11)
    recognition_hint = None
    if data.recognition_hint:
        parts = data.recognition_hint.strip().split()
        if parts:
            recognition_hint = parts[0].lower()[:16]

    # Sharing to socials is the poster's choice; on unless they opted out.
    publisher_opt_in = (data.publisher_opt_in is not False)

    kind = data.kind if data.kind in ("hookup", "confession") else None
    hookup_data = clean_hookup(data.hookup) if kind == "hookup" and data.hookup else None
    if kind == "hookup" and not hookup_data:
        raise HTTPException(status_code=400, detail="Fill in your age and area for a hookup confession.")
    if kind == "hookup" and not user.get("age_verified") and not user.get("is_admin"):
        # Older accounts without the 18+ tick: the age they just entered (18+) confirms it.
        await db["users"].update_one(
            {"_id": user["_id"]},
            {"$set": {"age_verified": True, "age_attested": "hookup_age"}},
        )

    night = is_night_mode()
    price = GROUP_DROP_PRICE_USD if data.is_group else DROP_PRICE_USD
    is_admin_drop = bool(user.get("is_admin"))
    admin_name = re.sub(r"\s+", " ", (data.display_name or "").strip())[:30] or ADMIN_DROP_NAME
    tags: list = []
    if is_admin_drop and data.tags:
        for t in data.tags:
            t = re.sub(r"\s+", " ", (t or "").strip().lstrip("#").lower())[:30]
            if t and t not in tags:
                tags.append(t)
        tags = tags[:10]

    # Cover frame: only for videos, and only a file in our own storage (or, for a
    # Stream clip posted without a chosen cover, Stream's own thumbnail).
    r2_prefix = (settings.R2_PUBLIC_URL or "").rstrip("/") + "/"
    stream_uid = data.stream_uid if is_admin_drop and data.media_type == "video" else None
    cover_ok = data.cover_url and data.media_type == "video" and (
        (len(r2_prefix) > 1 and data.cover_url.startswith(r2_prefix))
        or (stream_uid and re.match(r"^https://[\w.-]+\.cloudflarestream\.com/", data.cover_url))
    )
    cover_url = data.cover_url if cover_ok else None

    # Any confession can carry a track from the Sounds library (not voice drops,
    # which already have their own audio).
    sound = None
    if data.sound_id and data.media_type != "voice":
        try:
            sound_doc = await db["sounds"].find_one({"_id": ObjectId(data.sound_id), "active": True})
        except Exception:
            sound_doc = None
        if not sound_doc:
            raise HTTPException(status_code=400, detail="That sound isn't available any more. Pick another.")
        sound = {
            "id": str(sound_doc["_id"]),
            "title": sound_doc.get("title", ""),
            "url": sound_doc.get("url", ""),
            "mute_original": bool(data.sound_mute_original) and data.media_type == "video",
        }

    promo_until = None
    if is_admin_drop:
        if data.promo_kind:
            if data.promo_kind not in PROMO_KINDS or data.promo_hours not in PROMO_HOURS:
                raise HTTPException(status_code=400, detail="Pick pin or boost, for 6 hours, 1, 3 or 7 days.")
            promo_until = now_utc() + timedelta(hours=data.promo_hours)

    # Place for Near: from the typed area, else the poster's profile area, else their country.
    # Posting from somewhere else is found there; the profile location doesn't change.
    if kind == "hookup" and not location_detail:
        location_detail = hookup_place(hookup_data, user, x_country)
        if location_detail:
            location_display = ", ".join(v for v in (location_detail.get("sub_county"), location_detail.get("county"), location_detail.get("country")) if v)

    drop = {
        "_id": ObjectId(),
        "sender_id": current_user_id,
        "sender_anonymous_name": admin_name if is_admin_drop else user.get("anonymous_name", "Anonymous"),
        "is_admin_drop": is_admin_drop,
        "confession": data.confession.strip() if data.confession else None,
        # Copy the first photo to media_url/media_type for single-image consumers.
        "media_url": (images_data[0] if images_data else data.media_url) or None,
        "media_type": ("image" if images_data else data.media_type) or None,
        "image_url": data.image_url or None,
        "images": images_data,
        "is_group": data.is_group,
        "group_size": data.group_size if data.is_group else None,
        "price": price,
        # No expiry until the first unlock (see _complete_unlock).
        "expires_at": None,
        "is_active": True,
        "is_night_mode": night,
        "unlock_count": 0,
        "admirer_count": 0,
        "reactions": [],
        # a chosen video cover doubles as the share preview (and the teaser card's backdrop)
        "card_image_url": cover_url or _media_preview_url(
            images_data[0] if images_data else data.media_url,
            "image" if images_data else data.media_type,
        ),
        "target_user_id": data.target_user_id or None,
        "intent": data.intent if data.intent in VALID_INTENTS and data.intent != "the-exchange" else None,
        "kind": kind,
        "hookup": hookup_data,
        "live_until": fresh_until((hookup_data or {}).get("fresh_window"), now_utc()) if kind == "hookup" else None,
        "created_at": now_utc(),

        # ── Drop spec upgrade fields ──────────────────────────
        "theme": theme,
        "mood_tag": mood_tag,
        "intensity": intensity,
        "recognition_hint": recognition_hint,
        "publisher_opt_in": publisher_opt_in,
        "tier": 1,
        "published_at": None,            # set by POST /drops/:id/publish
        "duration_seconds": float(data.duration_seconds) if data.duration_seconds else None,
        "waveform_data": (data.waveform_data or None) if data.media_type == "voice" else None,
        "video_edit": video_edit_data,
        "cover_url": cover_url,
        "stream_uid": stream_uid,
        "media_download_url": data.media_download_url if stream_uid else None,
        "sound": sound,
        "promo_kind": data.promo_kind if promo_until else None,
        "promo_until": promo_until,
        "reaction_counts": {r: 0 for r in VALID_REACTIONS},
        "report_count": 0,
        "moderation_status": "visible",   # "visible" | "flagged" | "hidden"
        "sensitivity": classify_sensitivity(
            data.confession, data.poll.question if data.poll else None,
            marked_mature=data.sensitivity == "mature" or kind == "hookup",
        ),
        # All drops are always public in the marketplace.
        # target_user_id means "also deliver to this inbox" — not "private only".
        "is_marketplace": True,

        # Feed-as-drops upgrade
        "location":        location_display,   # joined display string, e.g. "Kilimani, Westlands, Nairobi, Kenya"
        "location_detail": location_detail,    # {country, county, sub_county, estate} — used for filtering
        # Country the local feed matches on: the picked location, else the author's. Official drops stay global.
        "feed_country": known_country((location_detail or {}).get("country")) or (None if is_admin_drop else (
            country_from_header(x_country) or known_country(user.get("location_country")) or known_country(user.get("detected_country"))
        )),
        "poll":       poll_data,
        "font_style": font_style,
        "tags":       tags or None,
        "topics":     (clean_topics(data.topics) or None) if kind != "hookup" else None,

        # ── Native social engagement (like/save/comment/view) ─
        "liked_by":     [],
        "likes_count":  0,
        "saves_count":  0,
        "thread_count": 0,
        "views_count":  0,
    }

    # Charge after validation, so a rejected drop costs nothing. Admin drops and regular
    # confessions are free; hookup drops pay.
    post_cost = 0 if is_admin_drop or kind == "confession" else DROP_POST_COST
    if post_cost and not await is_premium_user_id(current_user_id, db):
        try:
            await debit_coins(
                db=db, user_id=current_user_id, amount=DROP_POST_COST,
                reason="drop_post", description="Posted a drop",
                meta={"drop_id": str(drop["_id"])},
            )
        except ValueError as e:
            if "Insufficient" in str(e):
                raise HTTPException(
                    status_code=402,
                    detail=f"Not enough coins. Posting a drop costs {DROP_POST_COST} coins.",
                )
            raise HTTPException(status_code=404, detail="User not found.")

    await db["drops"].insert_one(drop)
    drop_id_str = str(drop["_id"])

    # ── Auto-queue for Anonixx socials (unless targeted, flagged or opted out).
    if (
        publisher_opt_in
        and not data.target_user_id
        and drop["moderation_status"] == "visible"
    ):
        drop["published_at"] = now_utc()
        await db["drops"].update_one(
            {"_id": drop["_id"]},
            {"$set": {"published_at": drop["published_at"]}},
        )

        # Blurred teaser card for socials. If it fails, publishing goes ahead without it.
        teaser_image_url = None
        try:
            from app.services.card_generator import generate_teaser_card, upload_teaser_card
            teaser_bytes = await generate_teaser_card(drop)
            teaser_image_url = upload_teaser_card(teaser_bytes, str(drop["_id"]))
            if teaser_image_url:
                await db["drops"].update_one(
                    {"_id": drop["_id"]},
                    {"$set": {"card_image_url": teaser_image_url}},
                )
        except Exception as e:
            print(f"⚠️ Teaser card generation failed for drop {drop['_id']}: {e}")

        await db["publisher_queue"].insert_one({
            "_id":               ObjectId(),
            "drop_id":           str(drop["_id"]),
            "sender_id":         current_user_id,
            "theme":             drop.get("theme"),
            "media_type":        drop.get("media_type"),
            "confession":        drop.get("confession"),
            "media_url":         drop.get("media_download_url") or drop.get("media_url"),   # socials need a plain file
            "teaser_image_url":  teaser_image_url,
            "submitted_at":      drop["published_at"],
            "status":            "queued",
            "retry_count":       0,
        })

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

    return {
        "id": drop_id_str,
        "expires_at": None,          # nothing counting down until first unlock
        "time_left": None,
        "is_night_mode": night,
        "price": price,
        "coins_spent": post_cost,
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


@router.post("/{drop_id}/vote")
async def vote_on_drop_poll(
    drop_id: str,
    data: DropVoteRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    try:
        oid = ObjectId(drop_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid drop ID.")

    drop = await db["drops"].find_one({"_id": oid})
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found.")

    poll = drop.get("poll")
    if not poll:
        raise HTTPException(status_code=400, detail="This drop has no poll.")

    options = poll.get("options", [])
    if data.option_index < 0 or data.option_index >= len(options):
        raise HTTPException(status_code=400, detail="Invalid option.")

    existing = await db["drop_poll_votes"].find_one({"drop_id": drop_id, "user_id": current_user_id})
    if existing:
        raise HTTPException(status_code=400, detail="You've already voted on this poll.")

    await db["drop_poll_votes"].insert_one({
        "drop_id": drop_id,
        "user_id": current_user_id,
        "option_index": data.option_index,
        "created_at": now_utc(),
    })

    await db["drops"].update_one(
        {"_id": oid},
        {
            "$inc": {
                f"poll.options.{data.option_index}.votes": 1,
                "poll.total_votes": 1,
            }
        }
    )

    updated_drop = await db["drops"].find_one({"_id": oid})
    updated_poll = updated_drop["poll"]
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


# ==================== CARD IMAGE ====================


# ==================== REACT (pre-payment) ====================


# ==================== LIKE / SAVE / THREAD / VIEW ====================

MAX_VOICE_COMMENT_SECONDS = 30


@router.post("/{drop_id}/like")
async def like_drop(
    drop_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Drop not found")
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    liked_by = drop.get("liked_by", [])
    if current_user_id in liked_by:
        return {"message": "Already liked", "liked": True, "likes_count": drop.get("likes_count", 0)}

    # $addToSet so a repeated request never counts the same user twice.
    updated = await db["drops"].find_one_and_update(
        {"_id": ObjectId(drop_id)},
        {"$addToSet": {"liked_by": current_user_id}, "$inc": {"likes_count": 1}},
        return_document=ReturnDocument.AFTER,
    )

    await update_drop_affinity(current_user_id, drop.get("mood_tag"), "like", db)

    if drop["sender_id"] != current_user_id:
        await send_push_notification(
            drop["sender_id"],
            "Someone felt your words ❤️",
            "A confession you shared just got a like.",
            db,
        )

    return {"message": "Drop liked", "liked": True, "likes_count": updated.get("likes_count", 0)}


@router.delete("/{drop_id}/like")
async def unlike_drop(
    drop_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Drop not found")
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    liked_by = drop.get("liked_by", [])
    if current_user_id not in liked_by:
        return {"message": "Not liked", "liked": False, "likes_count": drop.get("likes_count", 0)}

    updated = await db["drops"].find_one_and_update(
        {"_id": ObjectId(drop_id)},
        {"$pull": {"liked_by": current_user_id}, "$inc": {"likes_count": -1}},
        return_document=ReturnDocument.AFTER,
    )

    return {"message": "Drop unliked", "liked": False, "likes_count": max(0, updated.get("likes_count", 0))}


@router.post("/{drop_id}/save")
async def save_drop(
    drop_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    existing = await db["saved_drops"].find_one({"drop_id": drop_id, "user_id": current_user_id})

    if existing:
        await db["saved_drops"].delete_one({"_id": existing["_id"]})
        saves = 0
        try:
            d = await db["drops"].find_one_and_update(
                {"_id": ObjectId(drop_id)}, {"$inc": {"saves_count": -1}}, return_document=ReturnDocument.AFTER,
            )
            saves = max(0, (d or {}).get("saves_count", 0))
        except Exception:
            pass
        return {"message": "Drop removed from saved", "saved": False, "saves_count": saves}

    await db["saved_drops"].insert_one({
        "_id":        ObjectId(),
        "drop_id":    drop_id,
        "user_id":    current_user_id,
        "created_at": now_utc(),
    })
    saves = 0
    try:
        drop = await db["drops"].find_one_and_update(
            {"_id": ObjectId(drop_id)}, {"$inc": {"saves_count": 1}}, return_document=ReturnDocument.AFTER,
        )
        if drop:
            saves = max(0, drop.get("saves_count", 0))
            await update_drop_affinity(current_user_id, drop.get("mood_tag"), "save", db)
    except Exception:
        pass

    return {"message": "Saved to your collection", "saved": True, "saves_count": saves}


@router.get("/saved")
async def get_saved_drops(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    saved_cursor = db["saved_drops"].find({"user_id": current_user_id}).sort("created_at", -1)
    saved = []

    async for s in saved_cursor:
        try:
            drop = await db["drops"].find_one({"_id": ObjectId(s["drop_id"])})
        except Exception:
            continue
        if not drop:
            continue

        saved_at = s["created_at"]
        if saved_at.tzinfo is None:
            saved_at = saved_at.replace(tzinfo=timezone.utc)
        saved.append({
            "id":             str(drop["_id"]),
            "confession":     drop.get("confession"),
            "media_url":      drop.get("media_url"),
            "media_type":     drop.get("media_type"),
            "mood_tag":       drop.get("mood_tag"),
            "saved_at":       saved_at.isoformat(),
            "saved_days_ago": (now_utc() - saved_at).days,
        })

    return {"saved_drops": saved, "total": len(saved)}


@router.post("/{drop_id}/thread")
async def add_to_drop_thread(
    drop_id: str,
    data: dict,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    content        = data.get("content", "").strip()
    gif_url        = data.get("gif_url",   "").strip() if data.get("gif_url")   else None
    image_url      = data.get("image_url", "").strip() if data.get("image_url") else None
    voice_url      = data.get("voice_url", "").strip() if data.get("voice_url") else None
    voice_duration = data.get("voice_duration")
    parent_id      = data.get("parent_id")

    if not content and not gif_url and not image_url and not voice_url:
        raise HTTPException(status_code=400, detail="Comment must have text, a GIF, an image, or a voice note.")

    if voice_url and (voice_duration or 0) > MAX_VOICE_COMMENT_SECONDS:
        raise HTTPException(
            status_code=400,
            detail=f"Voice notes can't be longer than {MAX_VOICE_COMMENT_SECONDS} seconds.",
        )

    if contains_contact_info(content):
        raise HTTPException(status_code=400, detail=CONTACT_INFO_ERROR)
    if violates_policy(content):
        raise HTTPException(status_code=400, detail=MODERATION_ERROR)

    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Drop not found")
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    thread_doc = {
        "drop_id":        drop_id,
        "user_id":        current_user_id,
        "content":        content,
        "anonymous_name": user.get("anonymous_name", "Anonymous"),
        "liked_by":       [],
        "likes_count":    0,
        "created_at":     now_utc(),
    }
    if gif_url:
        thread_doc["gif_url"] = gif_url
    if image_url:
        thread_doc["image_url"] = image_url
    if voice_url:
        thread_doc["voice_url"] = voice_url
        thread_doc["voice_duration"] = voice_duration
    if parent_id:
        thread_doc["parent_id"] = parent_id

    result = await db["drop_threads"].insert_one(thread_doc)
    await db["drops"].update_one({"_id": ObjectId(drop_id)}, {"$inc": {"thread_count": 1}})

    await update_drop_affinity(current_user_id, drop.get("mood_tag"), "comment", db)

    if drop["sender_id"] != current_user_id:
        await send_push_notification(
            drop["sender_id"],
            "Someone responded to a thought like yours 💬",
            "A confession you shared just got a reply.",
            db,
        )

    # Notify @mentioned users (one query; self-mentions skipped).
    mentioned_usernames = set(MENTION_RE.findall(content)) if content else set()
    if mentioned_usernames:
        pattern = "|".join(re.escape(n) for n in mentioned_usernames)
        async for mentioned in db["users"].find(
            {"username": {"$regex": f"^({pattern})$", "$options": "i"}},
            {"_id": 1},
        ):
            mentioned_id = str(mentioned["_id"])
            if mentioned_id == current_user_id:
                continue
            await send_push_notification(
                mentioned_id,
                "Someone mentioned you 💬",
                f"{user.get('anonymous_name', 'Someone')} tagged you in a comment.",
                db,
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
    if voice_url:
        response["voice_url"] = voice_url
        response["voice_duration"] = voice_duration

    # Push the new comment to everyone with this drop's comments open.
    broadcast = {k: v for k, v in response.items() if k != "message"}
    broadcast["user_id"] = current_user_id
    if parent_id:
        broadcast["parent_id"] = parent_id
    await emit_new_comment(drop_id, broadcast)

    return response


@router.get("/{drop_id}/thread")
async def get_drop_thread(
    drop_id: str,
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db = Depends(get_database),
):
    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Drop not found")
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    thread_docs = await db["drop_threads"].find(
        {"drop_id": drop_id}
    ).sort("created_at", 1).to_list(None)

    def fmt(t):
        d = {
            "id":             str(t["_id"]),
            "content":        t.get("content", ""),
            "anonymous_name": t.get("anonymous_name", "Anonymous"),
            "created_at":     t["created_at"].isoformat(),
            "time_ago":       get_time_ago(t["created_at"]),
            "likes_count":    t.get("likes_count", 0),
            "liked_by_me":    current_user_id in t.get("liked_by", []) if current_user_id else False,
            "is_own_reply":   t.get("user_id") == current_user_id if current_user_id else False,
            "pinned":         bool(t.get("pinned")),
            "replies":        [],
        }
        if t.get("gif_url"):
            d["gif_url"] = t["gif_url"]
        if t.get("image_url"):
            d["image_url"] = t["image_url"]
        if t.get("voice_url"):
            d["voice_url"] = t["voice_url"]
            d["voice_duration"] = t.get("voice_duration")
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
    # The pinned comment always comes first.
    pinned = [c for c in top if c["pinned"]]
    if pinned:
        top = pinned + [c for c in top if not c["pinned"]]

    return {"threads": top, "thread_count": len(top)}


@router.post("/{drop_id}/thread/{comment_id}/like")
async def like_drop_comment(
    drop_id: str,
    comment_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    try:
        comment = await db["drop_threads"].find_one({"_id": ObjectId(comment_id), "drop_id": drop_id})
    except Exception:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    liked_by = comment.get("liked_by", [])
    if current_user_id in liked_by:
        return {"liked": True, "likes_count": comment.get("likes_count", 0)}

    updated = await db["drop_threads"].find_one_and_update(
        {"_id": ObjectId(comment_id)},
        {"$addToSet": {"liked_by": current_user_id}, "$inc": {"likes_count": 1}},
        return_document=ReturnDocument.AFTER,
    )
    likes_count = updated.get("likes_count", 0)
    await emit_comment_liked(drop_id, comment_id, likes_count)
    return {"liked": True, "likes_count": likes_count}


@router.delete("/{drop_id}/thread/{comment_id}/like")
async def unlike_drop_comment(
    drop_id: str,
    comment_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    try:
        comment = await db["drop_threads"].find_one({"_id": ObjectId(comment_id), "drop_id": drop_id})
    except Exception:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    liked_by = comment.get("liked_by", [])
    if current_user_id not in liked_by:
        return {"liked": False, "likes_count": comment.get("likes_count", 0)}

    updated = await db["drop_threads"].find_one_and_update(
        {"_id": ObjectId(comment_id)},
        {"$pull": {"liked_by": current_user_id}, "$inc": {"likes_count": -1}},
        return_document=ReturnDocument.AFTER,
    )
    likes_count = max(0, updated.get("likes_count", 0))
    await emit_comment_liked(drop_id, comment_id, likes_count)
    return {"liked": False, "likes_count": likes_count}


@router.post("/{drop_id}/thread/{comment_id}/pin")
async def pin_drop_comment(
    drop_id: str,
    comment_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Pin a top-level comment (owner only). Replaces any earlier pin."""
    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Drop not found")
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")
    if drop.get("sender_id") != current_user_id:
        raise HTTPException(status_code=403, detail="Only the drop's author can pin a comment")

    try:
        comment = await db["drop_threads"].find_one({"_id": ObjectId(comment_id), "drop_id": drop_id})
    except Exception:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.get("parent_id"):
        raise HTTPException(status_code=400, detail="Only top-level comments can be pinned")

    await db["drop_threads"].update_many(
        {"drop_id": drop_id, "pinned": True}, {"$set": {"pinned": False}},
    )
    await db["drop_threads"].update_one(
        {"_id": ObjectId(comment_id)}, {"$set": {"pinned": True}},
    )
    await emit_comment_pinned(drop_id, comment_id)
    return {"pinned": True, "comment_id": comment_id}


@router.delete("/{drop_id}/thread/{comment_id}/pin")
async def unpin_drop_comment(
    drop_id: str,
    comment_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Drop not found")
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")
    if drop.get("sender_id") != current_user_id:
        raise HTTPException(status_code=403, detail="Only the drop's author can unpin a comment")

    await db["drop_threads"].update_one(
        {"_id": ObjectId(comment_id), "drop_id": drop_id}, {"$set": {"pinned": False}},
    )
    await emit_comment_unpinned(drop_id, comment_id)
    return {"pinned": False, "comment_id": comment_id}


@router.post("/{drop_id}/view")
async def view_drop(
    drop_id: str,
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    db = Depends(get_database),
):
    try:
        # One view per viewer: signed-in user id, or a hashed device id for guests.
        # Guests with no device id aren't deduplicated.
        viewer_key = None
        if current_user_id:
            viewer_key = current_user_id
        elif x_device_id:
            viewer_key = f"device:{fingerprint_hash(x_device_id)}"

        drop = None
        if viewer_key:
            result = await db["drop_views"].update_one(
                {"drop_id": drop_id, "user_id": viewer_key},
                {"$set": {"drop_id": drop_id, "user_id": viewer_key, "viewed_at": now_utc()}},
                upsert=True,
            )
            if result.upserted_id is not None:
                drop = await db["drops"].find_one_and_update(
                    {"_id": ObjectId(drop_id)}, {"$inc": {"views_count": 1}},
                    return_document=ReturnDocument.AFTER,
                )
        else:
            drop = await db["drops"].find_one_and_update(
                {"_id": ObjectId(drop_id)}, {"$inc": {"views_count": 1}},
                return_document=ReturnDocument.AFTER,
            )

        # Always return the real count so the client can sync.
        if drop is None:
            drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
        return {"status": "success", "views_count": drop.get("views_count", 0) if drop else 0}
    except Exception as e:
        print(f"View tracking skipped: {e}")
    return {"status": "success"}


# ==================== FEED ====================
# Main feed. Personalised by the viewer's mood_tag affinity.

VALID_MOOD_TAGS = {"longing", "untold", "horny", "discreet"}

_drop_count_cache: dict = {"value": 0, "ts": 0.0}


async def get_behavioral_interests(user_id: str, db) -> dict:
    doc = await db["user_affinities"].find_one({"user_id": user_id})
    if doc:
        return doc.get("affinities", {})
    return {}


async def update_drop_affinity(user_id: str, mood_tag: Optional[str], action: str, db):
    weights = {"like": 3, "save": 2, "comment": 1}
    weight = weights.get(action, 1)
    if not mood_tag or mood_tag not in VALID_MOOD_TAGS:
        return
    await db["user_affinities"].update_one(
        {"user_id": user_id},
        {"$inc": {f"affinities.{mood_tag}": weight}, "$set": {"updated_at": now_utc()}},
        upsert=True,
    )


async def track_feed_streak(user_id: str, db) -> dict:
    today = now_utc().date().isoformat()
    doc = await db["user_streaks"].find_one({"user_id": user_id})

    if not doc:
        await db["user_streaks"].insert_one({
            "user_id": user_id, "streak": 1, "last_visit": today,
            "longest_streak": 1, "created_at": now_utc(),
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
            {"$set": {"streak": new_streak, "last_visit": today, "longest_streak": new_longest}},
        )
        return {"streak": new_streak, "is_new_day": True, "message": message}
    else:
        await db["user_streaks"].update_one(
            {"user_id": user_id},
            {"$set": {"streak": 1, "last_visit": today}},
        )
        return {"streak": 1, "is_new_day": True, "message": None}


def _score_drop(drop: dict, user_affinities: dict, now: datetime) -> float:
    score = 0.0
    mood = drop.get("mood_tag")
    if mood:
        score += min(user_affinities.get(mood, 0) * 2, 30)

    created_at = drop.get("created_at")
    if created_at:
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        age_hours = (now - created_at).total_seconds() / 3600
        score += 25 * max(0.0, 1.0 - age_hours / 168)

    engagement = (
        drop.get("likes_count", 0)
        + drop.get("saves_count", 0) * 1.5
        + drop.get("thread_count", 0) * 2
    )
    score += min(math.log1p(engagement) * 3, 15)
    return score


def _weighted_shuffle_drops(drops: list, user_affinities: dict) -> list:
    now = datetime.now(timezone.utc)
    scored = [(_score_drop(d, user_affinities, now), d) for d in drops]
    high   = [d for s, d in scored if s >= 50]
    medium = [d for s, d in scored if 20 <= s < 50]
    low    = [d for s, d in scored if s < 20]
    random.shuffle(high)
    random.shuffle(medium)
    random.shuffle(low)
    return high + medium + low


async def batch_format_drops(drops: list, current_user_id: Optional[str], db) -> list:
    drop_ids     = [str(d["_id"]) for d in drops]
    drop_ids_obj = [d["_id"] for d in drops]
    hookup_ids = [str(d["_id"]) for d in drops if d.get("kind") == "hookup"]
    # Sender avatars in one query. Admin drops excluded so the real account stays hidden.
    sender_oids = [
        ObjectId(sid) for sid in {
            d.get("sender_id") for d in drops
            if d.get("sender_id") and not d.get("is_admin_drop")
        } if ObjectId.is_valid(sid)
    ]

    # The page's lookups don't depend on each other, so they run together: one
    # database round trip of waiting instead of six in a row.
    async def counts(coll, pipeline):
        return {item["_id"]: item["count"] async for item in db[coll].aggregate(pipeline)}

    async def none():
        return []

    (
        thread_counts, linkup_counts, avatar_rows, saved_rows, liked_rows, vote_rows,
    ) = await asyncio.gather(
        counts("drop_threads", [
            {"$match": {"drop_id": {"$in": drop_ids}}},
            {"$group": {"_id": "$drop_id", "count": {"$sum": 1}}},
        ]),
        # "4 linked up" social proof on hookup posts: pending + accepted requests.
        counts("drop_unlock_requests", [
            {"$match": {"target_id": {"$in": hookup_ids}, "status": {"$in": ["pending", "accepting", "accepted"]}}},
            {"$group": {"_id": "$target_id", "count": {"$sum": 1}}},
        ]) if hookup_ids else asyncio.sleep(0, result={}),
        db["users"].find({"_id": {"$in": sender_oids}}, {"avatar_url": 1}).to_list(None) if sender_oids else none(),
        db["saved_drops"].find({"drop_id": {"$in": drop_ids}, "user_id": current_user_id}, {"drop_id": 1}).to_list(None) if current_user_id else none(),
        db["drops"].find({"_id": {"$in": drop_ids_obj}, "liked_by": current_user_id}, {"_id": 1}).to_list(None) if current_user_id else none(),
        db["drop_poll_votes"].find({"drop_id": {"$in": drop_ids}, "user_id": current_user_id}, {"drop_id": 1, "option_index": 1}).to_list(None) if current_user_id else none(),
    )
    sender_avatars: dict[str, Optional[str]] = {str(u["_id"]): u.get("avatar_url") for u in avatar_rows}
    saved_set = {r["drop_id"] for r in saved_rows}
    liked_set = {str(r["_id"]) for r in liked_rows}
    voted_map: dict[str, int] = {v["drop_id"]: v["option_index"] for v in vote_rows}

    formatted = []
    for drop in drops:
        did = str(drop["_id"])
        raw_poll = drop.get("poll")
        poll_out = None
        if raw_poll:
            voted_option = voted_map.get(did)
            options_out = []
            total = raw_poll.get("total_votes", 0)
            for opt in raw_poll.get("options", []):
                votes = opt.get("votes", 0)
                options_out.append({
                    "text": opt["text"],
                    "votes": votes if voted_option is not None else None,
                    "percent": round(votes / total * 100) if total > 0 and voted_option is not None else None,
                })
            poll_out = {
                "question":     raw_poll["question"],
                "options":      options_out,
                "total_votes":  total,
                "voted_option": voted_option,
            }

        confession = drop.get("confession") or ""
        created_at = drop.get("created_at")
        has_media  = bool(drop.get("media_url"))
        if (not confession and not has_media) or not created_at:
            continue
        created_at_iso = created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at)
        formatted.append({
            "id":               did,
            # Never expose the admin account behind an official drop.
            "user_id":          None if drop.get("is_admin_drop") else drop.get("sender_id"),
            "content":          confession,
            "anonymous_name":   drop.get("sender_anonymous_name"),
            "avatar_url":       sender_avatars.get(drop.get("sender_id")),
            "is_admin_drop":    drop.get("is_admin_drop", False),
            "mood_tag":         drop.get("mood_tag"),
            "theme":            drop.get("theme"),
            "intent":           drop.get("intent"),
            "kind":             drop.get("kind"),
            "hookup":           drop.get("hookup"),
            "live_until":       _aware(drop["live_until"]).isoformat() if drop.get("live_until") else None,
            "linkup_count":     linkup_counts.get(did, 0) if drop.get("kind") == "hookup" else None,
            "sensitivity":      drop.get("sensitivity", "general"),
            "intensity":        drop.get("intensity"),
            "media_url":        drop.get("media_url"),
            "media_type":       drop.get("media_type"),
            "video_url":        drop.get("media_url") if drop.get("media_type") == "video" else None,
            "video_edit":       drop.get("video_edit") if drop.get("media_type") == "video" else None,
            "cover_url":        drop.get("cover_url"),
            "sound":            drop.get("sound"),
            "promo_kind":       drop.get("promo_kind") if drop.get("promo_until") and _aware(drop["promo_until"]) > now_utc() else None,
            "audio_url":        drop.get("media_url") if drop.get("media_type") == "voice" else None,
            "image_url":        drop.get("image_url"),
            # Multi-image posts: the photos in order.
            "images":           drop.get("images") or None,
            "card_image_url":   drop.get("card_image_url"),
            "poll":             poll_out,
            "tags":             drop.get("tags") or None,
            "topics":           drop.get("topics") or None,
            "thread_count":     thread_counts.get(did, 0),
            "views_count":      drop.get("views_count", 0),
            "saves_count":      drop.get("saves_count", 0),
            "likes_count":      drop.get("likes_count", 0),
            "is_liked":         did in liked_set,
            "is_saved":         did in saved_set,
            "created_at":       created_at_iso,
            "time_ago":         get_time_ago(created_at),
            "is_own_post":      drop.get("sender_id") == current_user_id if current_user_id else False,
            "type":             "drop",
        })

    return formatted


@router.get("/feed")
async def get_drops_feed(
    session_posts: int = Query(0, ge=0),
    cursor: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_content_mode: Optional[str] = Header(None, alias="X-Content-Mode"),
    x_country: Optional[str] = Header(None, alias="X-Country"),
    db = Depends(get_database),
):
    current_user_id = None
    if authorization:
        try:
            from jose import jwt
            token = authorization.replace("Bearer ", "")
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            current_user_id = payload.get("sub")
        except Exception as e:
            print(f"⚠️ Guest token: {e}")

    SESSION_LIMIT = 100000  # effectively uncapped: the feed pages through every drop
    BATCH_SIZE = 10

    if session_posts >= SESSION_LIMIT:
        return {
            "posts": [], "message": "session_limit", "has_more": False,
            "session_posts": session_posts, "is_guest": current_user_id is None,
        }

    drops_to_load = min(BATCH_SIZE, SESSION_LIMIT - session_posts)

    streak_info = None
    user_doc = None
    user_affinities: dict = {}

    if current_user_id:
        async def _fetch_user_doc():
            return await db["users"].find_one(
                {"_id": ObjectId(current_user_id)},
                {
                    "blocked_user_ids": 1,
                    "location_country": 1, "location_county": 1,
                    "location_sub_county": 1, "location_estate": 1,
                    "feed_location_scope": 1, "age_verified": 1,
                    "detected_country": 1, "local_first": 1,
                },
            )

        streak_info, user_doc, user_affinities = await asyncio.gather(
            track_feed_streak(current_user_id, db),
            _fetch_user_doc(),
            get_behavioral_interests(current_user_id, db),
        )

    blocked_ids = list(user_doc.get("blocked_user_ids", []) if user_doc else [])
    if current_user_id:
        blocked_ids += [str(u["_id"]) async for u in db["users"].find({"blocked_user_ids": current_user_id}, {"_id": 1})]

    pool_query = {"sender_id": {"$nin": blocked_ids}} if blocked_ids else {}
    pool_query = apply_content_mode(pool_query, mature_allowed(x_content_mode, user_doc))
    pool_query = {"$and": [pool_query, discovery_fresh(now_utc()), DISCOVERY_VISIBLE]} if pool_query else {"$and": [discovery_fresh(now_utc()), DISCOVERY_VISIBLE]}

    loc_filter = build_feed_location_filter(
        {
            "country":    user_doc.get("location_country")    if user_doc else None,
            "county":     user_doc.get("location_county")     if user_doc else None,
            "sub_county": user_doc.get("location_sub_county") if user_doc else None,
            "estate":     user_doc.get("location_estate")     if user_doc else None,
        },
        user_doc.get("feed_location_scope") if user_doc else None,
    )
    if loc_filter:
        pool_query = {"$and": [pool_query, loc_filter]} if pool_query else loc_filter

    # Mixed feed: MEDIA_RUN media drops, then one text confession, repeating. Each kind pages
    # separately (utils/feed_mix.py). Local first, using the viewer's country unless turned off.
    detected = country_from_header(x_country)
    if detected and user_doc and user_doc.get("detected_country") != detected:
        await db["users"].update_one({"_id": user_doc["_id"]}, {"$set": {"detected_country": detected}})
    viewer_country = (
        known_country(user_doc.get("location_country")) if user_doc else None
    ) or detected or (known_country(user_doc.get("detected_country")) if user_doc else None)
    if user_doc and user_doc.get("local_first") is False:
        viewer_country = None

    scheduled_publisher.nudge(db)
    now = now_utc()
    stream_query = {"$and": [pool_query, not_promoted(now)]} if pool_query else not_promoted(now)
    page, next_cursor, page_has_more = await fetch_mixed(db, stream_query, drops_to_load, cursor, viewer_country)

    drops = reslot(page, _weighted_shuffle_drops(page, user_affinities))
    if not cursor:
        drops = splice_promoted(drops, await fetch_promoted(db, pool_query, now))
    formatted_drops = await batch_format_drops(drops, current_user_id, db)

    final_feed = []
    # Short divider lines between drops (shown on one line).
    divider_texts = [
        "consent isn't a mood killer.",
        "'not tonight' is a full sentence.",
        "get tested. that's respect.",
        "communication is the actual foreplay.",
        "aftercare isn't extra.",
        "a great partner keeps asking.",
        "boundaries aren't walls.",
        "the orgasm gap is real. ask more.",
        "protection isn't romantic. it's smart.",
        "you can change your mind mid-anything.",
        "reading 'no' is a required skill.",
        "your worth isn't who replies first.",
        "ask and you shall be given.",
        "you won't get what you don't ask for.",
        "say it. someone wants to give it.",
        "unposted drops make no connections.",
        "clarity isn't clingy. ask again.",
    ]

    for i, drop in enumerate(formatted_drops):
        final_feed.append(drop)
        if (i + 1) % 5 == 0 and i + 1 < len(formatted_drops):
            final_feed.append({"type": "divider", "text": random.choice(divider_texts)})

    new_session_posts = session_posts + len(drops)
    has_more = page_has_more and new_session_posts < SESSION_LIMIT

    return {
        "posts":         final_feed,
        "has_more":      has_more,
        "session_posts": new_session_posts,
        "next_cursor":   next_cursor,
        "is_guest":      current_user_id is None,
        "streak":        streak_info,
    }


@router.get("/single/{drop_id}")
async def get_single_drop(
    drop_id: str,
    x_content_mode: Optional[str] = Header(None, alias="X-Content-Mode"),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db = Depends(get_database),
):
    """One drop in feed shape — target of shared links (anonixx.com/drop/<id>)."""
    if not ObjectId.is_valid(drop_id):
        raise HTTPException(status_code=404, detail="Drop not found")
    user_doc = None
    if current_user_id and ObjectId.is_valid(current_user_id):
        user_doc = await db["users"].find_one({"_id": ObjectId(current_user_id)}, {"age_verified": 1})
    drop = await db["drops"].find_one(apply_content_mode({
        "_id": ObjectId(drop_id), "is_active": True, "moderation_status": "visible",
    }, mature_allowed(x_content_mode, user_doc)))
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")
    formatted = await batch_format_drops([drop], current_user_id, db)
    return {"post": formatted[0]}


@router.get("/search")
async def search_drops(
    q:                   Optional[str] = Query(None),
    mood_tag:            Optional[str] = Query(None),
    intent:              Optional[str] = Query(None),
    filter:              str = Query("recent"),
    location_country:    Optional[str] = Query(None),
    location_county:     Optional[str] = Query(None),
    location_sub_county: Optional[str] = Query(None),
    location_estate:     Optional[str] = Query(None),
    limit: int = Query(20, le=50, ge=1),
    skip:  int = Query(0, ge=0),
    x_content_mode: Optional[str] = Header(None, alias="X-Content-Mode"),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db = Depends(get_database),
):
    """Full-text search across drop confessions + sender name. Case-insensitive."""
    query = (q or "").strip()
    valid_mood   = mood_tag if mood_tag in VALID_MOOD_TAGS else None
    valid_intent = intent if intent in VALID_INTENTS else None
    loc_filter = build_location_search_filter(
        location_country, location_county, location_sub_county, location_estate,
    )
    if not query and not valid_mood and not valid_intent and not loc_filter:
        return {"results": [], "total": 0, "query": query}

    base_filter: dict = {}
    if query:
        safe_query = re.escape(query)
        rx = {"$regex": safe_query, "$options": "i"}
        base_filter["$or"] = [
            {"confession":            rx},
            {"sender_anonymous_name": rx},
            {"tags":                  rx},
            {"poll.question":         rx},
        ]

    if valid_mood:
        base_filter["mood_tag"] = valid_mood

    if valid_intent:
        base_filter["intent"] = valid_intent

    if filter == "recent":
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        base_filter["created_at"] = {"$gte": cutoff}

    if loc_filter:
        base_filter = {"$and": [base_filter, loc_filter]} if base_filter else loc_filter

    from app.utils.discovery import viewer_context, eligible
    ctx = await viewer_context(db, current_user_id, x_content_mode)
    base_filter = {"$and": ([base_filter] if base_filter else []) + eligible(ctx, now_utc())}

    sort_key = "likes_count" if filter == "popular" else "created_at"

    total = await db["drops"].count_documents(base_filter)
    raw   = await db["drops"].find(base_filter) \
                .sort(sort_key, -1) \
                .skip(skip) \
                .limit(limit) \
                .to_list(limit)

    results = await batch_format_drops(raw, current_user_id, db)
    return {"results": results, "total": total, "query": query, "filter": filter}


# ==================== MY DROPS (dashboard) ====================

@router.get("/mine")
async def get_my_drops(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Every drop the current user has authored — used by the user dashboard's
    'My Drops' section (edit/delete live there, not in the public feed)."""
    cursor = db["drops"].find({"sender_id": current_user_id}).sort("created_at", -1)
    drops = await cursor.to_list(200)

    total_views = 0
    total_likes = 0
    formatted = []
    for drop in drops:
        created_at = drop.get("created_at")
        views = drop.get("views_count", 0)
        likes = drop.get("likes_count", 0)
        total_views += views
        total_likes += likes
        formatted.append({
            "id":           str(drop["_id"]),
            "content":      drop.get("confession") or "",
            "media_url":    drop.get("media_url"),
            "media_type":   drop.get("media_type"),
            "images":       drop.get("images") or None,
            "views_count":  views,
            "likes_count":  likes,
            "saves_count":  drop.get("saves_count", 0),
            "created_at":   created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
            "edited_at":    drop["edited_at"].isoformat() if drop.get("edited_at") else None,
            "kind":         drop.get("kind"),
            "topics":       drop.get("topics") or [],
            "time_ago":     get_time_ago(created_at) if created_at else "",
        })

    return {
        "posts":       formatted,
        "total_posts": len(formatted),
        "total_views": total_views,
        "total_likes": total_likes,
    }


@router.post("/{drop_id}/extend")
async def extend_hookup(
    drop_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Keeps a hookup post live another HOOKUP_LIVE_HOURS (from now if it already
    ran out), up to HOOKUP_MAX_LIVE_HOURS after it was posted. Owner only."""
    try:
        oid = ObjectId(drop_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid drop ID.")
    drop = await db["drops"].find_one({"_id": oid}, {"sender_id": 1, "kind": 1, "live_until": 1, "created_at": 1, "hookup.fresh_window": 1})
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found.")
    if drop["sender_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Only the person who posted it can extend it.")
    if drop.get("kind") != "hookup":
        raise HTTPException(status_code=400, detail="Only hookup posts run on a timer.")
    now = now_utc()
    _, step, most = FRESH_WINDOWS.get((drop.get("hookup") or {}).get("fresh_window") or "tonight", FRESH_WINDOWS["tonight"])
    ceiling = _aware(drop["created_at"]) + most
    base = max(now, _aware(drop["live_until"])) if drop.get("live_until") else now
    if base >= ceiling - timedelta(minutes=1):
        limit = f"{int(most.total_seconds() // 3600)} hours" if most < timedelta(days=3) else f"{most.days} days"
        raise HTTPException(status_code=400, detail=f"This post can stay up {limit} at most. Post a fresh one.")
    live_until = min(base + step, ceiling)
    await db["drops"].update_one({"_id": oid}, {"$set": {"live_until": live_until}})
    return {"live_until": live_until.isoformat()}


class EditDropRequest(BaseModel):
    content: Optional[str] = None
    topics: Optional[List[str]] = None   # replaces the author's moods/topics; [] clears


@router.patch("/{drop_id}")
async def edit_drop(
    drop_id: str,
    data: EditDropRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    if data.content is None and data.topics is None:
        raise HTTPException(status_code=400, detail="Nothing to change.")
    if data.content is not None and not data.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty.")

    try:
        oid = ObjectId(drop_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid drop ID.")

    drop = await db["drops"].find_one({"_id": oid})
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found.")
    if drop["sender_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="You can only edit your own drops.")

    update: dict = {"edited_at": now_utc()}
    if data.content is not None:
        # Edits pass the same gates as a new post (they used to skip them, so a
        # clean post could be edited into one carrying a phone number).
        text = data.content.strip()
        if contains_contact_info(text):
            raise HTTPException(status_code=400, detail=CONTACT_INFO_ERROR)
        if violates_policy(text):
            raise HTTPException(status_code=400, detail=MODERATION_ERROR)
        update["confession"] = text
        update["sensitivity"] = classify_sensitivity(text, marked_mature=drop.get("sensitivity") == "mature")
    if data.topics is not None:
        if drop.get("kind") == "hookup":
            raise HTTPException(status_code=400, detail="Moods and topics are for confessions.")
        update["topics"] = clean_topics(data.topics) or None
    await db["drops"].update_one({"_id": oid}, {"$set": update})
    return {"message": "Drop updated.", "topics": update.get("topics", drop.get("topics")) or []}


@router.delete("/{drop_id}")
async def delete_drop(
    drop_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    try:
        oid = ObjectId(drop_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid drop ID.")

    drop = await db["drops"].find_one({"_id": oid})
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found.")
    if drop["sender_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="You can only delete your own drops.")

    # Cascade delete
    await db["drops"].delete_one({"_id": oid})
    await db["drop_threads"].delete_many({"drop_id": drop_id})
    await db["saved_drops"].delete_many({"drop_id": drop_id})
    await db["drop_views"].delete_many({"drop_id": drop_id})
    await stream.delete_video(drop.get("stream_uid"))   # Stream bills per stored minute

    return {"message": "Gone for good."}


# ==================== UNLOCK — COINS ====================

COINS_UNLOCK_COST         = 6    # coins required to unlock a drop

# Hookup posts are live for HOOKUP_LIVE_HOURS, extendable up to HOOKUP_MAX_LIVE_HOURS.
# After that they leave the feed and can't be linked up with.
HOOKUP_LIVE_HOURS = 12
HOOKUP_MAX_LIVE_HOURS = 48


def live_filter(now: datetime) -> dict:
    """Feed condition: drops with no live window (everything but hookups, and
    hookups posted before the window existed) or one that hasn't run out."""
    return {"$or": [{"live_until": None}, {"live_until": {"$gt": now}}]}


AGE_GATE_DETAIL = {
    "code": "age_verification_required",
    "message": "Confirm you're 18+ first. It takes a second, and it keeps everyone here an adult.",
}
ORIGIN_AUTHOR_UNLOCK_COST = 3    # discounted rate for the author of the inspiring post


# ==================== UNLOCK — M-PESA ====================


# ==================== UNLOCK — STRIPE ====================


# ==================== M-PESA CALLBACK ====================


# ==================== POLL UNLOCK STATUS ====================


# Approx. coins per dollar (3 coins / $0.99), to record a cash unlock's coin value.
CASH_TO_COIN_RATE = 3 / 0.99


async def _credit_reward(drop: dict, coin_equivalent: int, db):
    """Credit the owner their flat unlock reward."""
    reward = await unlock_reward_for(drop["sender_id"], db)
    if reward <= 0:
        return
    try:
        await credit_coins(
            db=db,
            user_id=drop["sender_id"],
            amount=reward,
            reason="drop_unlock_reward",
            description=f"+{reward} coins — someone unlocked your drop",
            meta={
                "drop_id": str(drop["_id"]),
                "unlock_cost_coins": coin_equivalent,
                "reward_coins": reward,
            },
        )
    except ValueError:
        pass  # sender account missing — don't fail the unlocker's flow over it


async def _complete_unlock(
    drop_id: str, unlocker_id: str, drop: dict, method: str, db,
    coin_equivalent: Optional[int] = None, amount_charged: Optional[float] = None,
):
    """Finish an unlock. `amount_charged` is what the unlocker actually paid."""
    if coin_equivalent is None:
        cash_price = drop.get("price", DROP_PRICE_USD)
        coin_equivalent = round(cash_price * CASH_TO_COIN_RATE)
    await _credit_reward(drop, coin_equivalent, db)

    await db["drop_unlocks"].insert_one({
        "_id": ObjectId(),
        "drop_id": drop_id,
        "unlocker_id": unlocker_id,
        "sender_id": drop["sender_id"],
        "method": method,
        "amount": amount_charged if amount_charged is not None else drop.get("price", DROP_PRICE_USD),
        "sender_anonymous_name": drop["sender_anonymous_name"],
        "created_at": now_utc()
    })
    await db["drops"].update_one(
        {"_id": ObjectId(drop_id)},
        {"$inc": {"unlock_count": 1}}
    )

    # The first unlock starts the deletion clock, once only. Regular confessions never start it.
    if drop.get("kind") != "confession":
        grace_days = await grace_days_for(drop["sender_id"], db)
        await db["drops"].update_one(
            {"_id": ObjectId(drop_id), "expires_at": None},
            {"$set": {"expires_at": now_utc() + timedelta(days=grace_days)}},
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
        # A fresh Let In after the owner removed them reopens the same thread.
        if existing_conn.get("removed_at"):
            await db["drop_connections"].update_one(
                {"_id": existing_conn["_id"]}, {"$set": {"removed_at": None, "removed_by": None}},
            )
        # Update the unlock record with connection_id
        await db["drop_unlocks"].update_many(
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

async def get_unread_message_counts(db, user_id: str) -> dict:
    """Unread message count per connection for this user. New connections start unread."""
    conns = await db["drop_connections"].find({
        "$or": [{"sender_id": user_id}, {"unlocker_id": user_id}]
    }).to_list(None)
    if not conns:
        return {}

    thresholds = {}
    for c in conns:
        is_sender = c["sender_id"] == user_id
        last_read = c.get("sender_last_read_at") if is_sender else c.get("unlocker_last_read_at")
        thresholds[str(c["_id"])] = last_read or c["created_at"]

    min_cutoff = min(thresholds.values())
    unread_msgs = await db["drop_messages"].find({
        "connection_id": {"$in": list(thresholds.keys())},
        "sender_id": {"$ne": user_id},
        "created_at": {"$gt": min_cutoff},
    }).to_list(None)

    counts = {cid: 0 for cid in thresholds}
    for m in unread_msgs:
        cid = m["connection_id"]
        if m["created_at"] > thresholds[cid]:
            counts[cid] += 1
    return counts


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
        ],
        "removed_at": None,
    }
    raw_connections = await db["drop_connections"].find(query).sort("last_message_at", -1).to_list(None)
    unread_counts = await get_unread_message_counts(db, current_user_id)

    # The other person's current avatar (it can change after connecting).
    other_ids = set()
    for conn in raw_connections:
        is_sender = conn["sender_id"] == current_user_id
        other_ids.add(conn["unlocker_id"] if is_sender else conn["sender_id"])
    avatar_by_id = {}
    if other_ids:
        valid_ids = [ObjectId(oid) for oid in other_ids if ObjectId.is_valid(oid)]
        async for u in db["users"].find({"_id": {"$in": valid_ids}}, {"avatar_url": 1}):
            avatar_by_id[str(u["_id"])] = u.get("avatar_url")

    from app.websockets.events import is_user_online

    connections = []
    for conn in raw_connections:
        is_sender = conn["sender_id"] == current_user_id
        other_id = conn["unlocker_id"] if is_sender else conn["sender_id"]
        other_name = conn["unlocker_anonymous_name"] if is_sender else conn["sender_anonymous_name"]

        last_msg = await db["drop_messages"].find_one(
            {"connection_id": str(conn["_id"])},
            sort=[("created_at", -1)]
        )

        # Seen tick, only when the last message is mine.
        other_last_read_at = conn.get("unlocker_last_read_at" if is_sender else "sender_last_read_at")
        last_message_is_own = bool(last_msg and last_msg["sender_id"] == current_user_id)
        last_message_seen = bool(
            last_message_is_own and other_last_read_at
            and last_msg["created_at"] <= other_last_read_at
        )

        connections.append({
            "id": str(conn["_id"]),
            "drop_id": conn["drop_id"],
            "confession": conn["confession"],
            "other_user_id": other_id,
            "other_anonymous_name": other_name,
            "other_avatar_url": avatar_by_id.get(other_id),
            "other_is_online": is_user_online(other_id),
            "is_sender": is_sender,
            "message_count": conn.get("message_count", 0),
            "unread_count": unread_counts.get(str(conn["_id"]), 0),
            "last_message": last_msg["content"] if last_msg else None,
            "last_message_at": conn["last_message_at"].isoformat(),
            "last_message_is_own": last_message_is_own,
            "last_message_seen": last_message_seen,
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
    if conn.get("removed_at"):
        raise HTTPException(status_code=403, detail="You're no longer inside this Room.")

    is_sender = conn["sender_id"] == current_user_id
    other_user_id = conn["unlocker_id"] if is_sender else conn["sender_id"]
    # The other person's last read time, which decides if my messages show as seen.
    other_last_read_at = conn.get("unlocker_last_read_at" if is_sender else "sender_last_read_at")

    messages = []
    async for msg in db["drop_messages"].find(
        # Hide messages this viewer deleted for themselves.
        {"connection_id": connection_id, "deleted_for": {"$ne": current_user_id}}
    ).sort("created_at", 1):
        is_own = msg["sender_id"] == current_user_id
        deleted_for_everyone = bool(msg.get("deleted_for_everyone"))

        reply_payload = _reply_payload_for(msg.get("reply_to"), current_user_id)

        messages.append({
            "id": str(msg["_id"]),
            # A deleted-for-everyone message keeps its row (so the thread
            # doesn't jump around) but never leaks its real content again.
            "content":         "" if deleted_for_everyone else msg["content"],
            "media_url":       None if deleted_for_everyone else msg.get("media_url"),
            "media_type":      None if deleted_for_everyone else msg.get("media_type"),
            "duration_seconds": None if deleted_for_everyone else msg.get("duration_seconds"),
            "deleted":         deleted_for_everyone,
            "reply_to":        reply_payload,
            "sender_id": msg["sender_id"],
            "is_own": is_own,
            # Only meaningful on my own sent messages — ticks aren't shown
            # on messages I received.
            "seen": bool(is_own and other_last_read_at and msg["created_at"] <= other_last_read_at),
            "time_ago": get_time_ago(msg["created_at"]),
            "created_at": msg["created_at"].isoformat(),
        })

    # Opening (and polling) the thread marks it read; the other side is told live.
    read_field = "sender_last_read_at" if is_sender else "unlocker_last_read_at"
    seen_at = now_utc()
    await db["drop_connections"].update_one(
        {"_id": ObjectId(connection_id)},
        {"$set": {read_field: seen_at}}
    )
    await emit_messages_seen(other_user_id, connection_id, seen_at.isoformat())

    # The poster's themed chat surface — always the drop's *sender*, since
    # a chat_profile is reused across every unlocker who chats with them.
    chat_profile = await db["chat_profiles"].find_one({"user_id": conn["sender_id"]})
    from app.api.v1.chat_profile import gallery_for, room_theme_of
    # Being let in never shows a gallery the owner keeps to themself.
    room_gallery = gallery_for(chat_profile, current_user_id, conn["sender_id"], inside=True) if chat_profile else []

    from app.api.v1.drop_calls import get_active_call_for_host
    active_call = await get_active_call_for_host(conn["sender_id"], db)

    from app.websockets.events import is_user_online

    # Welcome gallery and sound, once per unlocker on first open.
    welcome_gallery = []
    welcome_sound = None
    if not is_sender and chat_profile:
        shown_to = conn.get("welcome_shown_to", [])
        if current_user_id not in shown_to:
            welcome_gallery = room_gallery
            welcome_sound = chat_profile.get("welcome_sound", "soft-chime")
            await db["drop_connections"].update_one(
                {"_id": ObjectId(connection_id)},
                {"$addToSet": {"welcome_shown_to": current_user_id}},
            )

    return {
        "messages": messages,
        "connection": {
            "id": connection_id,
            "confession": conn["confession"],
            "other_anonymous_name": conn["unlocker_anonymous_name"] if is_sender else conn["sender_anonymous_name"],
            "is_sender": is_sender,
            "host_user_id": conn["sender_id"],
            "other_user_id": other_user_id,
            "other_is_online": is_user_online(other_user_id),
        },
        "chat_profile": {
            "background_pattern": chat_profile.get("background_pattern", "midnight-solid") if chat_profile else "midnight-solid",
            "font_style":          chat_profile.get("font_style", "clean-regular") if chat_profile else "clean-regular",
            "profile_picture_url": chat_profile.get("profile_picture_url") if chat_profile else None,
            "welcome_sound":       chat_profile.get("welcome_sound", "soft-chime") if chat_profile else "soft-chime",
            # Always available, so either side can open the gallery any time.
            "gallery":             room_gallery,
            "call_mode":           chat_profile.get("call_mode", "solo") if chat_profile else "solo",
            "room_theme":          room_theme_of(chat_profile or {}),
            "welcome_message":     (chat_profile or {}).get("welcome_message"),
        },
        "welcome_gallery": welcome_gallery,
        "welcome_sound": welcome_sound,
        "active_call": active_call,
    }


def _message_preview_text(content: str, media_type: Optional[str]) -> str:
    """Short label for a message — used both for push notification bodies
    and for the quoted snippet shown when another message replies to it."""
    if media_type == "voice":
        return "🎙 Voice note"
    if media_type == "image":
        return "📷 Photo"
    if media_type == "video":
        return "🎥 Video"
    content = content or ""
    return content[:60] + ("..." if len(content) > 60 else "")


def _reply_payload_for(reply_to: Optional[dict], viewer_id: str) -> Optional[dict]:
    """A reply quote as seen by one viewer (`is_own` depends on who's looking)."""
    if not reply_to:
        return None
    return {
        "id":         reply_to["id"],
        "preview":    reply_to["preview"],
        "media_type": reply_to.get("media_type"),
        "is_own":     reply_to["sender_id"] == viewer_id,
    }


@router.post("/connections/{connection_id}/message")
async def send_drop_message(
    connection_id: str,
    data: dict,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    content    = (data.get("content") or "").strip()
    media_url  = data.get("media_url")
    media_type = data.get("media_type")   # "voice" | "image" | "video"
    reply_to_id = data.get("reply_to_id")

    if not content and not media_url:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if violates_policy(content):
        raise HTTPException(status_code=400, detail=MODERATION_ERROR)
    if media_url and media_type not in ("voice", "image", "video"):
        raise HTTPException(status_code=400, detail="media_type must be 'voice', 'image', or 'video'")

    try:
        conn = await db["drop_connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        raise HTTPException(status_code=404, detail="Connection not found")

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if current_user_id not in [conn["sender_id"], conn["unlocker_id"]]:
        raise HTTPException(status_code=403, detail="Access denied")
    if conn.get("removed_at"):
        raise HTTPException(status_code=403, detail="You're no longer inside this Room.")

    # Store a snapshot of the replied-to message so the quote survives deletes.
    reply_to = None
    if reply_to_id:
        try:
            replied = await db["drop_messages"].find_one({
                "_id": ObjectId(reply_to_id), "connection_id": connection_id,
            })
        except Exception:
            replied = None
        if replied:
            reply_to = {
                "id":         str(replied["_id"]),
                "sender_id":  replied["sender_id"],
                "preview":    (
                    "This message was deleted" if replied.get("deleted_for_everyone")
                    else _message_preview_text(replied.get("content", ""), replied.get("media_type"))
                ),
                "media_type": None if replied.get("deleted_for_everyone") else replied.get("media_type"),
            }

    msg = {
        "_id": ObjectId(),
        "connection_id": connection_id,
        "sender_id": current_user_id,
        "content": content,
        "media_url": media_url,
        "media_type": media_type,
        "duration_seconds": data.get("duration_seconds"),
        "reply_to": reply_to,
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

    # Push the new message to the other person.
    await emit_new_message(other_id, connection_id, {
        "id":               str(msg["_id"]),
        "content":          content,
        "media_url":        media_url,
        "media_type":       media_type,
        "duration_seconds": msg["duration_seconds"],
        "sender_id":        current_user_id,
        "is_own":           False,
        "deleted":          False,
        "reply_to":         _reply_payload_for(reply_to, other_id),
        "time_ago":         "just now",
        "created_at":       msg["created_at"].isoformat(),
    })

    notify_body = _message_preview_text(content, media_type)
    await send_push_notification(
        other_id,
        f"{sender_name} sent a message 💬",
        notify_body,
        db,
        {"url": f"/chat/{connection_id}"},
    )

    return {
        "id": str(msg["_id"]),
        "content": content,
        "media_url": media_url,
        "media_type": media_type,
        "duration_seconds": msg["duration_seconds"],
        "deleted": False,
        "reply_to": _reply_payload_for(reply_to, current_user_id),
        "time_ago": "just now",
        "created_at": msg["created_at"].isoformat(),
    }


@router.post("/connections/{connection_id}/messages/{message_id}/delete")
async def delete_drop_message(
    connection_id: str,
    message_id: str,
    data: dict,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Delete a message. Default hides it for you only. for_everyone (sender only) replaces it
    with "This message was deleted" for both sides, live."""
    for_everyone = bool(data.get("for_everyone"))

    try:
        conn = await db["drop_connections"].find_one({"_id": ObjectId(connection_id)})
        msg  = await db["drop_messages"].find_one({
            "_id": ObjectId(message_id), "connection_id": connection_id,
        })
    except Exception:
        raise HTTPException(status_code=404, detail="Message not found")

    if not conn or not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if current_user_id not in [conn["sender_id"], conn["unlocker_id"]]:
        raise HTTPException(status_code=403, detail="Access denied")

    if for_everyone:
        if msg["sender_id"] != current_user_id:
            raise HTTPException(status_code=403, detail="You can only delete your own messages for everyone.")
        await db["drop_messages"].update_one(
            {"_id": ObjectId(message_id)},
            {"$set": {"deleted_for_everyone": True}},
        )
        other_id = conn["unlocker_id"] if current_user_id == conn["sender_id"] else conn["sender_id"]
        await emit_message_deleted(other_id, connection_id, message_id)
    else:
        await db["drop_messages"].update_one(
            {"_id": ObjectId(message_id)},
            {"$addToSet": {"deleted_for": current_user_id}},
        )

    return {"deleted": True, "for_everyone": for_everyone}


@router.post("/connections/{connection_id}/remove")
async def remove_from_room(
    connection_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """The Room owner removes a visitor. Their threads close (messages kept); they must knock
    and pay again to return. No refund."""
    try:
        conn = await db["drop_connections"].find_one({"_id": ObjectId(connection_id)})
    except Exception:
        conn = None
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    if conn["sender_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Only the Room's owner can remove someone.")

    result = await db["drop_connections"].update_many(
        {"sender_id": current_user_id, "unlocker_id": conn["unlocker_id"], "removed_at": None},
        {"$set": {"removed_at": now_utc(), "removed_by": current_user_id}},
    )
    return {"removed": True, "closed": result.modified_count}


@router.get("/room/{host_user_id}/guests")
async def list_room_guests(
    host_user_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Everyone connected with this host. Visible to the host and their connections."""
    is_host = current_user_id == host_user_id
    if not is_host and not await db["drop_connections"].find_one(
        {"sender_id": host_user_id, "unlocker_id": current_user_id}
    ):
        raise HTTPException(status_code=403, detail="Unlock a drop from this person first.")

    from app.websockets.events import is_user_online

    guests = []
    async for conn in db["drop_connections"].find({"sender_id": host_user_id}):
        guests.append({
            "user_id": conn["unlocker_id"],
            "anonymous_name": conn.get("unlocker_anonymous_name", "Anonymous"),
            "is_online": is_user_online(conn["unlocker_id"]),
            "unlocked_at": conn["_id"].generation_time.isoformat() if hasattr(conn["_id"], "generation_time") else None,
        })

    guests.sort(key=lambda g: g["is_online"], reverse=True)
    return {"guests": guests, "is_host": is_host}


# ==================== RENEW DROP ====================


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


# ==================== DAILY LIMIT (removed) ====================


# ==================== PUBLISH (section 16) ====================

@router.post("/{drop_id}/publish")
async def publish_drop(
    drop_id: str,
    data: PublishDropRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Publish a drop to Anonixx's social pages (after the poster confirms twice)."""
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

    teaser_image_url = None
    try:
        from app.services.card_generator import generate_teaser_card, upload_teaser_card
        teaser_bytes = await generate_teaser_card(drop)
        teaser_image_url = upload_teaser_card(teaser_bytes, drop_id)
        if teaser_image_url:
            await db["drops"].update_one(
                {"_id": ObjectId(drop_id)},
                {"$set": {"card_image_url": teaser_image_url}},
            )
    except Exception as e:
        print(f"⚠️ Teaser card generation failed for drop {drop_id}: {e}")

    # Queue for the social publishing worker (app/tasks/publisher_worker.py).
    await db["publisher_queue"].insert_one({
        "_id":               ObjectId(),
        "drop_id":           drop_id,
        "sender_id":         current_user_id,
        "theme":             drop.get("theme"),
        "media_type":        drop.get("media_type"),         # text | image | video | None
        "confession":        drop.get("confession"),
        "media_url":         drop.get("media_download_url") or drop.get("media_url"),   # socials need a plain file
        "teaser_image_url":  teaser_image_url,
        "submitted_at":      published_at,
        "status":            "queued",                       # queued | processing | posted | failed | rejected
        "retry_count":       0,
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
    """Report a drop. One report per user; 3 reports flag it. Self-harm reports hide it at once
    and show the reporter support resources."""
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
        {"$inc": {"report_count": 1}, "$set": {"risk_scored_at": None}},
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
