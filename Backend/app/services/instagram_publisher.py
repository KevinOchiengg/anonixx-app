"""
app/services/instagram_publisher.py

Instagram Publishing via the Instagram Graph API (Meta Graph API v21.0).

Requirements
  - Instagram Business or Creator account linked to the Anonixx Facebook Page
  - The same Page Access Token used for Facebook works here

Supported drop formats
  image  → single photo post
  video  → Reel (REELS media type — highest reach on IG)
  text   → NOT SUPPORTED by Instagram (raises PlatformSkipped)
           Instagram has no text-only post endpoint; all posts require media.

Two-step flow (same for image and video)
  1. Create a media container → returns creation_id
  2. For video: poll container status until FINISHED (max ~60 s)
  3. Publish the container  → returns ig_post_id

Credentials
  INSTAGRAM_ACCOUNT_ID       — numeric IG Business/Creator account ID
    How to find it:
      GET /{facebook_page_id}?fields=instagram_business_account&access_token=...
      → { "instagram_business_account": { "id": "12345678" } }
  FACEBOOK_PAGE_ACCESS_TOKEN — same long-lived token used for Facebook
"""

import asyncio
import logging

import httpx

from app.config import settings

log = logging.getLogger(__name__)

GRAPH_API_BASE           = "https://graph.facebook.com/v21.0"
CAPTION_MAX_LEN          = 2200    # Instagram caption limit
VIDEO_STATUS_MAX_POLLS   = 15      # 15 × 5 s = 75 s max wait
VIDEO_STATUS_POLL_DELAY  = 5       # seconds between polls

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

# Instagram loves hashtags — more = better discoverability
_IG_TAGS = (
    "#anonixx #anonymous #confession #mentalhealth #anonymousconfessions "
    "#MentalHealthMatters #confessions #secrets #anonymousstories "
    "#feelingsheard #youarenotalone #healing #realstories #vulnerability "
    "#emotionalhealth #innervoice"
)


class PlatformSkipped(Exception):
    """Raised when a platform legitimately cannot handle this drop type."""


def build_ig_caption(confession: str, category: str) -> str:
    """
    Instagram caption — hashtag-rich for maximum reach.

    Example:
        Someone on Anonixx dropped this 💔

        "I still think about you every single day."

        #anonixx #anonymous #confession #mentalhealth ...
    """
    emoji   = _CATEGORY_EMOJI.get(category, "💬")
    content = confession.strip() if confession else ""
    caption = (
        f"Someone on Anonixx dropped this {emoji}\n\n"
        f'"{content}"\n\n'
        f"{_IG_TAGS}"
    )
    return caption[:CAPTION_MAX_LEN]


