from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
import os

async def process_pending_reveals():
    """
    Cron job to check cooling periods and notify recipients
    Run every hour
    """
    client = AsyncIOMotorClient(os.getenv("MONGODB_URI"))
    db = client[os.getenv("MONGODB_DB")]
    
    # Find reveals past cooling period
    reveals = await db.identity_reveals.find({
        "status": "cooling",
        "cooling_ends_at": {"$lte": datetime.utcnow()}
    }).to_list(length=None)
    
    for reveal in reveals:
        # Update to pending_consent
        await db.identity_reveals.update_one(
            {"_id": reveal["_id"]},
            {"$set": {"status": "pending_consent"}}
        )
        
        # TODO: Send push notification to recipient
        print(f"✅ Reveal {reveal['_id']} ready for consent")
    
    client.close()


# You can set this up with APScheduler or run as a separate cron job