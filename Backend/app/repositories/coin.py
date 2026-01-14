from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from typing import Optional, List
from datetime import datetime


class CoinTransactionRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["coin_transactions"]

    async def create(self, transaction_data: dict) -> dict:
        """Create coin transaction"""
        result = await self.collection.insert_one(transaction_data)
        transaction_data["_id"] = result.inserted_id
        return transaction_data

    async def find_by_transaction_id(self, transaction_id: str) -> Optional[dict]:
        """Find by transaction ID"""
        return await self.collection.find_one({"transaction_id": transaction_id})

    async def find_by_reference_id(self, reference_id: str) -> Optional[dict]:
        """Find by payment reference ID (for idempotency)"""
        return await self.collection.find_one({"reference_id": reference_id})

    async def get_user_transactions(self, user_id: str, limit: int = 50) -> List[dict]:
        """Get user's transaction history"""
        return await self.collection.find({
            "user_id": user_id
        }).sort("created_at", -1).limit(limit).to_list(length=limit)

    async def update_status(self, transaction_id: str, status: str) -> bool:
        """Update transaction status"""
        result = await self.collection.update_one(
            {"transaction_id": transaction_id},
            {"$set": {"status": status, "updated_at": datetime.utcnow()}}
        )
        return result.modified_count > 0

    async def get_pending_transactions(self, user_id: str) -> List[dict]:
        """Get pending transactions for user"""
        return await self.collection.find({
            "user_id": user_id,
            "status": "pending"
        }).to_list(length=100)

    async def get_total_earned(self, user_id: str) -> int:
        """Calculate total coins earned"""
        pipeline = [
            {"$match": {
                "user_id": user_id,
                "transaction_type": {"$in": ["purchase", "earn"]},
                "status": "success"
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        result = await self.collection.aggregate(pipeline).to_list(length=1)
        return result[0]["total"] if result else 0

    async def get_total_spent(self, user_id: str) -> int:
        """Calculate total coins spent"""
        pipeline = [
            {"$match": {
                "user_id": user_id,
                "transaction_type": "spend",
                "status": "success"
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        result = await self.collection.aggregate(pipeline).to_list(length=1)
        return result[0]["total"] if result else 0