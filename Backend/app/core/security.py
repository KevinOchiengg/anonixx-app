from passlib.context import CryptContext
import secrets
from datetime import datetime, timedelta
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId  # ← ADDED THIS
from app.config import settings
from app.database import get_database

# Argon2 for password hashing
pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto",
    argon2__rounds=4
)

security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def generate_anonymous_name() -> str:
    adjectives = ["Silent", "Mystic", "Shadow", "Cosmic", "Electric", "Neon", "Crystal", "Hidden", "Secret", "Ghost"]
    nouns = ["Fox", "Wolf", "Eagle", "Phoenix", "Dragon", "Tiger", "Owl", "Raven", "Falcon", "Hawk"]
    number = secrets.randbelow(9999)
    return f"{secrets.choice(adjectives)}{secrets.choice(nouns)}{number}"


def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Dependency to get current authenticated user from JWT token
    """
    print("=" * 50)
    print("🔍 DEBUG: get_current_user called")
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        token = credentials.credentials
        print(f"🔑 Token received: {token[:30]}...")
        
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        print(f"✅ Token decoded successfully")
        
        user_id: str = payload.get("sub")
        print(f"👤 User ID from token: {user_id}")
        
        if user_id is None:
            print("❌ No user_id in token!")
            raise credentials_exception
            
    except JWTError as e:
        print(f"❌ JWT decode error: {e}")
        raise credentials_exception
    
    # Get user from database
    print(f"📡 Fetching user from database...")
    db = await get_database()
    
    # ← FIXED: Convert string ID to ObjectId for MongoDB query
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception as e:
        print(f"⚠️ Could not convert to ObjectId, trying as string: {e}")
        user = await db.users.find_one({"_id": user_id})
    
    if user is None:
        print(f"❌ User not found in database: {user_id}")
        raise credentials_exception
    
    print(f"✅ User found in DB!")
    print(f"📧 Email: {user.get('email')}")
    print(f"💰 Coins: {user.get('coin_balance')}")
    print(f"📦 Full user data: {user}")
    
    # Convert to User object
    print(f"🔄 Converting to User object...")
    try:
        from app.models.user import User
        
        # ← FIXED: Convert ObjectId to string for Pydantic
        user["_id"] = str(user["_id"])
        
        user_obj = User(**user)
        print(f"✅ User object created successfully!")
        print(f"✅ User ID: {user_obj.id}")
        print(f"✅ User email: {user_obj.email}")
        print(f"✅ User coins: {user_obj.coin_balance}")
        print("=" * 50)
        return user_obj
        
    except Exception as e:
        print(f"❌ ERROR creating User object!")
        print(f"❌ Error type: {type(e).__name__}")
        print(f"❌ Error message: {str(e)}")
        print(f"❌ Full error: {repr(e)}")
        print(f"📦 User data that failed: {user}")
        print("=" * 50)
        
        # Return more detailed error
        raise HTTPException(
            status_code=403, 
            detail=f"User validation error: {str(e)}"
        )