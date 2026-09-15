"""
r2_storage.py — Cloudflare R2 (S3-compatible object storage) helpers.

Replaces Cloudinary as the media backend. Cloudinary is a media-processing
service that actively scans uploads for policy violations — it disabled
uploads for this account entirely after a single explicit test clip
("action is disabled for <cloud_name>"), which isn't viable for an app
whose whole premise is anonymous, unfiltered confessions between adults.
R2 is dumb object storage: no scanning, no transformations, no opinions
about content — just a bucket and a CDN in front of it.

Two upload shapes, same as the Cloudinary setup before it:
  - Direct-from-client: `presign_put()` hands the client a short-lived
    signed PUT URL; the file goes straight from the device to R2, never
    through our server. Used for anything a user attaches directly
    (drop media, chat attachments, unlock clues).
  - Server-side proxy: `upload_bytes()` for the handful of endpoints that
    receive the file as a multipart upload and forward it themselves
    (comment images, chat profile photos, voice notes recorded in-app).

No watermarking and no server-reported audio/video duration — both were
Cloudinary transformations with no R2 equivalent (R2 doesn't process
anything). Duration, where it matters, comes from the client's own
already-tracked recording/playback state instead.
"""
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

# Content-type → extension. Deliberately a fixed small map (not
# mimetypes.guess_extension) — that stdlib function is unreliable for the
# handful of container types voice/video recording actually produces
# (e.g. it doesn't recognize "audio/m4a" at all).
_EXT_BY_CONTENT_TYPE = {
    "image/jpeg":      "jpg",
    "image/jpg":       "jpg",
    "image/png":       "png",
    "image/webp":      "webp",
    "image/gif":       "gif",
    "image/heic":      "heic",
    "video/mp4":       "mp4",
    "video/quicktime": "mov",
    "audio/m4a":       "m4a",
    "audio/mp4":       "m4a",
    "audio/x-m4a":     "m4a",
    "audio/aac":       "aac",
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
    """Server-side proxy upload — for endpoints that receive the file
    themselves (multipart form) rather than handing out a presigned URL.
    Returns the public URL."""
    key = build_key(resource_type, content_type)
    _client().put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    return public_url_for(key)


def delete_by_url(url: Optional[str]):
    """Best-effort cleanup — takes a public URL (as stored on a document)
    and removes the underlying object. Silent no-op on any failure; this
    is always a secondary cleanup step, never the primary operation."""
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
