from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timedelta, timezone, date
from passlib.context import CryptContext
from jose import JWTError, jwt
from bson import ObjectId
import secrets
import hashlib
import re
import random

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

MINIMUM_AGE = 18

def _is_adult(dob: date) -> bool:
    """Whole-years age from a date of birth, evaluated as of today (UTC)."""
    today = _now().date()
    years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return years >= MINIMUM_AGE


# ─── Models ───────────────────────────────────────────────────
# Free-tier coins every new user starts with, to learn how Anonixx works
# before paying anything: ~100 drops (10 each) or 20 unlocks (50 each), or
# any mix. Once it's spent, topping up via M-Pesa/Stripe/PayPal is the only
# way to keep going. NOT withdrawable — see WITHDRAWABLE_REASONS in
# utils/coin_service.py; only earned reward coins can be cashed out.
WELCOME_BONUS = 1000

class RegisterRequest(BaseModel):
    email:         EmailStr
    password:      str
    username:      Optional[str] = None
    referral_code: Optional[str] = None   # Optional referral code during signup
    date_of_birth: date                   # Anonixx is 18+ only — enforced at registration

class LoginRequest(BaseModel):
    email:    EmailStr
    password: str

class UpdateGenderRequest(BaseModel):
    gender: str  # 'male' | 'female' | 'nonbinary' | 'prefer_not_to_say'

class UpdateProfileRequest(BaseModel):
    username:       Optional[str]     = None
    email:          Optional[EmailStr]= None
    anonymous_name: Optional[str]     = None
    avatar_url:     Optional[str]     = None   # Cloudinary URL for real photo

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
    age_verified:            bool = False


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

_NAME_ADJECTIVES = [
    "Quiet", "Gentle", "Brave", "Kind", "Thoughtful", "Peaceful",
    "Calm", "Hopeful", "Strong", "Soft", "Wise", "Warm",
]
_NAME_NOUNS = [
    "Soul", "Heart", "Spirit", "Mind", "Voice", "Light",
    "Star", "Moon", "Sky", "Dream", "Hope", "Dawn",
]


def generate_anonymous_name() -> str:
    return f"{random.choice(_NAME_ADJECTIVES)} {random.choice(_NAME_NOUNS)} {random.randint(100, 999)}"


async def generate_unique_anonymous_name(db, attempts: int = 12) -> str:
    """Anonymous name that isn't already taken.

    The pool is only 12 x 12 x 900 = 129,600 names, so by the birthday
    paradox duplicates become likely at a few hundred users — and a shared
    name means one person's profile can resolve to another's. Retry a few
    times, then widen the number range so this can't fail outright.
    """
    for _ in range(attempts):
        name = generate_anonymous_name()
        if not await db["users"].find_one({"anonymous_name": name}, {"_id": 1}):
            return name
    # Pool is crowded — fall back to a wider suffix rather than risk a clash.
    while True:
        name = (
            f"{random.choice(_NAME_ADJECTIVES)} {random.choice(_NAME_NOUNS)} "
            f"{random.randint(1000, 999999)}"
        )
        if not await db["users"].find_one({"anonymous_name": name}, {"_id": 1}):
            return name


# ─── Endpoints ────────────────────────────────────────────────
@router.post("/register", response_model=TokenResponse)
async def register(data: RegisterRequest, db=Depends(get_database)):
    if await db["users"].find_one({"email": data.email}):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    if not _is_adult(data.date_of_birth):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Anonixx is for adults 18+")

    # The username someone picks at signup IS their public anonymous name —
    # there's no separate identity-setup step anymore, so this is the only
    # chance to enforce the same rules update_profile applies to a later
    # anonymous_name change (format, profanity, case-insensitive uniqueness
    # against both fields, since the two are the same value from here on).
    chosen_name = (data.username or "").strip()
    if chosen_name:
        if not _ANON_NAME_RE.match(chosen_name):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Username must be 3–30 characters — letters, numbers, dots, hyphens, underscores or emoji only",
            )
        if _contains_profanity(chosen_name):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="That username isn't allowed. Try something else.")
        name_clash = await db["users"].find_one({
            "$or": [
                {"username":       {"$regex": f"^{re.escape(chosen_name)}$", "$options": "i"}},
                {"anonymous_name": {"$regex": f"^{re.escape(chosen_name)}$", "$options": "i"}},
            ]
        })
        if name_clash:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="That username is already taken")
        anonymous_name = chosen_name
    else:
        # No username supplied (shouldn't happen via SignUpScreen, which
        # requires one) — fall back to a random pseudonym as before.
        anonymous_name = await generate_unique_anonymous_name(db)

    user_id = ObjectId()
    user = {
        "_id":            user_id,
        "email":          data.email,
        "username":       chosen_name or data.email.split("@")[0],
        "password":       get_password_hash(data.password),
        "anonymous_name": anonymous_name,
        "interests":      [],
        "coin_balance":   0,          # Start at 0; welcome bonus credited below
        "streak_count":   0,
        "date_of_birth":  data.date_of_birth.isoformat(),
        "age_verified":   True,       # DOB above already proves 18+ at this point
        "blocked_user_ids": [],
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
            "avatar_url":     user.get("avatar_url"),
            "is_admin":       user.get("is_admin", False),
            "coin_balance":   WELCOME_BONUS,
            "age_verified":            user.get("age_verified", False),
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
            "avatar_url":     user.get("avatar_url"),
            "is_admin":       user.get("is_admin", False),
            "age_verified":            user.get("age_verified", False),
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
            "avatar_url":     user.get("avatar_url"),
            "is_admin":       user.get("is_admin", False),
            "age_verified":            user.get("age_verified", False),
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
        "age_verified":            user.get("age_verified", False),
    }


