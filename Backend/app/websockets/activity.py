"""Real-time activity events: profile_viewed, high_activity_detected."""

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


