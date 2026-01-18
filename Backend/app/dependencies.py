from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.jwt import decode_token
from app.database import get_database
from bson import ObjectId


# Required authentication
security = HTTPBearer()

# ✅ NEW: Optional authentication (doesn't error if no token)
security_optional = HTTPBearer(auto_error=False)


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db = Depends(get_database)
) -> str:
    """Get current user ID - REQUIRED authentication"""
    token = credentials.credentials
    payload = decode_token(token)
    
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    
    user = await db["users"].find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    return user_id


# ✅ NEW: Optional authentication dependency
async def get_optional_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_optional),
    db = Depends(get_database)
) -> Optional[str]:
    """Get user ID if token exists, None otherwise - OPTIONAL authentication"""
    
    # No credentials provided (guest user)
    if not credentials:
        return None
    
    try:
        token = credentials.credentials
        payload = decode_token(token)
        
        # Invalid token - treat as guest
        if not payload or payload.get("type") != "access":
            return None
        
        user_id = payload.get("sub")
        if not user_id:
            return None
        
        # Verify user exists
        user = await db["users"].find_one({"_id": ObjectId(user_id)})
        if not user:
            return None
        
        return user_id
    
    except Exception as e:
        # Any error - treat as guest
        print(f"⚠️ Optional auth error: {e}")
        return None