from fastapi import APIRouter, Depends, HTTPException, Query, Header
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from bson import ObjectId
import httpx
import random
import re

from app.database import get_database
from app.dependencies import get_current_user_id, get_optional_user_id
from app.config import settings
from app.utils.coin_service import debit_coins, credit_coins
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

# Confession type — the audience/nature a drop is written for. Chosen at
# compose time (DropsComposeScreen's "Confession Type" picker) and drives the
# card's whole visual identity (DropCardRenderer.jsx's CARD_INTENTS) — colors
# and background pattern, not just a label. Kept in sync with CARD_INTENTS
# there; don't rename an id on one side without the other.
# Trimmed to the 3 broadest intents + General as the default catch-all —
# covers the widest range of "why someone opens the app" (casual / serious /
# just lonely) rather than specific-audience recognition.
VALID_INTENTS = [
    "no-strings",         # casual, no labels, no promises
    "real-connection",    # tired of games, wants something real
    "just-talk",          # no romance pressure, just wants company
    "general",            # no specific audience — default
]

# Display labels — mirrors CARD_INTENTS' `label` field in
# DropCardRenderer.jsx exactly. Used to let a typed search query like
# "sex for fun" resolve to the same drops as tapping that filter chip
# (see get_marketplace's `q` handling below), not just the chip itself.
INTENT_LABELS = {
    "no-strings":      "Sex for Fun",
    "just-talk":       "Sex for Token",
    "real-connection": "Relationship",
    "general":         "General",
}

# Intents that belong in the "Open to Connect" marketplace section — genuine
# relationship-seeking ones. Excludes "no-strings" (casual, not relationship-
# seeking), "just-talk" (companionship, not dating) and "general" (no stated
# audience).
CONNECTION_INTENTS = {"real-connection"}

class DropPollInput(BaseModel):
    question: str
    options: List[str]  # 2–4 items


class DropVoteRequest(BaseModel):
    option_index: int


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
    theme: Optional[str] = None                  # "desire", "after-dark", "midnight-sin"
    mood_tag: Optional[str] = None               # "longing", "restless", …
    intensity: Optional[str] = None              # "soft" | "heavy" | "devastating"
    recognition_hint: Optional[str] = None       # one word, directed drops only
    # Share anonymously on Anonixx social. Tri-state: None/omitted = default
    # (auto-queued for eligible drops), True = explicit opt-in, False =
    # explicit opt-out — lets a client distinguish "didn't ask" from "said no."
    publisher_opt_in: Optional[bool] = None
    duration_seconds: Optional[float] = None     # voice drops
    waveform_data: Optional[List[float]] = None  # voice drops
    inspired_by_post_id: Optional[str] = None   # feed post that triggered this drop
    # AI refinement — set when the user accepted a suggested refinement
    ai_refined:      Optional[bool] = False
    ai_refined_mode: Optional[str]  = None      # "holding_back" | "distill" | "find_words"

    # Feed-as-drops upgrade — structured location, most-specific to least.
    # Only country + county are backed by a real fixed list client-side
    # (Kenya's 47 counties); sub_county/estate are freeform text everywhere
    # since no reliable exhaustive dataset exists for either.
    location_country:    Optional[str] = None   # e.g. "Kenya"
    location_county:     Optional[str] = None   # e.g. "Nairobi" (or state/region for non-Kenya)
    location_sub_county: Optional[str] = None   # e.g. "Westlands"
    location_estate:     Optional[str] = None   # e.g. "Kilimani"
    poll:       Optional[DropPollInput] = None   # optional attached poll
    font_style: Optional[str] = None             # "classic" | "sultry-script" | "bold-tease"


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
# Tier-2 themes are never published and are 18+ gated (age_verified AND
# explicit_content_opt_in both required — see the /drops POST handler below).
# NOTE: these previously didn't match the frontend's real theme ids at all
# (only "cinematic-coral"/"after-dark" happened to overlap) — every other
# theme selection was silently rejected by the check below. Now reduced to
# the 3 curated themes and kept in exact sync with the frontend.
TIER_1_THEMES = {"desire"}
TIER_2_THEMES = {"after-dark", "midnight-sin"}
VALID_THEMES = TIER_1_THEMES | TIER_2_THEMES

