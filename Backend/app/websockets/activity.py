"""
activity.py

Helpers for emitting real-time activity events to users.
Call these from API route handlers to drive the frontend loading system.

Events emitted:
  profile_viewed          → target user learns someone viewed their profile
  high_activity_detected  → user is told the space is busy
  message_locked          → user is told a message is behind a paywall
"""

from app.sio import sio


async def emit_profile_viewed(target_user_id: str, viewer_user_id: str | None = None):
    """Notify *target_user_id* that their profile was viewed."""
    await sio.emit(
        "profile_viewed",
        {"viewedBy": viewer_user_id},
        room=f"user_{target_user_id}",
    )


async def emit_high_activity(user_id: str, online_count: int = 0):
    """Notify *user_id* that there is high activity in the space."""
    await sio.emit(
        "high_activity_detected",
        {"onlineCount": online_count},
        room=f"user_{user_id}",
    )


async def emit_message_locked(user_id: str, chat_id: str | None = None):
    """Notify *user_id* that a message in *chat_id* is locked."""
    await sio.emit(
        "message_locked",
        {"chatId": chat_id},
        room=f"user_{user_id}",
    )
