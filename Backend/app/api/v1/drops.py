from fastapi import APIRouter, Depends, HTTPException, Query, Header
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from bson import ObjectId
import httpx
import random

from app.database import get_database
from app.dependencies import get_current_user_id, get_optional_user_id
from app.config import settings

router = APIRouter(prefix="/drops", tags=["Drops"])

DROP_PRICE_USD = 2.00
REVEAL_PRICE_USD = 1.00
GROUP_DROP_PRICE_USD = 3.00
CARD_EXPIRY_HOURS = 24
NIGHT_MODE_START = 22  # 10pm
NIGHT_MODE_END = 3     # 3am

CATEGORIES = ["love", "fun", "adventure", "friendship", "spicy"]

# ==================== REQUEST MODELS ====================

class CreateDropRequest(BaseModel):
    confession: str
    category: str = "love"
    is_group: bool = False
    group_size: Optional[int] = None  # e.g. 4 for "looking for a 4th"


class ReactToDropRequest(BaseModel):
    reaction: str  # single emoji or one word max


class MpesaUnlockRequest(BaseModel):
    phone_number: str  # format: 2547XXXXXXXX


class StripeUnlockRequest(BaseModel):
    payment_method_id: str


class MpesaRevealRequest(BaseModel):
    phone_number: str


class StripeRevealRequest(BaseModel):
    payment_method_id: str


class RenewDropRequest(BaseModel):
    drop_id: str


# ==================== HELPERS ====================

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def is_night_mode() -> bool:
    hour = now_utc().hour
    return hour >= NIGHT_MODE_START or hour < NIGHT_MODE_END


def get_expiry() -> datetime:
    return now_utc() + timedelta(hours=CARD_EXPIRY_HOURS)