class InstagramPublisher:
    """
    Async wrapper around the Instagram Graph API publishing flow.

    Usage:
        from app.services.instagram_publisher import instagram_publisher

        result = await instagram_publisher.post_image(image_url, "secret", "love")
        # → {"post_id": "17841400...", "status": "posted"}

        # Text drops are not supported — catch PlatformSkipped
        from app.services.instagram_publisher import PlatformSkipped
    """

    def __init__(self):
        self._timeout = httpx.Timeout(60.0)

    # ── Auth helpers ─────────────────────────────────────────────
    @property
    def _token(self) -> str:
        return settings.FACEBOOK_PAGE_ACCESS_TOKEN   # IG uses same token as FB

    @property
    def _ig_id(self) -> str:
        return settings.INSTAGRAM_ACCOUNT_ID

    def is_configured(self) -> bool:
        return bool(
            self._token  and self._token  not in ("", "your-facebook-page-access-token-here")
            and self._ig_id and self._ig_id not in ("", "your-instagram-account-id-here")
        )

    def _require_configured(self):
        if not self.is_configured():
            raise RuntimeError(
                "Instagram publisher not configured. "
                "Set INSTAGRAM_ACCOUNT_ID and FACEBOOK_PAGE_ACCESS_TOKEN in .env"
            )

    # ── Text Post — not supported ─────────────────────────────────
    async def post_text(self, confession: str, category: str = "love") -> dict:
        """
        Instagram does not support text-only posts.
        Raises PlatformSkipped so the worker records 'skipped' rather than 'failed'.
        """
        raise PlatformSkipped(
            "Instagram does not support text-only posts. "
            "Drop was posted to other configured platforms."
        )

    # ── Image Post ────────────────────────────────────────────────
    async def post_image(
        self,
        image_url:  str,
        confession: str = "",
        category:   str = "love",
    ) -> dict:
        """Post an image drop as an Instagram photo."""
        self._require_configured()

        creation_id = await self._create_image_container(image_url, confession, category)
        return await self._publish_container(creation_id)

    # ── Video / Reel Post ─────────────────────────────────────────
    async def post_video(
        self,
        video_url:  str,
        confession: str = "",
        category:   str = "love",
    ) -> dict:
        """
        Post a video drop as an Instagram Reel.
        Polls until the container is FINISHED before publishing.
        """
        self._require_configured()

        creation_id = await self._create_video_container(video_url, confession, category)
        await self._wait_for_video_ready(creation_id)
        return await self._publish_container(creation_id)

    # ── Step 1a: create image container ──────────────────────────
    async def _create_image_container(
        self,
        image_url:  str,
        confession: str,
        category:   str,
    ) -> str:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{GRAPH_API_BASE}/{self._ig_id}/media",
                params={"access_token": self._token},
                json={
                    "image_url": image_url,
                    "caption":   build_ig_caption(confession, category),
                },
            )

        data = res.json()
        if res.status_code not in (200, 201) or "error" in data:
            err = data.get("error", {})
            raise RuntimeError(
                f"Instagram image container creation failed: "
                f"({err.get('code')}) {err.get('message', data)}"
            )
        return data["id"]

    # ── Step 1b: create video container (Reel) ────────────────────
    async def _create_video_container(
        self,
        video_url:  str,
        confession: str,
        category:   str,
    ) -> str:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{GRAPH_API_BASE}/{self._ig_id}/media",
                params={"access_token": self._token},
                json={
                    "video_url":  video_url,
                    "media_type": "REELS",
                    "caption":    build_ig_caption(confession, category),
                },
            )

        data = res.json()
        if res.status_code not in (200, 201) or "error" in data:
            err = data.get("error", {})
            raise RuntimeError(
                f"Instagram video container creation failed: "
                f"({err.get('code')}) {err.get('message', data)}"
            )
        return data["id"]

    # ── Step 2: poll until video container is ready ───────────────
    async def _wait_for_video_ready(self, creation_id: str):
        """
        Poll the container status until FINISHED or ERROR.
        Raises RuntimeError if it never finishes within the timeout window.
        """
        for attempt in range(VIDEO_STATUS_MAX_POLLS):
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                res = await client.get(
                    f"{GRAPH_API_BASE}/{creation_id}",
                    params={
                        "fields":       "status_code",
                        "access_token": self._token,
                    },
                )

            data        = res.json()
            status_code = data.get("status_code", "")

            if status_code == "FINISHED":
                return
            if status_code == "ERROR":
                raise RuntimeError(
                    f"Instagram video container errored during processing "
                    f"(creation_id={creation_id})."
                )

            log.debug(
                "InstagramPublisher: container %s status=%s (attempt %d/%d)",
                creation_id, status_code, attempt + 1, VIDEO_STATUS_MAX_POLLS,
            )
            await asyncio.sleep(VIDEO_STATUS_POLL_DELAY)

        raise RuntimeError(
            f"Instagram video container {creation_id} did not finish "
            f"within {VIDEO_STATUS_MAX_POLLS * VIDEO_STATUS_POLL_DELAY}s."
        )

    # ── Step 3: publish container ─────────────────────────────────
    async def _publish_container(self, creation_id: str) -> dict:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{GRAPH_API_BASE}/{self._ig_id}/media_publish",
                params={"access_token": self._token},
                json={"creation_id": creation_id},
            )

        data = res.json()
        if res.status_code not in (200, 201) or "error" in data:
            err = data.get("error", {})
            raise RuntimeError(
                f"Instagram media_publish failed: "
                f"({err.get('code')}) {err.get('message', data)}"
            )
        return {"post_id": data.get("id"), "status": "posted"}


# ── Singleton ────────────────────────────────────────────────────
instagram_publisher = InstagramPublisher()
