from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from typing import Optional, List, Tuple
from datetime import datetime


class PostRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["posts"]

    async def create(self, post_data: dict) -> dict:
        """Create new post"""
        result = await self.collection.insert_one(post_data)
        post_data["_id"] = result.inserted_id
        return post_data

    async def find_by_id(self, post_id: str) -> Optional[dict]:
        """Find post by ID"""
        return await self.collection.find_one({
            "_id": ObjectId(post_id),
            "is_deleted": False
        })

    async def get_feed(self, limit: int, cursor: Optional[str] = None) -> Tuple[List[dict], Optional[str]]:
        """Get global feed with cursor pagination"""
        query = {"is_deleted": False, "group_id": None}
        
        if cursor:
            query["_id"] = {"$lt": ObjectId(cursor)}

        posts = await self.collection.find(query)\
            .sort("_id", -1)\
            .limit(limit + 1)\
            .to_list(length=limit + 1)

        has_more = len(posts) > limit
        if has_more:
            posts = posts[:limit]

        next_cursor = str(posts[-1]["_id"]) if has_more and posts else None
        return posts, next_cursor

    async def get_group_feed(self, group_id: str, limit: int, cursor: Optional[str] = None) -> Tuple[List[dict], Optional[str]]:
        """Get group-specific feed"""
        query = {"is_deleted": False, "group_id": group_id}
        
        if cursor:
            query["_id"] = {"$lt": ObjectId(cursor)}

        posts = await self.collection.find(query)\
            .sort("_id", -1)\
            .limit(limit + 1)\
            .to_list(length=limit + 1)

        has_more = len(posts) > limit
        if has_more:
            posts = posts[:limit]

        next_cursor = str(posts[-1]["_id"]) if has_more and posts else None
        return posts, next_cursor

    async def get_user_posts(self, user_id: str, limit: int) -> List[dict]:
        """Get user's posts"""
        return await self.collection.find({
            "user_id": user_id,
            "is_deleted": False
        }).sort("created_at", -1).limit(limit).to_list(length=limit)

    async def update(self, post_id: str, update_data: dict) -> bool:
        """Update post"""
        update_data["updated_at"] = datetime.utcnow()
        result = await self.collection.update_one(
            {"_id": ObjectId(post_id)},
            {"$set": update_data}
        )
        return result.modified_count > 0

    async def add_reaction(self, post_id: str, reaction_type: str) -> bool:
        """Add reaction to post"""
        result = await self.collection.update_one(
            {"_id": ObjectId(post_id)},
            {"$inc": {f"reactions.{reaction_type}": 1}}
        )
        return result.modified_count > 0

    async def remove_reaction(self, post_id: str, reaction_type: str) -> bool:
        """Remove reaction from post"""
        result = await self.collection.update_one(
            {"_id": ObjectId(post_id)},
            {"$inc": {f"reactions.{reaction_type}": -1}}
        )
        return result.modified_count > 0

    async def increment_reply_count(self, post_id: str):
        """Increment reply count"""
        await self.collection.update_one(
            {"_id": ObjectId(post_id)},
            {"$inc": {"reply_count": 1}}
        )

    async def soft_delete(self, post_id: str) -> bool:
        """Soft delete post"""
        result = await self.collection.update_one(
            {"_id": ObjectId(post_id)},
            {"$set": {"is_deleted": True, "updated_at": datetime.utcnow()}}
        )
        return result.modified_count > 0

    async def flag_post(self, post_id: str):
        """Flag post for moderation"""
        await self.collection.update_one(
            {"_id": ObjectId(post_id)},
            {"$set": {"is_flagged": True}}
        )

    async def update_trending_score(self, post_id: str, score: float):
        """Update trending score"""
        await self.collection.update_one(
            {"_id": ObjectId(post_id)},
            {"$set": {"trending_score": score}}
        )

    async def get_trending(self, limit: int = 20) -> List[dict]:
        """Get trending posts"""
        return await self.collection.find({
            "is_deleted": False,
            "trending_score": {"$gt": 0}
        }).sort("trending_score", -1).limit(limit).to_list(length=limit)