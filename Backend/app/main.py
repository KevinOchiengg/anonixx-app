import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings
from app.database import connect_to_mongo, close_mongo_connection
from app.sio import sio
import app.websockets.events  # noqa: F401 — registers all @sio.event handlers
from app.api.v1 import payments
from app.api.v1 import drops, rewards, referrals
from app.api.v1 import admin
from app.api.v1 import publisher
from app.api.v1 import messages
from app.api.v1 import (
    auth,
    coins,
    posts,
    upload,
    users,
    impact,
    connections,
    rituals,
    connect,
    circles,
)
from app.tasks.publisher_worker import publisher_worker


async def _ensure_indexes():
    """Create performance-critical indexes if they don't already exist."""
    from app.database import get_database
    import logging
    log = logging.getLogger(__name__)
    try:
        db = await get_database()
        await db["posts"].create_index([("created_at", -1)],       background=True)
        await db["posts"].create_index([("likes_count", -1)],      background=True)
        await db["saved_posts"].create_index(
            [("user_id", 1), ("post_id", 1)], unique=True, background=True
        )
        await db["poll_votes"].create_index(
            [("post_id", 1), ("user_id", 1)], background=True
        )
        await db["post_threads"].create_index([("post_id", 1)],    background=True)
        await db["threads"].create_index([("post_id", 1)],         background=True)
        await db["connect_messages"].create_index(
            [("chat_id", 1), ("created_at", -1)], background=True
        )
        await db["connect_messages"].create_index(
            [("chat_id", 1), ("sender_id", 1), ("is_read", 1)], background=True
        )
        await db["drop_messages"].create_index(
            [("connection_id", 1), ("created_at", -1)], background=True
        )
        await db["publisher_queue"].create_index(
            [("status", 1), ("submitted_at", 1)], background=True
        )
        log.info("MongoDB indexes verified.")
    except Exception as exc:
        log.warning("Index creation skipped: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    await _ensure_indexes()
    await publisher_worker.start()   # start social publishing worker
    yield
    await publisher_worker.stop()    # clean shutdown
    await close_mongo_connection()


app = FastAPI(
    title=settings.APP_NAME,
    version="2.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "app": settings.APP_NAME}


@app.get("/")
async def root():
    return {
        "message": "Welcome to Anonixx — a space that heals, not hurts.",
        "docs": "/docs",
    }


app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(coins.router, prefix=settings.API_V1_PREFIX)
app.include_router(posts.router, prefix=settings.API_V1_PREFIX)
app.include_router(upload.router, prefix=settings.API_V1_PREFIX)
app.include_router(users.router, prefix=settings.API_V1_PREFIX)
app.include_router(impact.router, prefix=settings.API_V1_PREFIX)
app.include_router(connections.router, prefix=settings.API_V1_PREFIX)
app.include_router(rituals.router, prefix=settings.API_V1_PREFIX)
app.include_router(connect.router, prefix=settings.API_V1_PREFIX)
app.include_router(payments.router, prefix=settings.API_V1_PREFIX)
app.include_router(drops.router, prefix=settings.API_V1_PREFIX)
app.include_router(rewards.router, prefix=settings.API_V1_PREFIX)
app.include_router(referrals.router, prefix=settings.API_V1_PREFIX)
app.include_router(circles.router,    prefix=settings.API_V1_PREFIX)
app.include_router(admin.router,      prefix=settings.API_V1_PREFIX)
app.include_router(publisher.router,  prefix=settings.API_V1_PREFIX)
app.include_router(messages.router,   prefix=settings.API_V1_PREFIX)

# Wrap FastAPI with Socket.IO ASGI app.
# Run with: uvicorn app.main:socket_app --reload
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
