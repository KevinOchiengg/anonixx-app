from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from bson import ObjectId
from app.core.security import get_current_user
from app.database import get_database
from app.models.user import User
from app.models.group import Group, GroupMember, MemberRole, GroupCategory

router = APIRouter(prefix="/groups", tags=["groups"])


# Request Models
class GroupCreate(BaseModel):
    name: str
    description: str
    category: GroupCategory
    avatar_url: Optional[str] = None
    tags: List[str] = []


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[GroupCategory] = None
    tags: Optional[List[str]] = None


# Response Models
class UserInfo(BaseModel):
    id: str
    username: str
    avatar_url: Optional[str] = None


class MemberInfo(BaseModel):
    user: UserInfo
    role: str
    joined_at: datetime


class GroupResponse(BaseModel):
    id: str
    name: str
    description: str
    category: str
    owner_id: str
    member_count: int
    avatar_url: Optional[str]
    tags: List[str]
    created_at: datetime
    user_role: Optional[str] = None
    is_member: bool = False


async def get_user_info(user_id: str) -> Optional[UserInfo]:
    """Get user info"""
    db = await get_database()
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
    except:
        user = await db.users.find_one({"_id": user_id})
    
    if not user:
        return None
    
    return UserInfo(
        id=str(user["_id"]),
        username=user.get("username", "Unknown"),
        avatar_url=user.get("avatar_url")
    )


async def get_user_role(group: dict, user_id: str) -> Optional[str]:
    """Get user's role in group"""
    for member in group.get("members", []):
        if str(member["user_id"]) == str(user_id):
            return member["role"]
    return None


@router.post("", status_code=201)
async def create_group(
    data: GroupCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new group (costs 100 coins)"""
    print("=" * 50)
    print("🔵 Create group called!")
    print(f"📦 Data received: {data}")
    print(f"👤 User: {current_user.email}")
    print(f"💰 Current coins: {current_user.coin_balance}")
    print("=" * 50)
    
    db = await get_database()
    
    # Check if user has enough coins
    if current_user.coin_balance < 100:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough coins. Need 100 coins, you have {current_user.coin_balance}"
        )
    
    # Deduct 100 coins
    new_balance = current_user.coin_balance - 100
    try:
        await db.users.update_one(
            {"_id": ObjectId(current_user.id)},
            {"$set": {"coin_balance": new_balance}}
        )
    except:
        await db.users.update_one(
            {"_id": current_user.id},
            {"$set": {"coin_balance": new_balance}}
        )
    
    print(f"✅ Coins deducted. New balance: {new_balance}")
    
    # Create coin transaction
    from app.models.coin_transaction import CoinTransaction, TransactionType, TransactionReason
    transaction = CoinTransaction(
        user_id=str(current_user.id),
        amount=-100,
        balance_after=new_balance,
        transaction_type=TransactionType.SPEND,
        reason=TransactionReason.POST_CREATED,
        description=f"Created group: {data.name}"
    )
    
    # ✅ FIXED: Remove _id before inserting to avoid duplicate key error
    transaction_dict = transaction.dict(by_alias=True)
    transaction_dict.pop('_id', None)  # Remove _id, let MongoDB generate it
    await db.coin_transactions.insert_one(transaction_dict)
    
    print("✅ Transaction recorded")
    
    # Create group
    owner_member = GroupMember(
        user_id=str(current_user.id),
        role=MemberRole.OWNER
    )
    
    group = Group(
        name=data.name,
        description=data.description,
        category=data.category,
        owner_id=str(current_user.id),
        members=[owner_member.dict()],
        member_count=1,
        avatar_url=data.avatar_url,
        tags=data.tags
    )
    
    group_dict = group.dict(by_alias=True)
    group_dict.pop('_id', None)  # Remove _id to let MongoDB generate it
    
    result = await db.groups.insert_one(group_dict)
    group_id = str(result.inserted_id)
    
    print(f"✅ Group created with ID: {group_id}")
    print("=" * 50)
    
    return GroupResponse(
        id=group_id,
        name=group.name,
        description=group.description,
        category=group.category.value,
        owner_id=str(group.owner_id),
        member_count=1,
        avatar_url=data.avatar_url,
        tags=group.tags,
        created_at=group.created_at,
        user_role=MemberRole.OWNER.value,
        is_member=True
    )


@router.get("")
async def get_groups(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get list of groups"""
    db = await get_database()
    
    skip = (page - 1) * limit
    
    # Build query
    query = {}
    
    if category:
        query["category"] = category
    
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"tags": {"$in": [search]}}
        ]
    
    groups = await db.groups.find(query).sort("member_count", -1).skip(skip).limit(limit).to_list(None)
    
    result = []
    for group in groups:
        user_role = await get_user_role(group, current_user.id)
        is_member = user_role is not None
        
        result.append(GroupResponse(
            id=str(group["_id"]),
            name=group["name"],
            description=group["description"],
            category=group["category"],
            owner_id=str(group["owner_id"]),
            member_count=group["member_count"],
            avatar_url=group.get("avatar_url"),
            tags=group.get("tags", []),
            created_at=group["created_at"],
            user_role=user_role,
            is_member=is_member
        ))
    
    return result


