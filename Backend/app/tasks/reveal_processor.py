"""
app/utils/reveal_processor.py
Cron job — checks cooling periods and notifies recipients.
Run every hour via APScheduler or external cron.
"""

from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os

from app.utils.notifications import send_push_notification


async def process_pending_reveals():
    """
    Finds reveals past their cooling period and notifies recipients.
    Run every hour.
    """
    client = AsyncIOMotorClient(os.getenv("MONGODB_URI"))
    db = client[os.getenv("MONGODB_DB")]

    try:
        reveals = await db.identity_reveals.find(
            {
                "status": "cooling",
                "cooling_ends_at": {"$lte": datetime.now(timezone.utc)},
            }
        ).to_list(length=None)

        for reveal in reveals:
            # Update to pending_consent
            await db.identity_reveals.update_one(
                {"_id": reveal["_id"]}, {"$set": {"status": "pending_consent"}}
            )

            # Notify recipient
            recipient_id = reveal.get("other_user_id")
            if recipient_id:
                await send_push_notification(
                    user_id=str(recipient_id),
                    template_key="reveal_request",
                    db=db,
                    extra_data={"reveal_id": str(reveal["_id"])},
                )

            print(f"✅ Reveal {reveal['_id']} ready for consent — recipient notified")

    except Exception as e:
        print(f"❌ Reveal processor error: {e}")
    finally:
        client.close()
