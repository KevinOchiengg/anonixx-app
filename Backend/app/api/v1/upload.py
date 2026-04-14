from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.database import get_database
from app.config import settings
from app.dependencies import get_current_user_id
import asyncio
import time
import cloudinary
import cloudinary.uploader
import cloudinary.utils

router = APIRouter(prefix="/upload", tags=["upload"])

# Configure Cloudinary
cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
    secure=True,
)


# ── Signed upload (direct-to-Cloudinary from frontend) ───────────────────────

@router.get("/sign")
async def get_upload_signature(
    folder: str = "anonixx/posts",
    current_user_id: str = Depends(get_current_user_id),
):
    """Return short-lived signed params for a direct-to-Cloudinary upload."""
    if not settings.CLOUDINARY_API_SECRET or not settings.CLOUDINARY_API_KEY or not settings.CLOUDINARY_CLOUD_NAME:
        raise HTTPException(
            status_code=500,
            detail="Media uploads are not configured on this server. Contact support."
        )
    try:
        timestamp = int(time.time())
        params    = {"folder": folder, "timestamp": timestamp}
        signature = cloudinary.utils.api_sign_request(params, settings.CLOUDINARY_API_SECRET)
        return {
            "signature":  signature,
            "timestamp":  timestamp,
            "api_key":    settings.CLOUDINARY_API_KEY,
            "cloud_name": settings.CLOUDINARY_CLOUD_NAME,
            "folder":     folder,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not generate upload signature: {str(e)}")


# ── Server-side uploads (fallback) ───────────────────────────────────────────

@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user_id: str = Depends(get_current_user_id),
):
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
                allowed_formats=["jpg", "jpeg", "png", "gif", "webp"],
            ),
        )
        return {
            "url":           result["secure_url"],
            "public_id":     result["public_id"],
            "resource_type": "image",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Image upload failed. Try again.")


@router.post("/audio")
async def upload_audio(
    file: UploadFile = File(...),
    current_user_id: str = Depends(get_current_user_id),
):
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 10MB.")

    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: cloudinary.uploader.upload(
                contents,
                folder="anonixx/audio",
                resource_type="auto",
            ),
        )
        return {
            "url":           result["secure_url"],
            "public_id":     result["public_id"],
            "resource_type": "audio",
            "duration":      result.get("duration", 0),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Audio upload failed. Try again.")


@router.post("/video")
async def upload_video(
    file: UploadFile = File(...),
    current_user_id: str = Depends(get_current_user_id),
):
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
            ),
        )
        return {
            "url":           result["secure_url"],
            "public_id":     result["public_id"],
            "resource_type": "video",
            "duration":      result.get("duration", 0),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Video upload failed. Try again.")
