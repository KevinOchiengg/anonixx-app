"""
app/services/whatsapp_sender.py

Sends a drop card to a phone number via the WhatsApp Cloud API, from
Anonixx's own business number — the recipient sees "Anonixx", never the
sharer's real number.

Credentials
  WHATSAPP_ACCESS_TOKEN     — permanent or long-lived token for the app
  WHATSAPP_PHONE_NUMBER_ID  — the sending number's ID (not the number itself)
    How to get them:
      1. developers.facebook.com > your app > WhatsApp > API Setup
      2. Generate a permanent access token (System User, not the 24h test token)
      3. Copy the "Phone number ID" shown for the sending number

Not a broadcast tool: every send here targets one recipient the composing
user typed in, so it is bound by WhatsApp's own anti-spam rules — a first
contact to a number that has never messaged Anonixx must use an
approved message template, not free-form text. `is_configured()` lets
callers no-op cleanly until real credentials + an approved template exist.
"""

import logging

import httpx

from app.config import settings

log = logging.getLogger(__name__)

API_BASE = "https://graph.facebook.com/v19.0"


class WhatsAppSender:
    """
    Async wrapper around the WhatsApp Cloud API for sending a drop-share
    template message to a single recipient number.

    Usage:
        from app.services.whatsapp_sender import whatsapp_sender

        result = await whatsapp_sender.send_drop_share(
            "+254712345678", "Someone shared a confession with you.", link
        )
    """

    def __init__(self):
        self._timeout = httpx.Timeout(30.0)

    @property
    def _token(self) -> str:
        return settings.WHATSAPP_ACCESS_TOKEN

    @property
    def _phone_number_id(self) -> str:
        return settings.WHATSAPP_PHONE_NUMBER_ID

    def is_configured(self) -> bool:
        return bool(
            self._token and self._token not in ("", "your-whatsapp-access-token-here")
            and self._phone_number_id and self._phone_number_id not in ("", "your-whatsapp-phone-number-id-here")
        )

    def _require_configured(self):
        if not self.is_configured():
            raise RuntimeError(
                "WhatsApp isn't configured — set WHATSAPP_ACCESS_TOKEN and "
                "WHATSAPP_PHONE_NUMBER_ID in the backend .env."
            )

    async def send_drop_share(self, to_phone: str, preview: str, link: str) -> dict:
        """
        Send a drop-share notification to `to_phone` (E.164, e.g. +254712345678).

        Uses a free-form text message. Meta requires this to be either inside
        an existing 24h customer-service window, or sent via a pre-approved
        message template for first contact — swap the payload below for a
        `template` object (name registered in WhatsApp Manager) once one is
        approved, so cold sends to numbers that have never messaged Anonixx
        don't get silently dropped by Meta.
        """
        self._require_configured()

        body = (
            f"Someone on Anonixx shared a confession with you 👀\n\n"
            f"“{preview}”\n\n"
            f"{link}\n\n"
            f"— sent via Anonixx. Reply STOP to never receive these again."
        )

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{API_BASE}/{self._phone_number_id}/messages",
                headers={"Authorization": f"Bearer {self._token}"},
                json={
                    "messaging_product": "whatsapp",
                    "to": to_phone,
                    "type": "text",
                    "text": {"body": body},
                },
            )
            if resp.status_code >= 400:
                log.warning("WhatsApp send failed (%s): %s", resp.status_code, resp.text)
                resp.raise_for_status()
            return resp.json()


whatsapp_sender = WhatsAppSender()
