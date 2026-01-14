from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from typing import Optional, List
from datetime import datetime


class GroupRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["groups"]

    async def create(self, group_data: dict) -> dict:
        """Create new group"""
        result = await self.collection.insert_one(group_data)
        group_data["_id"] = result.inserted_id
        return group_data

    async def find_by_id(self, group_id: str) -> Optional[dict]:
        """Find group by ID"""
        return await self.collection.find_one({"_id": ObjectId(group_id)})

    async def get_all(self, limit: int = 50, category: Optional[str] = None) -> List[dict]:
        """Get all groups"""
        query = {"is_public": True}
        if category:
            query["category"] = category

        return await self.collection.find(query)\
            .sort("member_count", -1)\
            .limit(limit)\
            .to_list(length=limit)

    async def get_user_groups(self, user_id: str) -> List[dict]:
        """Get groups user is member of"""
        return await self.collection.find({
            "members": user_id
        }).to_list(length=100)

    async def add_member(self, group_id: str, user_id: str) -> bool:
        """Add member to group"""
        result = await self.collection.update_one(
            {"_id": ObjectId(group_id)},
            {
                "$addToSet": {"members": user_id},
                "$inc": {"member_count": 1}
            }
        )
        return result.modified_count > 0

    async def remove_member(self, group_id: str, user_id: str) -> bool:
        """Remove member from group"""
        result = await self.collection.update_one(
            {"_id": ObjectId(group_id)},
            {
                "$pull": {"members": user_id},
                "$inc": {"member_count": -1}
            }
        )
        return result.modified_count > 0

    async def is_member(self, group_id: str, user_id: str) -> bool:
        """Check if user is group member"""
        group = await self.collection.find_one({
            "_id": ObjectId(group_id),
            "members": user_id
        })
        return group is not None

    async def update(self, group_id: str, update_data: dict) -> bool:
        """Update group"""
        update_data["updated_at"] = datetime.utcnow()
        result = await self.collection.update_one(
            {"_id": ObjectId(group_id)},
            {"$set": update_data}
        )
        return result.modified_count > 0

    async def add_moderator(self, group_id: str, user_id: str) -> bool:
        """Add moderator"""
        result = await self.collection.update_one(
            {"_id": ObjectId(group_id)},
            {"$addToSet": {"moderators": user_id}}
        )
        return result.modified_count > 0