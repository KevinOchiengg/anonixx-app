"""
api/v1/premium.py — Anonixx Premium subscription purchase.

Perks (all defined and enforced in drops.py — see the PREMIUM_* constants
and the unlock_cost_for / unlock_reward_for / grace_days_for helpers):
  • Unlocks cost 25 coins instead of 50      (keyed on the UNLOCKER)
  • Unlock reward is 10 coins instead of 5   (keyed on the DROP OWNER)
  • Unlocked drops survive 14 days instead
    of 7 before cleanup deletes them         (keyed on the POSTER)
  • Ad-free feed                             (GET /ads/active returns [])

Drops no longer expire on a timer: one stays live indefinitely until its
first unlock, which is what starts the grace window above.

The old "unlimited Drops per day" perk is gone — that cap was removed and
posting is unlimited for everyone now.

Mirrors the coin-purchase pattern in coins.py exactly:
  M-Pesa  — STK push, poll status, Safaricom callback credits on success.
  Stripe  — create a PaymentIntent, client confirms via native PaymentSheet,
            webhook grants premium on payment_intent.succeeded.

A renewal extends from the current premium_until if it's still in the
future, rather than from "now" — buying more time never costs you time
you already paid for.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id
from app.utils.mpesa import MPesaClient
from app.config import settings

router = APIRouter(prefix="/premium", tags=["premium"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


PREMIUM_PLANS: List[dict] = [
    {"id": "monthly",   "label": "1 Month",  "days": 30,  "kes": 1300,  "usd_cents": 999,  "usd_display": "$9.99",  "save": None},
    {"id": "quarterly", "label": "3 Months", "days": 90,  "kes": 3250,  "usd_cents": 2499, "usd_display": "$24.99", "save": "17%"},
    {"id": "yearly",    "label": "1 Year",   "days": 365, "kes": 10400, "usd_cents": 7999, "usd_display": "$79.99", "save": "33%"},
]
_PLAN_MAP = {p["id"]: p for p in PREMIUM_PLANS}


class MpesaPremiumRequest(BaseModel):
    plan_id:      str
    phone_number: str

class StripePremiumRequest(BaseModel):
    plan_id: str

class MpesaCallbackBody(BaseModel):
    Body: dict


async def _grant_premium(user_id: str, plan_id: str, db) -> datetime:
    """Extends from the current premium_until if still active, else from now."""
    plan = _PLAN_MAP[plan_id]
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"premium_until": 1})
    now  = _now()
    current_until = user.get("premium_until") if user else None
    base = current_until if (current_until and current_until > now) else now
    new_until = base + timedelta(days=plan["days"])

    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "is_premium":    True,
            "premium_plan":  plan_id,
            "premium_until": new_until,
        }},
    )
    return new_until


@router.get("/plans")
async def list_plans():
    return {"plans": PREMIUM_PLANS}


# ─── M-Pesa: initiate STK push ────────────────────────────────────────────────

@router.post("/mpesa")
async def buy_premium_mpesa(
    data:            MpesaPremiumRequest,
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    plan = _PLAN_MAP.get(data.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Invalid plan.")

    phone = data.phone_number.strip().replace(" ", "")
    if phone.startswith("0"):
        phone = "254" + phone[1:]
    elif phone.startswith("7") or phone.startswith("1"):
        phone = "254" + phone
    if len(phone) < 12:
        raise HTTPException(status_code=400, detail="Invalid M-Pesa number.")

    existing = await db.premium_purchases.find_one({"user_id": current_user_id, "status": "pending"})
    if existing:
        return {
            "checkout_request_id": existing["checkout_request_id"],
            "message": "A payment is already pending. Check your phone.",
            "plan": plan,
        }

    mpesa    = MPesaClient(callback_url=f"{settings.BASE_URL}/api/v1/premium/mpesa/callback")
    response = await mpesa.stk_push(
        phone=phone, amount=plan["kes"],
        reference="ANON-PREMIUM", description=f"Anonixx Premium — {plan['label']}",
    )
    if not response.get("success"):
        raise HTTPException(status_code=502, detail="Could not reach M-Pesa. Try again.")

    checkout_id = response.get("CheckoutRequestID")
    if not checkout_id:
        raise HTTPException(status_code=502, detail="Could not initiate payment.")

    await db.premium_purchases.insert_one({
        "user_id": current_user_id, "plan_id": plan["id"], "provider": "mpesa",
        "kes": plan["kes"], "phone": phone,
        "checkout_request_id": checkout_id,
        "status": "pending", "created_at": _now(), "completed_at": None,
    })
    return {
        "checkout_request_id": checkout_id,
        "message": "Check your phone — enter your M-Pesa PIN to complete.",
        "plan": plan,
    }


@router.get("/mpesa/status/{checkout_request_id}")
async def check_premium_purchase_status(
    checkout_request_id: str,
    current_user_id:     str = Depends(get_current_user_id),
    db                   = Depends(get_database),
):
    purchase = await db.premium_purchases.find_one({
        "checkout_request_id": checkout_request_id, "user_id": current_user_id,
    })
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found.")
    return {"status": purchase["status"], "plan_id": purchase.get("plan_id")}


@router.post("/mpesa/callback")
async def premium_mpesa_callback(payload: MpesaCallbackBody, db=Depends(get_database)):
    """Safaricom callback. Register: https://anonixx-app.onrender.com/api/v1/premium/mpesa/callback"""
    try:
        stk         = payload.Body.get("stkCallback", {})
        result_code = stk.get("ResultCode")
        checkout_id = stk.get("CheckoutRequestID")
        if not checkout_id:
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        purchase = await db.premium_purchases.find_one({"checkout_request_id": checkout_id, "status": "pending"})
        if not purchase:
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        if result_code == 0:
            items     = stk.get("CallbackMetadata", {}).get("Item", [])
            mpesa_ref = next((i.get("Value") for i in items if i.get("Name") == "MpesaReceiptNumber"), checkout_id)
            premium_until = await _grant_premium(purchase["user_id"], purchase["plan_id"], db)
            await db.premium_purchases.update_one(
                {"_id": purchase["_id"]},
                {"$set": {"status": "completed", "mpesa_ref": mpesa_ref, "completed_at": _now(),
                          "premium_until": premium_until}},
            )
        else:
            await db.premium_purchases.update_one(
                {"_id": purchase["_id"]},
                {"$set": {"status": "failed", "result_code": result_code, "result_desc": stk.get("ResultDesc")}},
            )
    except Exception:
        pass
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


