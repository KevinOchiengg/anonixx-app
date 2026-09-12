"""
app/utils/notifications.py
Push notification utility — sends via Expo Push Notifications API.
Uses push tokens stored in the push_tokens collection by AuthContext.
"""
import httpx
import logging
from typing import Optional
from bson import ObjectId

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
    """
    Send a push notification to a user.

    Args:
        user_id: MongoDB user ID string
        template_key: Key from TEMPLATES dict
        db: Motor database instance
        extra_data: Additional data to merge into notification data payload
        title_override: Override the template title
        body_override: Override the template body

    Returns:
        True if sent successfully, False otherwise
    """
    token = await get_push_token(user_id, db)
    if not token:
        logger.info(f"No push token for user {user_id} — skipping notification")
        return False

    if not token.startswith("ExponentPushToken["):
        logger.warning(f"Invalid push token format for user {user_id}: {token[:20]}...")
        return False

    template = TEMPLATES.get(template_key)
    if not template:
        logger.error(f"Unknown notification template: {template_key}")
        return False

    # Build payload
    data = {**template["data"]}
    if extra_data:
        data.update(extra_data)

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


async def send_push_to_many(
    user_ids: list[str],
    template_key: str,
    db,
    extra_data: Optional[dict] = None,
) -> dict:
    """
    Send the same notification to multiple users.
    Returns dict with success/failure counts.
    """
    results = {"sent": 0, "failed": 0, "skipped": 0}

    for user_id in user_ids:
        token = await get_push_token(user_id, db)
        if not token:
            results["skipped"] += 1
            continue
        success = await send_push_notification(user_id, template_key, db, extra_data)
        if success:
            results["sent"] += 1
        else:
            results["failed"] += 1

    return results
