from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
from bson import ObjectId
from app.database import get_database
from app.dependencies import get_current_user_id


router = APIRouter(prefix="/payments", tags=["Payments"])

UNLOCK_AMOUNT_USD = 2.00
UNLOCK_AMOUNT_KES = 260


# ─────────────────────────────────────────────
# REQUEST MODELS
# ─────────────────────────────────────────────

class StripeUnlockRequest(BaseModel):
    chat_id: str
    payment_method_id: str


class MpesaUnlockRequest(BaseModel):
    chat_id: str
    phone_number: str


class MpesaCallbackRequest(BaseModel):
    Body: dict


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

async def unlock_chat(chat_id: str, payment_ref: str, user_id: str, db):
    """Mark connect_chat as unlocked after successful payment"""
    result = await db.connect_chats.update_one(
        {"_id": ObjectId(chat_id)},
        {
            "$set": {
                "is_unlocked": True,
                "unlocked_at": datetime.now(timezone.utc),
                "unlocked_by": user_id,
                "payment_ref": payment_ref,
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Chat not found")

    await db.payments.insert_one({
        "_id": ObjectId(),
        "chat_id": chat_id,
        "user_id": user_id,
        "amount_usd": UNLOCK_AMOUNT_USD,
        "amount_kes": UNLOCK_AMOUNT_KES,
        "payment_ref": payment_ref,
        "type": "chat_unlock",
        "created_at": datetime.now(timezone.utc),
    })


async def get_chat_for_user(chat_id: str, user_id: str, db):
    """Fetch a chat and verify the user is a participant"""
    try:
        chat = await db.connect_chats.find_one({"_id": ObjectId(chat_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid chat ID")

    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if user_id not in [chat.get("from_user_id"), chat.get("to_user_id")]:
        raise HTTPException(status_code=403, detail="Not your chat")

    return chat


# ─────────────────────────────────────────────
# STRIPE
# ─────────────────────────────────────────────

@router.post("/unlock/stripe")
async def unlock_with_stripe(
    data: StripeUnlockRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Process $2 unlock via Stripe card payment"""
    try:
        import stripe
        from app.config import settings
        stripe.api_key = settings.STRIPE_SECRET_KEY
    except ImportError:
        raise HTTPException(status_code=500, detail="Stripe not installed. Run: pip install stripe")

    chat = await get_chat_for_user(data.chat_id, current_user_id, db)

    if chat.get("is_unlocked"):
        return {"message": "Already unlocked", "status": "unlocked"}

    try:
        intent = stripe.PaymentIntent.create(
            amount=200,  # $2.00 in cents
            currency="usd",
            payment_method=data.payment_method_id,
            confirm=True,
            automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
            metadata={"chat_id": data.chat_id, "user_id": current_user_id}
        )
    except stripe.CardError as e:
        raise HTTPException(status_code=400, detail=str(e.user_message))
    except stripe.StripeError:
        raise HTTPException(status_code=500, detail="Payment failed. Please try again.")

    if intent.status != "succeeded":
        raise HTTPException(status_code=400, detail=f"Payment not completed. Status: {intent.status}")

    await unlock_chat(data.chat_id, intent.id, current_user_id, db)

    return {"message": "Chat unlocked!", "status": "unlocked", "payment_ref": intent.id}


# ─────────────────────────────────────────────
# M-PESA STK PUSH
# ─────────────────────────────────────────────

@router.post("/unlock/mpesa")
async def unlock_with_mpesa(
    data: MpesaUnlockRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Initiate M-Pesa STK Push for KES 260 chat unlock"""
    import httpx
    import base64
    from app.config import settings

    chat = await get_chat_for_user(data.chat_id, current_user_id, db)

    if chat.get("is_unlocked"):
        return {"message": "Already unlocked", "status": "unlocked"}

    # Get M-Pesa access token
    async with httpx.AsyncClient() as client:
        credentials = base64.b64encode(
            f"{settings.MPESA_CONSUMER_KEY}:{settings.MPESA_CONSUMER_SECRET}".encode()
        ).decode()

        token_resp = await client.get(
            "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
            headers={"Authorization": f"Basic {credentials}"}
        )

        if token_resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to get M-Pesa token")

        access_token = token_resp.json().get("access_token")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    password = base64.b64encode(
        f"{settings.MPESA_SHORTCODE}{settings.MPESA_PASSKEY}{timestamp}".encode()
    ).decode()

    stk_payload = {
        "BusinessShortCode": settings.MPESA_SHORTCODE,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": UNLOCK_AMOUNT_KES,
        "PartyA": data.phone_number,
        "PartyB": settings.MPESA_SHORTCODE,
        "PhoneNumber": data.phone_number,
        "CallBackURL": f"{settings.BASE_URL}/api/v1/payments/mpesa/callback",
        "AccountReference": f"ANON-{data.chat_id[:8]}",
        "TransactionDesc": "Anonixx Chat Unlock",
    }

    async with httpx.AsyncClient() as client:
        stk_resp = await client.post(
            "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json=stk_payload,
        )

    if stk_resp.status_code != 200:
        raise HTTPException(status_code=500, detail="Failed to initiate M-Pesa payment")

    stk_data = stk_resp.json()

    if stk_data.get("ResponseCode") != "0":
        raise HTTPException(
            status_code=400,
            detail=stk_data.get("ResponseDescription", "STK Push failed")
        )

    checkout_request_id = stk_data.get("CheckoutRequestID")

    await db.pending_payments.insert_one({
        "_id": ObjectId(),
        "checkout_request_id": checkout_request_id,
        "chat_id": data.chat_id,
        "user_id": current_user_id,
        "amount_kes": UNLOCK_AMOUNT_KES,
        "type": "chat_unlock",
        "status": "pending",
        "created_at": datetime.now(timezone.utc),
    })

    return {
        "message": "Check your phone to complete payment",
        "checkout_request_id": checkout_request_id,
    }


# ─────────────────────────────────────────────
# M-PESA CALLBACK
# ─────────────────────────────────────────────

@router.post("/mpesa/callback")
async def mpesa_callback(
    payload: MpesaCallbackRequest,
    db = Depends(get_database)
):
    """Safaricom POSTs here after STK Push completes"""
    try:
        stk_callback = payload.Body.get("stkCallback", {})
        result_code = stk_callback.get("ResultCode")
        checkout_request_id = stk_callback.get("CheckoutRequestID")

        pending = await db.pending_payments.find_one({
            "checkout_request_id": checkout_request_id
        })

        if not pending:
            return {"ResultCode": 0, "ResultDesc": "OK"}

        if result_code == 0:
            items = stk_callback.get("CallbackMetadata", {}).get("Item", [])
            mpesa_ref = next(
                (i.get("Value") for i in items if i.get("Name") == "MpesaReceiptNumber"),
                checkout_request_id
            )

            await unlock_chat(
                chat_id=pending["chat_id"],
                payment_ref=mpesa_ref,
                user_id=pending["user_id"],
                db=db
            )

            await db.pending_payments.update_one(
                {"_id": pending["_id"]},
                {"$set": {"status": "completed", "mpesa_ref": mpesa_ref}}
            )

            print(f"✅ Chat {pending['chat_id']} unlocked via M-Pesa — {mpesa_ref}")

        else:
            await db.pending_payments.update_one(
                {"_id": pending["_id"]},
                {"$set": {
                    "status": "failed",
                    "result_code": result_code,
                    "result_desc": stk_callback.get("ResultDesc"),
                }}
            )

            print(f"❌ M-Pesa failed for chat {pending['chat_id']} — {stk_callback.get('ResultDesc')}")

    except Exception as e:
        print(f"❌ M-Pesa callback error: {e}")

    return {"ResultCode": 0, "ResultDesc": "Accepted"}


# ─────────────────────────────────────────────
# POLL STATUS
# ─────────────────────────────────────────────

@router.get("/mpesa/status/{checkout_request_id}")
async def check_mpesa_status(
    checkout_request_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Frontend polls this every 3s after STK Push"""
    pending = await db.pending_payments.find_one({
        "checkout_request_id": checkout_request_id,
        "user_id": current_user_id,
    })

    if not pending:
        raise HTTPException(status_code=404, detail="Payment not found")

    return {
        "status": pending["status"],  # pending | completed | failed
        "chat_id": pending.get("chat_id"),
    }
