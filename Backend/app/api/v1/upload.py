from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.dependencies import get_current_user_id
from app.utils import r2_storage
from pydantic import BaseModel
import logging

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/upload", tags=["upload"])

# No processing on this backend anymore (R2 is dumb storage), so these are
# the only real guard against an oversized attachment — see the module
# docstring in app/utils/r2_storage.py for why there's no duration/watermark
# handling to guard on top of them.
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_AUDIO_BYTES = 10 * 1024 * 1024
MAX_VIDEO_BYTES = 50 * 1024 * 1024


# ── Signed upload (direct-to-R2 from the frontend) ───────────────────────────

class _SignRequest(BaseModel):
    resource_type: str = "image"   # "image" | "video" | "audio" | "raw"
    content_type: str = "application/octet-stream"


@router.post("/sign")
async def get_upload_signature(
    data: _SignRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    """Returns a short-lived presigned PUT URL — the client uploads the
    file straight to R2, never through this server."""
    r2_storage.require_configured()
    try:
        key = r2_storage.build_key(data.resource_type, data.content_type)
        upload_url = r2_storage.presign_put(key, data.content_type)
        return {
            "upload_url": upload_url,
            "public_url": r2_storage.public_url_for(key),
        }
    except Exception as e:
        logger.error(f"R2 presign failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not generate upload URL.")


# ── Server-side uploads (proxy — client sends the file to us, we forward
#    it to R2) ────────────────────────────────────────────────────────────

@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user_id: str = Depends(get_current_user_id),
):
    r2_storage.require_configured()
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    contents = await file.read()
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Max 5MB.")

    try:
        url = r2_storage.upload_bytes(contents, "image", file.content_type)
        return {"url": url, "resource_type": "image"}
    except Exception as e:
        logger.error(f"Image upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Image upload failed. Try again.")


@router.post("/audio")
async def upload_audio(
    file: UploadFile = File(...),
    current_user_id: str = Depends(get_current_user_id),
):
    r2_storage.require_configured()
    contents = await file.read()
    if len(contents) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Max 10MB.")

    try:
        url = r2_storage.upload_bytes(contents, "audio", file.content_type or "audio/m4a")
        return {"url": url, "resource_type": "audio"}
    except Exception as e:
        logger.error(f"Audio upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Audio upload failed. Try again.")


@router.post("/video")
async def upload_video(
    file: UploadFile = File(...),
    current_user_id: str = Depends(get_current_user_id),
):
    r2_storage.require_configured()
    contents = await file.read()
    if len(contents) > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Max 50MB.")

    try:
        url = r2_storage.upload_bytes(contents, "video", file.content_type or "video/mp4")
        return {"url": url, "resource_type": "video"}
    except Exception as e:
        logger.error(f"Video upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Video upload failed. Try again.")
