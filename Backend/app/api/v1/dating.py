"""
backend/app/api/v1/dating.py
Dating profiles and matching system
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from enum import Enum
from app.core.security import get_current_user
from app.database import get_database
from app.models.user import User

router = APIRouter(prefix="/dating", tags=["dating"])


# Enums
class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    NON_BINARY = "non-binary"
    OTHER = "other"


class LookingFor(str, Enum):
    FRIENDSHIP = "friendship"
    DATING = "dating"
    RELATIONSHIP = "relationship"
    CASUAL = "casual"


class SwipeAction(str, Enum):
    LIKE = "like"
    PASS = "pass"
    SUPER_LIKE = "super_like"


# Models
class DatingProfile(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    
    # Basic info
    display_name: str
    age: int
    gender: Gender
    bio: str
    location: Optional[str] = None
    
    # Preferences
    looking_for: List[LookingFor] = []
    min_age: int = 18
    max_age: int = 100
    max_distance: int = 50  # km
    
    # Profile
    photos: List[str] = []  # URLs
    interests: List[str] = []
    
    # Stats
    likes_received: int = 0
    matches_count: int = 0
    profile_views: int = 0
    
    # Settings
    is_active: bool = True
    show_age: bool = True
    show_distance: bool = True
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    class Config:
        populate_by_name = True


class Swipe(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_id: str  # Who swiped
    target_id: str  # Who was swiped on
    action: SwipeAction
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True


class Match(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user1_id: str
    user2_id: str
    matched_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True
    last_message_at: Optional[datetime] = None

    class Config:
        populate_by_name = True


# API Schemas
class DatingProfileCreate(BaseModel):
    display_name: str
    age: int
    gender: Gender
    bio: str
    location: Optional[str] = None
    looking_for: List[LookingFor] = []
    interests: List[str] = []
    photos: List[str] = []

    class Config:
        json_schema_extra = {
            "example": {
                "display_name": "Alex",
                "age": 25,
                "gender": "male",
                "bio": "Love hiking and coffee ☕",
                "location": "San Francisco",
                "looking_for": ["dating", "friendship"],
                "interests": ["hiking", "photography", "music"]
            }
        }


class DatingProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    looking_for: Optional[List[LookingFor]] = None
    interests: Optional[List[str]] = None
    photos: Optional[List[str]] = None
    min_age: Optional[int] = None
    max_age: Optional[int] = None
    is_active: Optional[bool] = None


class SwipeRequest(BaseModel):
    target_id: str
    action: SwipeAction

    class Config:
        json_schema_extra = {
            "example": {
                "target_id": "user123",
                "action": "like"
            }
        }


class ProfileResponse(BaseModel):
    id: str
    display_name: str
    age: int
    gender: str
    bio: str
    location: Optional[str]
    looking_for: List[str]
    interests: List[str]
    photos: List[str]
    profile_views: int
    distance: Optional[int] = None  # Distance in km
    
    # Matching info
    is_liked: bool = False
    is_matched: bool = False


class MatchResponse(BaseModel):
    id: str
    profile: ProfileResponse
    matched_at: datetime
    is_active: bool


# Endpoints
@router.post("/profiles", response_model=ProfileResponse, status_code=201)
async def create_dating_profile(
    data: DatingProfileCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a dating profile"""
    db = await get_database()
    
    # Check if profile already exists
    existing = await db.dating_profiles.find_one({"user_id": current_user.id})
    if existing:
        raise HTTPException(status_code=400, detail="Dating profile already exists")
    
    profile = DatingProfile(
        user_id=current_user.id,
        display_name=data.display_name,
        age=data.age,
        gender=data.gender,
        bio=data.bio,
        location=data.location,
        looking_for=data.looking_for,
        interests=data.interests,
        photos=data.photos
    )
    
    result = await db.dating_profiles.insert_one(profile.dict(by_alias=True))
    
    return ProfileResponse(
        id=str(result.inserted_id),
        display_name=profile.display_name,
        age=profile.age,
        gender=profile.gender.value,
        bio=profile.bio,
        location=profile.location,
        looking_for=[lf.value for lf in profile.looking_for],
        interests=profile.interests,
        photos=profile.photos,
        profile_views=0,
        is_liked=False,
        is_matched=False
    )


@router.get("/profiles/me", response_model=ProfileResponse)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    """Get current user's dating profile"""
    db = await get_database()
    
    profile = await db.dating_profiles.find_one({"user_id": current_user.id})
    if not profile:
        raise HTTPException(status_code=404, detail="Dating profile not found")
    
    return ProfileResponse(
        id=str(profile["_id"]),
        display_name=profile["display_name"],
        age=profile["age"],
        gender=profile["gender"],
        bio=profile["bio"],
        location=profile.get("location"),
        looking_for=profile.get("looking_for", []),
        interests=profile.get("interests", []),
        photos=profile.get("photos", []),
        profile_views=profile.get("profile_views", 0),
        is_liked=False,
        is_matched=False
    )


