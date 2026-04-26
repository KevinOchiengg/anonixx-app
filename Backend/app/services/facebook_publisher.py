"""
app/services/facebook_publisher.py

Facebook Page Publishing via the Meta Graph API v21.0.

Supported drop formats
  text   → POST /{page_id}/feed         (message only)
  image  → POST /{page_id}/photos       (url + caption)
  video  → POST /{page_id}/videos       (file_url + description)

Credentials
  FACEBOOK_PAGE_ID           — numeric ID of the Anonixx Facebook Page
  FACEBOOK_PAGE_ACCESS_TOKEN — long-lived Page Access Token
    How to get it:
      1. Create a Meta app at https://developers.facebook.com
      2. Add the "Pages" product
      3. Grant permissions: pages_manage_posts  pages_read_engagement
      4. Generate a Page Access Token via Graph API Explorer
      5. Exchange for a long-lived token (never expires if refreshed within 60 days)
"""

import logging

import httpx

from app.config import settings

log = logging.getLogger(__name__)

GRAPH_API_BASE   = "https://graph.facebook.com/v21.0"
CAPTION_MAX_LEN  = 63206    # Facebook's post character limit

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

_FB_TAGS = "#anonixx #anonymous #confession #mentalhealth #anonymousconfessions"


def build_fb_caption(confession: str, category: str) -> str:
    """
    Facebook caption — slightly richer than TikTok; includes an app CTA.

    Example:
        Someone on Anonixx dropped this 💔

        "I still think about you every single day."

        Anonymous. Safe. Real. — anonixx.app

        #anonixx #anonymous #confession #mentalhealth #anonymousconfessions
    """
    emoji   = _CATEGORY_EMOJI.get(category, "💬")
    content = confession.strip() if confession else ""
    caption = (
        f"Someone on Anonixx dropped this {emoji}\n\n"
        f'"{content}"\n\n'
        f"Anonymous. Safe. Real. — anonixx.app\n\n"
        f"{_FB_TAGS}"
    )
    return caption[:CAPTION_MAX_LEN]


class FacebookPublisher:
    """
    Async wrapper around Meta Graph API page publishing endpoints.

    Usage:
        from app.services.facebook_publisher import facebook_publisher

        result = await facebook_publisher.post_text("I have a secret…", "love")
        # → {"post_id": "123456789_987654321"}
    """

    def __init__(self):
        self._timeout = httpx.Timeout(60.0)  # video uploads can be slow

    # ── Auth helpers ─────────────────────────────────────────────
    @property
    def _token(self) -> str:
        return settings.FACEBOOK_PAGE_ACCESS_TOKEN

    @property
    def _page_id(self) -> str:
        return settings.FACEBOOK_PAGE_ID

    def is_configured(self) -> bool:
        return bool(
            self._token   and self._token   not in ("", "your-facebook-page-access-token-here")
            and self._page_id and self._page_id not in ("", "your-facebook-page-id-here")
        )

    def _require_configured(self):
        if not self.is_configured():
            raise RuntimeError(
                "Facebook publisher not configured. "
                "Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN in .env"
            )

    # ── Text Post ─────────────────────────────────────────────────
    async def post_text(self, confession: str, category: str = "love") -> dict:
        """Post a text confession to the Facebook Page feed."""
        self._require_configured()

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{GRAPH_API_BASE}/{self._page_id}/feed",
                params={"access_token": self._token},
                json={"message": build_fb_caption(confession, category)},
            )

        return self._parse(res, "text post")

    # ── Image Post ────────────────────────────────────────────────
    async def post_image(
        self,
        image_url:  str,
        confession: str = "",
        category:   str = "love",
    ) -> dict:
        """
        Post an image drop to the Facebook Page.
        Facebook fetches the image from the Cloudinary URL.
        """
        self._require_configured()

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{GRAPH_API_BASE}/{self._page_id}/photos",
                params={"access_token": self._token},
                json={
                    "url":     image_url,
                    "caption": build_fb_caption(confession, category),
                },
            )

        return self._parse(res, "image post")

    # ── Video Post ────────────────────────────────────────────────
    async def post_video(
        self,
        video_url:  str,
        confession: str = "",
        category:   str = "love",
    ) -> dict:
        """
        Post a video drop to the Facebook Page.
        Facebook fetches the video from the Cloudinary URL.
        """
        self._require_configured()

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{GRAPH_API_BASE}/{self._page_id}/videos",
                params={"access_token": self._token},
                json={
                    "file_url":    video_url,
                    "description": build_fb_caption(confession, category),
                },
            )

        return self._parse(res, "video post")

    # ── Internal ──────────────────────────────────────────────────
    @staticmethod
    def _parse(res: httpx.Response, context: str) -> dict:
        data = res.json()
        if res.status_code not in (200, 201) or "error" in data:
            err = data.get("error", {})
            raise RuntimeError(
                f"Facebook {context} failed [{res.status_code}]: "
                f"({err.get('code')}) {err.get('message', data)}"
            )
        # Graph API returns { "id": "page_id_post_id" } for feed/photos
        # and { "id": "video_id" } for videos
        return {"post_id": data.get("id"), "status": "posted"}


# ── Singleton ────────────────────────────────────────────────────
facebook_publisher = FacebookPublisher()
