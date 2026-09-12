"""
chat.py

Real-time events for Link Up DM chat (drop_connections / drop_messages).

Unlike drop comment threads (room-per-drop, any number of viewers), a DM
is always between exactly two known users — so this targets the other
party's personal room directly (f"user_{user_id}", already joined on
socket connect, see app/websockets/events.py) instead of a room scoped to
the conversation. No join/leave events needed on the client side.

Events emitted:
  new_message      → the other party in a Link Up chat received a message
  messages_seen    → the other party just read up to some point in the chat
                      (drives the sent-message "seen" tick going live/blue
                      without waiting for that party's own next poll)
  message_deleted  → a message was deleted for everyone — the other party
                      needs to swap it for the "deleted" placeholder live,
                      not just on their next poll
"""

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
