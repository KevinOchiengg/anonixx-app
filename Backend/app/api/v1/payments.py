"""
payments.py — Anonixx Payments Router

Two payment flows:
  1. Connect unlock — M-Pesa (KES 49)
  2. Group entry    — handled in groups.py, not here

Collections:
  connect_payments  — pending/completed/failed payment records
  connections       — updated to is_unlocked=True on success
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
from app.database import get_database
from app.dependencies import get_current_user_id
from app.config import settings

router = APIRouter(prefix="/payments", tags=["payments"])

def _now() -> datetime:
    return datetime.now(timezone.utc)

UNLOCK_AMOUNT_KES = 49


# ─── Request models ───────────────────────────────────────────────────────────

class MpesaUnlockRequest(BaseModel):
    chat_id:      str
    phone_number: str

class StripeUnlockRequest(BaseModel):
    chat_id:           str
    payment_method_id: str

class MpesaCallbackRequest(BaseModel):
    Body: dict


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def get_chat_for_user(chat_id: str, user_id: str, db) -> dict:
    try:
        chat = await db.connect_chats.find_one({"_id": ObjectId(chat_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid chat ID.")
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found.")
    if user_id not in [chat.get("from_user_id"), chat.get("to_user_id")]:
        raise HTTPException(status_code=403, detail="Not your chat.")
    return chat


async def mark_chat_unlocked(chat_id: str, user_id: str, payment_ref: str, provider: str, db):
    now = _now()
    result = await db.connect_chats.update_one(
        {"_id": ObjectId(chat_id)},
        {"$set": {
            "is_unlocked":     True,
            "unlocked_at":     now,
            "unlocked_by":     user_id,
            "unlock_provider": provider,
            "payment_ref":     payment_ref,
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Chat not found.")

    await db.connect_payments.update_one(
        {"chat_id": chat_id, "user_id": user_id, "status": "pending"},
        {"$set": {
            "status":       "completed",
            "payment_ref":  payment_ref,
            "completed_at": now,
        }}
    )


# ─── M-Pesa: initiate STK push ────────────────────────────────────────────────

@router.post("/unlock/mpesa")
async def unlock_with_mpesa(
    data:            MpesaUnlockRequest,
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    chat = await get_chat_for_user(data.chat_id, current_user_id, db)
    if chat.get("is_unlocked"):
        return {"status": "unlocked", "message": "Already unlocked."}

    # Format phone
    phone = data.phone_number.strip().replace(" ", "")
    if phone.startswith("0"):
        phone = "254" + phone[1:]
    elif phone.startswith("7") or phone.startswith("1"):
        phone = "254" + phone
    if len(phone) < 12:
        raise HTTPException(status_code=400, detail="Invalid M-Pesa number.")

    from app.utils.mpesa import MPesaClient
    mpesa    = MPesaClient()
    response = await mpesa.stk_push(
        phone=phone,
        amount=UNLOCK_AMOUNT_KES,
        reference=f"ANON-{data.chat_id[:8]}",
        description="Anonixx Connect Unlock",
    )

    if not response.get("success"):
        raise HTTPException(status_code=502, detail="Could not initiate M-Pesa payment.")

    checkout_id = response.get("CheckoutRequestID")
    if not checkout_id:
        raise HTTPException(status_code=502, detail="Could not initiate M-Pesa payment.")

    await db.connect_payments.insert_one({
        "chat_id":             data.chat_id,
        "user_id":             current_user_id,
        "provider":            "mpesa",
        "checkout_request_id": checkout_id,
        "amount_kes":          UNLOCK_AMOUNT_KES,
        "status":              "pending",
        "created_at":          _now(),
        "completed_at":        None,
    })

    return {
        "checkout_request_id": checkout_id,
        "message":             "Check your phone to complete payment.",
    }


# ─── M-Pesa: poll status (DB read only) ──────────────────────────────────────

@router.get("/mpesa/status/{checkout_request_id}")
async def check_mpesa_status(
    checkout_request_id: str,
    current_user_id:     str = Depends(get_current_user_id),
    db                   = Depends(get_database),
):
    payment = await db.connect_payments.find_one({
        "checkout_request_id": checkout_request_id,
        "user_id":             current_user_id,
    })
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found.")
    return {
        "status":  payment["status"],   # pending | completed | failed
        "chat_id": payment.get("chat_id"),
    }


# ─── M-Pesa: Safaricom callback ───────────────────────────────────────────────

@router.post("/mpesa/callback")
async def mpesa_callback(
    payload: MpesaCallbackRequest,
    db       = Depends(get_database),
):
    """
    Safaricom POSTs here after STK push completes or fails.
    Register in M-Pesa dashboard:
      https://anonixx-app.onrender.com/api/v1/payments/mpesa/callback
    """
    try:
        stk         = payload.Body.get("stkCallback", {})
        result_code = stk.get("ResultCode")
        checkout_id = stk.get("CheckoutRequestID")

        if not checkout_id:
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        payment = await db.connect_payments.find_one({
            "checkout_request_id": checkout_id,
            "provider":            "mpesa",
        })
        if not payment or payment.get("status") != "pending":
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        if result_code == 0:
            items     = stk.get("CallbackMetadata", {}).get("Item", [])
            mpesa_ref = next(
                (i.get("Value") for i in items if i.get("Name") == "MpesaReceiptNumber"),
                checkout_id,
            )
            await mark_chat_unlocked(
                chat_id=payment["chat_id"],
                user_id=payment["user_id"],
                payment_ref=mpesa_ref,
                provider="mpesa",
                db=db,
            )
        else:
            await db.connect_payments.update_one(
                {"_id": payment["_id"]},
                {"$set": {
                    "status":      "failed",
                    "result_code": result_code,
                    "result_desc": stk.get("ResultDesc"),
                }}
            )
    except Exception:
        pass  # Always return 200 to Safaricom

    return {"ResultCode": 0, "ResultDesc": "Accepted"}


# ─── Stripe: initiate PaymentIntent ──────────────────────────────────────────

@router.post("/unlock/stripe")
async def unlock_with_stripe(
    data:            StripeUnlockRequest,
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    chat = await get_chat_for_user(data.chat_id, current_user_id, db)
    if chat.get("is_unlocked"):
        return {"status": "unlocked", "message": "Already unlocked."}

    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        intent = stripe.PaymentIntent.create(
            amount=49,  # KES 49 in cents equivalent (kept for Stripe fallback)
            currency="usd",
            payment_method=data.payment_method_id,
            confirm=True,
            automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
            metadata={"chat_id": data.chat_id, "user_id": current_user_id},
        )
    except Exception as e:
        user_msg = getattr(getattr(e, 'user_message', None), '__str__', lambda: str(e))()
        raise HTTPException(status_code=400, detail=user_msg or "Payment failed.")

    if intent.status != "succeeded":
        raise HTTPException(
            status_code=400,
            detail=f"Payment not completed. Status: {intent.status}"
        )

    await db.connect_payments.insert_one({
        "chat_id":           data.chat_id,
        "user_id":           current_user_id,
        "provider":          "stripe",
        "payment_intent_id": intent.id,
        "amount_kes":        UNLOCK_AMOUNT_KES,
        "status":            "pending",
        "created_at":        _now(),
        "completed_at":      None,
    })

    await mark_chat_unlocked(
        chat_id=data.chat_id,
        user_id=current_user_id,
        payment_ref=intent.id,
        provider="stripe",
        db=db,
    )

    return {
        "status":      "unlocked",
        "message":     "Chat unlocked!",
        "payment_ref": intent.id,
    }


# ─── Stripe: webhook ─────────────────────────────────────────────────────────

@router.post("/stripe/webhook")
async def stripe_webhook(
    request:          Request,
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature"),
    db                = Depends(get_database),
):
    """
    Stripe POSTs here for async payment events.
    Register in Stripe dashboard:
      https://anonixx-app.onrender.com/api/v1/payments/stripe/webhook
    Events: payment_intent.succeeded, payment_intent.payment_failed
    """
    payload = await request.body()

    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    try:
        event_type     = event["type"]
        payment_intent = event["data"]["object"]
        metadata       = payment_intent.get("metadata", {})
        chat_id        = metadata.get("chat_id")
        user_id        = metadata.get("user_id")

        payment = await db.connect_payments.find_one({
            "payment_intent_id": payment_intent["id"],
        })
        if not payment or payment.get("status") != "pending":
            return {"received": True}  # Idempotent

        if event_type == "payment_intent.succeeded" and chat_id and user_id:
            await mark_chat_unlocked(
                chat_id=chat_id,
                user_id=user_id,
                payment_ref=payment_intent["id"],
                provider="stripe",
                db=db,
            )
        elif event_type == "payment_intent.payment_failed":
            await db.connect_payments.update_one(
                {"_id": payment["_id"]},
                {"$set": {"status": "failed"}}
            )
    except Exception:
        pass  # Don't return non-200 to Stripe

    return {"received": True}
