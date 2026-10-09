from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.jwt import decode_token
from app.database import get_database
from bson import ObjectId
from app.config import settings


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
        payload = decode_token(token)

        if not payload:
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

        if not user.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account has been suspended."
            )

        return user_id

    except HTTPException:
        raise
    except Exception as e:
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


def is_super_admin_user(user: dict) -> bool:
    emails = {e.strip().lower() for e in settings.SUPER_ADMIN_EMAILS.split(",") if e.strip()}
    return bool(user.get("is_admin")) and (user.get("email") or "").lower() in emails


async def require_super_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db = Depends(get_database),
) -> str:
    """Authenticate + verify super admin (is_admin and email in SUPER_ADMIN_EMAILS)."""
    user_id = await require_admin(credentials, db)
    user = await db["users"].find_one({"_id": ObjectId(user_id)}, {"email": 1, "is_admin": 1})
    if not user or not is_super_admin_user(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Super admin access required")
    return user_id


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
        if not payload:
            return None

        user_id = payload.get("sub")
        if not user_id:
            return None

        # Verify user exists
        user = await db["users"].find_one({"_id": ObjectId(user_id)})
        if not user:
            return None

        return user_id

    except Exception:
        # Any error - treat as guest
        return None