VALID_MOOD_TAGS = {
    "longing", "restless", "tender", "bitter", "hopeful",
    "ashamed", "dangerous", "quiet", "unsent", "reckless",
}

VALID_INTENSITIES = {"soft", "heavy", "devastating"}

# Card-text font presets — style composition on the two font families the app
# already ships (PlayfairDisplay / DMSans), not new font assets.
FONT_STYLES = {"classic", "sultry-script", "bold-tease"}

MAX_LOCATION_PART_LEN = 60


def _build_location(country, county, sub_county, estate):
    """Turns the 4 structured location inputs into (structured dict, display
    string) — most-specific to least, e.g. "Kilimani, Westlands, Nairobi,
    Kenya". Returns (None, None) if every part is empty."""
    parts = {
        "country":    (country or "").strip()[:MAX_LOCATION_PART_LEN] or None,
        "county":     (county or "").strip()[:MAX_LOCATION_PART_LEN] or None,
        "sub_county": (sub_county or "").strip()[:MAX_LOCATION_PART_LEN] or None,
        "estate":     (estate or "").strip()[:MAX_LOCATION_PART_LEN] or None,
    }
    if not any(parts.values()):
        return None, None
    display = ", ".join(
        v for v in [parts["estate"], parts["sub_county"], parts["county"], parts["country"]] if v
    )
    return parts, display

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


def _is_premium_active(user: dict) -> bool:
    """True while a purchased plan is still running — see api/v1/premium.py.
    `premium_active` is a legacy field some older accounts may still carry;
    `is_premium` alone (no premium_until) is treated as never-expiring."""
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

_CONTACT_INFO_PATTERNS = [
    re.compile(r"[\w.+-]+@[\w-]+\.[a-z]{2,}", re.IGNORECASE),          # email
    re.compile(r"(\+?\d[\d\-\s()]{7,}\d)"),                             # phone number
    re.compile(r"(?:^|\s)@[a-z0-9._]{2,}", re.IGNORECASE),              # @handle
    re.compile(r"\b(wa\.me|t\.me|snapchat\.com|instagram\.com|tiktok\.com|facebook\.com)\/\S+", re.IGNORECASE),
    re.compile(r"\bsnap(?:chat)?\s*[:：]\s*\S+", re.IGNORECASE),
    re.compile(r"\btelegram\s*[:：]\s*\S+", re.IGNORECASE),
    re.compile(r"\b(whatsapp|whats app)\b", re.IGNORECASE),
]


