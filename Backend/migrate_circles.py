"""
migrate_circles.py
Run once to create collections + indexes for Circles feature.

Usage:
  cd backend
  python migrate_circles.py
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME", "anonispill")


async def run():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]

    # circles
    await db.circles.create_index("creator_id")
    await db.circles.create_index("category")
    await db.circles.create_index("is_active")
    await db.circles.create_index([("is_live", -1), ("member_count", -1)])
    print("✓ circles")

    # circle_members
    await db.circle_members.create_index(
        [("circle_id", 1), ("user_id", 1)], unique=True
    )
    await db.circle_members.create_index("user_id")
    print("✓ circle_members")

    # circle_events
    await db.circle_events.create_index("circle_id")
    await db.circle_events.create_index("status")
    await db.circle_events.create_index([("circle_id", 1), ("scheduled_at", 1)])
    print("✓ circle_events")

    # circle_event_payments
    await db.circle_event_payments.create_index(
        "checkout_request_id", unique=True, sparse=True
    )
    await db.circle_event_payments.create_index([("event_id", 1), ("user_id", 1)])
    await db.circle_event_payments.create_index("status")
    print("✓ circle_event_payments")

    # circle_gifts
    await db.circle_gifts.create_index("event_id")
    await db.circle_gifts.create_index("circle_id")
    print("✓ circle_gifts")

    # circle_payouts
    await db.circle_payouts.create_index(
        [("circle_id", 1), ("creator_id", 1), ("status", 1)]
    )
    print("✓ circle_payouts")

    # circle_hand_raises
    await db.circle_hand_raises.create_index([("circle_id", 1), ("user_id", 1)])
    await db.circle_hand_raises.create_index("status")
    print("✓ circle_hand_raises")

    # circle_kicks
    await db.circle_kicks.create_index([("circle_id", 1), ("user_id", 1)], unique=True)
    print("✓ circle_kicks")

    # circle_hot_seats
    await db.circle_hot_seats.create_index([("event_id", 1), ("user_id", 1)])
    await db.circle_hot_seats.create_index("status")
    print("✓ circle_hot_seats")

    print("\nAll Circles collections and indexes created.")
    client.close()


if __name__ == "__main__":
    asyncio.run(run())
