"""
Anonixx Database Migration Script
==================================
Run this ONCE to:
1. Patch existing users with TRACE system fields
2. Create indexes for all new TRACE collections
3. Fix confession (post) timestamps to always use MongoDB server time
4. Backfill any posts missing created_at

Usage:
    python migrate.py

Requirements:
    pip install motor python-dotenv
"""

import asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DATABASE_NAME", "anonispill")


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def now():
    return datetime.now(timezone.utc)

def log(msg: str):
    print(f"[{now().strftime('%H:%M:%S')}] {msg}")


# ─────────────────────────────────────────────
# MIGRATION 1: Patch existing users
# ─────────────────────────────────────────────

async def migrate_users(db):
    log("👤 Migrating users — adding TRACE fields...")

    result = await db.users.update_many(
        {
            # Only update users missing these fields
            "daily_traces_remaining": {"$exists": False}
        },
        {
            "$set": {
                "avatar_aura": "purple_glow",
                "daily_traces_remaining": 5,
                "last_trace_reset": now(),
                "city": None,
                "age_range": None,
                "vibe": None
            }
        }
    )

    log(f"   ✅ {result.modified_count} users updated")


# ─────────────────────────────────────────────
# MIGRATION 2: Create indexes for TRACE collections
# ─────────────────────────────────────────────

async def create_indexes(db):
    log("📑 Creating indexes...")

    # broadcasts
    await db.broadcasts.create_index("user_id")
    await db.broadcasts.create_index("is_active")
    await db.broadcasts.create_index("expires_at")
    await db.broadcasts.create_index([("click_count", -1)])  # hot traces sort
    await db.broadcasts.create_index([("created_at", -1)])
    log("   ✅ broadcasts indexes")

    # connections
    await db.connections.create_index("broadcast_user_id")
    await db.connections.create_index("opener_user_id")
    await db.connections.create_index("broadcast_id")
    await db.connections.create_index("status")
    await db.connections.create_index("expires_at")
    log("   ✅ connections indexes")

    # connection_messages
    await db.connection_messages.create_index("connection_id")
    await db.connection_messages.create_index("sender_id")
    await db.connection_messages.create_index([("created_at", 1)])
    log("   ✅ connection_messages indexes")

    # reveals
    await db.reveals.create_index("connection_id")
    await db.reveals.create_index("initiator_id")
    await db.reveals.create_index("status")
    await db.reveals.create_index("expires_at")
    log("   ✅ reveals indexes")

    # blocks
    await db.blocks.create_index("blocker_id")
    await db.blocks.create_index("blocked_id")
    await db.blocks.create_index([("blocker_id", 1), ("blocked_id", 1)], unique=True)
    log("   ✅ blocks indexes")


# ─────────────────────────────────────────────
# MIGRATION 3: Fix confession timestamps
#
# Problem: client-side time was being stored,
# causing timezone mismatches and wrong display.
# Fix: ensure all posts have created_at as proper
# UTC datetime from MongoDB, and add server-side
# index so new inserts are always UTC.
# ─────────────────────────────────────────────

async def fix_confession_timestamps(db):
    log("🕐 Fixing confession (post) timestamps...")

    # 1. Backfill posts with no created_at
    missing = await db.posts.count_documents({"created_at": {"$exists": False}})
    if missing > 0:
        result = await db.posts.update_many(
            {"created_at": {"$exists": False}},
            {"$set": {"created_at": now()}}
        )
        log(f"   ✅ Backfilled {result.modified_count} posts missing created_at")
    else:
        log("   ✅ All posts already have created_at")

    # 2. Convert any string timestamps to proper datetime objects
    #    (happens when client sends ISO string instead of letting Mongo handle it)
    string_timestamps = db.posts.find({"created_at": {"$type": "string"}})
    converted = 0
    async for post in string_timestamps:
        try:
            parsed = datetime.fromisoformat(post["created_at"].replace("Z", "+00:00"))
            await db.posts.update_one(
                {"_id": post["_id"]},
                {"$set": {"created_at": parsed}}
            )
            converted += 1
        except Exception:
            # Fallback: set to now if unparseable
            await db.posts.update_one(
                {"_id": post["_id"]},
                {"$set": {"created_at": now()}}
            )
            converted += 1

    if converted > 0:
        log(f"   ✅ Converted {converted} string timestamps to datetime")
    else:
        log("   ✅ No string timestamps found")

    # 3. Create index on posts.created_at for fast sorting (newest first)
    await db.posts.create_index([("created_at", -1)])
    log("   ✅ posts.created_at index created")

    log("")
    log("   📝 FRONTEND NOTE:")
    log("   In your post creation endpoint (posts.py), make sure you're")
    log("   setting created_at server-side, NOT accepting it from the client:")
    log("")
    log('      # ✅ Correct — server sets the time')
    log('      post_doc = { ...post_data, "created_at": datetime.now(timezone.utc) }')
    log("")
    log('      # ❌ Wrong — never trust client time')
    log('      post_doc = { ...post_data, "created_at": post_data.created_at }')
    log("")


# ─────────────────────────────────────────────
# VERIFICATION
# ─────────────────────────────────────────────

async def verify(db):
    log("🔍 Verifying migration...")

    user_count = await db.users.count_documents({})
    patched = await db.users.count_documents({"daily_traces_remaining": {"$exists": True}})
    posts_with_ts = await db.posts.count_documents({"created_at": {"$exists": True}})
    posts_total = await db.posts.count_documents({})

    log(f"   Users total:          {user_count}")
    log(f"   Users with TRACE:     {patched}/{user_count}")
    log(f"   Posts with timestamp: {posts_with_ts}/{posts_total}")

    if patched < user_count:
        log(f"   ⚠️  WARNING: {user_count - patched} users still missing TRACE fields")
    else:
        log("   ✅ All users patched successfully")

    if posts_with_ts < posts_total:
        log(f"   ⚠️  WARNING: {posts_total - posts_with_ts} posts still missing timestamps")
    else:
        log("   ✅ All posts have valid timestamps")


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

async def main():
    log("=" * 50)
    log("🚀 Anonixx Migration Starting")
    log("=" * 50)

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    try:
        # Ping to confirm connection
        await client.admin.command("ping")
        log(f"✅ Connected to MongoDB — database: '{DB_NAME}'")
        log("")

        await migrate_users(db)
        log("")
        await create_indexes(db)
        log("")
        await fix_confession_timestamps(db)
        log("")
        await verify(db)

        log("")
        log("=" * 50)
        log("🎉 Migration complete!")
        log("=" * 50)

    except Exception as e:
        log(f"❌ Migration failed: {e}")
        raise

    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
