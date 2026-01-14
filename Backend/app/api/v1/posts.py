"""
backend/app/api/v1/posts.py
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from bson import ObjectId
from app.core.security import get_current_user, generate_anonymous_name
from app.database import get_database
from app.models.user import User
from app.models.post import Post, Comment, PostType

router = APIRouter(prefix="/posts", tags=["posts"])


# Request Models
class PostCreate(BaseModel):
    content: str
    post_type: PostType = PostType.TEXT
    images: List[str] = []
    audio_url: Optional[str] = None
    video_url: Optional[str] = None
    is_anonymous: bool = False


class CommentCreate(BaseModel):
    content: str
    is_anonymous: bool = False


class ReactRequest(BaseModel):
    reaction_type: str


# Response Models
class UserInfo(BaseModel):
    id: str
    username: str
    avatar_url: Optional[str] = None


class PostResponse(BaseModel):
    id: str
    user: Optional[UserInfo] = None
    content: str
    post_type: str
    images: List[str]
    audio_url: Optional[str] = None
    video_url: Optional[str] = None
    is_anonymous: bool
    anonymous_name: Optional[str]
    reactions: dict
    reactions_count: int
    comments_count: int
    views_count: int
    user_reaction: Optional[str] = None
    created_at: datetime


class CommentResponse(BaseModel):
    id: str
    post_id: str
    user: Optional[UserInfo] = None
    content: str
    is_anonymous: bool
    anonymous_name: Optional[str]
    reactions: dict
    reactions_count: int
    created_at: datetime


async def get_user_info(user_id: str) -> Optional[UserInfo]:
    """Get user info for display"""
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


@router.post("", status_code=201)
async def create_post(
    data: PostCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new post"""
    db = await get_database()
    
    post = Post(
        user_id=str(current_user.id),
        content=data.content,
        post_type=data.post_type,
        images=data.images,
        audio_url=data.audio_url,
        video_url=data.video_url,
        is_anonymous=data.is_anonymous,
        anonymous_name=generate_anonymous_name() if data.is_anonymous else None
    )
    
    # Remove _id before inserting
    post_dict = post.dict(by_alias=True)
    post_dict.pop('_id', None)
    
    result = await db.posts.insert_one(post_dict)
    
    # Award 10 coins for creating post
    new_balance = current_user.coin_balance + 10
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
    
    # Create coin transaction
    from app.models.coin_transaction import CoinTransaction, TransactionType, TransactionReason
    transaction = CoinTransaction(
        user_id=str(current_user.id),
        amount=10,
        balance_after=new_balance,
        transaction_type=TransactionType.EARN,
        reason=TransactionReason.POST_CREATED,
        description="Created a post"
    )
    
    # Remove _id before inserting transaction
    transaction_dict = transaction.dict(by_alias=True)
    transaction_dict.pop('_id', None)
    await db.coin_transactions.insert_one(transaction_dict)
    
    user_info = None if data.is_anonymous else await get_user_info(current_user.id)
    
    return PostResponse(
        id=str(result.inserted_id),
        user=user_info,
        content=post.content,
        post_type=post.post_type.value,
        images=post.images,
        audio_url=post.audio_url,
        video_url=post.video_url,
        is_anonymous=post.is_anonymous,
        anonymous_name=post.anonymous_name,
        reactions={},
        reactions_count=0,
        comments_count=0,
        views_count=0,
        created_at=post.created_at
    )


