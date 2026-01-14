from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from typing import Optional
from app.database import get_users_collection


class UserRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["users"]

    async def create(self, user_data: dict) -> dict:
        """Create new user"""
        result = await self.collection.insert_one(user_data)
        user_data["_id"] = result.inserted_id
        return user_data

    async def find_by_id(self, user_id: str) -> Optional[dict]:
        """Find user by ID"""
        return await self.collection.find_one({"_id": ObjectId(user_id)})

    async def find_by_email(self, email: str) -> Optional[dict]:
        """Find user by email"""
        return await self.collection.find_one({"email": email})

    async def find_by_phone(self, phone: str) -> Optional[dict]:
        """Find user by phone"""
        return await self.collection.find_one({"phone": phone})

    async def find_by_username(self, username: str) -> Optional[dict]:
        """Find user by username"""
        return await self.collection.find_one({"username": username})

    async def update(self, user_id: str, update_data: dict) -> bool:
        """Update user"""
        from datetime import datetime
        update_data["updated_at"] = datetime.utcnow()
        result = await self.collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_data}
        )
        return result.modified_count > 0

    async def update_coin_balance(self, user_i async def update_coin_balance(self, user_id: str, amount: int) -> bool:
        """Update coin balance atomically"""
        result = await self.collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$inc": {"coin_balance": amount}}
        )
        return result.modified_count > 0

    async def get_coin_balance(self, user_id: str) -> Optional[int]:
        """Get user's coin balance"""
        user = await self.find_by_id(user_id)
        return user.get("coin_balance") if user else None

    async def update_last_login(self, user_id: str):
        """Update last login timestamp"""
        from datetime import datetime
        await self.collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"last_login": datetime.utcnow()}}
        )

    async def shadowban_user(self, user_id: str, is_banned: bool):
        """Shadowban or unshadowban user"""
        await self.collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"is_shadowbanned": is_banned}}
        )