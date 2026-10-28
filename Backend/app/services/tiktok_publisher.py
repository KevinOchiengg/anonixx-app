"""Posts drops to the Anonixx TikTok account (Content Posting API v2): text, photo or video,
pulled from the media URL. Needs an access token with video.publish and video.upload."""

import logging

import httpx

from app.config import settings
from app.services.caption_engine import build_caption

log = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────
TIKTOK_API_BASE = "https://open.tiktokapis.com"
PRIVACY_LEVEL   = "PUBLIC_TO_EVERYONE"


# ── Client ───────────────────────────────────────────────────────
class TikTokPublisher:
    """TikTok publishing client."""

    def __init__(self):
        self._timeout = httpx.Timeout(30.0)

    # ── Auth helpers ─────────────────────────────────────────────
    @property
    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {settings.TIKTOK_ACCESS_TOKEN}",
            "Content-Type":  "application/json; charset=UTF-8",
        }

    def is_configured(self) -> bool:
        """Return True only when a real access token is present."""
        token = settings.TIKTOK_ACCESS_TOKEN
        return bool(token and token not in ("", "your-tiktok-access-token-here"))

    def _require_configured(self):
        if not self.is_configured():
            raise RuntimeError(
                "TIKTOK_ACCESS_TOKEN is not configured. "
                "Add a valid long-lived token to your .env file."
            )

    # ── Text Post ─────────────────────────────────────────────────
    async def post_text(self, confession: str) -> dict:
        """Post a text confession as a TikTok text post."""
        self._require_configured()

        payload = {
            "post_info": {
                "title":           build_caption(confession, platform="tiktok"),
                "privacy_level":   PRIVACY_LEVEL,
                "disable_duet":    True,
                "disable_comment": False,
                "disable_stitch":  True,
            },
            "post_mode":  "DIRECT_POST",
            "media_type": "TEXT",
        }

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{TIKTOK_API_BASE}/v2/post/publish/content/init/",
                headers=self._headers,
                json=payload,
            )

        return self._parse(res, "text post")

    # ── Video Post ────────────────────────────────────────────────
    async def post_video(
        self,
        video_url:  str,
        confession: str = "",
    ) -> dict:
        """Post a video (pulled from its URL)."""
        self._require_configured()

        payload = {
            "post_info": {
                "title":           build_caption(confession, platform="tiktok"),
                "privacy_level":   PRIVACY_LEVEL,
                "disable_duet":    True,
                "disable_comment": False,
                "disable_stitch":  True,
            },
            "source_info": {
                "source":    "PULL_FROM_URL",
                "video_url": video_url,
            },
        }

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{TIKTOK_API_BASE}/v2/post/publish/video/init/",
                headers=self._headers,
                json=payload,
            )

        return self._parse(res, "video post")

    # ── Image / Photo Post ────────────────────────────────────────
    async def post_image(
        self,
        image_url:  str,
        confession: str = "",
    ) -> dict:
        """Post an image as a photo post."""
        self._require_configured()

        payload = {
            "post_info": {
                "title":                build_caption(confession, platform="tiktok"),
                "privacy_level":        PRIVACY_LEVEL,
                "disable_duet":         True,
                "disable_comment":      False,
                "disable_stitch":       True,
                "brand_content_toggle": False,
                "brand_organic_toggle": False,
            },
            "source_info": {
                "source":            "PULL_FROM_URL",
                "photo_images":      [image_url],
                "photo_cover_index": 0,
            },
            "post_mode":  "DIRECT_POST",
            "media_type": "PHOTO",
        }

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{TIKTOK_API_BASE}/v2/post/publish/content/init/",
                headers=self._headers,
                json=payload,
            )

        return self._parse(res, "image post")

    # ── Status Check ──────────────────────────────────────────────
    async def get_post_status(self, publish_id: str) -> dict:
        """Publish status of a post: PROCESSING_UPLOAD | SEND_TO_USER_INBOX | FAILED | PUBLISHED."""
        self._require_configured()

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{TIKTOK_API_BASE}/v2/post/publish/status/fetch/",
                headers=self._headers,
                json={"publish_id": publish_id},
            )

        data = res.json()
        if res.status_code not in (200, 201) or data.get("error", {}).get("code") != "ok":
            err = data.get("error", {})
            raise RuntimeError(
                f"TikTok status fetch failed: [{err.get('code')}] {err.get('message')}"
            )

        d = data.get("data", {})
        return {
            "publish_id":  publish_id,
            "status":      d.get("status"),
            "fail_reason": d.get("fail_reason"),
            "post_id":     d.get("publicaly_available_post_id"),
        }

    # ── Internal ──────────────────────────────────────────────────
    @staticmethod
    def _parse(res: httpx.Response, context: str) -> dict:
        data = res.json()
        if res.status_code not in (200, 201) or data.get("error", {}).get("code") != "ok":
            err = data.get("error", {})
            raise RuntimeError(
                f"TikTok {context} failed: [{err.get('code')}] {err.get('message')}"
            )
        return {
            "publish_id": data["data"]["publish_id"],
            "status":     "PROCESSING_UPLOAD",
        }


# ── Singleton ────────────────────────────────────────────────────
tiktok_publisher = TikTokPublisher()
