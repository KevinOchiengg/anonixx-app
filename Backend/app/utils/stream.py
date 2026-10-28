"""Cloudflare Stream for video drops. The browser uploads the original over tus; we clip the
posted window with the watermark and 3-minute cap; then delete the original and publish the
clip. Off until CF_ACCOUNT_ID / CF_STREAM_TOKEN are set (videos go to R2)."""
import base64
import logging
from typing import Optional

import httpx

from app.config import settings

log = logging.getLogger(__name__)

API = "https://api.cloudflare.com/client/v4/accounts/{account}/stream"
MAX_UPLOAD_SECONDS = 600   # storage reserved per upload; longer originals are refused by Stream


def is_configured() -> bool:
    return bool(settings.CF_ACCOUNT_ID and settings.CF_STREAM_TOKEN)


def _url(path: str = "") -> str:
    return API.format(account=settings.CF_ACCOUNT_ID) + path


def _auth() -> dict:
    return {"Authorization": f"Bearer {settings.CF_STREAM_TOKEN}"}


async def create_tus_upload(upload_length: int) -> tuple[str, str]:
    """Reserves a one-time tus upload. Returns (upload_url, video_uid)."""
    meta = {"maxDurationSeconds": str(MAX_UPLOAD_SECONDS)}
    header = ",".join(f"{k} {base64.b64encode(v.encode()).decode()}" for k, v in meta.items())
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            _url(),
            params={"direct_user": "true"},
            headers={
                **_auth(),
                "Tus-Resumable": "1.0.0",
                "Upload-Length": str(upload_length),
                "Upload-Metadata": header,
            },
        )
    if r.status_code >= 300 or not r.headers.get("Location"):
        raise RuntimeError(f"Stream refused the upload ({r.status_code}): {r.text[:200]}")
    location = r.headers["Location"]
    # Stream names the video in a header; the upload URL ends with the same id as a fallback.
    uid = r.headers.get("stream-media-id") or location.rstrip("/").split("?")[0].rsplit("/", 1)[-1]
    return location, uid


async def create_direct_upload() -> tuple[str, str]:
    """One-time basic upload URL for the app (max 200 MB). Returns (upload_url, video_uid)."""
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(_url("/direct_upload"), headers=_auth(), json={"maxDurationSeconds": MAX_UPLOAD_SECONDS})
    if r.status_code >= 300:
        raise RuntimeError(f"Stream refused the upload ({r.status_code}): {r.text[:200]}")
    res = r.json()["result"]
    return res["uploadURL"], res["uid"]


async def get_video(uid: str) -> Optional[dict]:
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(_url(f"/{uid}"), headers=_auth())
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json().get("result")


async def create_clip(source_uid: str, start: float, end: float, name: str) -> dict:
    body: dict = {
        "clippedFromVideoUID": source_uid,
        "startTimeSeconds": max(0, int(start)),
        "endTimeSeconds": max(int(start) + 1, int(round(end))),
        "meta": {"name": name[:100] or "anonixx clip"},
    }
    if settings.STREAM_WATERMARK_UID:
        body["watermark"] = {"uid": settings.STREAM_WATERMARK_UID}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(_url("/clip"), headers=_auth(), json=body)
    if r.status_code >= 300:
        raise RuntimeError(f"Stream couldn't cut the clip ({r.status_code}): {r.text[:200]}")
    return r.json()["result"]


async def enable_download(uid: str) -> Optional[str]:
    """Asks Stream for an MP4 copy (the socials publishers need a plain file,
    not a manifest). Returns its URL; the file itself becomes ready a little later."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(_url(f"/{uid}/downloads"), headers=_auth())
        r.raise_for_status()
        return ((r.json().get("result") or {}).get("default") or {}).get("url")
    except Exception as e:
        log.warning("stream: MP4 download not enabled for %s: %s", uid, e)
        return None


async def delete_video(uid: Optional[str]) -> None:
    """Best-effort: a leftover video only costs storage, so failures are logged, not raised."""
    if not uid or not is_configured():
        return
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.delete(_url(f"/{uid}"), headers=_auth())
        if r.status_code not in (200, 204, 404):
            log.warning("stream: delete %s returned %s", uid, r.status_code)
    except Exception as e:
        log.warning("stream: delete %s failed: %s", uid, e)


def is_ready(video: Optional[dict]) -> bool:
    return bool(video and video.get("readyToStream") and (video.get("status") or {}).get("state") == "ready")


def failure(video: Optional[dict]) -> Optional[str]:
    if video is None:
        return "The video was removed from Stream before it finished."
    status = video.get("status") or {}
    if status.get("state") == "error":
        return status.get("errorReasonText") or "Stream couldn't process this video."
    return None
