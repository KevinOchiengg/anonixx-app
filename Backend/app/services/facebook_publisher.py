"""Posts drops to the Anonixx Facebook Page (Graph API v21.0): text, image or video.
Needs FACEBOOK_PAGE_ID and a long-lived FACEBOOK_PAGE_ACCESS_TOKEN."""

import logging
from typing import Optional

import httpx

from app.config import settings
from app.services.caption_engine import build_caption, build_teaser_caption

log = logging.getLogger(__name__)

GRAPH_API_BASE = "https://graph.facebook.com/v21.0"


class FacebookPublisher:
    """Facebook Page publishing client."""

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
    async def post_text(self, confession: str) -> dict:
        """Post a text confession to the Facebook Page feed."""
        self._require_configured()

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{GRAPH_API_BASE}/{self._page_id}/feed",
                params={"access_token": self._token},
                json={"message": build_caption(confession, platform="facebook")},
            )

        return self._parse(res, "text post")

    # ── Image Post ────────────────────────────────────────────────
    async def post_image(
        self,
        image_url:  str,
        confession: str = "",
        drop_link:  Optional[str] = None,
        drop_id:    Optional[str] = None,
    ) -> dict:
        """Post an image. With `drop_link` it's a teaser card: no confession text, links to the drop."""
        self._require_configured()

        caption = (
            build_teaser_caption(drop_link, seed=drop_id or image_url)
            if drop_link
            else build_caption(confession, platform="facebook")
        )

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{GRAPH_API_BASE}/{self._page_id}/photos",
                params={"access_token": self._token},
                json={
                    "url":     image_url,
                    "caption": caption,
                },
            )

        return self._parse(res, "image post")

    # ── Video Post ────────────────────────────────────────────────
    async def post_video(
        self,
        video_url:  str,
        confession: str = "",
    ) -> dict:
        """Post a video (Facebook fetches it from the URL)."""
        self._require_configured()

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{GRAPH_API_BASE}/{self._page_id}/videos",
                params={"access_token": self._token},
                json={
                    "file_url":    video_url,
                    "description": build_caption(confession, platform="facebook"),
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
