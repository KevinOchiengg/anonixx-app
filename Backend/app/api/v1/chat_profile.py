"""Each poster's Room: theme, font, picture, gallery (up to 3 items), door rules and call
settings. The full profile is only visible to people connected with them."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import Optional
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id
from app.utils.coin_service import debit_coins
from app.utils.contact_filter import contains_contact_info, CONTACT_INFO_ERROR
from app.utils.moderation import violates_policy, MODERATION_ERROR

router = APIRouter(prefix="/chat-profile", tags=["Chat Profile"])

MAX_GALLERY_ITEMS = 3

# Font ids (rendered by Frontend/src/config/fonts.js CHAT_FONT_OPTIONS).
FONT_STYLES = {
    "clean-regular", "soft-medium", "confident-semibold", "bold-statement",
    "elegant-serif", "elegant-italic", "playful-script", "whisper-italic",
}
# Played once for an unlocker on their first open of the chat — see
# Frontend/src/config/sounds.js for the id → asset mapping.
WELCOME_SOUNDS = {"soft-chime", "warm-bell", "gentle-hum", "silence"}
# Background ids (rendered by Frontend/src/config/patterns.js).
BACKGROUND_PATTERNS = {
    "midnight-solid", "velvet-dots", "smoke-lines", "ember-glow",
    "obsidian-grid", "rose-noise", "eclipse-mesh", "static-haze",
    "crimson-fade", "ink-bloom",
}

# Room colour themes. Ids match Web/lib/roomThemes.ts and Frontend/src/config/roomThemes.js.
ROOM_THEMES = {
    "midnight-blue", "velvet-burgundy", "dark-plum", "obsidian-gold", "smoky-emerald",
    "obsidian-rose", "arctic-silver", "deep-ocean", "ember", "pure-noir",
}
DEFAULT_ROOM_THEME = "midnight-blue"
# Accounts that picked a chat background before themes existed get the
# closest theme instead of the default, so their Room keeps its mood.
PATTERN_TO_THEME = {
    "midnight-solid": "midnight-blue", "velvet-dots": "velvet-burgundy", "smoke-lines": "dark-plum",
    "ember-glow": "ember", "obsidian-grid": "pure-noir", "rose-noise": "obsidian-rose",
    "eclipse-mesh": "dark-plum", "static-haze": "arctic-silver", "crimson-fade": "velvet-burgundy",
    "ink-bloom": "deep-ocean",
}
ROOM_STATUSES = {"open", "late", "quiet", "away"}
# Who sees the gallery: everyone, only people let in, or only the owner.
GALLERY_VISIBILITY = {"window", "inside", "only_me"}

# Door rules: what a Knock must include. line | line_peek (line + photo/video/voice) | voice
DOOR_RULES = {"line", "line_peek", "voice"}
DEFAULT_DOOR_RULE = "line_peek"

# Listing in Discover: discoverable (shows in Near) | limited (via posts/links, default) | private
LISTINGS = {"discoverable", "limited", "private"}
DEFAULT_LISTING = "limited"

# Availability: open | break (no new knocks, optionally until a time) | hidden.
# Never shows online status, and a break doesn't affect existing chats.
BREAK_HOURS = {12, 72, 168}   # tonight, 3 days, a week; anything else = until switched back on


def knocks_open_of(doc: Optional[dict], now: Optional[datetime] = None) -> bool:
    """The one answer to "can someone knock right now?". A timed break ends by itself."""
    doc = doc or {}
    if doc.get("knocks_open", True) is not False:
        return True
    until = doc.get("knocks_paused_until")
    if not until:
        return False
    until = until if until.tzinfo else until.replace(tzinfo=timezone.utc)
    return until <= (now or _now())


def availability_of(doc: Optional[dict], now: Optional[datetime] = None) -> str:
    if (doc or {}).get("listing") == "private":
        return "hidden"
    return "open" if knocks_open_of(doc, now) else "break"


def closed_query(now: datetime) -> dict:
    """Mongo condition for chat_profiles not taking knocks right now (mirrors knocks_open_of)."""
    return {"knocks_open": False, "$or": [{"knocks_paused_until": None}, {"knocks_paused_until": {"$gt": now}}]}


def door_rule_of(doc: dict) -> str:
    rule = (doc or {}).get("door_rule")
    return rule if rule in DOOR_RULES else DEFAULT_DOOR_RULE
MAX_INTRO_CHARS   = 160
MAX_WELCOME_CHARS = 280

# ── Video calls: the owner's call mode and room size (sessions live in drop_calls.py).
CALL_MODES        = {"solo", "multi"}
FREE_GUEST_CAP     = 4    # every "multi" room starts with this many slots, free
MAX_GUEST_CAP      = 12   # hard ceiling regardless of how many slots are bought
EXTRA_SLOT_COST    = 25   # coins per guest slot beyond FREE_GUEST_CAP


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ChatProfileUpdate(BaseModel):
    background_pattern: Optional[str] = None
    font_style:       Optional[str] = None
    profile_picture_url: Optional[str] = None
    welcome_sound:    Optional[str] = None
    call_mode:        Optional[str] = None   # "solo" | "multi"
    room_theme:       Optional[str] = None
    intro:            Optional[str] = None   # "" clears
    welcome_message:  Optional[str] = None   # "" clears
    room_status:      Optional[str] = None   # "" clears
    gallery_visibility: Optional[str] = None
    knocks_open:      Optional[bool] = None
    door_rule:        Optional[str] = None   # see DOOR_RULES
    listing:          Optional[str] = None   # see LISTINGS
    break_hours:      Optional[int] = None   # with knocks_open=False: one of BREAK_HOURS, else until switched back


class CapacityUpgradeRequest(BaseModel):
    add_slots: int   # how many extra guest slots to buy, beyond whatever's already purchased


class GalleryMediaInput(BaseModel):
    media_url:        str
    media_type:       str            # "image" | "video" | "gif"
    duration_seconds: Optional[float] = None


def room_theme_of(doc: dict) -> str:
    return doc.get("room_theme") or PATTERN_TO_THEME.get(doc.get("background_pattern") or "", DEFAULT_ROOM_THEME)


def gallery_for(doc: dict, viewer_id: str, owner_id: str, inside: bool) -> list:
    """The gallery as this viewer may see it. The one place visibility is enforced."""
    if viewer_id == owner_id:
        return doc.get("gallery", [])
    vis = doc.get("gallery_visibility") or "window"
    if vis == "window" or (vis == "inside" and inside):
        return doc.get("gallery", [])
    return []


def _clean_text(raw: Optional[str], limit: int) -> Optional[str]:
    text = (raw or "").strip()[:limit]
    if not text:
        return None
    if contains_contact_info(text):
        raise HTTPException(status_code=400, detail=CONTACT_INFO_ERROR)
    if violates_policy(text):
        raise HTTPException(status_code=400, detail=MODERATION_ERROR)
    return text


async def is_blocked_between(db, a: str, b: str) -> bool:
    """True if either account has blocked the other."""
    if not (ObjectId.is_valid(a) and ObjectId.is_valid(b)):
        return False
    return await db["users"].count_documents({"$or": [
        {"_id": ObjectId(a), "blocked_user_ids": b},
        {"_id": ObjectId(b), "blocked_user_ids": a},
    ]}) > 0


def _sanitize(doc: dict, user: Optional[dict] = None) -> dict:
    """Public view of a Room. Picture falls back to the account avatar."""
    call_mode  = doc.get("call_mode") or "solo"
    max_guests = 1 if call_mode == "solo" else FREE_GUEST_CAP + doc.get("purchased_slots", 0)
    user = user or {}
    return {
        "background_pattern": doc.get("background_pattern") or "midnight-solid",
        "font_style":          doc.get("font_style") or "clean-regular",
        "profile_picture_url": doc.get("profile_picture_url") or user.get("avatar_url"),
        "anonymous_name":      user.get("anonymous_name"),
        "gallery":             doc.get("gallery", []),
        "welcome_sound":       doc.get("welcome_sound") or "soft-chime",
        "call_mode":           call_mode,
        "max_guests":          max_guests,
        "purchased_slots":     doc.get("purchased_slots", 0),
        "room_theme":          room_theme_of(doc),
        "intro":               doc.get("intro"),
        "welcome_message":     doc.get("welcome_message"),
        "room_status":         doc.get("room_status"),
        "gallery_visibility":  doc.get("gallery_visibility") or "window",
        "knocks_open":         knocks_open_of(doc),
        "availability":        availability_of(doc),
        "break_until":         doc["knocks_paused_until"].isoformat() if not knocks_open_of(doc) and doc.get("knocks_paused_until") else None,
        "door_rule":           door_rule_of(doc),
        "listing":             doc.get("listing") if doc.get("listing") in LISTINGS else DEFAULT_LISTING,
        "updated_at":          doc["updated_at"].isoformat() if doc.get("updated_at") else None,
    }


@router.get("/me")
async def get_my_chat_profile(
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    doc  = await db["chat_profiles"].find_one({"user_id": current_user_id}) or {}
    user = await db["users"].find_one(
        {"_id": ObjectId(current_user_id)}, {"avatar_url": 1, "anonymous_name": 1},
    )
    return _sanitize(doc, user)


@router.put("/me")
async def update_my_chat_profile(
    data:             ChatProfileUpdate,
    current_user_id:  str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    if data.font_style and data.font_style not in FONT_STYLES:
        raise HTTPException(status_code=400, detail=f"font_style must be one of: {', '.join(FONT_STYLES)}")

    if data.welcome_sound and data.welcome_sound not in WELCOME_SOUNDS:
        raise HTTPException(status_code=400, detail=f"welcome_sound must be one of: {', '.join(WELCOME_SOUNDS)}")

    if data.background_pattern and data.background_pattern not in BACKGROUND_PATTERNS:
        raise HTTPException(status_code=400, detail=f"background_pattern must be one of: {', '.join(BACKGROUND_PATTERNS)}")

    if data.call_mode and data.call_mode not in CALL_MODES:
        raise HTTPException(status_code=400, detail=f"call_mode must be one of: {', '.join(CALL_MODES)}")

    if data.room_theme and data.room_theme not in ROOM_THEMES:
        raise HTTPException(status_code=400, detail="Pick one of the Room themes.")

    if data.room_status and data.room_status not in ROOM_STATUSES:
        raise HTTPException(status_code=400, detail=f"room_status must be one of: {', '.join(ROOM_STATUSES)}")

    if data.gallery_visibility and data.gallery_visibility not in GALLERY_VISIBILITY:
        raise HTTPException(status_code=400, detail=f"gallery_visibility must be one of: {', '.join(GALLERY_VISIBILITY)}")

    update = {"updated_at": _now()}
    if data.background_pattern is not None:
        update["background_pattern"] = data.background_pattern
    if data.font_style is not None:
        update["font_style"] = data.font_style
    if data.profile_picture_url is not None:
        update["profile_picture_url"] = data.profile_picture_url
    if data.welcome_sound is not None:
        update["welcome_sound"] = data.welcome_sound
    if data.call_mode is not None:
        update["call_mode"] = data.call_mode
    if data.room_theme is not None:
        update["room_theme"] = data.room_theme
    if data.intro is not None:
        update["intro"] = _clean_text(data.intro, MAX_INTRO_CHARS)
    if data.welcome_message is not None:
        update["welcome_message"] = _clean_text(data.welcome_message, MAX_WELCOME_CHARS)
    if data.room_status is not None:
        update["room_status"] = data.room_status or None
    if data.gallery_visibility is not None:
        update["gallery_visibility"] = data.gallery_visibility
    if data.knocks_open is not None:
        update["knocks_open"] = data.knocks_open
        if data.knocks_open is True:
            update["knocks_paused_until"] = None
        elif data.break_hours is not None:
            update["knocks_paused_until"] = _now() + timedelta(hours=data.break_hours) if data.break_hours in BREAK_HOURS else None
        else:
            # Saving other settings while on a break keeps its end time; a new break has none.
            cur = await db["chat_profiles"].find_one({"user_id": current_user_id}, {"knocks_open": 1, "knocks_paused_until": 1}) or {}
            if knocks_open_of(cur):   # wasn't on a (running) break
                update["knocks_paused_until"] = None
    if data.listing is not None:
        if data.listing not in LISTINGS:
            raise HTTPException(status_code=400, detail=f"listing must be one of: {', '.join(sorted(LISTINGS))}")
        update["listing"] = data.listing
    if data.door_rule is not None:
        if data.door_rule not in DOOR_RULES:
            raise HTTPException(status_code=400, detail=f"door_rule must be one of: {', '.join(sorted(DOOR_RULES))}")
        update["door_rule"] = data.door_rule

    await db["chat_profiles"].update_one(
        {"user_id": current_user_id},
        {
            "$set": update,
            "$setOnInsert": {
                "user_id": current_user_id,
                "gallery": [],
                "created_at": _now(),
            },
        },
        upsert=True,
    )
    doc  = await db["chat_profiles"].find_one({"user_id": current_user_id})
    user = await db["users"].find_one(
        {"_id": ObjectId(current_user_id)}, {"avatar_url": 1, "anonymous_name": 1},
    )
    return _sanitize(doc, user)


@router.post("/call-capacity")
async def upgrade_call_capacity(
    data:             CapacityUpgradeRequest,
    current_user_id:  str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    """Buy a bigger video-call room (above the free 4 guests, up to MAX_GUEST_CAP)."""
    if data.add_slots <= 0:
        raise HTTPException(status_code=400, detail="add_slots must be positive.")

    doc = await db["chat_profiles"].find_one({"user_id": current_user_id})
    current_purchased = doc.get("purchased_slots", 0) if doc else 0
    current_cap = FREE_GUEST_CAP + current_purchased

    if current_cap + data.add_slots > MAX_GUEST_CAP:
        room_left = MAX_GUEST_CAP - current_cap
        raise HTTPException(
            status_code=400,
            detail=f"Room is capped at {MAX_GUEST_CAP} guests — you can buy at most {max(room_left, 0)} more slot(s).",
        )

    cost = data.add_slots * EXTRA_SLOT_COST
    try:
        await debit_coins(
            db=db, user_id=current_user_id, amount=cost,
            reason="call_capacity", description=f"+{data.add_slots} video call guest slot(s)",
            meta={"add_slots": data.add_slots},
        )
    except ValueError as e:
        if "Insufficient" in str(e):
            raise HTTPException(status_code=402, detail=f"Not enough coins. You need {cost} coins for {data.add_slots} more slot(s).")
        raise HTTPException(status_code=404, detail="User not found.")

    await db["chat_profiles"].update_one(
        {"user_id": current_user_id},
        {
            "$inc": {"purchased_slots": data.add_slots},
            "$set": {"updated_at": _now()},
            "$setOnInsert": {
                "user_id": current_user_id, "gallery": [], "created_at": _now(),
            },
        },
        upsert=True,
    )
    updated = await db["chat_profiles"].find_one({"user_id": current_user_id})
    return {"coins_spent": cost, **_sanitize(updated)}


@router.post("/media")
async def add_gallery_media(
    data:             GalleryMediaInput,
    current_user_id:  str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    if data.media_type not in ("image", "video", "gif"):
        raise HTTPException(status_code=400, detail="media_type must be 'image', 'video', or 'gif'")

    doc = await db["chat_profiles"].find_one({"user_id": current_user_id})
    gallery = doc.get("gallery", []) if doc else []
    if len(gallery) >= MAX_GALLERY_ITEMS:
        raise HTTPException(status_code=400, detail=f"Gallery is capped at {MAX_GALLERY_ITEMS} items — delete one first.")

    gallery.append({
        "media_url":        data.media_url,
        "media_type":       data.media_type,
        "duration_seconds": data.duration_seconds,
    })

    await db["chat_profiles"].update_one(
        {"user_id": current_user_id},
        {
            "$set": {"gallery": gallery, "updated_at": _now()},
            "$setOnInsert": {
                "user_id": current_user_id,
                "background_pattern": "midnight-solid",
                "font_style": "clean-regular",
                "created_at": _now(),
            },
        },
        upsert=True,
    )
    updated = await db["chat_profiles"].find_one({"user_id": current_user_id})
    return _sanitize(updated)


@router.delete("/media/{index}")
async def delete_gallery_media(
    index:            int,
    current_user_id:  str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    doc = await db["chat_profiles"].find_one({"user_id": current_user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Chat profile not configured yet.")

    gallery = doc.get("gallery", [])
    if index < 0 or index >= len(gallery):
        raise HTTPException(status_code=400, detail="Invalid gallery index.")

    gallery.pop(index)

    await db["chat_profiles"].update_one(
        {"user_id": current_user_id},
        {"$set": {"gallery": gallery, "updated_at": _now()}},
    )
    updated = await db["chat_profiles"].find_one({"user_id": current_user_id})
    return _sanitize(updated)


@router.get("/{user_id}/preview")
async def get_room_preview(
    user_id:          str,
    drop_id:          Optional[str] = None,
    current_user_id:  str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    """The locked Room anyone 18+ sees before linking up: theme, picture, gallery and their
    pinned post, plus where the viewer stands (connected, pending, or invited)."""
    from app.api.v1.drops import unlock_cost_for, _aware, AGE_GATE_DETAIL

    viewer = await db["users"].find_one({"_id": ObjectId(current_user_id)}, {"age_verified": 1, "is_admin": 1})
    if user_id != current_user_id and viewer and not viewer.get("age_verified") and not viewer.get("is_admin"):
        raise HTTPException(status_code=403, detail=AGE_GATE_DETAIL)
    try:
        owner_oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Room not found.")
    user = await db["users"].find_one({"_id": owner_oid}, {"avatar_url": 1, "anonymous_name": 1, "is_active": 1})
    if not user or user.get("is_active") is False:
        raise HTTPException(status_code=404, detail="Room not found.")
    # A block either way closes the Room completely, as if it didn't exist.
    if user_id != current_user_id and await is_blocked_between(db, user_id, current_user_id):
        raise HTTPException(status_code=404, detail="Room not found.")
    raw_profile = await db["chat_profiles"].find_one({"user_id": user_id}) or {}
    profile = _sanitize(raw_profile, user)
    now = _now()

    # Pinned post: the one they came from, else their latest hookup post, else latest confession.
    post_doc = None
    real = {"sender_id": user_id, "is_active": True, "is_admin_drop": {"$ne": True}}
    if drop_id and ObjectId.is_valid(drop_id):
        post_doc = await db["drops"].find_one({
            "_id": ObjectId(drop_id), "sender_id": user_id, "kind": {"$in": ["hookup", "confession"]},
        })
    if not post_doc:
        post_doc = await db["drops"].find_one(
            {**real, "kind": "hookup", "live_until": {"$gt": now}},
            sort=[("created_at", -1)],
        )
    if not post_doc:
        post_doc = await db["drops"].find_one({**real, "kind": "confession"}, sort=[("created_at", -1)])
    post = None
    if post_doc:
        pid = str(post_doc["_id"])
        live_until = _aware(post_doc["live_until"]) if post_doc.get("live_until") else None
        post = {
            "id":           pid,
            "kind":         post_doc.get("kind"),
            "content":      post_doc.get("confession") or "",
            "hookup":       post_doc.get("hookup"),
            "live_until":   live_until.isoformat() if live_until else None,
            "live":         live_until is None or live_until > now,
            "linkup_count": await db["drop_unlock_requests"].count_documents(
                {"target_id": pid, "status": {"$in": ["pending", "accepting", "accepted"]}}),
            "created_at":   post_doc["created_at"].isoformat() if post_doc.get("created_at") else None,
        }

    connection = None
    if user_id != current_user_id:
        connection = await db["drop_connections"].find_one({"$or": [
            {"sender_id": user_id, "unlocker_id": current_user_id},
            {"sender_id": current_user_id, "unlocker_id": user_id},
        ], "removed_at": None}, {"_id": 1})
    mine = await db["drop_unlock_requests"].find_one(
        {"requester_id": current_user_id, "target_id": post["id"], "status": {"$in": ["pending", "accepting"]}},
        {"_id": 1, "status": 1},
    ) if post and user_id != current_user_id else None
    theirs = await db["drop_unlock_requests"].find_one(
        {"requester_id": user_id, "owner_id": current_user_id, "status": "pending", "expires_at": {"$gt": now}},
        {"_id": 1, "pitch": 1, "intents": 1, "target_id": 1, "media_url": 1, "media_type": 1,
         "peek": 1, "voice_url": 1, "voice_duration": 1},
    ) if user_id != current_user_id else None
    their_signals = {}
    if theirs:
        from app.api.v1.unlock_requests import _signals
        their_signals = (await _signals(db, current_user_id, {user_id})).get(user_id, {})

    # Hidden gallery items are counted (never shown) so visitors know something is kept back.
    inside = bool(connection)
    visible = gallery_for(raw_profile, current_user_id, user_id, inside)
    room = {k: profile[k] for k in (
        "background_pattern", "font_style", "profile_picture_url", "anonymous_name", "call_mode",
        "room_theme", "intro", "room_status", "knocks_open", "gallery_visibility", "door_rule",
    )}
    room["gallery"] = visible
    room["gallery_hidden"] = len(raw_profile.get("gallery", [])) - len(visible)
    # The welcome note is for people inside (and the owner previewing), not the window.
    room["welcome_message"] = profile["welcome_message"] if (inside or user_id == current_user_id) else None
    return {
        "user_id": user_id,
        "room": room,
        "inside": inside,
        "post": post,
        "connection_id": str(connection["_id"]) if connection else None,
        "my_request": {"id": str(mine["_id"]), "status": mine["status"]} if mine else None,
        "incoming_request": {
            "id": str(theirs["_id"]), "pitch": theirs.get("pitch"), "intents": theirs.get("intents") or [],
            "target_id": theirs.get("target_id"), "media_url": theirs.get("media_url"), "media_type": theirs.get("media_type"),
            "peek": theirs.get("peek") or [], "voice_url": theirs.get("voice_url"), "voice_duration": theirs.get("voice_duration"),
            "signals": their_signals,
        } if theirs else None,
        "linkup_cost": await unlock_cost_for(current_user_id, db),
    }


@router.get("/{user_id}")
async def get_chat_profile(
    user_id:          str,
    current_user_id:  str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    """Full Room profile, only for people connected with this user."""
    if user_id != current_user_id:
        connection = await db["drop_connections"].find_one({
            "$or": [
                {"sender_id": user_id, "unlocker_id": current_user_id},
                {"sender_id": current_user_id, "unlocker_id": user_id},
            ],
            "removed_at": None,
        })
        if not connection:
            raise HTTPException(status_code=403, detail="Knock on this person's Room to see more.")

    doc  = await db["chat_profiles"].find_one({"user_id": user_id}) or {}
    user = await db["users"].find_one(
        {"_id": ObjectId(user_id)}, {"avatar_url": 1, "anonymous_name": 1},
    )
    out = _sanitize(doc, user)
    out["gallery"] = gallery_for(doc, current_user_id, user_id, inside=True)
    return out
