"""Cloudflare R2 storage. Clients upload directly with presign_put(); a few endpoints upload
server-side with upload_bytes(). R2 does no processing (no watermark, no duration)."""
import uuid
import logging
from typing import Optional

import boto3
from botocore.client import Config as BotoConfig

from app.config import settings

logger = logging.getLogger("uvicorn.error")

# Cloudinary's folder-per-type convention, carried over so existing DB
# records' URLs and any manual bucket browsing stay organized the same way.
_FOLDER_BY_RESOURCE_TYPE = {
    "image": "images",
    "video": "videos",
    "audio": "audio",
    "raw":   "files",
}

# Content type to file extension (fixed map; mimetypes misses types like audio/m4a).
_EXT_BY_CONTENT_TYPE = {
    "image/jpeg":      "jpg",
    "image/jpg":       "jpg",
    "image/png":       "png",
    "image/webp":      "webp",
    "image/gif":       "gif",
    "image/heic":      "heic",
    "video/mp4":       "mp4",
    "video/quicktime": "mov",
    "video/webm":      "webm",
    "video/x-matroska": "mkv",
    "video/3gpp":      "3gp",
    "audio/webm":      "webm",
    "audio/ogg":       "ogg",
    "audio/m4a":       "m4a",
    "audio/mp4":       "m4a",
    "audio/x-m4a":     "m4a",
    "audio/aac":       "aac",
    "audio/mpeg":      "mp3",
    "audio/mp3":       "mp3",
}

_s3_client = None


def _client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.R2_ENDPOINT,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            config=BotoConfig(signature_version="s3v4"),
            region_name="auto",
        )
    return _s3_client


def is_configured() -> bool:
    return bool(
        settings.R2_ACCESS_KEY_ID and settings.R2_SECRET_ACCESS_KEY
        and settings.R2_BUCKET_NAME and settings.R2_ENDPOINT and settings.R2_PUBLIC_URL
    )


def require_configured():
    if not is_configured():
        from fastapi import HTTPException
        raise HTTPException(
            status_code=500,
            detail="Media uploads are not configured on this server. Contact support.",
        )


def build_key(resource_type: str, content_type: str) -> str:
    folder = _FOLDER_BY_RESOURCE_TYPE.get(resource_type, "files")
    ext = _EXT_BY_CONTENT_TYPE.get(content_type, "bin")
    return f"anonixx/{folder}/{uuid.uuid4().hex}.{ext}"


def public_url_for(key: str) -> str:
    return f"{settings.R2_PUBLIC_URL.rstrip('/')}/{key}"


def presign_put(key: str, content_type: str, expires_in: int = 300) -> str:
    """Short-lived URL the client PUTs the raw file bytes to directly."""
    return _client().generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.R2_BUCKET_NAME, "Key": key, "ContentType": content_type},
        ExpiresIn=expires_in,
    )


def upload_bytes(data: bytes, resource_type: str, content_type: str) -> str:
    """Upload bytes from the server under a random key. Returns the public URL."""
    key = build_key(resource_type, content_type)
    _client().put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    return public_url_for(key)


def upload_bytes_at(key: str, data: bytes, content_type: str) -> str:
    """Upload bytes to a fixed key, overwriting what's there (e.g. a teaser card)."""
    _client().put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    return public_url_for(key)


def delete_by_url(url: Optional[str]):
    """Delete the object behind a public URL. Never raises."""
    if not url or not settings.R2_PUBLIC_URL:
        return
    prefix = settings.R2_PUBLIC_URL.rstrip("/") + "/"
    if not url.startswith(prefix):
        return
    key = url[len(prefix):]
    try:
        _client().delete_object(Bucket=settings.R2_BUCKET_NAME, Key=key)
    except Exception as e:
        logger.warning(f"R2 delete failed for key {key}: {e}")
