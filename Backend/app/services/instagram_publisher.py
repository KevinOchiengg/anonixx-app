"""Posts drops to the Anonixx Instagram account (Graph API v21.0): images, and videos as Reels.
Text-only isn't possible (raises PlatformSkipped). Create a container, wait for video
processing, then publish. Needs INSTAGRAM_ACCOUNT_ID and the Facebook Page token."""

import asyncio
import logging

import httpx

from app.config import settings
from app.services.caption_engine import build_caption

log = logging.getLogger(__name__)

GRAPH_API_BASE          = "https://graph.facebook.com/v21.0"
VIDEO_STATUS_MAX_POLLS  = 15      # 15 × 5 s = 75 s max wait
VIDEO_STATUS_POLL_DELAY = 5       # seconds between polls


class PlatformSkipped(Exception):
    """Raised when a platform legitimately cannot handle this drop type."""


class InstagramPublisher:
    """Instagram publishing client."""

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
    async def post_text(self, confession: str) -> dict:
        """Text-only posts aren't supported: raises PlatformSkipped (recorded as skipped)."""
        raise PlatformSkipped(
            "Instagram does not support text-only posts. "
            "Drop was posted to other configured platforms."
        )

    # ── Image Post ────────────────────────────────────────────────
    async def post_image(
        self,
        image_url:  str,
        confession: str = "",
    ) -> dict:
        """Post an image drop as an Instagram photo."""
        self._require_configured()

        creation_id = await self._create_image_container(image_url, confession)
        return await self._publish_container(creation_id)

    # ── Video / Reel Post ─────────────────────────────────────────
    async def post_video(
        self,
        video_url:  str,
        confession: str = "",
    ) -> dict:
        """Post a video as a Reel, once processing finishes."""
        self._require_configured()

        creation_id = await self._create_video_container(video_url, confession)
        await self._wait_for_video_ready(creation_id)
        return await self._publish_container(creation_id)

    # ── Step 1a: create image container ──────────────────────────
    async def _create_image_container(
        self,
        image_url:  str,
        confession: str,
    ) -> str:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{GRAPH_API_BASE}/{self._ig_id}/media",
                params={"access_token": self._token},
                json={
                    "image_url": image_url,
                    "caption":   build_caption(confession, platform="instagram"),
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
    ) -> str:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{GRAPH_API_BASE}/{self._ig_id}/media",
                params={"access_token": self._token},
                json={
                    "video_url":  video_url,
                    "media_type": "REELS",
                    "caption":    build_caption(confession, platform="instagram"),
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
        """Wait for a media container to finish. RuntimeError on timeout."""
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
