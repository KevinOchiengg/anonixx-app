from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import JWTError, jwt
from bson import ObjectId

from app.database import get_database
from app.config import settings
from app.dependencies import get_current_user_id
from app.utils.coin_service import credit_coins

router = APIRouter(prefix="/auth", tags=["Authentication"])

pwd_context   = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/token")

def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Models ───────────────────────────────────────────────────
WELCOME_BONUS = 15  # Coins awarded to every new user

class RegisterRequest(BaseModel):
    email:         EmailStr
    password:      str
    username:      Optional[str] = None
    referral_code: Optional[str] = None   # Optional referral code during signup

class LoginRequest(BaseModel):
    email:    EmailStr
    password: str

class UpdateInterestsRequest(BaseModel):
    interests: list[str]

class UpdateGenderRequest(BaseModel):
    gender: str  # 'male' | 'female' | 'nonbinary' | 'prefer_not_to_say'

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str
    user:         dict

class UserResponse(BaseModel):
    id:             str
    email:          str
    username:       Optional[str]
    anonymous_name: Optional[str]
    created_at:     str


# ─── Helpers ──────────────────────────────────────────────────
def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire    = _now() + (expires_delta or timedelta(days=30))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")

def generate_anonymous_name() -> str:
    import random
    adjectives = [
        "Quiet", "Gentle", "Brave", "Kind", "Thoughtful", "Peaceful",
        "Calm", "Hopeful", "Strong", "Soft", "Wise", "Warm",
    ]
    nouns = [
        "Soul", "Heart", "Spirit", "Mind", "Voice", "Light",
        "Star", "Moon", "Sky", "Dream", "Hope", "Dawn",
    ]
    return f"{random.choice(adjectives)} {random.choice(nouns)} {random.randint(100, 999)}"


# ─── Endpoints ────────────────────────────────────────────────
@router.post("/register", response_model=TokenResponse)
async def register(data: RegisterRequest, db=Depends(get_database)):
    if await db["users"].find_one({"email": data.email}):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user_id = ObjectId()
    user = {
        "_id":            user_id,
        "email":          data.email,
        "username":       data.username or data.email.split("@")[0],
        "password":       get_password_hash(data.password),
        "anonymous_name": generate_anonymous_name(),
        "interests":      [],
        "coin_balance":   0,          # Start at 0; welcome bonus credited below
        "streak_count":   0,
        "created_at":     _now(),
        "updated_at":     _now(),
    }

    # Store referral code association before insert
    if data.referral_code:
        referrer = await db["users"].find_one({"referral_code": data.referral_code.upper()})
        if referrer and str(referrer["_id"]) != str(user_id):
            user["referred_by"]         = data.referral_code.upper()
            user["referred_by_user_id"] = str(referrer["_id"])

    await db["users"].insert_one(user)

    # Credit welcome bonus as a proper transaction
    await credit_coins(
        db          = db,
        user_id     = str(user_id),
        amount      = WELCOME_BONUS,
        reason      = "welcome_bonus",
        description = "Welcome to Anonixx 🎉",
    )

    access_token = create_access_token({"sub": str(user["_id"])})
    return {
        "access_token": access_token,
        "token_type":   "bearer",
        "user": {
            "id":             str(user["_id"]),
            "email":          user["email"],
            "username":       user["username"],
            "anonymous_name": user["anonymous_name"],
            "coin_balance":   WELCOME_BONUS,
        },
    }


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db=Depends(get_database)):
    user = await db["users"].find_one({"email": data.email})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    access_token = create_access_token({"sub": str(user["_id"])})
    return {
        "access_token": access_token,
        "token_type":   "bearer",
        "user": {
            "id":             str(user["_id"]),
            "email":          user["email"],
            "username":       user.get("username"),
            "anonymous_name": user.get("anonymous_name"),
        },
    }


@router.post("/token", response_model=TokenResponse)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db=Depends(get_database),
):
    user = await db["users"].find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user.get("password", "")):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token({"sub": str(user["_id"])})
    return {
        "access_token": access_token,
        "token_type":   "bearer",
        "user": {
            "id":             str(user["_id"]),
            "email":          user["email"],
            "username":       user.get("username"),
            "anonymous_name": user.get("anonymous_name"),
        },
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    current_user_id: str = Depends(get_current_user_id),
    db=Depends(get_database),
):
    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    return {
        "id":             str(user["_id"]),
        "email":          user["email"],
        "username":       user.get("username"),
        "anonymous_name": user.get("anonymous_name"),
        "created_at":     user["created_at"].isoformat(),
    }


@router.put("/interests")
async def update_interests(
    data: UpdateInterestsRequest,
    current_user_id: str = Depends(get_current_user_id),
    db=Depends(get_database),
):
    if len(data.interests) > 5:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Maximum 5 interests allowed")

    result = await db["users"].update_one(
        {"_id": ObjectId(current_user_id)},
        {"$set": {"interests": data.interests, "updated_at": _now()}},
    )
    if result.modified_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    # Trigger referral conversion on first onboarding completion
    user = await db["users"].find_one(
        {"_id": ObjectId(current_user_id)},
        {"referred_by_user_id": 1, "referral_completed": 1},
    )
    if user and user.get("referred_by_user_id") and not user.get("referral_completed"):
        from app.api.v1.referrals import REFERRER_REWARD, REFERRED_REWARD, _now as ref_now
        from app.utils.coin_service import credit_coins as _credit
        referrer_id   = user["referred_by_user_id"]
        current_month = _now().strftime("%Y-%m")
        referrer_doc  = await db["users"].find_one(
            {"_id": ObjectId(referrer_id)},
            {"monthly_ref_count": 1, "monthly_ref_month": 1},
        )
        if referrer_doc:
            stored_month  = referrer_doc.get("monthly_ref_month", "")
            monthly_count = referrer_doc.get("monthly_ref_count", 0) if stored_month == current_month else 0
            if monthly_count < 20:
                await _credit(db, referrer_id, REFERRER_REWARD, "referral_bonus",
                              "A friend joined using your link", {"referred_user_id": current_user_id})
                await db["users"].update_one(
                    {"_id": ObjectId(referrer_id)},
                    {"$set": {"monthly_ref_month": current_month, "monthly_ref_count": monthly_count + 1},
                     "$inc": {"total_referrals": 1}},
                )
        await _credit(db, current_user_id, REFERRED_REWARD, "referral_bonus",
                      "Joined via a friend's referral", {"referrer_id": referrer_id})
        await db["users"].update_one(
            {"_id": ObjectId(current_user_id)},
            {"$set": {"referral_completed": True, "referral_completed_at": _now()}},
        )

    return {"message": "Interests updated successfully", "interests": data.interests}


@router.put("/gender")
async def update_gender(
    data: UpdateGenderRequest,
    current_user_id: str = Depends(get_current_user_id),
    db=Depends(get_database),
):
    VALID = {'male', 'female', 'nonbinary', 'prefer_not_to_say'}
    if data.gender not in VALID:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid gender value")

    result = await db["users"].update_one(
        {"_id": ObjectId(current_user_id)},
        {"$set": {"gender": data.gender, "updated_at": _now()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    return {"message": "Gender updated", "gender": data.gender}


@router.post("/logout")
async def logout(current_user_id: str = Depends(get_current_user_id)):
    return {"message": "Logged out successfully", "status": "success"}
