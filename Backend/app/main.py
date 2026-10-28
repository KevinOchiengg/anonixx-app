import logging
import socketio
from bson import ObjectId
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from contextlib import asynccontextmanager
from app.config import settings
from app.database import connect_to_mongo, close_mongo_connection
from app.sio import sio
import app.websockets.events  # noqa: F401 — registers all @sio.event handlers
from app.api.v1 import geo_pricing, market
from app.api.v1 import drops, rewards, referrals, guided
from app.api.v1 import admin
from app.api.v1 import publisher
from app.api.v1 import chat_profile
from app.api.v1 import ads
from app.api.v1 import sounds
from app.api.v1 import drop_calls
from app.api.v1 import unlock_requests
from app.api.v1 import deception_reports
from app.api.v1 import support
from app.api.v1 import whatsapp
from app.api.v1 import public
from app.api.v1 import notifications
from app.api.v1 import visits
from app.api.v1 import admin_insights, agent_hub, discover
from app.tasks import admin_monitor
from app.api.v1 import (
    auth,
    coins,
    upload,
    users,
    impact,
    rituals,
    connect,
    premium,
)
from app.tasks.publisher_worker import publisher_worker
from app.tasks.drop_cleanup import drop_cleanup_worker
from app.tasks import scheduled_publisher
from app.utils import geoip


