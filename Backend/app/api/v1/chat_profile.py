"""
api/v1/chat_profile.py — Per-poster customizable chat interface.

One `chat_profiles` doc per user (the drop poster), reused across every
unlocker who chats with them: background color, font style, stickers,
profile picture, and a small media gallery (max 3 items). None of this is
visible to a viewer until they've actually unlocked a drop and a
`drop_connections` doc exists between the two of them — that's what
`GET /chat-profile/{user_id}` enforces.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id

router = APIRouter(prefix="/chat-profile", tags=["Chat Profile"])

MAX_GALLERY_ITEMS = 3
MIN_VIDEO_DURATION_FOR_LONGFORM = 60  # seconds — the "at least one ≥60s video" allowance, not enforced as a hard minimum on every item

FONT_STYLES = {"classic", "sultry-script", "bold-tease"}
STICKER_PACK = [
    "🔥", "😈", "💋", "🖤", "✨", "🌙", "⛓️", "🍒", "😏", "💦",
]
# Played once for an unlocker on their first open of the chat — see
# Frontend/src/config/sounds.js for the id → asset mapping.
WELCOME_SOUNDS = {"soft-chime", "warm-bell", "gentle-hum", "silence"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ChatProfileUpdate(BaseModel):
    background_color: Optional[str] = None   # hex, e.g. "#151924"
    font_style:       Optional[str] = None
    stickers:         Optional[List[str]] = None
    profile_picture_url: Optional[str] = None
    welcome_sound:    Optional[str] = None


class GalleryMediaInput(BaseModel):
    media_url:        str
    media_type:       str            # "image" | "video"
    duration_seconds: Optional[float] = None


def _sanitize(doc: dict) -> dict:
    return {
        "background_color":   doc.get("background_color") or "#151924",
        "font_style":          doc.get("font_style") or "classic",
        "stickers":            doc.get("stickers", []),
        "profile_picture_url": doc.get("profile_picture_url"),
        "gallery":             doc.get("gallery", []),
        "welcome_media_index": doc.get("welcome_media_index", 0),
        "welcome_sound":       doc.get("welcome_sound") or "soft-chime",
        "updated_at":          doc["updated_at"].isoformat() if doc.get("updated_at") else None,
    }


@router.get("/me")
async def get_my_chat_profile(
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    doc = await db["chat_profiles"].find_one({"user_id": current_user_id})
    if not doc:
        return None
    return _sanitize(doc)


@router.put("/me")
async def update_my_chat_profile(
    data:             ChatProfileUpdate,
    current_user_id:  str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    if data.font_style and data.font_style not in FONT_STYLES:
        raise HTTPException(status_code=400, detail=f"font_style must be one of: {', '.join(FONT_STYLES)}")

    if data.stickers is not None:
        invalid = [s for s in data.stickers if s not in STICKER_PACK]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Unknown stickers: {invalid}")

    if data.welcome_sound and data.welcome_sound not in WELCOME_SOUNDS:
        raise HTTPException(status_code=400, detail=f"welcome_sound must be one of: {', '.join(WELCOME_SOUNDS)}")

    update = {"updated_at": _now()}
    if data.background_color is not None:
        update["background_color"] = data.background_color
    if data.font_style is not None:
        update["font_style"] = data.font_style
    if data.stickers is not None:
        update["stickers"] = data.stickers
    if data.profile_picture_url is not None:
        update["profile_picture_url"] = data.profile_picture_url
    if data.welcome_sound is not None:
        update["welcome_sound"] = data.welcome_sound

    await db["chat_profiles"].update_one(
        {"user_id": current_user_id},
        {
            "$set": update,
            "$setOnInsert": {
                "user_id": current_user_id,
                "gallery": [],
                "welcome_media_index": 0,
                "created_at": _now(),
            },
        },
        upsert=True,
    )
    doc = await db["chat_profiles"].find_one({"user_id": current_user_id})
    return _sanitize(doc)


@router.post("/media")
async def add_gallery_media(
    data:             GalleryMediaInput,
    current_user_id:  str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    if data.media_type not in ("image", "video"):
        raise HTTPException(status_code=400, detail="media_type must be 'image' or 'video'")

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
                "background_color": "#151924",
                "font_style": "classic",
                "stickers": [],
                "welcome_media_index": 0,
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
    welcome_index = doc.get("welcome_media_index", 0)
    if welcome_index >= len(gallery):
        welcome_index = 0

    await db["chat_profiles"].update_one(
        {"user_id": current_user_id},
        {"$set": {"gallery": gallery, "welcome_media_index": welcome_index, "updated_at": _now()}},
    )
    updated = await db["chat_profiles"].find_one({"user_id": current_user_id})
    return _sanitize(updated)


@router.get("/{user_id}")
async def get_chat_profile(
    user_id:          str,
    current_user_id:  str = Depends(get_current_user_id),
    db                = Depends(get_database),
):
    """
    Only visible to a participant of an existing drop_connections doc with
    this user — a connection only exists post-unlock, which is what gates
    the profile picture/gallery/theme behind a paid unlock.
    """
    if user_id != current_user_id:
        connection = await db["drop_connections"].find_one({
            "$or": [
                {"sender_id": user_id, "unlocker_id": current_user_id},
                {"sender_id": current_user_id, "unlocker_id": user_id},
            ]
        })
        if not connection:
            raise HTTPException(status_code=403, detail="Unlock a drop from this person to view their profile.")

    doc = await db["chat_profiles"].find_one({"user_id": user_id})
    if not doc:
        return None
    return _sanitize(doc)
