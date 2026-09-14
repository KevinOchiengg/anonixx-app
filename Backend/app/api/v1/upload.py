from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from app.database import get_database
from app.config import settings
from app.dependencies import get_current_user_id
import asyncio
import logging
import time
import cloudinary
import cloudinary.uploader
import cloudinary.utils

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/upload", tags=["upload"])

MAX_VIDEO_DURATION_SECONDS = 600   # 10 minutes

# Soft, bottom-right "anonixx" text watermark burned into publicly-shared
# media (drop posts, circle posts, comment images) at upload time — not
# applied to private media (profile photos, chat/DM attachments, unlock
# "clue" media). Callers opt in with watermark=true.
WATERMARK_TRANSFORMATION = [{
    "overlay": {
        "font_family": "Arial",
        "font_size":   36,
        "text":        "anonixx",
    },
    "color":   "white",
    "opacity": 35,
    "gravity": "south_east",
    "x": 18,
    "y": 18,
}]
WATERMARK_TRANSFORMATION_STRING, _ = cloudinary.utils.generate_transformation_string(
    transformation=WATERMARK_TRANSFORMATION
)


def _require_cloudinary_configured():
    if not settings.CLOUDINARY_API_SECRET or not settings.CLOUDINARY_API_KEY or not settings.CLOUDINARY_CLOUD_NAME:
        raise HTTPException(
            status_code=500,
            detail="Media uploads are not configured on this server. Contact support."
        )

# Configure Cloudinary
cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
    secure=True,
)


# ── Signed upload (direct-to-Cloudinary from frontend) ───────────────────────

from pydantic import BaseModel as _BaseModel

class _SignRequest(_BaseModel):
    resource_type: str = "image"   # "image" | "video" (also used for audio) | "raw" (generic files)
    # Soft "anonixx" watermark burned in at upload time — only meaningful for
    # image/video, and only set true by callers uploading publicly-shared
    # content (drop posts, circle posts). Must be part of the signed params
    # since the client uploads directly to Cloudinary from here on.
    watermark: bool = False

_SIGN_FOLDERS = {
    "image": "anonixx/images",
    "video": "anonixx/videos",
    "raw":   "anonixx/files",
}

@router.post("/sign")
async def get_upload_signature(
    data: _SignRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    """Return short-lived signed params for a direct-to-Cloudinary upload."""
    if not settings.CLOUDINARY_API_SECRET or not settings.CLOUDINARY_API_KEY or not settings.CLOUDINARY_CLOUD_NAME:
        raise HTTPException(
            status_code=500,
            detail="Media uploads are not configured on this server. Contact support."
        )
    # Route files to type-specific folders
    folder = _SIGN_FOLDERS.get(data.resource_type, "anonixx/images")
    try:
        timestamp = int(time.time())
        params    = {"folder": folder, "timestamp": timestamp}
        watermark = data.watermark and data.resource_type in ("image", "video")
        if watermark:
            params["transformation"] = WATERMARK_TRANSFORMATION_STRING
        signature = cloudinary.utils.api_sign_request(params, settings.CLOUDINARY_API_SECRET)
        response = {
            "signature":   signature,
            "timestamp":   timestamp,
            "api_key":     settings.CLOUDINARY_API_KEY,
            "cloud_name":  settings.CLOUDINARY_CLOUD_NAME,
            "folder":      folder,
        }
        if watermark:
            response["transformation"] = WATERMARK_TRANSFORMATION_STRING
        return response
    except Exception as e:
        logger.error(f"Upload signature generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not generate upload signature: {str(e)}")


# ── Server-side uploads (fallback) ───────────────────────────────────────────

@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    watermark: bool = Form(False),
    current_user_id: str = Depends(get_current_user_id),
):
    _require_cloudinary_configured()

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 5MB.")

    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: cloudinary.uploader.upload(
                contents,
                folder="anonixx/images",
                resource_type="image",
                # Convert everything to JPEG for universal compatibility
                # (handles HEIC from iOS, WEBP, etc.)
                format="jpg",
                allowed_formats=["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"],
                **({"transformation": WATERMARK_TRANSFORMATION} if watermark else {}),
            ),
        )
        return {
            "url":           result["secure_url"],
            "public_id":     result["public_id"],
            "resource_type": "image",
        }
    except Exception as e:
        logger.error(f"Image upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Image upload failed. Try again.")


@router.post("/audio")
async def upload_audio(
    file: UploadFile = File(...),
    current_user_id: str = Depends(get_current_user_id),
):
    _require_cloudinary_configured()

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 10MB.")

    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            # "auto" mis-detects the .m4a/.mp4 voice-note containers the
            # recorder sends (Cloudinary has no true "audio" resource type —
            # audio-only files go through the "video" pipeline). This is
            # the same resource_type the known-working drop voice upload
            # (/upload/sign, see DropsRecordScreen.jsx) already uses.
            lambda: cloudinary.uploader.upload(
                contents,
                folder="anonixx/audio",
                resource_type="video",
            ),
        )
        return {
            "url":           result["secure_url"],
            "public_id":     result["public_id"],
            "resource_type": "audio",
            "duration":      result.get("duration", 0),
        }
    except Exception as e:
        logger.error(f"Audio upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Audio upload failed. Try again.")


@router.post("/video")
async def upload_video(
    file: UploadFile = File(...),
    watermark: bool = Form(False),
    current_user_id: str = Depends(get_current_user_id),
):
    _require_cloudinary_configured()

    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 50MB.")

    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: cloudinary.uploader.upload(
                contents,
                folder="anonixx/videos",
                resource_type="video",
                **({"transformation": WATERMARK_TRANSFORMATION} if watermark else {}),
            ),
        )

        duration = result.get("duration") or 0
        if duration > MAX_VIDEO_DURATION_SECONDS:
            # Delete the just-uploaded file — it exceeded the limit.
            try:
                await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: cloudinary.uploader.destroy(
                        result["public_id"], resource_type="video"
                    ),
                )
            except Exception:
                pass
            raise HTTPException(
                status_code=400,
                detail=f"Video exceeds the 10-minute limit ({int(duration)}s). Please trim it and try again.",
            )

        return {
            "url":           result["secure_url"],
            "public_id":     result["public_id"],
            "resource_type": "video",
            "duration":      duration,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Video upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Video upload failed. Try again.")
