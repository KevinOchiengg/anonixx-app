"""Real-time knock events: unlock_request_received, _accepted, _declined, _cancelled."""

from app.sio import sio


async def emit_unlock_request_received(owner_id: str, payload: dict):
    await sio.emit("unlock_request_received", payload, room=f"user_{owner_id}")


async def emit_unlock_request_accepted(requester_id: str, payload: dict):
    await sio.emit("unlock_request_accepted", payload, room=f"user_{requester_id}")


async def emit_unlock_request_declined(requester_id: str, payload: dict):
    await sio.emit("unlock_request_declined", payload, room=f"user_{requester_id}")


async def emit_unlock_request_cancelled(owner_id: str, payload: dict):
    await sio.emit("unlock_request_cancelled", payload, room=f"user_{owner_id}")