# ─── Anonymous name helpers ───────────────────────────────────
# Letters/numbers/./-/_ plus common emoji ranges (pictographs, misc symbols,
# dingbats, flags) and the joiner/variation-selector code points that make
# compound emoji (e.g. flags, skin tones) render as one glyph.
_ANON_NAME_RE = re.compile(
    r'^[a-zA-Z0-9._\-'
    r'\U0001F300-\U0001FAFF'   # symbols & pictographs (incl. extended-A)
    r'\U00002600-\U000027BF'   # misc symbols & dingbats
    r'\U0001F1E6-\U0001F1FF'   # regional indicators (flag emoji)
    r'\U0000FE0F\U0000200D'    # variation selector-16 + zero-width joiner
    r']{3,30}$'
)

_PROFANITY_BLOCKLIST = {
    "nigger","nigga","faggot","chink","spic","kike","retard",
    "cunt","whore","bitch","slut","rape","penis","vagina","porn",
    "sex","naked","nude","ass","fuck","shit","damn","cock","dick",
}

def _contains_profanity(name: str) -> bool:
    lower = name.lower()
    return any(word in lower for word in _PROFANITY_BLOCKLIST)

NAME_CHANGE_COOLDOWN_DAYS = 30


@router.get("/check-name")
async def check_anonymous_name(
    name: str,
    current_user_id: str = Depends(get_current_user_id),
    db=Depends(get_database),
):
    """Real-time availability check for anonymous names (used in onboarding + profile edit)."""
    name = name.strip()
    if not name:
        return {"available": False, "reason": "empty"}

    if not _ANON_NAME_RE.match(name):
        return {
            "available": False,
            "reason":    "invalid",
            "message":   "3–30 chars · letters, numbers, dots, hyphens or emoji",
        }

    if _contains_profanity(name):
        return {"available": False, "reason": "profanity", "message": "That name isn't allowed"}

    existing = await db["users"].find_one(
        {
            "anonymous_name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
            "_id": {"$ne": ObjectId(current_user_id)},
        }
    )
    return {"available": existing is None}


@router.put("/update-profile")
async def update_profile(
    data: UpdateProfileRequest,
    current_user_id: str = Depends(get_current_user_id),
    db=Depends(get_database),
):
    """
    Unified profile update.
    Handles username, email, anonymous_name (with cooldown + uniqueness),
    avatar_url (real photo), and preset avatar emoji/color.
    """
    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    update: dict = {}

    # ── Username ──────────────────────────────────────────────
    if data.username is not None:
        uname = data.username.strip()
        if not re.match(r'^[a-zA-Z0-9_]{3,30}$', uname):
            raise HTTPException(400, detail="Username must be 3–30 chars, letters/numbers/underscores only")
        clash = await db["users"].find_one(
            {"username": uname, "_id": {"$ne": ObjectId(current_user_id)}}
        )
        if clash:
            raise HTTPException(400, detail="Username already taken")
        update["username"] = uname

    # ── Email ─────────────────────────────────────────────────
    if data.email is not None:
        new_email = str(data.email).strip().lower()
        clash = await db["users"].find_one(
            {"email": new_email, "_id": {"$ne": ObjectId(current_user_id)}}
        )
        if clash:
            raise HTTPException(400, detail="Email already in use by another account")
        update["email"] = new_email

    # ── Anonymous name ────────────────────────────────────────
    if data.anonymous_name is not None:
        aname = data.anonymous_name.strip()
        if not _ANON_NAME_RE.match(aname):
            raise HTTPException(400, detail="Name must be 3–30 chars. Letters, numbers, dots, hyphens or emoji.")
        if _contains_profanity(aname):
            raise HTTPException(400, detail="That name isn't allowed. Try something else.")

        # 30-day cooldown (skip on first-time set)
        changed_at = user.get("anonymous_name_changed_at")
        if changed_at and user.get("anonymous_name") != generate_anonymous_name.__doc__:
            if isinstance(changed_at, str):
                changed_at = datetime.fromisoformat(changed_at)
            if getattr(changed_at, "tzinfo", None) is None:
                changed_at = changed_at.replace(tzinfo=timezone.utc)
            elapsed = _now() - changed_at
            if elapsed < timedelta(days=NAME_CHANGE_COOLDOWN_DAYS):
                days_left = NAME_CHANGE_COOLDOWN_DAYS - elapsed.days
                raise HTTPException(
                    400,
                    detail=f"You can change your name again in {days_left} day{'s' if days_left != 1 else ''}."
                )

        clash = await db["users"].find_one(
            {
                "anonymous_name": {"$regex": f"^{re.escape(aname)}$", "$options": "i"},
                "_id": {"$ne": ObjectId(current_user_id)},
            }
        )
        if clash:
            raise HTTPException(400, detail="That name is taken. Try something different.")

        update["anonymous_name"]            = aname
        update["anonymous_name_changed_at"] = _now()

    # ── Profile photo (Cloudinary URL) ───────────────────────
    if data.avatar_url is not None:
        update["avatar_url"] = data.avatar_url

    if not update:
        return {"message": "Nothing to update"}

    update["updated_at"] = _now()
    await db["users"].update_one({"_id": ObjectId(current_user_id)}, {"$set": update})

    refreshed = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    return {
        "username":       refreshed.get("username"),
        "email":          refreshed.get("email"),
        "anonymous_name": refreshed.get("anonymous_name"),
        "avatar_url":     refreshed.get("avatar_url"),
    }




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
