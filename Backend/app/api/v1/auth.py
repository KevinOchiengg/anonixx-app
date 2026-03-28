from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import JWTError, jwt
from bson import ObjectId
import secrets
import hashlib

from app.database import get_database
from app.config import settings
from app.dependencies import get_current_user_id
from app.utils.coin_service import credit_coins
from app.utils.email import send_password_reset_otp

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


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password:     str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email:        EmailStr
    otp:          str
    new_password: str


@router.put("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user_id: str = Depends(get_current_user_id),
    db=Depends(get_database),
):
    if len(data.new_password) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="New password must be at least 8 characters")

    if data.current_password == data.new_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="New password must differ from current password")

    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    if not verify_password(data.current_password, user["password"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")

    await db["users"].update_one(
        {"_id": ObjectId(current_user_id)},
        {"$set": {"password": get_password_hash(data.new_password), "updated_at": _now()}},
    )
    return {"message": "Password changed successfully"}


# ─── Helpers ──────────────────────────────────────────────────
OTP_TTL_MINUTES  = 15
OTP_MAX_ATTEMPTS = 5

def _generate_otp() -> str:
    """Cryptographically secure 6-digit OTP."""
    return str(secrets.randbelow(900_000) + 100_000)

def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, db=Depends(get_database)):
    """
    Always returns 200 regardless of whether the email exists
    to prevent account enumeration attacks.
    """
    user = await db["users"].find_one({"email": data.email})
    if user:
        otp     = _generate_otp()
        expires = _now() + timedelta(minutes=OTP_TTL_MINUTES)

        await db["users"].update_one(
            {"_id": user["_id"]},
            {"$set": {
                "reset_otp_hash":     _hash_otp(otp),
                "reset_otp_expires":  expires,
                "reset_otp_attempts": 0,
            }},
        )
        send_password_reset_otp(str(user["email"]), otp)

    return {"message": "If that email is registered, a reset code is on its way."}


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db=Depends(get_database)):
    if len(data.new_password) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")

    user = await db["users"].find_one({"email": data.email})
    if not user or not user.get("reset_otp_hash"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    # Check expiry
    expires = user.get("reset_otp_expires")
    if not expires or _now() > expires.replace(tzinfo=timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Code has expired. Request a new one.")

    # Check attempt limit
    attempts = user.get("reset_otp_attempts", 0)
    if attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts. Request a new code.")

    # Verify OTP
    if _hash_otp(data.otp.strip()) != user["reset_otp_hash"]:
        await db["users"].update_one(
            {"_id": user["_id"]},
            {"$inc": {"reset_otp_attempts": 1}},
        )
        remaining = OTP_MAX_ATTEMPTS - attempts - 1
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Incorrect code. {remaining} attempt{'s' if remaining != 1 else ''} left.",
        )

    # Success — update password, clear OTP fields
    await db["users"].update_one(
        {"_id": user["_id"]},
        {
            "$set":   {"password": get_password_hash(data.new_password), "updated_at": _now()},
            "$unset": {"reset_otp_hash": "", "reset_otp_expires": "", "reset_otp_attempts": ""},
        },
    )
    return {"message": "Password reset successfully"}