async def _ensure_indexes():
    """Create performance-critical indexes if they don't already exist."""
    from app.database import get_database
    import logging
    log = logging.getLogger(__name__)
    try:
        db = await get_database()
        await db["drops"].create_index([("created_at", -1)],       background=True)
        await db["drops"].create_index([("likes_count", -1)],      background=True)
        await db["saved_drops"].create_index(
            [("user_id", 1), ("drop_id", 1)], unique=True, background=True
        )
        await db["drop_threads"].create_index([("drop_id", 1)],    background=True)
        await db["drop_views"].create_index(
            [("drop_id", 1), ("user_id", 1)], unique=True, background=True
        )
        # One user's views/reactions/likes, for the admin Taste panel.
        await db["drop_views"].create_index([("user_id", 1), ("viewed_at", -1)], background=True)
        await db["drop_views"].create_index([("viewed_at", -1)], background=True)
        await db["drop_reactions"].create_index([("reactor_id", 1), ("updated_at", -1)], background=True)
        await db["drops"].create_index([("liked_by", 1)], background=True)
        await db["drop_messages"].create_index(
            [("connection_id", 1), ("created_at", -1)], background=True
        )
        await db["publisher_queue"].create_index(
            [("status", 1), ("submitted_at", 1)], background=True
        )
        await db["deception_reports"].create_index(
            [("connection_id", 1), ("reporter_id", 1)], unique=True, background=True
        )
        await db["deception_reports"].create_index(
            [("status", 1), ("created_at", -1)], background=True
        )
        await db["market_items"].create_index(
            [("status", 1), ("published_at", -1)], background=True
        )
        await db["market_unlocks"].create_index(
            [("user_id", 1), ("item_id", 1)], unique=True, background=True
        )
        await db["coin_purchases"].create_index(
            [("iap_transaction_id", 1)],
            unique=True,
            partialFilterExpression={"iap_transaction_id": {"$exists": True}},
            background=True,
        )
        await db["drop_unlock_requests"].create_index(
            [("target_type", 1), ("target_id", 1), ("requester_id", 1)],
            unique=True,
            partialFilterExpression={"status": "pending"},
            background=True,
        )
        await db["drop_unlock_requests"].create_index(
            [("owner_id", 1), ("status", 1), ("created_at", 1)], background=True
        )
        await db["drop_unlock_requests"].create_index(
            [("target_type", 1), ("target_id", 1), ("status", 1)], background=True
        )
        await db["signup_fingerprints"].create_index([("device_hash", 1), ("created_at", 1)], background=True)
        await db["signup_fingerprints"].create_index([("ip_hash", 1), ("created_at", 1)], background=True)
        # Auto-expire after 90 days — matches auth.py's DEVICE_LOOKBACK_DAYS,
        # the longest window anything here is ever queried against.
        await db["signup_fingerprints"].create_index(
            [("created_at", 1)], expireAfterSeconds=90 * 24 * 3600, background=True
        )
        await visits.ensure_indexes(db)
        await db["user_activity_days"].create_index([("user_id", 1), ("day", 1)], background=True)
        await db["user_activity_days"].create_index([("day", 1)], background=True)
        await db["admin_audit"].create_index([("created_at", -1)], background=True)
        await db["admin_audit"].create_index([("target_id", 1), ("created_at", -1)], background=True)
        await db["admin_alerts"].create_index([("type", 1), ("created_at", -1)], background=True)
        await db["signup_fingerprints"].create_index([("user_id", 1)], background=True)
        await db["drops"].create_index([("moderation_status", 1), ("risk_score", -1)], background=True)
        # Discover: Near (fresh Link Ups by place) and Stories (by kind, newest first).
        await db["drops"].create_index([("kind", 1), ("live_until", 1), ("created_at", -1)], background=True)
        await db["drops"].create_index(
            [("location_detail.country", 1), ("location_detail.county", 1), ("kind", 1), ("created_at", -1)], background=True,
        )
        await db["drops"].create_index([("sender_id", 1), ("created_at", -1)], background=True)
        await db["drops"].create_index([("topics", 1), ("created_at", -1)], background=True)
        await db["drop_unlock_requests"].create_index([("owner_id", 1), ("created_at", -1)], background=True)
        await db["discover_impressions"].create_index([("at", 1)], expireAfterSeconds=35 * 86400, background=True)
        await db["discover_impressions"].create_index([("day", 1)], background=True)
        await db["discover_stats"].create_index([("at", 1)], expireAfterSeconds=180 * 86400, background=True)
        await db["users"].create_index([("blocked_user_ids", 1)], background=True)
        # One account per email (checked live: no duplicates existed when this was added).
        try:
            await db["users"].create_index([("email", 1)], unique=True, background=True)
        except Exception as exc:   # e.g. duplicates appeared: report, don't skip the rest
            print(f"⚠️ users.email unique index not created: {exc}")
        await db["chat_profiles"].create_index([("listing", 1), ("updated_at", -1)], background=True)
        log.info("MongoDB indexes verified.")
    except Exception as exc:
        log.warning("Index creation skipped: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    await _ensure_indexes()
    await publisher_worker.start()          # start social publishing worker
    await drop_cleanup_worker.start()       # delete drops past their post-unlock grace
    await scheduled_publisher.start()       # publish admin drops scheduled for later
    await admin_monitor.start()             # alerts, morning digest, risk scores for flagged posts
    geoip.start_loading()                   # local IP->country database for payment pricing (background)
    yield
    await scheduled_publisher.stop()
    await admin_monitor.stop()
    await drop_cleanup_worker.stop()        # clean shutdown
    await publisher_worker.stop()
    await close_mongo_connection()


# Search text never reaches the server logs: the access log keeps the path of
# Discover and search requests but drops their query strings (q=, places, filters).
_PRIVATE_QUERY_PATHS = ("/discover/", "/drops/search")


class _RedactSearchQueries(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str) and "?" in args[2]                 and any(p in args[2] for p in _PRIVATE_QUERY_PATHS):
            record.args = args[:2] + (args[2].split("?", 1)[0] + "?[redacted]",) + args[3:]
        return True


logging.getLogger("uvicorn.access").addFilter(_RedactSearchQueries())

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
    # the browser's tus uploader reads these from POST /upload/stream/tus
    expose_headers=["Location", "X-Stream-Uid", "Tus-Resumable"],
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


PLAY_STORE_URL = f"https://play.google.com/store/apps/details?id={settings.GOOGLE_PLAY_PACKAGE_NAME}"
APP_STORE_URL  = "https://apps.apple.com/app/anonixx"


@app.get("/drop/{drop_id}", response_class=HTMLResponse)
async def drop_landing(drop_id: str):
    """
    Public https landing page for a single drop — the link embedded in
    social captions (Facebook, etc). Opens the app via the anonixx:// deep
    link if installed, otherwise falls back to the store listing. Carries
    only a teased snippet + the teaser card image for the link preview,
    never the full confession — matches the same privacy stance as the
    social teaser cards themselves.
    """
    import html as _html
    from app.database import get_database
    from app.services.card_generator import _tease

    title, teaser, image = "Anonixx", "someone dropped a confession — see it in the app.", None
    try:
        db = await get_database()
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
        if drop and drop.get("moderation_status") == "visible" and drop.get("sensitivity") != "mature":
            title  = "Someone confessed something on Anonixx"
            teaser = _tease(drop.get("confession") or "") or teaser
            image  = drop.get("card_image_url")
    except Exception:
        pass  # invalid id or db hiccup — fall through to the generic landing page

    # Escape before interpolating into the page — confession text is
    # arbitrary user input and this route is public.
    title  = _html.escape(title)
    teaser = _html.escape(teaser)
    image  = _html.escape(image) if image else None

    scheme_url = f"anonixx://drop/{_html.escape(drop_id)}"
    image_tag  = f'<meta property="og:image" content="{image}">' if image else ""

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>{title}</title>
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{teaser}">
  {image_tag}
  <script>
    setTimeout(function () {{ window.location.href = "{scheme_url}"; }}, 50);
  </script>
  <style>
    body {{ background:#0a0308; color:#f6e6ec; font-family:-apple-system,sans-serif;
            display:flex; flex-direction:column; align-items:center; justify-content:center;
            min-height:100vh; margin:0; text-align:center; padding:24px; }}
    p {{ opacity:.75; max-width:320px; }}
    a {{ display:block; margin-top:16px; padding:14px 28px; border-radius:999px;
         background:#e11d48; color:#fff; text-decoration:none; font-weight:600; }}
  </style>
</head>
<body>
  <h2>{title}</h2>
  <p>{teaser}</p>
  <a href="{scheme_url}">Open in Anonixx</a>
  <a href="{PLAY_STORE_URL}" style="background:transparent;border:1px solid #444;">Get it on Google Play</a>
  <a href="{APP_STORE_URL}" style="background:transparent;border:1px solid #444;">Get it on the App Store</a>
</body>
</html>"""
    return HTMLResponse(html)


app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(coins.router, prefix=settings.API_V1_PREFIX)
app.include_router(premium.router, prefix=settings.API_V1_PREFIX)
app.include_router(upload.router, prefix=settings.API_V1_PREFIX)
app.include_router(users.router, prefix=settings.API_V1_PREFIX)
app.include_router(impact.router, prefix=settings.API_V1_PREFIX)
app.include_router(rituals.router, prefix=settings.API_V1_PREFIX)
app.include_router(connect.router, prefix=settings.API_V1_PREFIX)
app.include_router(geo_pricing.router,   prefix=settings.API_V1_PREFIX)
app.include_router(market.router,        prefix=settings.API_V1_PREFIX)
app.include_router(drops.router, prefix=settings.API_V1_PREFIX)
app.include_router(guided.router, prefix=settings.API_V1_PREFIX)
app.include_router(rewards.router, prefix=settings.API_V1_PREFIX)
app.include_router(referrals.router, prefix=settings.API_V1_PREFIX)
app.include_router(admin.router,      prefix=settings.API_V1_PREFIX)
app.include_router(publisher.router,  prefix=settings.API_V1_PREFIX)
app.include_router(chat_profile.router, prefix=settings.API_V1_PREFIX)
app.include_router(ads.router,          prefix=settings.API_V1_PREFIX)
app.include_router(sounds.router,       prefix=settings.API_V1_PREFIX)
app.include_router(drop_calls.router,   prefix=settings.API_V1_PREFIX)
app.include_router(unlock_requests.router, prefix=settings.API_V1_PREFIX)
app.include_router(deception_reports.router, prefix=settings.API_V1_PREFIX)
app.include_router(support.router, prefix=settings.API_V1_PREFIX)
app.include_router(whatsapp.router, prefix=settings.API_V1_PREFIX)
app.include_router(public.router, prefix=settings.API_V1_PREFIX)
app.include_router(notifications.router, prefix=settings.API_V1_PREFIX)
app.include_router(visits.router, prefix=settings.API_V1_PREFIX)
app.include_router(admin_insights.router, prefix=settings.API_V1_PREFIX)
app.include_router(agent_hub.router, prefix=settings.API_V1_PREFIX)
app.include_router(discover.router, prefix=settings.API_V1_PREFIX)

# Wrap FastAPI with Socket.IO ASGI app.
# Run with: uvicorn app.main:socket_app --reload
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