def get_time_ago(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = now_utc() - dt
    if delta.days > 0:
        return f"{delta.days}d ago"
    elif delta.seconds > 3600:
        return f"{delta.seconds // 3600}h ago"
    elif delta.seconds > 60:
        return f"{delta.seconds // 60}m ago"
    return "just now"


def get_time_left(expires_at: datetime) -> str:
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    delta = expires_at - now_utc()
    if delta.total_seconds() <= 0:
        return "expired"
    hours = int(delta.total_seconds() // 3600)
    minutes = int((delta.total_seconds() % 3600) // 60)
    if hours > 0:
        return f"{hours}h {minutes}m left"
    return f"{minutes}m left"


async def update_vibe_score(user_id: str, action: str, db):
    """
    Vibe score events:
    - card_created: +2
    - card_unlocked: +5 (someone paid to connect with you)
    - reaction_received: +1
    - reveal_completed: +3
    - streak_day: +2
    """
    weights = {
        "card_created": 2,
        "card_unlocked": 5,
        "reaction_received": 1,
        "reveal_completed": 3,
        "streak_day": 2,
    }
    points = weights.get(action, 0)
    if points == 0:
        return

    await db["vibe_scores"].update_one(
        {"user_id": user_id},
        {
            "$inc": {"score": points, f"events.{action}": 1},
            "$set": {"updated_at": now_utc()}
        },
        upsert=True
    )


async def send_push_notification(user_id: str, title: str, body: str, db):
    try:
        doc = await db["push_tokens"].find_one({"user_id": user_id})
        if not doc:
            return
        token = doc.get("token")
        if not token or not token.startswith("ExponentPushToken"):
            return
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://exp.host/--/api/v2/push/send",
                json={"to": token, "title": title, "body": body, "sound": "default"},
                headers={"Content-Type": "application/json"},
                timeout=5.0
            )
    except Exception as e:
        print(f"⚠️ Push notification failed: {e}")


async def trigger_mpesa_stk(phone: str, amount: float, account_ref: str, description: str) -> dict:
    """
    Trigger M-Pesa STK Push. Returns { success, checkout_request_id, error }
    """
    try:
        import base64
        from datetime import datetime as dt

        timestamp = dt.now().strftime("%Y%m%d%H%M%S")
        shortcode = settings.MPESA_SHORTCODE
        passkey = settings.MPESA_PASSKEY
        password = base64.b64encode(f"{shortcode}{passkey}{timestamp}".encode()).decode()

        # Get access token
        async with httpx.AsyncClient() as client:
            auth_res = await client.get(
                "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
                auth=(settings.MPESA_CONSUMER_KEY, settings.MPESA_CONSUMER_SECRET),
                timeout=10.0
            )
            access_token = auth_res.json().get("access_token")

            stk_res = await client.post(
                "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
                headers={"Authorization": f"Bearer {access_token}"},
                json={
                    "BusinessShortCode": shortcode,
                    "Password": password,
                    "Timestamp": timestamp,
                    "TransactionType": "CustomerPayBillOnline",
                    "Amount": int(amount * 130),  # USD to KES approx
                    "PartyA": phone,
                    "PartyB": shortcode,
                    "PhoneNumber": phone,
                    "CallBackURL": f"{settings.BASE_URL}/api/v1/drops/mpesa/callback",
                    "AccountReference": account_ref,
                    "TransactionDesc": description,
                },
                timeout=15.0
            )
            data = stk_res.json()
            if data.get("ResponseCode") == "0":
                return {"success": True, "checkout_request_id": data.get("CheckoutRequestID")}
            return {"success": False, "error": data.get("ResponseDescription", "STK push failed")}

    except Exception as e:
        print(f"⚠️ M-Pesa STK error: {e}")
        return {"success": False, "error": str(e)}


# ==================== CREATE DROP ========================

@router.post("")
async def create_drop(
    data: CreateDropRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Create a confession card. Authenticated users only."""
    if data.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Category must be one of: {', '.join(CATEGORIES)}")

    if not data.confession.strip():
        raise HTTPException(status_code=400, detail="Confession cannot be empty")

    if len(data.confession) > 160:
        raise HTTPException(status_code=400, detail="Confession must be 160 characters or less")

    if data.is_group and (not data.group_size or data.group_size < 2 or data.group_size > 10):
        raise HTTPException(status_code=400, detail="Group size must be between 2 and 10")

    user = await db["users"].find_one({"_id": ObjectId(current_user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    night = is_night_mode()
    price = GROUP_DROP_PRICE_USD if data.is_group else DROP_PRICE_USD

    drop = {
        "_id": ObjectId(),
        "sender_id": current_user_id,
        "sender_anonymous_name": user.get("anonymous_name", "Anonymous"),
        "confession": data.confession.strip(),
        "category": data.category,
        "is_group": data.is_group,
        "group_size": data.group_size if data.is_group else None,
        "price": price,
        "expires_at": get_expiry(),
        "is_active": True,
        "is_night_mode": night,
        "unlock_count": 0,
        "admirer_count": 0,
        "reactions": [],
        "created_at": now_utc(),
    }

    await db["drops"].insert_one(drop)

    # Update vibe score
    await update_vibe_score(current_user_id, "card_created", db)

    # Update confession streak
    await _update_confession_streak(current_user_id, db)

    drop_id = str(drop["_id"])

    return {
        "id": drop_id,
        "share_link": f"anonixx://drop/{drop_id}",
        "share_text": f"{data.confession}\n\n— unlock to connect 👀\nanonixx://drop/{drop_id}",
        "expires_at": drop["expires_at"].isoformat(),
        "time_left": get_time_left(drop["expires_at"]),
        "is_night_mode": night,
        "price": price,
        "message": "Your card is live. Share it anywhere. 🔥",
    }


async def _update_confession_streak(user_id: str, db):
    today = now_utc().date().isoformat()
    doc = await db["confession_streaks"].find_one({"user_id": user_id})

    if not doc:
        await db["confession_streaks"].insert_one({
            "user_id": user_id,
            "streak": 1,
            "last_confession": today,
            "longest_streak": 1,
            "created_at": now_utc()
        })
        await update_vibe_score(user_id, "streak_day", db)
        return

    last = doc.get("last_confession")
    if last == today:
        return

    yesterday = (now_utc() - timedelta(days=1)).date().isoformat()
    current = doc.get("streak", 1)
    longest = doc.get("longest_streak", 1)

    if last == yesterday:
        new_streak = current + 1
        await db["confession_streaks"].update_one(
            {"user_id": user_id},
            {"$set": {
                "streak": new_streak,
                "last_confession": today,
                "longest_streak": max(longest, new_streak)
            }}
        )
        await update_vibe_score(user_id, "streak_day", db)
    else:
        await db["confession_streaks"].update_one(
            {"user_id": user_id},
            {"$set": {"streak": 1, "last_confession": today}}
        )


# ==================== MARKETPLACE ====================

@router.get("/marketplace")
async def get_marketplace(
    category: Optional[str] = Query(None),
    is_group: Optional[bool] = Query(None),
    night_only: Optional[bool] = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, le=50),
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db = Depends(get_database)
):
    """Browse active confession cards."""
    query = {
        "is_active": True,
        "expires_at": {"$gt": now_utc()},
    }

    if category and category in CATEGORIES:
        query["category"] = category
    if is_group is not None:
        query["is_group"] = is_group
    if night_only:
        query["is_night_mode"] = True

    # Exclude own drops
    if current_user_id:
        query["sender_id"] = {"$ne": current_user_id}

    total = await db["drops"].count_documents(query)

    cursor = db["drops"].find(query).sort("created_at", -1).skip(skip).limit(limit)
    drops = []

    async for drop in cursor:
        drop_id = str(drop["_id"])

        # Check if current user already unlocked
        already_unlocked = False
        if current_user_id:
            unlock = await db["drop_unlocks"].find_one({
                "drop_id": drop_id,
                "unlocker_id": current_user_id
            })
            already_unlocked = unlock is not None

        drops.append({
            "id": drop_id,
            "confession": drop["confession"],
            "category": drop["category"],
            "is_group": drop["is_group"],
            "group_size": drop.get("group_size"),
            "price": drop["price"],
            "is_night_mode": drop.get("is_night_mode", False),
            "unlock_count": drop.get("unlock_count", 0),
            "admirer_count": drop.get("admirer_count", 0),
            "reactions": drop.get("reactions", [])[-5:],  # last 5 reactions
            "time_left": get_time_left(drop["expires_at"]),
            "time_ago": get_time_ago(drop["created_at"]),
            "already_unlocked": already_unlocked,
        })

    return {
        "drops": drops,
        "total": total,
        "has_more": skip + limit < total,
    }


# ==================== DROP LANDING (deep link) ====================

@router.get("/{drop_id}/landing")
async def get_drop_landing(
    drop_id: str,
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db = Depends(get_database)
):
    """
    Called when someone taps a shared card link.
    Returns the drop info for the landing screen.
    """
    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except:
        raise HTTPException(status_code=404, detail="Drop not found")

    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    is_expired = drop["expires_at"] < now_utc() or not drop.get("is_active", True)

    # Track admirer (anonymous view)
    if current_user_id and current_user_id != drop["sender_id"]:
        existing = await db["admirer_logs"].find_one({
            "drop_id": drop_id,
            "viewer_id": current_user_id
        })
        if not existing:
            await db["admirer_logs"].insert_one({
                "drop_id": drop_id,
                "drop_sender_id": drop["sender_id"],
                "viewer_id": current_user_id,
                "viewed_at": now_utc()
            })
            await db["drops"].update_one(
                {"_id": ObjectId(drop_id)},
                {"$inc": {"admirer_count": 1}}
            )
            # Notify sender
            admirer_count = drop.get("admirer_count", 0) + 1
            if admirer_count in [3, 5, 10, 25, 50]:
                await send_push_notification(
                    drop["sender_id"],
                    f"{admirer_count} people are curious 👀",
                    "Your confession card is getting attention.",
                    db
                )
            await update_vibe_score(drop["sender_id"], "reaction_received", db)

    # Check if already unlocked
    already_unlocked = False
    if current_user_id:
        unlock = await db["drop_unlocks"].find_one({
            "drop_id": drop_id,
            "unlocker_id": current_user_id
        })
        already_unlocked = unlock is not None

    return {
        "id": drop_id,
        "confession": drop["confession"],
        "category": drop["category"],
        "is_group": drop["is_group"],
        "group_size": drop.get("group_size"),
        "price": drop["price"],
        "is_night_mode": drop.get("is_night_mode", False),
        "is_expired": is_expired,
        "time_left": get_time_left(drop["expires_at"]) if not is_expired else "expired",
        "unlock_count": drop.get("unlock_count", 0),
        "admirer_count": drop.get("admirer_count", 0),
        "reactions": drop.get("reactions", []),
        "already_unlocked": already_unlocked,
        "is_own_drop": current_user_id == drop["sender_id"] if current_user_id else False,
        "time_ago": get_time_ago(drop["created_at"]),
    }


# ==================== REACT (pre-payment) ====================

@router.post("/{drop_id}/react")
async def react_to_drop(
    drop_id: str,
    data: ReactToDropRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Send one anonymous reaction before paying. Max 1 per user per drop."""
    reaction = data.reaction.strip()
    if not reaction:
        raise HTTPException(status_code=400, detail="Reaction cannot be empty")
    if len(reaction) > 10:
        raise HTTPException(status_code=400, detail="Reaction too long — emoji or one word only")

    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except:
        raise HTTPException(status_code=404, detail="Drop not found")

    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    if drop["sender_id"] == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot react to your own drop")

    if drop["expires_at"] < now_utc():
        raise HTTPException(status_code=400, detail="This drop has expired")

    # One reaction per user per drop
    existing = await db["drop_reactions"].find_one({
        "drop_id": drop_id,
        "reactor_id": current_user_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="You already reacted to this drop")

    await db["drop_reactions"].insert_one({
        "_id": ObjectId(),
        "drop_id": drop_id,
        "reactor_id": current_user_id,
        "reaction": reaction,
        "created_at": now_utc()
    })

    # Append reaction to drop (store last 20 only)
    await db["drops"].update_one(
        {"_id": ObjectId(drop_id)},
        {
            "$push": {
                "reactions": {
                    "$each": [reaction],
                    "$slice": -20
                }
            }
        }
    )

    # Notify sender
    reaction_total = len(drop.get("reactions", [])) + 1
    if reaction_total in [1, 5, 10, 20]:
        await send_push_notification(
            drop["sender_id"],
            f"Someone reacted to your confession {reaction}",
            f"{reaction_total} reactions so far. People are feeling it.",
            db
        )
    await update_vibe_score(drop["sender_id"], "reaction_received", db)

    return {"message": "Reaction sent", "reaction": reaction}


# ==================== UNLOCK — M-PESA ====================

@router.post("/{drop_id}/unlock/mpesa")
async def unlock_drop_mpesa(
    drop_id: str,
    data: MpesaUnlockRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except:
        raise HTTPException(status_code=404, detail="Drop not found")

    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    if drop["sender_id"] == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot unlock your own drop")

    if drop["expires_at"] < now_utc():
        raise HTTPException(status_code=400, detail="This drop has expired")

    # Already unlocked?
    existing = await db["drop_unlocks"].find_one({
        "drop_id": drop_id,
        "unlocker_id": current_user_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already unlocked")

    price = drop.get("price", DROP_PRICE_USD)
    result = await trigger_mpesa_stk(
        phone=data.phone_number,
        amount=price,
        account_ref=f"DROP_{drop_id[:8].upper()}",
        description="Anonixx Drop Unlock"
    )

    if not result["success"]:
        raise HTTPException(status_code=402, detail=result.get("error", "Payment failed"))

    # Store pending unlock
    await db["drop_unlock_pending"].update_one(
        {"drop_id": drop_id, "unlocker_id": current_user_id},
        {"$set": {
            "drop_id": drop_id,
            "unlocker_id": current_user_id,
            "checkout_request_id": result["checkout_request_id"],
            "amount": price,
            "created_at": now_utc()
        }},
        upsert=True
    )

    return {
        "message": "STK push sent. Enter your M-Pesa PIN to unlock.",
        "checkout_request_id": result["checkout_request_id"],
        "amount": price,
    }


# ==================== UNLOCK — STRIPE ====================

@router.post("/{drop_id}/unlock/stripe")
async def unlock_drop_stripe(
    drop_id: str,
    data: StripeUnlockRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except:
        raise HTTPException(status_code=404, detail="Drop not found")

    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    if drop["sender_id"] == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot unlock your own drop")

    if drop["expires_at"] < now_utc():
        raise HTTPException(status_code=400, detail="This drop has expired")

    existing = await db["drop_unlocks"].find_one({
        "drop_id": drop_id,
        "unlocker_id": current_user_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already unlocked")

    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        price = drop.get("price", DROP_PRICE_USD)

        intent = stripe.PaymentIntent.create(
            amount=int(price * 100),
            currency="usd",
            payment_method=data.payment_method_id,
            confirm=True,
            metadata={"drop_id": drop_id, "unlocker_id": current_user_id},
            automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
        )

        if intent.status == "succeeded":
            await _complete_unlock(drop_id, current_user_id, drop, "stripe", db)
            connection_id = await _create_drop_connection(drop_id, drop, current_user_id, db)
            return {
                "message": "Unlocked! You can now chat.",
                "connection_id": connection_id,
                "sender_anonymous_name": drop["sender_anonymous_name"],
            }
        else:
            raise HTTPException(status_code=402, detail="Payment not completed")

    except Exception as e:
        raise HTTPException(status_code=402, detail=str(e))


# ==================== M-PESA CALLBACK ====================

@router.post("/mpesa/callback")
async def mpesa_callback(payload: dict, db = Depends(get_database)):
    """
    Called by Safaricom after STK push completes.
    Completes the unlock if payment succeeded.
    """
    try:
        stk = payload.get("Body", {}).get("stkCallback", {})
        result_code = stk.get("ResultCode")
        checkout_request_id = stk.get("CheckoutRequestID")

        if result_code != 0:
            print(f"⚠️ M-Pesa payment failed: {stk.get('ResultDesc')}")
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        # Find pending unlock
        pending = await db["drop_unlock_pending"].find_one({
            "checkout_request_id": checkout_request_id
        })
        if not pending:
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        drop_id = pending["drop_id"]
        unlocker_id = pending["unlocker_id"]

        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
        if not drop:
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        # Already completed?
        existing = await db["drop_unlocks"].find_one({
            "drop_id": drop_id,
            "unlocker_id": unlocker_id
        })
        if not existing:
            await _complete_unlock(drop_id, unlocker_id, drop, "mpesa", db)
            await _create_drop_connection(drop_id, drop, unlocker_id, db)

        # Clean up pending
        await db["drop_unlock_pending"].delete_one({"checkout_request_id": checkout_request_id})

        # Notify unlocker
        await send_push_notification(
            unlocker_id,
            "Payment confirmed 🔓",
            "You've unlocked the confession. Start chatting now.",
            db
        )

    except Exception as e:
        print(f"⚠️ M-Pesa callback error: {e}")

    return {"ResultCode": 0, "ResultDesc": "Accepted"}


# ==================== POLL UNLOCK STATUS ====================

@router.get("/{drop_id}/unlock/status")
async def poll_unlock_status(
    drop_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Poll after M-Pesa STK push to check if payment completed."""
    unlock = await db["drop_unlocks"].find_one({
        "drop_id": drop_id,
        "unlocker_id": current_user_id
    })

    if unlock:
        return {
            "unlocked": True,
            "connection_id": unlock.get("connection_id"),
            "sender_anonymous_name": unlock.get("sender_anonymous_name"),
        }

    return {"unlocked": False}


async def _complete_unlock(drop_id: str, unlocker_id: str, drop: dict, method: str, db):
    """Shared unlock completion logic."""
    await db["drop_unlocks"].insert_one({
        "_id": ObjectId(),
        "drop_id": drop_id,
        "unlocker_id": unlocker_id,
        "sender_id": drop["sender_id"],
        "method": method,
        "amount": drop.get("price", DROP_PRICE_USD),
        "sender_anonymous_name": drop["sender_anonymous_name"],
        "created_at": now_utc()
    })
    await db["drops"].update_one(
        {"_id": ObjectId(drop_id)},
        {"$inc": {"unlock_count": 1}}
    )
    await update_vibe_score(drop["sender_id"], "card_unlocked", db)

    # Notify sender
    unlock_count = drop.get("unlock_count", 0) + 1
    await send_push_notification(
        drop["sender_id"],
        "Someone unlocked your confession 🔓",
        f"{unlock_count} {'person has' if unlock_count == 1 else 'people have'} connected with you.",
        db
    )


async def _create_drop_connection(drop_id: str, drop: dict, unlocker_id: str, db) -> str:
    """Create a connection (chat) between drop sender and unlocker."""
    # Check if connection already exists
    existing_conn = await db["drop_connections"].find_one({
        "drop_id": drop_id,
        "unlocker_id": unlocker_id
    })
    if existing_conn:
        # Update the unlock record with connection_id
        await db["drop_unlocks"].update_one(
            {"drop_id": drop_id, "unlocker_id": unlocker_id},
            {"$set": {"connection_id": str(existing_conn["_id"])}}
        )
        return str(existing_conn["_id"])

    unlocker = await db["users"].find_one({"_id": ObjectId(unlocker_id)})
    unlocker_name = unlocker.get("anonymous_name", "Anonymous") if unlocker else "Anonymous"

    conn = {
        "_id": ObjectId(),
        "drop_id": drop_id,
        "sender_id": drop["sender_id"],
        "sender_anonymous_name": drop["sender_anonymous_name"],
        "unlocker_id": unlocker_id,
        "unlocker_anonymous_name": unlocker_name,
        "confession": drop["confession"],
        "message_count": 0,
        "is_revealed_sender": False,
        "is_revealed_unlocker": False,
        "created_at": now_utc(),
        "last_message_at": now_utc(),
    }
    await db["drop_connections"].insert_one(conn)
    connection_id = str(conn["_id"])

    # Update unlock record
    await db["drop_unlocks"].update_one(
        {"drop_id": drop_id, "unlocker_id": unlocker_id},
        {"$set": {"connection_id": connection_id, "sender_anonymous_name": drop["sender_anonymous_name"]}}
    )

    return connection_id


# ==================== DROP CHAT ====================

@router.get("/connections")
async def get_drop_connections(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get all active drop chats for current user."""
    query = {
        "$or": [
            {"sender_id": current_user_id},
            {"unlocker_id": current_user_id}
        ]
    }
    connections = []
    async for conn in db["drop_connections"].find(query).sort("last_message_at", -1):
        is_sender = conn["sender_id"] == current_user_id
        other_name = conn["unlocker_anonymous_name"] if is_sender else conn["sender_anonymous_name"]

        last_msg = await db["drop_messages"].find_one(
            {"connection_id": str(conn["_id"])},
            sort=[("created_at", -1)]
        )

        connections.append({
            "id": str(conn["_id"]),
            "drop_id": conn["drop_id"],
            "confession": conn["confession"],
            "other_anonymous_name": other_name,
            "is_sender": is_sender,
            "message_count": conn.get("message_count", 0),
            "last_message": last_msg["content"] if last_msg else None,
            "last_message_at": conn["last_message_at"].isoformat(),
            "is_revealed": conn["is_revealed_sender"] if is_sender else conn["is_revealed_unlocker"],
            "other_revealed": conn["is_revealed_unlocker"] if is_sender else conn["is_revealed_sender"],
        })

    return {"connections": connections}


@router.get("/connections/{connection_id}/messages")
async def get_drop_messages(
    connection_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        conn = await db["drop_connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        raise HTTPException(status_code=404, detail="Connection not found")

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if current_user_id not in [conn["sender_id"], conn["unlocker_id"]]:
        raise HTTPException(status_code=403, detail="Access denied")

    messages = []
    async for msg in db["drop_messages"].find(
        {"connection_id": connection_id}
    ).sort("created_at", 1):
        messages.append({
            "id": str(msg["_id"]),
            "content": msg["content"],
            "sender_id": msg["sender_id"],
            "is_own": msg["sender_id"] == current_user_id,
            "time_ago": get_time_ago(msg["created_at"]),
            "created_at": msg["created_at"].isoformat(),
        })

    is_sender = conn["sender_id"] == current_user_id
    return {
        "messages": messages,
        "connection": {
            "id": connection_id,
            "confession": conn["confession"],
            "other_anonymous_name": conn["unlocker_anonymous_name"] if is_sender else conn["sender_anonymous_name"],
            "is_revealed": conn["is_revealed_sender"] if is_sender else conn["is_revealed_unlocker"],
            "other_revealed": conn["is_revealed_unlocker"] if is_sender else conn["is_revealed_sender"],
        }
    }


@router.post("/connections/{connection_id}/message")
async def send_drop_message(
    connection_id: str,
    data: dict,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    content = data.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    try:
        conn = await db["drop_connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        raise HTTPException(status_code=404, detail="Connection not found")

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if current_user_id not in [conn["sender_id"], conn["unlocker_id"]]:
        raise HTTPException(status_code=403, detail="Access denied")

    msg = {
        "_id": ObjectId(),
        "connection_id": connection_id,
        "sender_id": current_user_id,
        "content": content,
        "created_at": now_utc()
    }
    await db["drop_messages"].insert_one(msg)
    await db["drop_connections"].update_one(
        {"_id": ObjectId(connection_id)},
        {"$inc": {"message_count": 1}, "$set": {"last_message_at": now_utc()}}
    )

    # Notify other party
    other_id = conn["unlocker_id"] if current_user_id == conn["sender_id"] else conn["sender_id"]
    sender_name = conn["sender_anonymous_name"] if current_user_id == conn["sender_id"] else conn["unlocker_anonymous_name"]

    await send_push_notification(
        other_id,
        f"{sender_name} sent a message 💬",
        content[:60] + ("..." if len(content) > 60 else ""),
        db
    )

    return {
        "id": str(msg["_id"]),
        "content": content,
        "time_ago": "just now",
        "created_at": msg["created_at"].isoformat(),
    }


# ==================== REVEAL ====================

@router.post("/connections/{connection_id}/reveal/mpesa")
async def reveal_mpesa(
    connection_id: str,
    data: MpesaRevealRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        conn = await db["drop_connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        raise HTTPException(status_code=404, detail="Connection not found")

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if current_user_id not in [conn["sender_id"], conn["unlocker_id"]]:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await trigger_mpesa_stk(
        phone=data.phone_number,
        amount=REVEAL_PRICE_USD,
        account_ref=f"REVEAL_{connection_id[:8].upper()}",
        description="Anonixx Identity Reveal"
    )

    if not result["success"]:
        raise HTTPException(status_code=402, detail=result.get("error", "Payment failed"))

    await db["drop_reveal_pending"].update_one(
        {"connection_id": connection_id, "requester_id": current_user_id},
        {"$set": {
            "connection_id": connection_id,
            "requester_id": current_user_id,
            "checkout_request_id": result["checkout_request_id"],
            "created_at": now_utc()
        }},
        upsert=True
    )

    return {
        "message": "STK push sent. Enter your M-Pesa PIN to reveal.",
        "checkout_request_id": result["checkout_request_id"],
    }


@router.post("/connections/{connection_id}/reveal/stripe")
async def reveal_stripe(
    connection_id: str,
    data: StripeRevealRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        conn = await db["drop_connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        raise HTTPException(status_code=404, detail="Connection not found")

    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if current_user_id not in [conn["sender_id"], conn["unlocker_id"]]:
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY

        intent = stripe.PaymentIntent.create(
            amount=int(REVEAL_PRICE_USD * 100),
            currency="usd",
            payment_method=data.payment_method_id,
            confirm=True,
            metadata={"connection_id": connection_id, "requester_id": current_user_id},
            automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
        )

        if intent.status == "succeeded":
            reveal_data = await _complete_reveal(connection_id, current_user_id, conn, db)
            return reveal_data
        else:
            raise HTTPException(status_code=402, detail="Payment not completed")

    except Exception as e:
        raise HTTPException(status_code=402, detail=str(e))


@router.post("/mpesa/reveal/callback")
async def mpesa_reveal_callback(payload: dict, db = Depends(get_database)):
    try:
        stk = payload.get("Body", {}).get("stkCallback", {})
        result_code = stk.get("ResultCode")
        checkout_request_id = stk.get("CheckoutRequestID")

        if result_code != 0:
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        pending = await db["drop_reveal_pending"].find_one({
            "checkout_request_id": checkout_request_id
        })
        if not pending:
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        connection_id = pending["connection_id"]
        requester_id = pending["requester_id"]

        conn = await db["drop_connections"].find_one({"_id": ObjectId(connection_id)})
        if conn:
            reveal_data = await _complete_reveal(connection_id, requester_id, conn, db)
            await send_push_notification(
                requester_id,
                "Identity revealed 🎭",
                f"You now know who {reveal_data.get('revealed_name', 'they')} is.",
                db
            )

        await db["drop_reveal_pending"].delete_one({"checkout_request_id": checkout_request_id})

    except Exception as e:
        print(f"⚠️ Reveal callback error: {e}")

    return {"ResultCode": 0, "ResultDesc": "Accepted"}


async def _complete_reveal(connection_id: str, requester_id: str, conn: dict, db) -> dict:
    """Complete a reveal — returns the other person's anonymous name and real first name."""
    is_sender = conn["sender_id"] == requester_id
    other_id = conn["unlocker_id"] if is_sender else conn["sender_id"]

    other_user = await db["users"].find_one({"_id": ObjectId(other_id)})
    anonymous_name = conn["unlocker_anonymous_name"] if is_sender else conn["sender_anonymous_name"]
    real_name = other_user.get("name", "").split()[0] if other_user else "Unknown"

    # Mark revealed
    field = "is_revealed_sender" if is_sender else "is_revealed_unlocker"
    await db["drop_connections"].update_one(
        {"_id": ObjectId(connection_id)},
        {"$set": {field: True}}
    )

    await db["drop_reveals"].insert_one({
        "_id": ObjectId(),
        "connection_id": connection_id,
        "requester_id": requester_id,
        "revealed_user_id": other_id,
        "created_at": now_utc()
    })

    await update_vibe_score(other_id, "reveal_completed", db)

    # Notify the person being revealed
    await send_push_notification(
        other_id,
        "Someone revealed your identity 🎭",
        "They now know your name. The mystery is gone — or just beginning.",
        db
    )

    return {
        "revealed": True,
        "anonymous_name": anonymous_name,
        "revealed_name": real_name,
        "message": f"Mystery solved. They are {real_name}.",
    }


@router.get("/connections/{connection_id}/reveal/status")
async def poll_reveal_status(
    connection_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        conn = await db["drop_connections"].find_one({"_id": ObjectId(connection_id)})
    except:
        raise HTTPException(status_code=404, detail="Not found")

    if not conn:
        raise HTTPException(status_code=404, detail="Not found")

    is_sender = conn["sender_id"] == current_user_id
    is_revealed = conn["is_revealed_sender"] if is_sender else conn["is_revealed_unlocker"]

    if not is_revealed:
        return {"revealed": False}

    other_id = conn["unlocker_id"] if is_sender else conn["sender_id"]
    other_user = await db["users"].find_one({"_id": ObjectId(other_id)})
    real_name = other_user.get("name", "").split()[0] if other_user else "Unknown"
    anonymous_name = conn["unlocker_anonymous_name"] if is_sender else conn["sender_anonymous_name"]

    return {
        "revealed": True,
        "anonymous_name": anonymous_name,
        "revealed_name": real_name,
    }


# ==================== RENEW DROP ====================

@router.post("/{drop_id}/renew")
async def renew_drop(
    drop_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    try:
        drop = await db["drops"].find_one({"_id": ObjectId(drop_id)})
    except:
        raise HTTPException(status_code=404, detail="Drop not found")

    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")

    if drop["sender_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Not your drop")

    new_expiry = get_expiry()
    await db["drops"].update_one(
        {"_id": ObjectId(drop_id)},
        {"$set": {
            "expires_at": new_expiry,
            "is_active": True,
            "is_night_mode": is_night_mode()
        }}
    )

    return {
        "message": "Drop renewed for another 24 hours 🔥",
        "expires_at": new_expiry.isoformat(),
        "time_left": get_time_left(new_expiry),
    }


# ==================== INBOX ====================

@router.get("/inbox")
async def get_drops_inbox(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Your received unlocks + active cards summary."""
    # Active drops you sent
    active_drops = []
    async for drop in db["drops"].find({
        "sender_id": current_user_id,
        "is_active": True,
        "expires_at": {"$gt": now_utc()}
    }).sort("created_at", -1):
        active_drops.append({
            "id": str(drop["_id"]),
            "confession": drop["confession"],
            "category": drop["category"],
            "unlock_count": drop.get("unlock_count", 0),
            "admirer_count": drop.get("admirer_count", 0),
            "reactions": drop.get("reactions", []),
            "time_left": get_time_left(drop["expires_at"]),
            "is_night_mode": drop.get("is_night_mode", False),
            "share_link": f"anonixx://drop/{str(drop['_id'])}",
        })

    # Connections (chats)
    connections = []
    async for conn in db["drop_connections"].find({
        "$or": [{"sender_id": current_user_id}, {"unlocker_id": current_user_id}]
    }).sort("last_message_at", -1).limit(20):
        is_sender = conn["sender_id"] == current_user_id
        other_name = conn["unlocker_anonymous_name"] if is_sender else conn["sender_anonymous_name"]
        last_msg = await db["drop_messages"].find_one(
            {"connection_id": str(conn["_id"])},
            sort=[("created_at", -1)]
        )
        connections.append({
            "id": str(conn["_id"]),
            "confession": conn["confession"],
            "other_anonymous_name": other_name,
            "is_sender": is_sender,
            "last_message": last_msg["content"] if last_msg else None,
            "message_count": conn.get("message_count", 0),
            "is_revealed": conn["is_revealed_sender"] if is_sender else conn["is_revealed_unlocker"],
            "other_revealed": conn["is_revealed_unlocker"] if is_sender else conn["is_revealed_sender"],
        })

    return {
        "active_drops": active_drops,
        "connections": connections,
    }


# ==================== VIBE SCORE ====================

@router.get("/vibe-score")
async def get_vibe_score(
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    doc = await db["vibe_scores"].find_one({"user_id": current_user_id})
    score = doc.get("score", 0) if doc else 0
    events = doc.get("events", {}) if doc else {}

    # Admirer count (unique viewers of your drops)
    admirer_count = await db["admirer_logs"].count_documents({
        "drop_sender_id": current_user_id
    })

    # Confession streak
    streak_doc = await db["confession_streaks"].find_one({"user_id": current_user_id})
    streak = streak_doc.get("streak", 0) if streak_doc else 0
    longest_streak = streak_doc.get("longest_streak", 0) if streak_doc else 0

    # Vibe tier
    if score >= 500:
        tier = "Legendary 🔥"
    elif score >= 200:
        tier = "Electric ⚡"
    elif score >= 100:
        tier = "Rising 🌙"
    elif score >= 50:
        tier = "Awakening ✨"
    else:
        tier = "Fresh 🌱"

    return {
        "score": score,
        "tier": tier,
        "admirer_count": admirer_count,
        "confession_streak": streak,
        "longest_streak": longest_streak,
        "events": events,
        "next_tier_at": _next_tier(score),
    }


def _next_tier(score: int) -> int:
    tiers = [50, 100, 200, 500]
    for t in tiers:
        if score < t:
            return t
    return score
    #noma
