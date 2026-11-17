"""Posts drops to the Anonixx X (Twitter) account: the teaser card or image with a short
caption and the drop's link. Video drops without a teaser card post the caption only.
Needs X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN and X_ACCESS_TOKEN_SECRET (OAuth 1.0a,
from an X developer app with Read and Write permission)."""

import base64
import hashlib
import hmac
import logging
import secrets
import time
from urllib.parse import quote

import httpx

from app.config import settings
from app.services.caption_engine import build_caption

log = logging.getLogger(__name__)

TWEETS_URL = "https://api.x.com/2/tweets"
MEDIA_URL = "https://api.x.com/2/media/upload"


def _enc(s) -> str:
    return quote(str(s), safe="~")


def oauth1_header(method: str, url: str, key: str, secret: str, token: str, token_secret: str,
                  params: dict | None = None, nonce: str | None = None, timestamp: str | None = None) -> str:
    """OAuth 1.0a (HMAC-SHA1) Authorization header. JSON and multipart bodies are not signed."""
    oauth = {
        "oauth_consumer_key": key,
        "oauth_nonce": nonce or secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": timestamp or str(int(time.time())),
        "oauth_token": token,
        "oauth_version": "1.0",
    }
    pairs = sorted((_enc(k), _enc(v)) for k, v in {**(params or {}), **oauth}.items())
    base = "&".join([method.upper(), _enc(url), _enc("&".join(f"{k}={v}" for k, v in pairs))])
    signing_key = f"{_enc(secret)}&{_enc(token_secret)}"
    oauth["oauth_signature"] = base64.b64encode(hmac.new(signing_key.encode(), base.encode(), hashlib.sha1).digest()).decode()
    return "OAuth " + ", ".join(f'{_enc(k)}="{_enc(v)}"' for k, v in sorted(oauth.items()))


class XPublisher:
    def __init__(self):
        self._timeout = httpx.Timeout(60.0)

    @staticmethod
    def _creds() -> tuple[str, str, str, str]:
        return settings.X_API_KEY, settings.X_API_SECRET, settings.X_ACCESS_TOKEN, settings.X_ACCESS_TOKEN_SECRET

    def is_configured(self) -> bool:
        return all(self._creds())

    def _auth(self, method: str, url: str) -> dict:
        if not self.is_configured():
            raise RuntimeError("X publisher not configured. Set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN and X_ACCESS_TOKEN_SECRET.")
        return {"Authorization": oauth1_header(method, url, *self._creds())}

    async def _upload_image(self, client: httpx.AsyncClient, image_url: str) -> str:
        img = await client.get(image_url)
        if img.status_code != 200:
            raise RuntimeError(f"X image fetch failed [{img.status_code}]")
        res = await client.post(
            MEDIA_URL, headers=self._auth("POST", MEDIA_URL),
            files={"media": ("card.jpg", img.content, img.headers.get("content-type", "image/jpeg"))},
            data={"media_category": "tweet_image"},
        )
        data = self._json(res)
        media_id = (data.get("data") or {}).get("id") or data.get("media_id_string")
        if res.status_code >= 300 or not media_id:
            raise RuntimeError(f"X media upload failed [{res.status_code}]: {data}")
        return str(media_id)

    async def post(self, confession: str, link: str, image_url: str | None = None) -> dict:
        text = build_caption(confession, platform="x", link=link)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            body: dict = {"text": text}
            if image_url:
                body["media"] = {"media_ids": [await self._upload_image(client, image_url)]}
            res = await client.post(TWEETS_URL, headers=self._auth("POST", TWEETS_URL), json=body)
        data = self._json(res)
        if res.status_code >= 300 or not (data.get("data") or {}).get("id"):
            raise RuntimeError(f"X post failed [{res.status_code}]: {data.get('detail') or data}")
        return {"post_id": data["data"]["id"], "status": "posted"}

    @staticmethod
    def _json(res: httpx.Response) -> dict:
        try:
            return res.json()
        except Exception:
            return {"raw": res.text[:300]}


x_publisher = XPublisher()
