from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId

from app.database import get_database
from app.dependencies import require_admin
from app.utils.coin_service import credit_coins

router = APIRouter(prefix="/admin", tags=["Admin"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Request Models ───────────────────────────────────────────

class CoinAdjustRequest(BaseModel):
    amount: int   # positive = credit, negative = debit
    reason: str


# ─── Stats ────────────────────────────────────────────────────

@router.get("/stats", summary="Platform overview — users, content, revenue")
async def get_stats(
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    now             = _now()
    thirty_days_ago = now - timedelta(days=30)
    today_start     = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_users    = await db["users"].count_documents({})
    active_users   = await db["users"].count_documents({"last_login": {"$gte": thirty_days_ago}})
    banned_users   = await db["users"].count_documents({"is_active": False})
    verified_users = await db["users"].count_documents({"is_verified": True})
    premium_users  = await db["users"].count_documents({"is_premium": True})
    admin_count    = await db["users"].count_documents({"is_admin": True})

    total_posts  = await db["posts"].count_documents({})
    posts_today  = await db["posts"].count_documents({"created_at": {"$gte": today_start}})

    collections = await db.list_collection_names()
    total_drops = await db["drops"].count_documents({}) if "drops" in collections else 0

    total_revenue = 0.0
    if "payments" in collections:
        async for p in db["payments"].find({"status": "completed"}, {"amount": 1}):
            total_revenue += float(p.get("amount", 0))

    total_coin_txns = await db["coin_transactions"].count_documents({}) if "coin_transactions" in collections else 0

    return {
        "users": {
            "total":            total_users,
            "active_last_30d":  active_users,
            "banned":           banned_users,
            "verified":         verified_users,
            "premium":          premium_users,
            "admins":           admin_count,
        },
        "content": {
            "total_posts": total_posts,
            "posts_today": posts_today,
            "total_drops": total_drops,
        },
        "financials": {
            "total_revenue_usd":       round(total_revenue, 2),
            "total_coin_transactions": total_coin_txns,
        },
    }


# ─── User Management ──────────────────────────────────────────

@router.get("/users", summary="List users — paginated, searchable")
async def list_users(
    skip:   int            = Query(0,  ge=0),
    limit:  int            = Query(20, ge=1, le=100),
    search: Optional[str]  = Query(None, description="Filter by email, username, or anonymous name"),
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    query = {}
    if search:
        query["$or"] = [
            {"email":          {"$regex": search, "$options": "i"}},
            {"username":       {"$regex": search, "$options": "i"}},
            {"anonymous_name": {"$regex": search, "$options": "i"}},
        ]

    total  = await db["users"].count_documents(query)
    cursor = db["users"].find(query, {"password": 0}).sort("created_at", -1).skip(skip).limit(limit)

    users = []
    async for u in cursor:
        users.append({
            "id":             str(u["_id"]),
            "email":          u.get("email"),
            "username":       u.get("username"),
            "anonymous_name": u.get("anonymous_name"),
            "is_active":      u.get("is_active", True),
            "is_admin":       u.get("is_admin", False),
            "is_verified":    u.get("is_verified", False),
            "is_premium":     u.get("is_premium", False),
            "coin_balance":   u.get("coin_balance", 0),
            "created_at":     u["created_at"].isoformat() if u.get("created_at") else None,
            "last_login":     u["last_login"].isoformat() if u.get("last_login") else None,
        })

    return {"total": total, "skip": skip, "limit": limit, "users": users}


@router.get("/users/{user_id}", summary="Full user profile + activity summary")
async def get_user(
    user_id: str,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID")

    user = await db["users"].find_one({"_id": oid}, {"password": 0})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    collections  = await db.list_collection_names()
    post_count   = await db["posts"].count_documents({"user_id": user_id})
    report_count = await db["reports"].count_documents({"reported_user_id": user_id}) if "reports" in collections else 0

    return {
        "id":             str(user["_id"]),
        "email":          user.get("email"),
        "username":       user.get("username"),
        "anonymous_name": user.get("anonymous_name"),
        "display_name":   user.get("display_name"),
        "bio":            user.get("bio"),
        "gender":         user.get("gender"),
        "interests":      user.get("interests", []),
        "is_active":      user.get("is_active", True),
        "is_admin":       user.get("is_admin", False),
        "is_verified":    user.get("is_verified", False),
        "is_premium":     user.get("is_premium", False),
        "coin_balance":   user.get("coin_balance", 0),
        "created_at":     user["created_at"].isoformat() if user.get("created_at") else None,
        "last_login":     user["last_login"].isoformat() if user.get("last_login") else None,
        "post_count":     post_count,
        "report_count":   report_count,
    }


@router.patch("/users/{user_id}/ban", summary="Toggle ban — sets is_active false/true")
async def toggle_ban(
    user_id:  str,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    if user_id == admin_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot ban yourself")

    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID")

    user = await db["users"].find_one({"_id": oid}, {"is_active": 1})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    new_status = not user.get("is_active", True)
    await db["users"].update_one(
        {"_id": oid},
        {"$set": {"is_active": new_status, "updated_at": _now()}},
    )
    return {
        "user_id":  user_id,
        "is_active": new_status,
        "action":    "unbanned" if new_status else "banned",
    }


@router.patch("/users/{user_id}/verify", summary="Toggle verified badge")
async def toggle_verify(
    user_id:  str,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID")

    user = await db["users"].find_one({"_id": oid}, {"is_verified": 1})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    new_status = not user.get("is_verified", False)
    await db["users"].update_one(
        {"_id": oid},
        {"$set": {"is_verified": new_status, "updated_at": _now()}},
    )
    return {"user_id": user_id, "is_verified": new_status}


@router.patch("/users/{user_id}/admin", summary="Grant or revoke admin role")
async def toggle_admin_role(
    user_id:  str,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    if user_id == admin_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot modify your own admin status")

    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID")

    user = await db["users"].find_one({"_id": oid}, {"is_admin": 1})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    new_status = not user.get("is_admin", False)
    await db["users"].update_one(
        {"_id": oid},
        {"$set": {"is_admin": new_status, "updated_at": _now()}},
    )
    return {"user_id": user_id, "is_admin": new_status}


@router.post("/users/{user_id}/coins", summary="Manually credit or debit coins (positive = credit, negative = debit)")
async def adjust_coins(
    user_id:  str,
    data:     CoinAdjustRequest,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    if data.amount == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Amount cannot be zero")

    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID")

    user = await db["users"].find_one({"_id": oid}, {"coin_balance": 1})
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    if data.amount > 0:
        await credit_coins(db, user_id, data.amount, "admin_adjustment", data.reason)
    else:
        result = await db["users"].find_one_and_update(
            {"_id": oid, "coin_balance": {"$gte": abs(data.amount)}},
            {"$inc": {"coin_balance": data.amount}},
            return_document=True,
            projection={"coin_balance": 1},
        )
        if not result:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Insufficient balance. User has {user.get('coin_balance', 0)} coins.",
            )
        await db["coin_transactions"].insert_one({
            "user_id":     user_id,
            "amount":      data.amount,
            "type":        "admin_adjustment",
            "description": data.reason,
            "created_at":  _now(),
        })

    updated = await db["users"].find_one({"_id": oid}, {"coin_balance": 1})
    return {
        "user_id":     user_id,
        "adjustment":  data.amount,
        "new_balance": updated.get("coin_balance", 0),
    }


# ─── Content Moderation ───────────────────────────────────────

@router.get("/posts", summary="List all posts — newest first")
async def list_posts(
    skip:     int = Query(0,  ge=0),
    limit:    int = Query(20, ge=1, le=100),
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    total  = await db["posts"].count_documents({})
    cursor = db["posts"].find({}).sort("created_at", -1).skip(skip).limit(limit)

    posts = []
    async for p in cursor:
        posts.append({
            "id":           str(p["_id"]),
            "user_id":      p.get("user_id"),
            "content":      (p.get("content") or "")[:200],
            "is_anonymous": p.get("is_anonymous", True),
            "media_urls":   p.get("media_urls", []),
            "likes_count":  p.get("likes_count", 0),
            "created_at":   p["created_at"].isoformat() if p.get("created_at") else None,
            "edited_at":    p["edited_at"].isoformat() if p.get("edited_at") else None,
        })

    return {"total": total, "skip": skip, "limit": limit, "posts": posts}


@router.delete("/posts/{post_id}", summary="Force-delete any post (admin override, cascades)")
async def force_delete_post(
    post_id:  str,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    try:
        oid = ObjectId(post_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid post ID")

    result = await db["posts"].delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")

    await db["post_threads"].delete_many({"post_id": post_id})
    await db["threads"].delete_many({"post_id": oid})
    await db["saved_posts"].delete_many({"post_id": post_id})
    await db["post_views"].delete_many({"post_id": oid})

    return {"deleted": post_id}


# ─── Revenue ──────────────────────────────────────────────────

@router.get("/revenue", summary="Revenue breakdown by payment method")
async def get_revenue(
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    collections = await db.list_collection_names()
    if "payments" not in collections:
        return {"total_usd": 0.0, "by_method": {}}

    pipeline = [
        {"$match": {"status": "completed"}},
        {"$group": {
            "_id":   "$payment_method",
            "total": {"$sum": "$amount"},
            "count": {"$sum": 1},
        }},
    ]

    breakdown = {}
    total = 0.0
    async for row in db["payments"].aggregate(pipeline):
        method = row["_id"] or "unknown"
        breakdown[method] = {
            "total_usd": round(float(row["total"]), 2),
            "count":     row["count"],
        }
        total += float(row["total"])

    return {"total_usd": round(total, 2), "by_method": breakdown}


# ─── Coin Transactions ────────────────────────────────────────

@router.get("/coins/transactions", summary="Recent coin transactions — all users")
async def list_coin_transactions(
    skip:     int = Query(0,  ge=0),
    limit:    int = Query(20, ge=1, le=100),
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    collections = await db.list_collection_names()
    if "coin_transactions" not in collections:
        return {"total": 0, "transactions": []}

    total  = await db["coin_transactions"].count_documents({})
    cursor = db["coin_transactions"].find({}).sort("created_at", -1).skip(skip).limit(limit)

    txns = []
    async for t in cursor:
        txns.append({
            "id":          str(t["_id"]),
            "user_id":     t.get("user_id"),
            "amount":      t.get("amount"),
            "type":        t.get("type"),
            "description": t.get("description"),
            "created_at":  t["created_at"].isoformat() if t.get("created_at") else None,
        })

    return {"total": total, "skip": skip, "limit": limit, "transactions": txns}


# ─── Bootstrap ────────────────────────────────────────────────

@router.post(
    "/bootstrap",
    summary="Promote a user to the first admin — only works when zero admins exist",
    description=(
        "One-time operation. Pass the `user_id` of the account you want to make admin. "
        "Once an admin exists this endpoint permanently returns 403 — "
        "use `PATCH /admin/users/{id}/admin` to promote additional admins."
    ),
)
async def bootstrap_admin(
    user_id: str,
    db=Depends(get_database),
):
    admin_count = await db["users"].count_documents({"is_admin": True})
    if admin_count > 0:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "An admin already exists. Bootstrap is disabled.",
        )

    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID")

    result = await db["users"].update_one(
        {"_id": oid},
        {"$set": {"is_admin": True, "updated_at": _now()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    return {"message": "First admin created.", "user_id": user_id}
