"""Real-time comment events for a drop_{id} room: new_comment, comment_liked,
comment_pinned, comment_unpinned."""

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