@router.put("/profiles/me", response_model=ProfileResponse)
async def update_my_profile(
    data: DatingProfileUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update dating profile"""
    db = await get_database()
    
    profile = await db.dating_profiles.find_one({"user_id": current_user.id})
    if not profile:
        raise HTTPException(status_code=404, detail="Dating profile not found")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    await db.dating_profiles.update_one(
        {"user_id": current_user.id},
        {"$set": update_data}
    )
    
    updated_profile = await db.dating_profiles.find_one({"user_id": current_user.id})
    
    return ProfileResponse(
        id=str(updated_profile["_id"]),
        display_name=updated_profile["display_name"],
        age=updated_profile["age"],
        gender=updated_profile["gender"],
        bio=updated_profile["bio"],
        location=updated_profile.get("location"),
        looking_for=updated_profile.get("looking_for", []),
        interests=updated_profile.get("interests", []),
        photos=updated_profile.get("photos", []),
        profile_views=updated_profile.get("profile_views", 0),
        is_liked=False,
        is_matched=False
    )


@router.get("/profiles/discover", response_model=List[ProfileResponse])
async def discover_profiles(
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user)
):
    """Discover new profiles to swipe on"""
    db = await get_database()
    
    # Get current user's profile
    my_profile = await db.dating_profiles.find_one({"user_id": current_user.id})
    if not my_profile:
        raise HTTPException(status_code=404, detail="Create a dating profile first")
    
    # Get users already swiped on
    swiped = await db.swipes.find({"user_id": current_user.id}).to_list(None)
    swiped_ids = [s["target_id"] for s in swiped]
    
    # Build query for compatible profiles
    query = {
        "user_id": {"$ne": current_user.id, "$nin": swiped_ids},
        "is_active": True,
        "age": {"$gte": my_profile.get("min_age", 18), "$lte": my_profile.get("max_age", 100)}
    }
    
    profiles = await db.dating_profiles.find(query).limit(limit).to_list(None)
    
    result = []
    for profile in profiles:
        # Check if they liked us
        their_swipe = await db.swipes.find_one({
            "user_id": profile["user_id"],
            "target_id": current_user.id,
            "action": SwipeAction.LIKE
        })
        
        result.append(ProfileResponse(
            id=str(profile["_id"]),
            display_name=profile["display_name"],
            age=profile["age"],
            gender=profile["gender"],
            bio=profile["bio"],
            location=profile.get("location"),
            looking_for=profile.get("looking_for", []),
            interests=profile.get("interests", []),
            photos=profile.get("photos", []),
            profile_views=profile.get("profile_views", 0),
            is_liked=their_swipe is not None,
            is_matched=False
        ))
    
    return result


@router.post("/swipe")
async def swipe_profile(
    data: SwipeRequest,
    current_user: User = Depends(get_current_user)
):
    """Swipe on a profile"""
    db = await get_database()
    
    # Check if already swiped
    existing = await db.swipes.find_one({
        "user_id": current_user.id,
        "target_id": data.target_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already swiped on this profile")
    
    # Create swipe
    swipe = Swipe(
        user_id=current_user.id,
        target_id=data.target_id,
        action=data.action
    )
    
    await db.swipes.insert_one(swipe.dict(by_alias=True))
    
    # If like, check for match
    is_match = False
    if data.action in [SwipeAction.LIKE, SwipeAction.SUPER_LIKE]:
        # Check if they liked us back
        reverse_swipe = await db.swipes.find_one({
            "user_id": data.target_id,
            "target_id": current_user.id,
            "action": {"$in": [SwipeAction.LIKE, SwipeAction.SUPER_LIKE]}
        })
        
        if reverse_swipe:
            # It's a match!
            match = Match(
                user1_id=current_user.id,
                user2_id=data.target_id
            )
            await db.matches.insert_one(match.dict(by_alias=True))
            
            # Update profile stats
            await db.dating_profiles.update_one(
                {"user_id": current_user.id},
                {"$inc": {"matches_count": 1}}
            )
            await db.dating_profiles.update_one(
                {"user_id": data.target_id},
                {"$inc": {"matches_count": 1, "likes_received": 1}}
            )
            
            is_match = True
        else:
            # Just update their likes_received
            await db.dating_profiles.update_one(
                {"user_id": data.target_id},
                {"$inc": {"likes_received": 1}}
            )
    
    return {
        "message": "Swiped successfully",
        "is_match": is_match
    }


@router.get("/matches", response_model=List[MatchResponse])
async def get_matches(current_user: User = Depends(get_current_user)):
    """Get all matches"""
    db = await get_database()
    
    # Find matches where user is either user1 or user2
    matches = await db.matches.find({
        "$or": [
            {"user1_id": current_user.id},
            {"user2_id": current_user.id}
        ],
        "is_active": True
    }).sort("matched_at", -1).to_list(None)
    
    result = []
    for match in matches:
        # Get the other person's profile
        other_id = match["user2_id"] if match["user1_id"] == current_user.id else match["user1_id"]
        profile = await db.dating_profiles.find_one({"user_id": other_id})
        
        if profile:
            result.append(MatchResponse(
                id=str(match["_id"]),
                profile=ProfileResponse(
                    id=str(profile["_id"]),
                    display_name=profile["display_name"],
                    age=profile["age"],
                    gender=profile["gender"],
                    bio=profile["bio"],
                    location=profile.get("location"),
                    looking_for=profile.get("looking_for", []),
                    interests=profile.get("interests", []),
                    photos=profile.get("photos", []),
                    profile_views=profile.get("profile_views", 0),
                    is_liked=True,
                    is_matched=True
                ),
                matched_at=match["matched_at"],
                is_active=match["is_active"]
            ))
    
    return result


@router.delete("/matches/{match_id}")
async def unmatch(
    match_id: str,
    current_user: User = Depends(get_current_user)
):
    """Unmatch with someone"""
    db = await get_database()
    
    match = await db.matches.find_one({"_id": match_id})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    # Check if user is part of the match
    if current_user.id not in [match["user1_id"], match["user2_id"]]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.matches.update_one(
        {"_id": match_id},
        {"$set": {"is_active": False}}
    )
    
    return {"message": "Unmatched successfully"}