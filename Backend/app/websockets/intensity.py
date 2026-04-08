"""
intensity.py

Chat intensity engine for Anonixx.

Scores each chat 0–100 based on five real behavioral signals:
  1. Message frequency  (0–25 pts) — how often they talk
  2. Reply speed        (0–25 pts) — how fast they respond
  3. Reciprocity        (0–20 pts) — balanced vs one-sided conversation
  4. Depth              (0–20 pts) — total message volume
  5. Recency            (0–10 pts) — active in the last hour

The score is persisted in connect_chats.intensity_score and emitted
to both participants via Socket.IO as `intensity_update`.
"""

import asyncio
from datetime import datetime, timezone
from bson import ObjectId
from app.sio import sio


# ─── Public API ───────────────────────────────────────────────────────────────

async def calculate_and_emit(db, chat_id: str, participant_ids: list[str]) -> float:
    """
    Recalculate intensity for *chat_id*, persist it, and push to both users.

    Designed to be fire-and-forget from API routes:
        asyncio.create_task(calculate_and_emit(db, chat_id, [u1, u2]))
    """
    score = await _calculate(db, chat_id)

    await db["connect_chats"].update_one(
        {"_id": ObjectId(chat_id)},
        {"$set": {"intensity_score": round(score, 2)}},
    )

    payload = {"chatId": chat_id, "score": round(score, 2)}
    for uid in participant_ids:
        await sio.emit("intensity_update", payload, room=f"user_{uid}")

    return score


# ─── Scoring logic ────────────────────────────────────────────────────────────

async def _calculate(db, chat_id: str) -> float:
    messages = await (
        db["connect_messages"]
        .find({"chat_id": chat_id}, sort=[("created_at", -1)])
        .limit(100)
        .to_list(100)
    )

    if not messages:
        return 0.0

    now  = datetime.now(timezone.utc)
    score = 0.0

    # ── 1. Frequency — messages in last 24 h (0–25 pts) ──────────────────────
    last_24h = [
        m for m in messages
        if _age_seconds(m["created_at"], now) < 86_400
    ]
    score += min(len(last_24h) / 40.0, 1.0) * 25.0

    # ── 2. Reply speed — avg gap inside sessions (0–25 pts) ──────────────────
    if len(messages) >= 2:
        gaps = []
        for i in range(len(messages) - 1):
            gap = abs((_ts(messages[i]) - _ts(messages[i + 1])).total_seconds())
            if gap < 3_600:           # ignore gaps > 1 h (different sessions)
                gaps.append(gap)
        if gaps:
            avg = sum(gaps) / len(gaps)
            # <30 s → 25 pts │ >30 min → 0 pts
            score += max(0.0, 1.0 - avg / 1_800.0) * 25.0

    # ── 3. Reciprocity — balance of both sides talking (0–20 pts) ────────────
    senders = [m["sender_id"] for m in messages]
    unique  = set(senders)
    if len(unique) >= 2:
        counts  = {s: senders.count(s) for s in unique}
        balance = min(counts.values()) / max(counts.values())   # 0–1
        score  += balance * 20.0

    # ── 4. Depth — total message volume (0–20 pts) ───────────────────────────
    score += min(len(messages) / 80.0, 1.0) * 20.0

    # ── 5. Recency — messages in last hour (0–10 pts) ────────────────────────
    last_1h = [m for m in messages if _age_seconds(m["created_at"], now) < 3_600]
    score  += min(len(last_1h) / 10.0, 1.0) * 10.0

    return min(score, 100.0)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _ts(message) -> datetime:
    """Return timezone-aware datetime from a message document."""
    dt = message["created_at"]
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _age_seconds(created_at: datetime, now: datetime) -> float:
    dt = created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
    return (now - dt).total_seconds()
