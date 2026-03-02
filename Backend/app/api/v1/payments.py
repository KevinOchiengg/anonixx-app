from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
from bson import ObjectId
from app.database import get_database
from app.dependencies import get_current_user_id


router = APIRouter(prefix="/payments", tags=["Payments"])

UNLOCK_AMOUNT = 2.00  # USD


# ─────────────────────────────────────────────
# REQUEST MODELS
# ─────────────────────────────────────────────

class StripeUnlockRequest(BaseModel):
    connection_id: str
    payment_method_id: str


class MpesaUnlockRequest(BaseModel):
    connection_id: str
    phone_number: str


class MpesaCallbackRequest(BaseModel):
    Body: dict


# ─────────────────────────────────────────────
# HELPER
# ─────────────────────────────────────────────

async def upgrade_connection_to_premium(connection_id: str, payment_ref: str, db):
    """Mark connection as premium after successful payment"""
    result = await db.connections.update_one(
        {"_id": ObjectId(connection_id)},
        {
            "$set": {
                "status": "premium",
                "upgraded_at": datetime.now(timezone.utc),
                "payment_ref": payment_ref,
                "expires_at": None,
                "message_limit": None,
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Connection not found")

    await db.payments.insert_one({
        "_id": ObjectId(),
        "connection_id": ObjectId(connection_id),
        "amount": UNLOCK_AMOUNT,
        "currency": "USD",
        "payment_ref": payment_ref,
        "type": "connection_unlock",
        "created_at": datetime.now(timezone.utc),
    })


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

    connection = await db.connections.find_one({
        "_id": ObjectId(data.connection_id),
        "$or": [
            {"broadcast_user_id": current_user_id},
            {"opener_user_id": current_user_id},
        ]
    })

    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    if connection.get("status") == "premium":
        return {"message": "Already unlocked", "status": "premium"}

    try:
        intent = stripe.PaymentIntent.create(
            amount=200,
            currency="usd",
            payment_method=data.payment_method_id,
            confirm=True,
            automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
            metadata={"connection_id": data.connection_id, "user_id": current_user_id}
        )
    except stripe.CardError as e:
        raise HTTPException(status_code=400, detail=str(e.user_message))
    except stripe.StripeError:
        raise HTTPException(status_code=500, detail="Payment failed. Please try again.")

    if intent.status != "succeeded":
        raise HTTPException(status_code=400, detail=f"Payment not completed. Status: {intent.status}")

    await upgrade_connection_to_premium(data.connection_id, intent.id, db)

    return {"message": "Connection unlocked!", "status": "premium", "payment_ref": intent.id}


# ─────────────────────────────────────────────
# M-PESA STK PUSH
# ─────────────────────────────────────────────

@router.post("/unlock/mpesa")
async def unlock_with_mpesa(
    data: MpesaUnlockRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Initiate M-Pesa STK Push for $2 connection unlock"""
    import httpx
    import base64
    from app.config import settings

    connection = await db.connections.find_one({
        "_id": ObjectId(data.connection_id),
        "$or": [
            {"broadcast_user_id": current_user_id},
            {"opener_user_id": current_user_id},
        ]
    })

    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    if connection.get("status") == "premium":
        return {"message": "Already unlocked", "status": "premium"}

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

    amount_kes = 260  # ~$2 USD

    stk_payload = {
        "BusinessShortCode": settings.MPESA_SHORTCODE,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": amount_kes,
        "PartyA": data.phone_number,
        "PartyB": settings.MPESA_SHORTCODE,
        "PhoneNumber": data.phone_number,
        "CallBackURL": f"{settings.BASE_URL}/api/v1/payments/mpesa/callback",
        "AccountReference": f"TRACE-{data.connection_id[:8]}",
        "TransactionDesc": "Anonixx Connection Unlock",
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
        "connection_id": data.connection_id,
        "user_id": current_user_id,
        "amount_kes": amount_kes,
        "type": "connection_unlock",
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

            await upgrade_connection_to_premium(pending["connection_id"], mpesa_ref, db)

            await db.pending_payments.update_one(
                {"_id": pending["_id"]},
                {"$set": {"status": "completed", "mpesa_ref": mpesa_ref}}
            )
        else:
            await db.pending_payments.update_one(
                {"_id": pending["_id"]},
                {"$set": {
                    "status": "failed",
                    "result_code": result_code,
                    "result_desc": stk_callback.get("ResultDesc"),
                }}
            )

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
        "status": pending["status"],   # pending | completed | failed
        "connection_id": pending.get("connection_id"),
    }
