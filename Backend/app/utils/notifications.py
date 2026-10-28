"""Expo push notifications, using tokens in the push_tokens collection."""
import asyncio
import json
import httpx
import logging
from typing import Optional

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# ── Notification templates ─────────────────────────────────────
TEMPLATES = {
    # Connect requests
    "connect_request": {
        "title": "Someone wants in",
        "body": "A stranger noticed you. Your call.",
        "data": {"type": "connect_request"},
    },
    "connect_accepted": {
        "title": "Request accepted 🌑",
        "body": "Your connect request was accepted. Say something.",
        "data": {"type": "connect_accepted"},
    },

    # Messages
    "new_message": {
        "title": "Someone said something",
        "body": "Don't leave them on read.",  # Never show content — anonymous
        "data": {"type": "new_message"},
    },

    # Posts
    "post_response": {
        "title": "Someone responded to your confession",
        "body": "A new response on your drop.",
        "data": {"type": "post_response"},
    },
    "post_like": {
        "title": "Someone felt your confession",
        "body": "Your drop resonated with someone.",
        "data": {"type": "post_like"},
    },

    # Drops
    "drop_resonated": {
        "title": "Someone resonated with your confession 🔥",
        "body": "They felt your words and had to say something back. Tap to read their drop.",
        "data": {"type": "drop_resonated"},
    },
    "drop_unlocked": {
        "title": "Someone unlocked your confession 🔓",
        "body": "They paid to connect with you. Say something.",
        "data": {"type": "drop_unlocked"},
    },

    # Deception reports — see api/v1/deception_reports.py
    "deception_refund": {
        "title": "You've been refunded",
        "body": "The confession you reported was confirmed deceptive. Your coins are back.",
        "data": {"type": "deception_refund"},
    },
    "deception_strike_warning": {
        "title": "A confession you posted was reported",
        "body": "It was confirmed deceptive. This is a strike on your account — repeat strikes lead to a posting suspension, then a ban.",
        "data": {"type": "deception_strike_warning"},
    },
    "deception_strike_suspended": {
        "title": "Posting suspended",
        "body": "A second confirmed deceptive confession means you can't post for 7 days.",
        "data": {"type": "deception_strike_suspended"},
    },
    "deception_strike_banned": {
        "title": "Account deactivated",
        "body": "Repeated confirmed deceptive confessions have deactivated your account.",
        "data": {"type": "deception_strike_banned"},
    },
}


def _web_push_one(sub: dict, payload: str) -> str:
    """Blocking send to one browser subscription. Returns 'ok', 'gone' or 'error'."""
    from pywebpush import webpush, WebPushException
    from app.config import settings
    try:
        webpush(
            subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
            data=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=86400,
        )
        return "ok"
    except WebPushException as e:
        code = getattr(getattr(e, "response", None), "status_code", None)
        return "gone" if code in (404, 410) else "error"
    except Exception:
        return "error"


async def send_web_push(user_id: str, title: str, body: str, data: Optional[dict], db) -> int:
    """Deliver a notification to every browser the user enabled notifications on."""
    from app.config import settings
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return 0
    try:
        subs = await db["web_push_subscriptions"].find({"user_id": user_id}).to_list(length=10)
        if not subs:
            return 0
        payload = json.dumps({"title": title, "body": body, "data": data or {}})
        sent = 0
        for sub in subs:
            result = await asyncio.to_thread(_web_push_one, sub, payload)
            if result == "ok":
                sent += 1
            elif result == "gone":
                await db["web_push_subscriptions"].delete_one({"_id": sub["_id"]})
        return sent
    except Exception as e:
        logger.warning(f"Web push failed for {user_id}: {e}")
        return 0


async def get_push_token(user_id: str, db) -> Optional[str]:
    """Fetch the most recent push token for a user."""
    try:
        record = await db["push_tokens"].find_one(
            {"user_id": user_id},
            sort=[("created_at", -1)]
        )
        if record:
            return record.get("token")
    except Exception as e:
        logger.error(f"Error fetching push token for {user_id}: {e}")
    return None


async def send_push_notification(
    user_id: str,
    template_key: str,
    db,
    extra_data: Optional[dict] = None,
    title_override: Optional[str] = None,
    body_override: Optional[str] = None,
) -> bool:
    """Send TEMPLATES[template_key] to a user (title/body can be overridden). True if sent."""
    template = TEMPLATES.get(template_key)
    if not template:
        logger.error(f"Unknown notification template: {template_key}")
        return False

    # Build payload
    data = {**template["data"]}
    if extra_data:
        data.update(extra_data)

    web_sent = await send_web_push(
        user_id, title_override or template["title"], body_override or template["body"], data, db,
    )

    token = await get_push_token(user_id, db)
    if not token:
        logger.info(f"No push token for user {user_id} — skipping notification")
        return web_sent > 0

    if not token.startswith("ExponentPushToken["):
        logger.warning(f"Invalid push token format for user {user_id}: {token[:20]}...")
        return web_sent > 0

    payload = {
        "to": token,
        "title": title_override or template["title"],
        "body": body_override or template["body"],
        "data": data,
        "sound": "default",
        "priority": "high",
        "channelId": "default",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=payload,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
            )

            result = response.json()

            # Check for errors in Expo response
            if response.status_code == 200:
                data_field = result.get("data", {})
                status = data_field.get("status")
                if status == "error":
                    details = data_field.get("details", {})
                    error = data_field.get("message", "Unknown error")
                    logger.error(f"Expo push error for {user_id}: {error} — {details}")

                    # Token is invalid — remove it
                    if details.get("error") == "DeviceNotRegistered":
                        await db["push_tokens"].delete_many({"token": token})
                        logger.info(f"Removed invalid token for user {user_id}")
                    return False

                logger.info(f"✅ Push sent to {user_id} [{template_key}]")
                return True
            else:
                logger.error(f"Expo API error {response.status_code}: {result}")
                return False

    except httpx.TimeoutException:
        logger.warning(f"Push notification timeout for user {user_id}")
        return False
    except Exception as e:
        logger.error(f"Push notification failed for {user_id}: {e}")
        return False


