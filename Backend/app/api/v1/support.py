"""
Customer support — user<->admin chat and coin-purchase refund requests.

One conversation per user (support_messages.user_id). Any admin can reply;
refund decisions are super-admin only (they move money).
"""
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.database import get_database
from app.dependencies import get_current_user_id, require_admin, require_super_admin
from app.utils.coin_service import debit_coins
from app.utils.notifications import send_push_notification

router = APIRouter(tags=["Support"])

MAX_MESSAGE_LEN = 1000


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: Optional[datetime]) -> Optional[str]:
    return d.isoformat() if d else None


class MessageBody(BaseModel):
    text: str


class RefundRequestBody(BaseModel):
    purchase_id: str
    reason: str


class RefundDecisionBody(BaseModel):
    note: Optional[str] = None


def _clean_text(text: str) -> str:
    text = (text or "").strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Message cannot be empty")
    if len(text) > MAX_MESSAGE_LEN:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Message must be {MAX_MESSAGE_LEN} characters or less")
    return text


def _serialize_message(m: dict) -> dict:
    return {
        "id":         str(m["_id"]),
        "sender":     m["sender"],
        "text":       m["text"],
        "created_at": _iso(m.get("created_at")),
    }


async def _post_message(db, user_id: str, sender: str, text: str, admin_id: Optional[str] = None) -> dict:
    doc = {
        "user_id":       user_id,
        "sender":        sender,
        "admin_id":      admin_id,
        "text":          text,
        "created_at":    _now(),
        "read_by_admin": sender == "admin",
        "read_by_user":  sender == "user",
    }
    res = await db["support_messages"].insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc


async def _notify_user(db, user_id: str, body: str) -> None:
    try:
        await send_push_notification(
            user_id, "new_message", db,
            extra_data={"type": "support_reply"},
            title_override="Anonixx Support",
            body_override=body[:120],
        )
    except Exception:
        pass


# ─── User side ────────────────────────────────────────────────

@router.get("/support/messages", summary="My support conversation")
async def my_messages(
    current_user_id: str = Depends(get_current_user_id),
    db=Depends(get_database),
):
    cursor = db["support_messages"].find({"user_id": current_user_id}).sort("created_at", 1).limit(500)
    messages = [_serialize_message(m) async for m in cursor]
    await db["support_messages"].update_many(
        {"user_id": current_user_id, "sender": "admin", "read_by_user": False},
        {"$set": {"read_by_user": True}},
    )
    return {"messages": messages}


@router.post("/support/messages", summary="Send a message to support")
async def send_my_message(
    data: MessageBody,
    current_user_id: str = Depends(get_current_user_id),
    db=Depends(get_database),
):
    doc = await _post_message(db, current_user_id, "user", _clean_text(data.text))
    return _serialize_message(doc)


@router.get("/support/refundable-purchases", summary="My completed coin purchases that can still be refunded")
async def refundable_purchases(
    current_user_id: str = Depends(get_current_user_id),
    db=Depends(get_database),
):
    cursor = db["coin_purchases"].find(
        {"user_id": current_user_id, "status": "completed", "refund_status": {"$exists": False}}
    ).sort("created_at", -1).limit(20)
    return {"purchases": [
        {
            "id":         str(p["_id"]),
            "coins":      p.get("coins", 0),
            "kes":        p.get("kes"),
            "created_at": _iso(p.get("created_at")),
        }
        async for p in cursor
    ]}


