"""
app/services/telegram_publisher.py

Telegram channel publishing via the Bot API.

Supported drop formats
  text   → POST /sendMessage   (Markdown-enabled caption)
  image  → POST /sendPhoto     (photo URL + caption)
  video  → POST /sendVideo     (video URL + caption)

Credentials
  TELEGRAM_BOT_TOKEN  — token from @BotFather
  TELEGRAM_CHANNEL_ID — the channel the bot posts into (e.g. "@anonixx" or "-100123456789")
    How to get it:
      1. Message @BotFather, /newbot, grab the token
      2. Add the bot as an admin of the Anonixx channel
      3. Use the channel's @username, or its numeric chat id if private
"""

import logging

import httpx

from app.config import settings
from app.services.caption_engine import build_caption

log = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org"


class TelegramPublisher:
    """
    Async wrapper around the Telegram Bot API for channel posts.

    Usage:
        from app.services.telegram_publisher import telegram_publisher

        result = await telegram_publisher.post_text("I have a secret…")
        # → {"message_id": 42}
    """

    def __init__(self):
        self._timeout = httpx.Timeout(60.0)

    @property
    def _token(self) -> str:
        return settings.TELEGRAM_BOT_TOKEN

    @property
    def _channel_id(self) -> str:
        return settings.TELEGRAM_CHANNEL_ID

    def is_configured(self) -> bool:
        return bool(
            self._token and self._token not in ("", "your-telegram-bot-token-here")
            and self._channel_id and self._channel_id not in ("", "your-telegram-channel-id-here")
        )

    def _require_configured(self):
        if not self.is_configured():
            raise RuntimeError(
                "Telegram publisher not configured. "
                "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID in .env"
            )

    def _url(self, method: str) -> str:
        return f"{API_BASE}/bot{self._token}/{method}"

    # ── Text Post ─────────────────────────────────────────────────
    async def post_text(self, confession: str) -> dict:
        self._require_configured()

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                self._url("sendMessage"),
                json={
                    "chat_id": self._channel_id,
                    "text":    build_caption(confession, platform="telegram"),
                },
            )
        return self._parse(res, "text post")

    # ── Image Post ────────────────────────────────────────────────
    async def post_image(self, image_url: str, confession: str = "") -> dict:
        self._require_configured()

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                self._url("sendPhoto"),
                json={
                    "chat_id": self._channel_id,
                    "photo":   image_url,
                    "caption": build_caption(confession, platform="telegram"),
                },
            )
        return self._parse(res, "image post")

    # ── Video Post ────────────────────────────────────────────────
    async def post_video(self, video_url: str, confession: str = "") -> dict:
        self._require_configured()

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                self._url("sendVideo"),
                json={
                    "chat_id": self._channel_id,
                    "video":   video_url,
                    "caption": build_caption(confession, platform="telegram"),
                },
            )
        return self._parse(res, "video post")

    # ── Internal ──────────────────────────────────────────────────
    @staticmethod
    def _parse(res: httpx.Response, context: str) -> dict:
        data = res.json()
        if res.status_code != 200 or not data.get("ok"):
            raise RuntimeError(
                f"Telegram {context} failed [{res.status_code}]: {data.get('description', data)}"
            )
        return {"message_id": data.get("result", {}).get("message_id"), "status": "posted"}


# ── Singleton ────────────────────────────────────────────────────
telegram_publisher = TelegramPublisher()
