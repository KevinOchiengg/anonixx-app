"""Real-time Link Up chat events, sent to the other person's user_{id} room:
new_message, messages_seen, message_deleted."""

from app.sio import sio


async def emit_new_message(other_user_id: str, connection_id: str, message: dict):
    await sio.emit(
        "new_message",
        {"connectionId": connection_id, "message": message},
        room=f"user_{other_user_id}",
    )


async def emit_messages_seen(other_user_id: str, connection_id: str, seen_at: str):
    await sio.emit(
        "messages_seen",
        {"connectionId": connection_id, "seenAt": seen_at},
        room=f"user_{other_user_id}",
    )


async def emit_message_deleted(other_user_id: str, connection_id: str, message_id: str):
    await sio.emit(
        "message_deleted",
        {"connectionId": connection_id, "messageId": message_id},
        room=f"user_{other_user_id}",
    )