@router.get("/feed")
async def get_feed(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """Get personalized feed"""
    db = await get_database()
    
    skip = (page - 1) * limit
    
    posts = await db.posts.find({
        "is_deleted": False
    }).sort("created_at", -1).skip(skip).limit(limit).to_list(None)
    
    result = []
    for post in posts:
        try:
            user_info = None
            if not post.get("is_anonymous"):
                user_info = await get_user_info(post["user_id"])
            
            reactions = post.get("reactions", {})
            
            result.append(PostResponse(
                id=str(post["_id"]),
                user=user_info,
                content=post.get("content", ""),
                post_type=post.get("post_type", "text"),
                images=post.get("images", []),
                audio_url=post.get("audio_url"),
                video_url=post.get("video_url"),
                is_anonymous=post.get("is_anonymous", False),
                anonymous_name=post.get("anonymous_name"),
                reactions=reactions,
                reactions_count=len(reactions),
                comments_count=post.get("comments_count", 0),
                views_count=post.get("views_count", 0),
                user_reaction=reactions.get(str(current_user.id)),
                created_at=post.get("created_at", datetime.utcnow())
            ))
        except Exception as e:
            print(f"⚠️ Error processing post {post.get('_id')}: {e}")
            continue
    
    return result


@router.get("/{post_id}")
async def get_post(
    post_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a single post"""
    db = await get_database()
    
    try:
        post = await db.posts.find_one({"_id": ObjectId(post_id), "is_deleted": False})
    except:
        post = await db.posts.find_one({"_id": post_id, "is_deleted": False})
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Increment view count
    try:
        await db.posts.update_one(
            {"_id": ObjectId(post_id)},
            {"$inc": {"views_count": 1}}
        )
    except:
        await db.posts.update_one(
            {"_id": post_id},
            {"$inc": {"views_count": 1}}
        )
    
    user_info = None
    if not post.get("is_anonymous"):
        user_info = await get_user_info(post["user_id"])
    
    reactions = post.get("reactions", {})
    
    return PostResponse(
        id=str(post["_id"]),
        user=user_info,
        content=post.get("content", ""),
        post_type=post.get("post_type", "text"),
        images=post.get("images", []),
        audio_url=post.get("audio_url"),
        video_url=post.get("video_url"),
        is_anonymous=post.get("is_anonymous", False),
        anonymous_name=post.get("anonymous_name"),
        reactions=reactions,
        reactions_count=len(reactions),
        comments_count=post.get("comments_count", 0),
        views_count=post.get("views_count", 0) + 1,
        user_reaction=reactions.get(str(current_user.id)),
        created_at=post.get("created_at", datetime.utcnow())
    )


@router.delete("/{post_id}")
async def delete_post(
    post_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a post"""
    db = await get_database()
    
    try:
        post = await db.posts.find_one({"_id": ObjectId(post_id)})
    except:
        post = await db.posts.find_one({"_id": post_id})
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    if str(post["user_id"]) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    try:
        await db.posts.update_one(
            {"_id": ObjectId(post_id)},
            {"$set": {"is_deleted": True}}
        )
    except:
        await db.posts.update_one(
            {"_id": post_id},
            {"$set": {"is_deleted": True}}
        )
    
    return {"message": "Post deleted successfully"}


@router.post("/{post_id}/react")
async def react_to_post(
    post_id: str,
    data: ReactRequest,
    current_user: User = Depends(get_current_user)
):
    """React to a post"""
    db = await get_database()
    
    try:
        post = await db.posts.find_one({"_id": ObjectId(post_id), "is_deleted": False})
    except:
        post = await db.posts.find_one({"_id": post_id, "is_deleted": False})
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    try:
        await db.posts.update_one(
            {"_id": ObjectId(post_id)},
            {"$set": {f"reactions.{current_user.id}": data.reaction_type}}
        )
    except:
        await db.posts.update_one(
            {"_id": post_id},
            {"$set": {f"reactions.{current_user.id}": data.reaction_type}}
        )
    
    return {"message": "Reaction added"}


@router.delete("/{post_id}/react")
async def remove_reaction(
    post_id: str,
    current_user: User = Depends(get_current_user)
):
    """Remove reaction from a post"""
    db = await get_database()
    
    try:
        await db.posts.update_one(
            {"_id": ObjectId(post_id)},
            {"$unset": {f"reactions.{current_user.id}": ""}}
        )
    except:
        await db.posts.update_one(
            {"_id": post_id},
            {"$unset": {f"reactions.{current_user.id}": ""}}
        )
    
    return {"message": "Reaction removed"}


@router.post("/{post_id}/comments", status_code=201)
async def add_comment(
    post_id: str,
    data: CommentCreate,
    current_user: User = Depends(get_current_user)
):
    """Add a comment to a post"""
    db = await get_database()
    
    try:
        post = await db.posts.find_one({"_id": ObjectId(post_id), "is_deleted": False})
    except:
        post = await db.posts.find_one({"_id": post_id, "is_deleted": False})
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    comment = Comment(
        post_id=post_id,
        user_id=str(current_user.id),
        content=data.content,
        is_anonymous=data.is_anonymous,
        anonymous_name=generate_anonymous_name() if data.is_anonymous else None
    )
    
    # Remove _id before inserting comment
    comment_dict = comment.dict(by_alias=True)
    comment_dict.pop('_id', None)
    
    result = await db.comments.insert_one(comment_dict)
    
    # Increment post comment count
    try:
        await db.posts.update_one(
            {"_id": ObjectId(post_id)},
            {"$inc": {"comments_count": 1}}
        )
    except:
        await db.posts.update_one(
            {"_id": post_id},
            {"$inc": {"comments_count": 1}}
        )
    
    # Award 5 coins
    new_balance = current_user.coin_balance + 5
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
    
    user_info = None if data.is_anonymous else await get_user_info(current_user.id)
    
    return CommentResponse(
        id=str(result.inserted_id),
        post_id=post_id,
        user=user_info,
        content=data.content,
        is_anonymous=data.is_anonymous,
        anonymous_name=comment.anonymous_name,
        reactions={},
        reactions_count=0,
        created_at=comment.created_at
    )


@router.get("/{post_id}/comments")
async def get_comments(
    post_id: str,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user)
):
    """Get comments for a post"""
    db = await get_database()
    
    comments = await db.comments.find({
        "post_id": post_id,
        "is_deleted": False
    }).sort("created_at", -1).limit(limit).to_list(None)
    
    result = []
    for comment in comments:
        user_info = None
        if not comment.get("is_anonymous"):
            user_info = await get_user_info(comment["user_id"])
        
        reactions = comment.get("reactions", {})
        
        result.append(CommentResponse(
            id=str(comment["_id"]),
            post_id=comment["post_id"],
            user=user_info,
            content=comment.get("content", ""),
            is_anonymous=comment.get("is_anonymous", False),
            anonymous_name=comment.get("anonymous_name"),
            reactions=reactions,
            reactions_count=len(reactions),
            created_at=comment.get("created_at", datetime.utcnow())
        ))
    
    return result