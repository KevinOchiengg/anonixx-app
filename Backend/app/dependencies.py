from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.jwt import decode_token
from app.database import get_database
from bson import ObjectId


# Required authentication
security = HTTPBearer()

# Optional authentication (doesn't error if no token)
security_optional = HTTPBearer(auto_error=False)


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db = Depends(get_database)
) -> str:
    """Get current user ID - REQUIRED authentication"""
    try:
        token = credentials.credentials
        print(f"🔍 Auth - Token received: {token[:30]}...")
        
        payload = decode_token(token)
        print(f"🔍 Auth - Payload: {payload}")
        
        # ✅ REMOVE type check - it might not exist in your tokens
        if not payload:
            print(f"❌ Auth - Payload is None")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials"
            )
        
        user_id = payload.get("sub")
        print(f"🔍 Auth - User ID from token: {user_id}")
        
        if not user_id:
            print(f"❌ Auth - No user_id in payload")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )
        
        user = await db["users"].find_one({"_id": ObjectId(user_id)})
        print(f"🔍 Auth - User found: {user is not None}")
        
        if not user:
            print(f"❌ Auth - User not found in database")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        print(f"✅ Auth - Success for user: {user.get('username')}")
        return user_id
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Auth - Exception: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )


async def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db = Depends(get_database),
) -> str:
    """Authenticate + verify is_admin=True. Returns user_id."""
    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub") if payload else None
        if not user_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

        user = await db["users"].find_one(
            {"_id": ObjectId(user_id)},
            {"is_admin": 1, "is_active": 1},
        )
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        if not user.get("is_admin"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")

        return user_id

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication failed")


async def get_optional_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_optional),
    db = Depends(get_database)
) -> Optional[str]:
    """Get user ID if token exists, None otherwise - OPTIONAL authentication"""
    
    # No credentials provided (guest user)
    if not credentials:
        print("🔍 Optional auth - No credentials (guest)")
        return None
    
    try:
        token = credentials.credentials
        print(f"🔍 Optional auth - Token: {token[:30]}...")
        
        payload = decode_token(token)
        print(f"🔍 Optional auth - Payload: {payload}")
        
        # Invalid token - treat as guest
        if not payload:
            print("⚠️ Optional auth - Invalid payload, treating as guest")
            return None
        
        user_id = payload.get("sub")
        if not user_id:
            print("⚠️ Optional auth - No user_id, treating as guest")
            return None
        
        # Verify user exists
        user = await db["users"].find_one({"_id": ObjectId(user_id)})
        if not user:
            print(f"⚠️ Optional auth - User {user_id} not found, treating as guest")
            return None
        
        print(f"✅ Optional auth - User authenticated: {user.get('username')}")
        return user_id
    
    except Exception as e:
        # Any error - treat as guest
        print(f"⚠️ Optional auth error: {e}")
        return None