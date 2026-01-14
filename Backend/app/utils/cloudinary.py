import cloudinary
import cloudinary.uploader
from app.config import settings
from typing import Optional


cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET
)


async def upload_image(file_data: bytes, filename: str, folder: str = "echo") -> Optional[str]:
    """Upload image to Cloudinary"""
    try:
        result = cloudinary.uploader.upload(
            file_data,
            folder=folder,
            resource_type="image",
            public_id=filename
        )
        return result.get("secure_url")
    except Exception as e:
        print(f"Cloudinary upload error: {e}")
        return None


async def upload_video(file_data: bytes, filename: str, folder: str = "echo/videos") -> Optional[str]:
    """Upload video to Cloudinary"""
    try:
        result = cloudinary.uploader.upload(
            file_data,
            folder=folder,
            resource_type="video",
            public_id=filename
        )
        return result.get("secure_url")
    except Exception as e:
        print(f"Cloudinary video upload error: {e}")
        return None


async def upload_audio(file_data: bytes, filename: str, folder: str = "echo/audio") -> Optional[str]:
    """Upload audio to Cloudinary"""
    try:
        result = cloudinary.uploader.upload(
            file_data,
            folder=folder,
            resource_type="raw",
            public_id=filename
        )
        return result.get("secure_url")
    except Exception as e:
        print(f"Cloudinary audio upload error: {e}")
        return None


async def delete_media(public_id: str, resource_type: str = "image"):
    """Delete media from Cloudinary"""
    try:
        cloudinary.uploader.destroy(public_id, resource_type=resource_type)
    except Exception as e:
        print(f"Cloudinary delete error: {e}")