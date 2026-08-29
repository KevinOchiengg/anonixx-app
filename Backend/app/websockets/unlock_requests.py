"""
unlock_requests.py

Real-time events for the confession unlock request/approval flow —
mirrors activity.py's per-user room emit pattern.

Events emitted:
  unlock_request_received   → owner learns someone wants to unlock their confession
  unlock_request_accepted   → requester learns the owner accepted (waiting screen -> chat)
  unlock_request_declined   → requester learns the owner declined
  unlock_request_cancelled  → owner learns the requester withdrew
"""

from app.sio import sio


async def emit_unlock_request_received(owner_id: str, payload: dict):
    await sio.emit("unlock_request_received", payload, room=f"user_{owner_id}")


async def emit_unlock_request_accepted(requester_id: str, payload: dict):
    await sio.emit("unlock_request_accepted", payload, room=f"user_{requester_id}")


async def emit_unlock_request_declined(requester_id: str, payload: dict):
    await sio.emit("unlock_request_declined", payload, room=f"user_{requester_id}")


async def emit_unlock_request_cancelled(owner_id: str, payload: dict):
    await sio.emit("unlock_request_cancelled", payload, room=f"user_{owner_id}")