@router.post("/support/refund-requests", summary="Request a refund for a coin purchase")
async def create_refund_request(
    data: RefundRequestBody,
    current_user_id: str = Depends(get_current_user_id),
    db=Depends(get_database),
):
    reason = _clean_text(data.reason)
    try:
        pid = ObjectId(data.purchase_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid purchase")

    purchase = await db["coin_purchases"].find_one_and_update(
        {"_id": pid, "user_id": current_user_id, "status": "completed", "refund_status": {"$exists": False}},
        {"$set": {"refund_status": "requested"}},
    )
    if not purchase:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This purchase can't be refunded.")

    doc = {
        "user_id":     current_user_id,
        "purchase_id": str(pid),
        "coins":       purchase.get("coins", 0),
        "kes":         purchase.get("kes"),
        "reason":      reason,
        "status":      "pending",
        "created_at":  _now(),
    }
    res = await db["refund_requests"].insert_one(doc)
    await _post_message(
        db, current_user_id, "user",
        f"Refund request for {doc['coins']} coins: {reason}",
    )
    return {"id": str(res.inserted_id), "status": "pending"}


@router.get("/support/refund-requests", summary="My refund requests")
async def my_refund_requests(
    current_user_id: str = Depends(get_current_user_id),
    db=Depends(get_database),
):
    cursor = db["refund_requests"].find({"user_id": current_user_id}).sort("created_at", -1).limit(20)
    return {"requests": [
        {
            "id":         str(r["_id"]),
            "coins":      r.get("coins"),
            "reason":     r.get("reason"),
            "status":     r.get("status"),
            "created_at": _iso(r.get("created_at")),
        }
        async for r in cursor
    ]}


# ─── Admin: inbox ─────────────────────────────────────────────

@router.get("/admin/support/conversations", summary="Support inbox — latest message per user")
async def list_conversations(
    skip:  int = Query(0,  ge=0),
    limit: int = Query(30, ge=1, le=100),
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    pipeline = [
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id":     "$user_id",
            "last":    {"$first": "$$ROOT"},
            "unread":  {"$sum": {"$cond": [
                {"$and": [{"$eq": ["$sender", "user"]}, {"$eq": ["$read_by_admin", False]}]}, 1, 0,
            ]}},
        }},
        {"$sort": {"last.created_at": -1}},
        {"$skip": skip},
        {"$limit": limit},
    ]
    rows = [r async for r in db["support_messages"].aggregate(pipeline)]

    oids = []
    for r in rows:
        try:
            oids.append(ObjectId(r["_id"]))
        except Exception:
            pass
    users = {
        str(u["_id"]): u
        async for u in db["users"].find({"_id": {"$in": oids}}, {"anonymous_name": 1, "username": 1, "avatar_url": 1})
    }

    return {"conversations": [
        {
            "user_id":    r["_id"],
            "name":       (users.get(r["_id"]) or {}).get("anonymous_name") or (users.get(r["_id"]) or {}).get("username") or "Deleted user",
            "avatar_url": (users.get(r["_id"]) or {}).get("avatar_url"),
            "last_text":  r["last"]["text"],
            "last_sender": r["last"]["sender"],
            "last_at":    _iso(r["last"].get("created_at")),
            "unread":     r["unread"],
        }
        for r in rows
    ]}


