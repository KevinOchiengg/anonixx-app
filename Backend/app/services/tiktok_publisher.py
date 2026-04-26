"""
app/services/tiktok_publisher.py

TikTok Content Posting API v2 client for the Anonixx brand account.

Supported drop formats
  text   → TikTok text post   POST /v2/post/publish/content/init/  (media_type=TEXT)
  image  → TikTok photo post  POST /v2/post/publish/content/init/  (media_type=PHOTO, PULL_FROM_URL)
  video  → TikTok video post  POST /v2/post/publish/video/init/    (PULL_FROM_URL)

Token
  Long-lived OAuth 2.0 access token for the Anonixx TikTok business account.
  Obtain via: https://developers.tiktok.com/doc/login-kit-web
  Required scopes: video.publish  video.upload

TikTok pulls media directly from the Cloudinary URL — no local re-upload needed.
"""

import logging
from typing import Optional

import httpx

from app.config import settings

log = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────
TIKTOK_API_BASE  = "https://open.tiktokapis.com"
PRIVACY_LEVEL    = "PUBLIC_TO_EVERYONE"
BASE_TAGS        = "#anonixx #anonymous #confession #mentalhealth #anonymousconfessions"
CAPTION_MAX_LEN  = 2200   # TikTok character cap

_CATEGORY_EMOJI: dict[str, str] = {
    "love":                  "💔",
    "fun":                   "✨",
    "friendship":            "🤝",
    "adventure":             "🌍",
    "spicy":                 "🌶️",
    "carrying this alone":   "🌑",
    "starting over":         "🌱",
    "need stability":        "⚓",
    "open to connection":    "🤲",
    "just need to be heard": "🌙",
}


# ── Caption builder ──────────────────────────────────────────────
def build_caption(confession: str, category: str) -> str:
    """
    Build the TikTok post caption.

    Example output:
        Someone on Anonixx dropped this 💔

        "I still think about you every single day."

        #anonixx #anonymous #confession #mentalhealth #anonymousconfessions
    """
    emoji   = _CATEGORY_EMOJI.get(category, "💬")
    content = confession.strip() if confession else ""
    caption = (
        f"Someone on Anonixx dropped this {emoji}\n\n"
        f'"{content}"\n\n'
        f"{BASE_TAGS}"
    )
    return caption[:CAPTION_MAX_LEN]


# ── Client ───────────────────────────────────────────────────────
class TikTokPublisher:
    """
    Thin async wrapper around TikTok's Content / Video Posting APIs.

    Usage:
        from app.services.tiktok_publisher import tiktok_publisher

        result = await tiktok_publisher.post_text("I have a secret…", "love")
        # → {"publish_id": "v_pub_url~...", "status": "PROCESSING_UPLOAD"}
    """

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
    async def post_text(self, confession: str, category: str = "love") -> dict:
        """Post a text confession as a TikTok text post."""
        self._require_configured()

        payload = {
            "post_info": {
                "title":           build_caption(confession, category),
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
        category:   str = "love",
    ) -> dict:
        """
        Post a video drop.
        TikTok pulls the video directly from the Cloudinary URL
        (PULL_FROM_URL) — no local download or re-upload required.
        """
        self._require_configured()

        payload = {
            "post_info": {
                "title":           build_caption(confession, category),
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
        category:   str = "love",
    ) -> dict:
        """
        Post an image drop as a TikTok photo post.
        TikTok pulls the image from the Cloudinary URL.
        """
        self._require_configured()

        payload = {
            "post_info": {
                "title":                build_caption(confession, category),
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
        """
        Poll TikTok for the final publish status of a submitted post.

        Returns one of:
            PROCESSING_UPLOAD | SEND_TO_USER_INBOX | FAILED | PUBLISHED
        """
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
