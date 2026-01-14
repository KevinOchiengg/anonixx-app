from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from bson import ObjectId
from app.database import get_database
from app.core.security import verify_password, get_password_hash, generate_anonymous_name
from app.core.jwt import create_access_token, create_refresh_token
from app.dependencies import get_current_user_id


router = APIRouter(prefix="/auth", tags=["Authentication"])


# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: str
    username: Optional[str] = None


class UserLogin(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: str


class UserProfile(BaseModel):
    id: str
    anonymous_name: str
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    avatar: Optional[str] = None
    bio: Optional[str] = None
    coin_balance: int = 0
    is_premium: bool = False


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserProfile


class UpdateProfileRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ==================== ENDPOINTS ====================

@router.post("/anonymous", response_model=TokenResponse)
async def create_anonymous_user(db = Depends(get_database)):
    """Create anonymous user account"""
    anonymous_name = generate_anonymous_name()
    
    user_data = {
        "_id": ObjectId(),
        "anonymous_name": anonymous_name,
        "username": None,
        "email": None,
        "password_hash": None,
        "coin_balance": 100,
        "is_premium": False,
        "is_anonymous": True,
        "created_at": datetime.utcnow(),
    }
    
    await db["users"].insert_one(user_data)
    
    user_id = str(user_data["_id"])
    access_token = create_access_token({"sub": user_id})
    refresh_token = create_refresh_token({"sub": user_id})
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserProfile(
            id=user_id,
            anonymous_name=anonymous_name,
            coin_balance=100,
            is_premium=False
        )
    )


@router.post("/signup", response_model=TokenResponse)
async def signup(data: UserCreate, db = Depends(get_database)):
    """Sign up with email/phone and password"""
    if not data.email and not data.phone:
        raise HTTPException(status_code=400, detail="Email or phone required")
    
    # Check if email already exists
    if data.email:
        existing = await db["users"].find_one({"email": data.email})
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check if phone already exists
    if data.phone:
        existing = await db["users"].find_one({"phone": data.phone})
        if existing:
            raise HTTPException(status_code=400, detail="Phone number already registered")
    
    # Validate password
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    anonymous_name = generate_anonymous_name()
    password_hash = get_password_hash(data.password)
    
    user_data = {
        "_id": ObjectId(),
        "anonymous_name": anonymous_name,
        "username": data.username,
        "email": data.email,
        "phone": data.phone,
        "password_hash": password_hash,
        "coin_balance": 100,
        "is_premium": False,
        "is_anonymous": False,
        "created_at": datetime.utcnow(),
    }
    
    await db["users"].insert_one(user_data)
    
    user_id = str(user_data["_id"])
    access_token = create_access_token({"sub": user_id})
    refresh_token = create_refresh_token({"sub": user_id})
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserProfile(
            id=user_id,
            anonymous_name=anonymous_name,
            username=data.username,
            email=data.email,
            coin_balance=100,
            is_premium=False
        )
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db = Depends(get_database)):
    """Login with email/phone and password"""
    user = None
    
    if data.email:
        user = await db["users"].find_one({"email": data.email})
    elif data.phone:
        user = await db["users"].find_one({"phone": data.phone})
    else:
        raise HTTPException(status_code=400, detail="Email or phone required")
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="This account has no password. Please sign up first.")
    
    if not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user_id = str(user["_id"])
    access_token = create_access_token({"sub": user_id})
    refresh_token = create_refresh_token({"sub": user_id})
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserProfile(
            id=user_id,
            anonymous_name=user["anonymous_name"],
            username=user.get("username"),
            email=user.get("email"),
            coin_balance=user.get("coin_balance", 0),
            is_premium=user.get("is_premium", False)
        )
    )


@router.get("/me", response_model=UserProfile)
async def get_me(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get current user profile"""
    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserProfile(
        id=str(user["_id"]),
        anonymous_name=user["anonymous_name"],
        username=user.get("username"),
        email=user.get("email"),
        coin_balance=user.get("coin_balance", 0),
        is_premium=user.get("is_premium", False)
    )


@router.put("/update-profile")
async def update_profile(
    data: UpdateProfileRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Update user profile (username and/or email)"""
    update_data = {}
    
    if data.username:
        # Validate username
        if len(data.username) < 3:
            raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
        
        if len(data.username) > 30:
            raise HTTPException(status_code=400, detail="Username must be less than 30 characters")
        
        # Check if username is already taken by another user
        existing = await db["users"].find_one({
            "username": data.username,
            "_id": {"$ne": ObjectId(current_user_id)}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        
        update_data["username"] = data.username
    
    if data.email:
        # Check if email is already taken by another user
        existing = await db["users"].find_one({
            "email": data.email,
            "_id": {"$ne": ObjectId(current_user_id)}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        
        update_data["email"] = data.email
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    # Update user
    await db["users"].update_one(
        {"_id": ObjectId(current_user_id)},
        {"$set": update_data}
    )
    
    # Return updated user
    updated_user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    
    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "username": updated_user.get("username"),
        "email": updated_user.get("email"),
        "anonymous_name": updated_user.get("anonymous_name"),
        "coin_balance": updated_user.get("coin_balance", 0)
    }


@router.put("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Change user password"""
    # Get user
    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user has a password (not anonymous)
    if not user.get("password_hash"):
        raise HTTPException(
            status_code=400, 
            detail="Cannot change password for anonymous accounts. Please set up an account first."
        )
    
    # Verify current password
    if not verify_password(data.current_password, user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Validate new password
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")
    
    # Hash new password
    new_password_hash = get_password_hash(data.new_password)
    
    # Update password
    await db["users"].update_one(
        {"_id": ObjectId(current_user_id)},
        {"$set": {"password_hash": new_password_hash}}
    )
    
    return {"message": "Password changed successfully"}


@router.delete("/delete-account")
async def delete_account(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Delete user account permanently"""
    # Check if user exists
    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete user's posts
    await db["posts"].delete_many({"user_id": current_user_id})
    
    # Delete user's comments
    await db["comments"].delete_many({"user_id": current_user_id})
    
    # Delete user's reactions
    await db["reactions"].delete_many({"user_id": current_user_id})
    
    # Remove user from groups
    await db["groups"].update_many(
        {"members": current_user_id},
        {"$pull": {"members": current_user_id}, "$inc": {"members_count": -1}}
    )
    
    # Delete user
    result = await db["users"].delete_one({"_id": ObjectId(current_user_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "Account deleted successfully"}