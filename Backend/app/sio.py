import socketio

# Single AsyncServer instance shared across the whole app.
# Mounted on main.py as an ASGI app wrapping FastAPI.
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)