@router.get("/{group_id}")
async def get_group(
    group_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a single group"""
    db = await get_database()
    
    try:
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
    except:
        group = await db.groups.find_one({"_id": group_id})
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    user_role = await get_user_role(group, current_user.id)
    
    return GroupResponse(
        id=str(group["_id"]),
        name=group["name"],
        description=group["description"],
        category=group["category"],
        owner_id=str(group["owner_id"]),
        member_count=group["member_count"],
        avatar_url=group.get("avatar_url"),
        tags=group.get("tags", []),
        created_at=group["created_at"],
        user_role=user_role,
        is_member=user_role is not None
    )


@router.post("/{group_id}/join")
async def join_group(
    group_id: str,
    current_user: User = Depends(get_current_user)
):
    """Join a group"""
    db = await get_database()
    
    try:
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
    except:
        group = await db.groups.find_one({"_id": group_id})
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check if already member
    if await get_user_role(group, current_user.id):
        raise HTTPException(status_code=400, detail="Already a member")
    
    # Add member
    new_member = GroupMember(
        user_id=str(current_user.id),
        role=MemberRole.MEMBER
    )
    
    try:
        await db.groups.update_one(
            {"_id": ObjectId(group_id)},
            {
                "$push": {"members": new_member.dict()},
                "$inc": {"member_count": 1}
            }
        )
    except:
        await db.groups.update_one(
            {"_id": group_id},
            {
                "$push": {"members": new_member.dict()},
                "$inc": {"member_count": 1}
            }
        )
    
    return {"message": "Joined group successfully"}


@router.post("/{group_id}/leave")
async def leave_group(
    group_id: str,
    current_user: User = Depends(get_current_user)
):
    """Leave a group"""
    db = await get_database()
    
    try:
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
    except:
        group = await db.groups.find_one({"_id": group_id})
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check if member
    user_role = await get_user_role(group, current_user.id)
    if not user_role:
        raise HTTPException(status_code=400, detail="Not a member")
    
    # Owner cannot leave
    if user_role == MemberRole.OWNER.value:
        raise HTTPException(status_code=400, detail="Owner cannot leave. Delete the group instead.")
    
    # Remove member
    try:
        await db.groups.update_one(
            {"_id": ObjectId(group_id)},
            {
                "$pull": {"members": {"user_id": str(current_user.id)}},
                "$inc": {"member_count": -1}
            }
        )
    except:
        await db.groups.update_one(
            {"_id": group_id},
            {
                "$pull": {"members": {"user_id": str(current_user.id)}},
                "$inc": {"member_count": -1}
            }
        )
    
    return {"message": "Left group successfully"}


@router.get("/{group_id}/members")
async def get_members(
    group_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get group members"""
    db = await get_database()
    
    try:
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
    except:
        group = await db.groups.find_one({"_id": group_id})
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    members = []
    for member in group.get("members", []):
        user_info = await get_user_info(member["user_id"])
        if user_info:
            members.append(MemberInfo(
                user=user_info,
                role=member["role"],
                joined_at=member["joined_at"]
            ))
    
    return members


@router.delete("/{group_id}")
async def delete_group(
    group_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete group (owner only)"""
    db = await get_database()
    
    try:
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
    except:
        group = await db.groups.find_one({"_id": group_id})
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if str(group["owner_id"]) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only owner can delete group")
    
    try:
        await db.groups.delete_one({"_id": ObjectId(group_id)})
    except:
        await db.groups.delete_one({"_id": group_id})
    
    return {"message": "Group deleted successfully"}