def _contains_contact_info(text: Optional[str]) -> bool:
    """
    Confessions stay public until someone pays to unlock a chat — contact
    info (phone/email/social handles) can't be smuggled into the public
    card text. Chat messages after unlock are exempt from this check.
    """
    if not text:
        return False
    return any(p.search(text) for p in _CONTACT_INFO_PATTERNS)


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

    if data.confession and len(data.confession) > 500:
        raise HTTPException(status_code=400, detail="Confession must be 500 characters or less")

    if _contains_contact_info(data.confession):
        raise HTTPException(
            status_code=400,
            detail="Remove contact info from your confession — you can share it after someone unlocks.",
        )

    if data.media_url and data.media_type not in ("image", "video", "voice"):
        raise HTTPException(status_code=400, detail="media_type must be 'image', 'video', or 'voice'")

    location_detail, location_display = _build_location(
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
        if _contains_contact_info(data.poll.question) or any(_contains_contact_info(o) for o in poll_options):
            raise HTTPException(status_code=400, detail="Remove contact info from your poll.")
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

    # Tier 2 themes (After Dark) are 18+ only and never published on social.
    # Signup itself is a hard 18+ gate (age_verified is always true past
    # registration), so that's sufficient on its own now — the separate
    # explicit_content_opt_in toggle no longer gates theme selection, only
    # a viewer's own feed preferences elsewhere.
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
    # Otherwise defaults True (auto-queue) unless the client explicitly opted out.
    publisher_opt_in = (data.publisher_opt_in is not False) and not is_tier2

    # ── Daily drop limit (section 14) ───────────────────────────
    is_premium = _is_premium_active(user)
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

        # Feed-as-drops upgrade
        "location":        location_display,   # joined display string, e.g. "Kilimani, Westlands, Nairobi, Kenya"
        "location_detail": location_detail,    # {country, county, sub_county, estate} — used for filtering
        "poll":       poll_data,
        "font_style": font_style,
    }

    await db["drops"].insert_one(drop)

    # ── Mirror into the main feed as a genuine post ──────────────
    # Drops surface inline in the main feed — but as an ordinary confession
    # post (real likes/saves/comments via the Posts API), not the separate
    # drop-card treatment with its own paywall/expiry/reactions. Tier-2
    # (After Dark) drops are never published anywhere, so they're excluded
    # here too, same as social publishing above.
    if not is_tier2:
        mirrored_poll = None
        if poll_data:
            mirrored_poll = {
                **poll_data,
                "ends_at": drop["expires_at"].isoformat() if drop.get("expires_at") else None,
            }
        await db["posts"].insert_one({
            "_id": ObjectId(),
            "user_id": current_user_id,
            "content": drop["confession"],
            "is_anonymous": True,
            "anonymous_name": drop["sender_anonymous_name"],
            "topics": [],
            "images": [drop["media_url"]] if drop["media_url"] and drop["media_type"] == "image" else [],
            "video_url": drop["media_url"] if drop["media_type"] == "video" else None,
            "audio_url": drop["media_url"] if drop["media_type"] == "voice" else None,
            "poll": mirrored_poll,
            "thread_count": 0,
            "views_count": 0,
            "saves_count": 0,
            "liked_by": [],
            "likes_count": 0,
            "created_at": drop["created_at"],
        })

    # ── Auto-queue for Anonixx social publishing ────────────────
    # Eligible drops (Tier-1, not privately targeted, not already flagged,
    # not explicitly opted out) queue for cross-posting immediately — no
    # manual "Publish" tap needed. POST /{drop_id}/publish still works as a
    # manual re-trigger for drops that skipped auto-queue (e.g. targeted).
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

        # Blurred teaser card — the growth hook for social. Best-effort:
        # if generation/upload fails, publishing still proceeds using
        # whatever card_image_url already exists (poster-frame or None).
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
            "category":          drop.get("category", "love"),
            "media_type":        drop.get("media_type"),
            "confession":        drop.get("confession"),
            "media_url":         drop.get("media_url"),
            "teaser_image_url":  teaser_image_url,
            "submitted_at":      drop["published_at"],
            "status":            "queued",
            "retry_count":       0,
        })

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

    return {
        "id": drop_id,
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
            "theme":           drop.get("theme", "desire"),
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
    await _complete_unlock(drop_id, current_user_id, drop, unlock_method, db, coin_equivalent=cost)
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


# Approximate coins-per-dollar rate (from the Tier-1 "starter" package: 55
# coins / $0.99), used only to convert a cash unlock's USD price into a
# coin-equivalent figure for the drop-owner's 10% revenue share below —
# never charged to a user directly.
CASH_TO_COIN_RATE = 55 / 0.99
DROP_REVENUE_SHARE_PCT = 0.10


async def _credit_revenue_share(drop: dict, coin_equivalent: int, db):
    """Credit the drop owner 10% of what an unlock cost (in coins)."""
    share = max(1, round(coin_equivalent * DROP_REVENUE_SHARE_PCT))
    try:
        await credit_coins(
            db=db,
            user_id=drop["sender_id"],
            amount=share,
            reason="drop_revenue_share",
            description="10% share from a drop unlock",
            meta={"drop_id": str(drop["_id"]), "unlock_cost_coins": coin_equivalent},
        )
    except ValueError:
        pass  # sender account missing — don't fail the unlocker's flow over it


async def _complete_unlock(drop_id: str, unlocker_id: str, drop: dict, method: str, db, coin_equivalent: Optional[int] = None):
    """Shared unlock completion logic."""
    if coin_equivalent is None:
        cash_price = drop.get("price", DROP_PRICE_USD)
        coin_equivalent = round(cash_price * CASH_TO_COIN_RATE)
    await _credit_revenue_share(drop, coin_equivalent, db)

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
            "media_url": msg.get("media_url"),
            "media_type": msg.get("media_type"),
            "duration_seconds": msg.get("duration_seconds"),
            "sender_id": msg["sender_id"],
            "is_own": msg["sender_id"] == current_user_id,
            "time_ago": get_time_ago(msg["created_at"]),
            "created_at": msg["created_at"].isoformat(),
        })

    is_sender = conn["sender_id"] == current_user_id

    # The poster's themed chat surface — always the drop's *sender*, since
    # a chat_profile is reused across every unlocker who chats with them.
    chat_profile = await db["chat_profiles"].find_one({"user_id": conn["sender_id"]})

    from app.api.v1.drop_calls import get_active_call_for_host
    active_call = await get_active_call_for_host(conn["sender_id"], db)

    # Show the welcome gallery (all of it, up to 3 items) + play the welcome
    # sound once per unlocker, the first time they open this connection —
    # never to the sender viewing their own chat.
    welcome_gallery = []
    welcome_sound = None
    if not is_sender and chat_profile:
        shown_to = conn.get("welcome_shown_to", [])
        if current_user_id not in shown_to:
            welcome_gallery = chat_profile.get("gallery", [])
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
            "is_revealed": conn["is_revealed_sender"] if is_sender else conn["is_revealed_unlocker"],
            "other_revealed": conn["is_revealed_unlocker"] if is_sender else conn["is_revealed_sender"],
            "is_sender": is_sender,
            "host_user_id": conn["sender_id"],
        },
        "chat_profile": {
            "background_pattern": chat_profile.get("background_pattern", "midnight-solid") if chat_profile else "midnight-solid",
            "font_style":          chat_profile.get("font_style", "clean-regular") if chat_profile else "clean-regular",
            "profile_picture_url": chat_profile.get("profile_picture_url") if chat_profile else None,
            "welcome_sound":       chat_profile.get("welcome_sound", "soft-chime") if chat_profile else "soft-chime",
            # Always available (not gated to first-open) so either side of the
            # chat can revisit it any time — see the gallery button in
            # DropChatScreen, distinct from the once-only welcome takeover.
            "gallery":             chat_profile.get("gallery", []) if chat_profile else [],
            "call_mode":           chat_profile.get("call_mode", "solo") if chat_profile else "solo",
        },
        "welcome_gallery": welcome_gallery,
        "welcome_sound": welcome_sound,
        "active_call": active_call,
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
    media_type = data.get("media_type")   # "voice" — only kind supported today

    if not content and not media_url:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if media_url and media_type not in ("voice",):
        raise HTTPException(status_code=400, detail="media_type must be 'voice'")

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
        "media_url": media_url,
        "media_type": media_type,
        "duration_seconds": data.get("duration_seconds"),
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

    notify_body = "🎙 Voice note" if media_type == "voice" else content[:60] + ("..." if len(content) > 60 else "")
    await send_push_notification(
        other_id,
        f"{sender_name} sent a message 💬",
        notify_body,
        db
    )

    return {
        "id": str(msg["_id"]),
        "content": content,
        "media_url": media_url,
        "media_type": media_type,
        "duration_seconds": msg["duration_seconds"],
        "time_ago": "just now",
        "created_at": msg["created_at"].isoformat(),
    }


@router.get("/room/{host_user_id}/guests")
async def list_room_guests(
    host_user_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Everyone who's unlocked this host — the roster behind the 3-dot menu's
    guest list. Only the host or one of their own unlockers can see it (same
    exposure as a live group call already gives guests of each other)."""
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

    is_premium = _is_premium_active(user)
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
        "category":          drop.get("category", "love"),   # needed by TikTok caption builder
        "media_type":        drop.get("media_type"),         # text | image | video | None
        "confession":        drop.get("confession"),
        "media_url":         drop.get("media_url"),
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
