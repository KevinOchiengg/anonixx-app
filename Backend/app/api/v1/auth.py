from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from bson import ObjectId

from app.database import get_database
from app.config import settings
from app.dependencies import get_current_user_id

# Router
router = APIRouter(prefix="/auth", tags=["Authentication"])

# Password hashing - UPDATED TO ARGON2
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

# OAuth2
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/token")


# ==================== REQUEST/RESPONSE MODELS ====================

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    username: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict


class UserResponse(BaseModel):
    id: str
    email: str
    username: Optional[str]
    anonymous_name: Optional[str]
    created_at: str


# ==================== HELPER FUNCTIONS ====================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password - truncate to 72 bytes for bcrypt compatibility"""
    # Bcrypt has a 72-byte limit
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash password - truncate to 72 bytes for bcrypt compatibility"""
    # Bcrypt has a 72-byte limit, so truncate if necessary
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT token"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=30)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")
    
    return encoded_jwt


def generate_anonymous_name() -> str:
    """Generate random anonymous name"""
    import random
    
    adjectives = [
        "Quiet", "Gentle", "Brave", "Kind", "Thoughtful", "Peaceful",
        "Calm", "Hopeful", "Strong", "Soft", "Wise", "Warm"
    ]
    
    nouns = [
        "Soul", "Heart", "Spirit", "Mind", "Voice", "Light",
        "Star", "Moon", "Sky", "Dream", "Hope", "Dawn"
    ]
    
    number = random.randint(100, 999)
    
    return f"{random.choice(adjectives)} {random.choice(nouns)} {number}"


# ==================== ENDPOINTS ====================

@router.post("/register", response_model=TokenResponse)
async def register(
    data: RegisterRequest,
    db = Depends(get_database)
):
    """Register a new user"""
    
    print(f"🔵 Registration attempt: {data.email}")
    
    # Check if user already exists
    existing_user = await db["users"].find_one({"email": data.email})
    
    if existing_user:
        print(f"❌ User already exists: {data.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create user
    user = {
        "_id": ObjectId(),
        "email": data.email,
        "username": data.username or data.email.split("@")[0],
        "password": get_password_hash(data.password),
        "anonymous_name": generate_anonymous_name(),
        "interests": [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    await db["users"].insert_one(user)
    
    print(f"✅ User registered: {data.email}")
    
    # Create token
    access_token = create_access_token(data={"sub": str(user["_id"])})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user["_id"]),
            "email": user["email"],
            "username": user["username"],
            "anonymous_name": user["anonymous_name"]
        }
    }


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    db = Depends(get_database)
):
    """Login user"""
    
    print(f"🔵 Login attempt: {data.email}")
    
    # Find user
    user = await db["users"].find_one({"email": data.email})
    
    if not user:
        print(f"❌ User not found: {data.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Check if user has password field (for legacy users)
    if "password" not in user:
        print(f"❌ User {data.email} has no password field - legacy user")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account needs to be migrated. Please register again or contact support."
        )
    
    # Verify password
    if not verify_password(data.password, user["password"]):
        print(f"❌ Invalid password: {data.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    print(f"✅ User logged in: {data.email}")
    
    # Create token
    access_token = create_access_token(data={"sub": str(user["_id"])})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user["_id"]),
            "email": user["email"],
            "username": user.get("username"),
            "anonymous_name": user.get("anonymous_name")
        }
    }


@router.post("/token", response_model=TokenResponse)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db = Depends(get_database)
):
    """OAuth2 compatible token login (for docs)"""
    
    # Find user
    user = await db["users"].find_one({"email": form_data.username})
    
    if not user or not verify_password(form_data.password, user.get("password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create token
    access_token = create_access_token(data={"sub": str(user["_id"])})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user["_id"]),
            "email": user["email"],
            "username": user.get("username"),
            "anonymous_name": user.get("anonymous_name")
        }
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get current user info"""
    
    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "username": user.get("username"),
        "anonymous_name": user.get("anonymous_name"),
        "created_at": user["created_at"].isoformat()
    }


@router.post("/logout")
async def logout(
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Logout endpoint
    In a stateless JWT system, logout is handled client-side by removing the token.
    This endpoint is for logging purposes.
    """
    print(f"🔴 User {current_user_id} logged out")
    
    return {
        "message": "Logged out successfully",
        "status": "success"
    }