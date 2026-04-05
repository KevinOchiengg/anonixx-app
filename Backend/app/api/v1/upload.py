from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header
from app.database import get_database
from app.models.user import User
from app.config import settings
from jose import JWTError, jwt
from bson import ObjectId
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


async def get_user_from_token(authorization: str = Header(None)) -> User:
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization header")
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")

        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        db = await get_database()
        try:
            user = await db.users.find_one({"_id": ObjectId(user_id)})
        except Exception:
            user = await db.users.find_one({"_id": user_id})

        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        return User(
            id=str(user["_id"]),
            username=user["username"],
            email=user["email"],
            coin_balance=user.get("coin_balance", 0),
            is_premium=user.get("is_premium", False),
            is_anonymous=user.get("is_anonymous", False),
            anonymous_name=user.get("anonymous_name"),
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate token")


# ── Signed upload (direct-to-Cloudinary from frontend) ───────────────────────

@router.get("/sign")
async def get_upload_signature(
    folder: str = "anonixx/posts",
    current_user: User = Depends(get_user_from_token),
):
    """Return short-lived signed params for a direct-to-Cloudinary upload."""
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


# ── Server-side uploads (fallback) ───────────────────────────────────────────

@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_user_from_token),
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
    current_user: User = Depends(get_user_from_token),
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
    current_user: User = Depends(get_user_from_token),
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
