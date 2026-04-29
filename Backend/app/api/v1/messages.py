"""
app/api/v1/messages.py

Unified messaging inbox — merges Connect chats and Drop connections
into a single chronologically-sorted feed for the Messages tab.

GET /messages/inbox   — paginated unified inbox (connect + drop)

Defensive approach:
  - All field access uses .get() with safe defaults — one bad document
    in MongoDB will never crash the entire inbox.
  - Per-item try/except so a corrupt record is skipped, not fatal.
  - All per-chat DB queries are batched into a single asyncio.gather
    instead of N sequential round trips.
"""

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query

from app.database import get_database
from app.dependencies import get_current_user_id

router = APIRouter(prefix="/messages", tags=["messages"])
log    = logging.getLogger(__name__)

# Keep in sync with connect.py
REVEAL_MESSAGE_THRESHOLD = 30


def _iso(dt) -> str | None:
    """Safely convert a datetime (or string) to ISO-8601 UTC string."""
    if dt is None:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return str(dt)


# ── Connect items ─────────────────────────────────────────────────────────────

async def _connect_items(uid: str, db) -> list[dict]:
    """
    Fetch active connect_chats and normalise to inbox shape.
    All field access uses .get() — a single malformed document is skipped,
    not allowed to crash the entire inbox.
    """
    chats = await db["connect_chats"].find({
        "$or": [
            {"from_user_id": uid},
            {"to_user_id":   uid},
        ],
        "status": {"$in": ["active", "unlocked"]},
    }).sort("last_message_at", -1).to_list(None)

    if not chats:
        return []

    # Batch ALL last-message + unread queries in one gather call
    # instead of N sequential round trips
    chat_ids = [str(c["_id"]) for c in chats]

    last_msg_tasks = [
        db["connect_messages"].find_one(
            {"chat_id": cid}, sort=[("created_at", -1)]
        )
        for cid in chat_ids
    ]
    unread_tasks = [
        db["connect_messages"].count_documents({
            "chat_id":   cid,
            "sender_id": {"$ne": uid},
            "is_read":   False,
        })
        for cid in chat_ids
    ]

    results = await asyncio.gather(*last_msg_tasks, *unread_tasks, return_exceptions=True)
    last_msgs = results[:len(chats)]
    unreads   = results[len(chats):]

    items: list[dict] = []
    for i, chat in enumerate(chats):
        try:
            is_from = chat.get("from_user_id") == uid

            other_name   = chat.get("to_anonymous_name")  if is_from else chat.get("from_anonymous_name")
            other_avatar = chat.get("to_avatar")           if is_from else chat.get("from_avatar")
            other_color  = chat.get("to_avatar_color")     if is_from else chat.get("from_avatar_color")
            other_id     = chat.get("to_user_id")          if is_from else chat.get("from_user_id")

            last_msg    = last_msgs[i] if not isinstance(last_msgs[i], Exception) else None
            unread_cnt  = unreads[i]   if not isinstance(unreads[i],   Exception) else 0
            if not isinstance(unread_cnt, int):
                unread_cnt = 0

            msg_count    = chat.get("message_count", 0)
            is_unlocked  = chat.get("is_unlocked", False)
            messages_left = (
                None if is_unlocked
                else max(0, REVEAL_MESSAGE_THRESHOLD - msg_count)
            )

            last_content = None
            if last_msg and isinstance(last_msg, dict):
                last_content = (last_msg.get("content") or "")[:80] or None

            items.append({
                "id":                   str(chat["_id"]),
                "chat_type":            "connect",
                "other_anonymous_name": other_name   or "Anonymous",
                "other_avatar":         other_avatar or "ghost",
                "other_avatar_color":   other_color  or "#FF634A",
                "other_user_id":        other_id     or "",
                "last_message":         last_content,
                "last_message_at":      _iso(chat.get("last_message_at")),
                "unread_count":         unread_cnt,
                # connect-specific
                "is_unlocked":          is_unlocked,
                "messages_left":        messages_left,
                "reveal_status":        chat.get("reveal_status"),
                "reveal_initiator":     chat.get("reveal_initiator_id") == uid,
                "reveal_unlocked":      msg_count >= REVEAL_MESSAGE_THRESHOLD,
                "message_count":        msg_count,
                # drop-specific (null for connect)
                "drop_id":              None,
                "confession":           None,
                "is_sender":            None,
                "is_revealed":          None,
                "other_revealed":       None,
            })
        except Exception as exc:
            log.warning("messages: skipping malformed connect_chat %s — %s", chat.get("_id"), exc)
            continue

    return items


