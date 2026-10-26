import asyncio
from datetime import datetime, timezone
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

        mark_active(db, user_id)
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


# ─── Daily activity (retention) ─────────────────────────────────
# One row per user per UTC day they used the app (any signed-in request), in
# `user_activity_days`. It's what the retention table on the admin dashboard
# counts. Written in the background, once per user per day per server process.
_seen_today: set = set()
_seen_day = ""


def mark_active(db, user_id: str) -> None:
    global _seen_day
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if day != _seen_day:
        _seen_today.clear()
        _seen_day = day
    key = (user_id, day)
    if key in _seen_today:
        return
    _seen_today.add(key)

    async def _write():
        try:
            await db["user_activity_days"].update_one(
                {"_id": f"{user_id}:{day}"},
                {"$setOnInsert": {"user_id": user_id, "day": day, "created_at": datetime.now(timezone.utc)}},
                upsert=True,
            )
        except Exception:
            _seen_today.discard(key)
    try:
        asyncio.get_running_loop().create_task(_write())
    except RuntimeError:
        pass


# ─── Admin roles ─────────────────────────────────────────────────
# users.admin_role narrows what an admin may do. Missing = "admin" (everything a
# non-super admin could always do), so existing admins keep their access.
# Super admins can do everything regardless of role.
ADMIN_ROLES = {
    "admin":     {"*"},
    "moderator": {"moderation", "support"},
    "finance":   {"finance", "support"},
    "content":   {"content"},
}


def admin_scopes(user: dict) -> set:
    if is_super_admin_user(user):
        return {"*"}
    return ADMIN_ROLES.get(user.get("admin_role") or "admin", ADMIN_ROLES["admin"])


def require_scope(scope: str):
    """Dependency factory: an admin whose role covers `scope` (or a super admin)."""
    async def dep(
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db = Depends(get_database),
    ) -> str:
        user_id = await require_admin(credentials, db)
        user = await db["users"].find_one({"_id": ObjectId(user_id)}, {"email": 1, "is_admin": 1, "admin_role": 1})
        scopes = admin_scopes(user or {})
        if "*" not in scopes and scope not in scopes:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your admin role doesn't cover this.")
        return user_id
    return dep


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