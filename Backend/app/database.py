from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import settings
from typing import Optional


class Database:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None


db = Database()


async def connect_to_mongo():
    db.client = AsyncIOMotorClient(settings.MONGODB_URL)
    db.db = db.client[settings.DATABASE_NAME]
    try:
        await db.client.admin.command("ping")
    except Exception:
        pass


async def close_mongo_connection():
    if db.client:
        db.client.close()


async def get_database() -> AsyncIOMotorDatabase:
    if db.db is None:
        raise RuntimeError("Database not initialised. Did connect_to_mongo() run?")
    return db.db