# ── Drop items ────────────────────────────────────────────────────────────────

async def _drop_items(uid: str, db) -> list[dict]:
    """
    Fetch drop_connections and normalise to inbox shape.
    Same defensive approach — .get() everywhere, per-item try/except.
    """
    connections = await db["drop_connections"].find({
        "$or": [
            {"sender_id":   uid},
            {"unlocker_id": uid},
        ]
    }).sort("last_message_at", -1).to_list(None)

    if not connections:
        return []

    # Batch all last-message lookups
    conn_ids = [str(c["_id"]) for c in connections]
    last_msg_tasks = [
        db["drop_messages"].find_one(
            {"connection_id": cid}, sort=[("created_at", -1)]
        )
        for cid in conn_ids
    ]
    last_msgs = await asyncio.gather(*last_msg_tasks, return_exceptions=True)

    items: list[dict] = []
    for i, conn in enumerate(connections):
        try:
            is_sender  = conn.get("sender_id") == uid
            other_name = (
                conn.get("unlocker_anonymous_name") if is_sender
                else conn.get("sender_anonymous_name")
            )
            other_id   = (
                conn.get("unlocker_id") if is_sender
                else conn.get("sender_id")
            )

            last_msg = last_msgs[i] if not isinstance(last_msgs[i], Exception) else None

            last_content = None
            if last_msg and isinstance(last_msg, dict):
                last_content = (last_msg.get("content") or "")[:80] or None

            confession_text = (conn.get("confession") or "")[:100]

            items.append({
                "id":                   str(conn["_id"]),
                "chat_type":            "drop",
                "other_anonymous_name": other_name or "Anonymous",
                "other_avatar":         None,
                "other_avatar_color":   None,
                "other_user_id":        other_id or "",
                "last_message":         last_content,
                "last_message_at":      _iso(conn.get("last_message_at")),
                "unread_count":         0,   # drop messages don't track read status yet
                # connect-specific defaults
                "is_unlocked":          True,
                "messages_left":        None,
                "reveal_status":        None,
                "reveal_initiator":     None,
                "reveal_unlocked":      None,
                "message_count":        conn.get("message_count", 0),
                # drop-specific
                "drop_id":              conn.get("drop_id"),
                "confession":           confession_text,
                "is_sender":            is_sender,
                "is_revealed":          (
                    conn.get("is_revealed_sender") if is_sender
                    else conn.get("is_revealed_unlocker")
                ),
                "other_revealed":       (
                    conn.get("is_revealed_unlocker") if is_sender
                    else conn.get("is_revealed_sender")
                ),
            })
        except Exception as exc:
            log.warning("messages: skipping malformed drop_connection %s — %s", conn.get("_id"), exc)
            continue

    return items


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/inbox")
async def get_inbox(
    limit: int = Query(50, ge=1, le=100),
    skip:  int = Query(0, ge=0),
    db     = Depends(get_database),
    current_user_id: str = Depends(get_current_user_id),
):
    """
    Unified messaging inbox — merges Connect chats and Drop connections,
    sorted by most-recent message descending.

    Each item has a `chat_type` field: "connect" | "drop".
    Connect items carry full is_unlocked / reveal_status context.
    Drop items carry drop_id / confession context.
    """
    connect, drops = await asyncio.gather(
        _connect_items(current_user_id, db),
        _drop_items(current_user_id, db),
    )

    all_items = connect + drops

    # Sort by last_message_at descending — None sorts to bottom
    def _sort_key(x):
        val = x.get("last_message_at")
        return val if val else ""

    all_items.sort(key=_sort_key, reverse=True)

    total = len(all_items)
    paged = all_items[skip: skip + limit]

    return {
        "items":          paged,
        "total":          total,
        "unread_connect": sum(i["unread_count"] for i in connect),
        "unread_drop":    0,
    }