# ─── Stripe: create PaymentIntent ─────────────────────────────────────────────

@router.post("/stripe/create-intent")
async def buy_premium_stripe_create_intent(
    data:            StripePremiumRequest,
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    """
    Returns { client_secret, payment_intent_id, amount, currency, plan }.
    The frontend passes client_secret to Stripe's native PaymentSheet.
    Premium is granted via /premium/stripe/webhook once payment succeeds.
    """
    plan = _PLAN_MAP.get(data.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Invalid plan.")

    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Card payments are not configured yet.")

    try:
        import stripe as stripe_sdk
        stripe_sdk.api_key = settings.STRIPE_SECRET_KEY
        intent = stripe_sdk.PaymentIntent.create(
            amount=plan["usd_cents"],
            currency="usd",
            automatic_payment_methods={"enabled": True},
            metadata={
                "product": "anonixx_premium",
                "user_id": current_user_id,
                "plan_id": plan["id"],
            },
        )
    except Exception as e:
        msg = getattr(e, "user_message", None) or str(e)
        raise HTTPException(status_code=400, detail=msg)

    await db.premium_purchases.insert_one({
        "user_id":           current_user_id,
        "plan_id":           plan["id"],
        "amount_cents":      plan["usd_cents"],
        "currency":          "usd",
        "payment_intent_id": intent.id,
        "provider":          "stripe",
        "status":            "pending",
        "created_at":        _now(),
        "completed_at":      None,
    })

    return {
        "client_secret":     intent.client_secret,
        "payment_intent_id": intent.id,
        "amount":            plan["usd_cents"],
        "currency":          "usd",
        "plan":              plan,
    }


@router.post("/stripe/webhook")
async def premium_stripe_webhook(
    request:          Request,
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature"),
    db                = Depends(get_database),
):
    """
    Register this URL in your Stripe dashboard:
        https://anonixx-app.onrender.com/api/v1/premium/stripe/webhook
    Events to enable: payment_intent.succeeded  payment_intent.payment_failed
    """
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe not configured.")

    payload = await request.body()
    try:
        import stripe as stripe_sdk
        stripe_sdk.api_key = settings.STRIPE_SECRET_KEY
        event = stripe_sdk.Webhook.construct_event(
            payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET,
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    try:
        pi   = event["data"]["object"]
        meta = pi.get("metadata", {})

        if meta.get("product") != "anonixx_premium":
            return {"received": True}

        purchase = await db.premium_purchases.find_one({
            "payment_intent_id": pi["id"], "provider": "stripe",
        })
        if not purchase or purchase.get("status") != "pending":
            return {"received": True}

        if event["type"] == "payment_intent.succeeded":
            premium_until = await _grant_premium(purchase["user_id"], purchase["plan_id"], db)
            await db.premium_purchases.update_one(
                {"_id": purchase["_id"]},
                {"$set": {"status": "completed", "completed_at": _now(), "premium_until": premium_until}},
            )
        elif event["type"] == "payment_intent.payment_failed":
            await db.premium_purchases.update_one(
                {"_id": purchase["_id"]},
                {"$set": {
                    "status":      "failed",
                    "fail_reason": pi.get("last_payment_error", {}).get("message", ""),
                }},
            )
    except Exception:
        pass

    return {"received": True}