@router.get("/admin/support/conversations/{user_id}/messages", summary="One user's support thread")
async def admin_get_thread(
    user_id: str,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    cursor = db["support_messages"].find({"user_id": user_id}).sort("created_at", 1).limit(500)
    messages = [_serialize_message(m) async for m in cursor]
    await db["support_messages"].update_many(
        {"user_id": user_id, "sender": "user", "read_by_admin": False},
        {"$set": {"read_by_admin": True}},
    )
    return {"messages": messages}


@router.post("/admin/support/conversations/{user_id}/messages", summary="Reply to a user as support")
async def admin_reply(
    user_id: str,
    data: MessageBody,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    try:
        exists = await db["users"].find_one({"_id": ObjectId(user_id)}, {"_id": 1})
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid user ID")
    if not exists:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    text = _clean_text(data.text)
    doc = await _post_message(db, user_id, "admin", text, admin_id=admin_id)
    await _notify_user(db, user_id, text)
    return _serialize_message(doc)


# ─── Admin: refunds ───────────────────────────────────────────

@router.get("/admin/refunds", summary="Refund requests")
async def list_refunds(
    status_filter: str = Query("pending", alias="status", pattern="^(pending|accepted|rejected|all)$"),
    skip:  int = Query(0,  ge=0),
    limit: int = Query(30, ge=1, le=100),
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    query = {} if status_filter == "all" else {"status": status_filter}
    total = await db["refund_requests"].count_documents(query)
    rows = [r async for r in db["refund_requests"].find(query).sort("created_at", -1).skip(skip).limit(limit)]

    oids = []
    for r in rows:
        try:
            oids.append(ObjectId(r["user_id"]))
        except Exception:
            pass
    users = {
        str(u["_id"]): u
        async for u in db["users"].find({"_id": {"$in": oids}}, {"anonymous_name": 1, "email": 1, "coin_balance": 1})
    }

    return {"total": total, "refunds": [
        {
            "id":           str(r["_id"]),
            "user_id":      r["user_id"],
            "user_name":    (users.get(r["user_id"]) or {}).get("anonymous_name"),
            "user_email":   (users.get(r["user_id"]) or {}).get("email"),
            "user_balance": (users.get(r["user_id"]) or {}).get("coin_balance", 0),
            "coins":        r.get("coins"),
            "kes":          r.get("kes"),
            "reason":       r.get("reason"),
            "status":       r.get("status"),
            "note":         r.get("note"),
            "created_at":   _iso(r.get("created_at")),
        }
        for r in rows
    ]}


async def _decide_refund(db, refund_id: str, admin_id: str, new_status: str, note: Optional[str]) -> dict:
    try:
        rid = ObjectId(refund_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid refund ID")

    refund = await db["refund_requests"].find_one_and_update(
        {"_id": rid, "status": "pending"},
        {"$set": {
            "status": new_status, "note": (note or "").strip() or None,
            "decided_by": admin_id, "decided_at": _now(),
        }},
    )
    if not refund:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pending refund request not found")
    return refund


@router.post("/admin/refunds/{refund_id}/accept", summary="Accept a refund (super admin) — claws back the purchased coins")
async def accept_refund(
    refund_id: str,
    data: RefundDecisionBody,
    admin_id: str = Depends(require_super_admin),
    db=Depends(get_database),
):
    refund = await _decide_refund(db, refund_id, admin_id, "accepted", data.note)
    user_id = refund["user_id"]

    # The coins may already be spent — claw back whatever of them remains.
    user = await db["users"].find_one({"_id": ObjectId(user_id)}, {"coin_balance": 1})
    clawback = min(int(refund.get("coins") or 0), int((user or {}).get("coin_balance", 0)))
    if clawback > 0:
        try:
            await debit_coins(
                db, user_id, clawback, "refund_clawback",
                "Coins removed — purchase refunded",
                meta={"refund_id": refund_id},
            )
        except ValueError:
            clawback = 0

    await db["coin_purchases"].update_one(
        {"_id": ObjectId(refund["purchase_id"])}, {"$set": {"refund_status": "refunded"}}
    )
    await db["refund_requests"].update_one({"_id": refund["_id"]}, {"$set": {"coins_clawed_back": clawback}})

    msg = "Your refund request was approved. The money will be returned to your original payment method."
    await _post_message(db, user_id, "admin", msg, admin_id=admin_id)
    await _notify_user(db, user_id, msg)
    return {"id": refund_id, "status": "accepted", "coins_clawed_back": clawback}


@router.post("/admin/refunds/{refund_id}/reject", summary="Reject a refund (super admin)")
async def reject_refund(
    refund_id: str,
    data: RefundDecisionBody,
    admin_id: str = Depends(require_super_admin),
    db=Depends(get_database),
):
    refund = await _decide_refund(db, refund_id, admin_id, "rejected", data.note)
    user_id = refund["user_id"]

    await db["coin_purchases"].update_one(
        {"_id": ObjectId(refund["purchase_id"])}, {"$set": {"refund_status": "rejected"}}
    )

    msg = "Your refund request was declined." + (f" Note: {data.note.strip()}" if (data.note or "").strip() else "")
    await _post_message(db, user_id, "admin", msg, admin_id=admin_id)
    await _notify_user(db, user_id, msg)
    return {"id": refund_id, "status": "rejected"}
