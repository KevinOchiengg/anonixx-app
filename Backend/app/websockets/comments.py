"""
comments.py

Real-time events for a drop's comment thread — mirrors activity.py's /
unlock_requests.py's per-room emit pattern, but scoped to a drop_{id} room
instead of a user_{id} room, since a comment needs to reach everyone
currently viewing that thread, not one specific user.

Clients join the room via the `join_drop_thread` / `leave_drop_thread`
socket events (see app/websockets/events.py) when the comment sheet for a
drop opens/closes.

Events emitted:
  new_comment       → a top-level comment or reply was added to the thread
  comment_liked     → a comment's like count changed (like or unlike)
  comment_pinned    → the drop's author pinned a comment (replaces any
                       previously pinned one — see pin_drop_comment)
  comment_unpinned  → the drop's author unpinned a comment
"""

from app.sio import sio


async def emit_new_comment(drop_id: str, comment: dict):
    await sio.emit("new_comment", {"dropId": drop_id, "comment": comment}, room=f"drop_{drop_id}")


async def emit_comment_liked(drop_id: str, comment_id: str, likes_count: int):
    await sio.emit(
        "comment_liked",
        {"dropId": drop_id, "commentId": comment_id, "likesCount": likes_count},
        room=f"drop_{drop_id}",
    )


async def emit_comment_pinned(drop_id: str, comment_id: str):
    await sio.emit(
        "comment_pinned", {"dropId": drop_id, "commentId": comment_id}, room=f"drop_{drop_id}",
    )


async def emit_comment_unpinned(drop_id: str, comment_id: str):
    await sio.emit(
        "comment_unpinned", {"dropId": drop_id, "commentId": comment_id}, room=f"drop_{drop_id}",
    )
