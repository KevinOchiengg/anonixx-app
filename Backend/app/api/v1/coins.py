"""
api/v1/coins.py — Coin balance, transactions, and M-Pesa top-up.

Packages (KES → coins):
  Starter  50  →  55   (5 short of Connect Unlock — nudges to Popular)
  Popular  100 → 120
  Value    250 → 350
  Power    500 → 800
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id
from app.utils.coin_service import credit_coins, debit_coins
from app.utils.mpesa import MPesaClient
from app.config import settings

router = APIRouter(prefix="/coins", tags=["coins"])

COIN_PACKAGES: List[dict] = [
    {"id": "starter", "kes": 50,  "coins": 55,  "label": "Starter",  "tag": None},
    {"id": "popular", "kes": 100, "coins": 120, "label": "Popular",  "tag": "Best Value"},
    {"id": "value",   "kes": 250, "coins": 350, "label": "Value",    "tag": "+40% bonus"},
    {"id": "power",   "kes": 500, "coins": 800, "label": "Power",    "tag": "+60% bonus"},
]
_PACKAGE_MAP = {p["id"]: p for p in COIN_PACKAGES}

# Apple App Store Connect / Google Play Console product IDs.
# Create these in both consoles with EXACTLY these identifiers.
IAP_PRODUCT_IDS = {
    "starter": "com.anonixx.coins.starter",
    "popular": "com.anonixx.coins.popular",
    "value":   "com.anonixx.coins.value",
    "power":   "com.anonixx.coins.power",
}
IAP_PRODUCT_TO_PACKAGE = {v: k for k, v in IAP_PRODUCT_IDS.items()}


def _now() -> datetime:
    return datetime.now(timezone.utc)


SPEND_COSTS = {
    "connect_unlock": 60,
    "drop_reveal":    30,
    "circle_entry":   20,
    "streak_freeze":  50,
}

class BuyCoinsRequest(BaseModel):
    package_id:   str
    phone_number: str

class BuyCoinsStripeRequest(BaseModel):
    package_id: str

class BuyCoinsIAPRequest(BaseModel):
    platform:        str            # "ios" | "android"
    product_id:      str            # the IAP_PRODUCT_IDS value, e.g. "com.anonixx.coins.popular"
    receipt:         Optional[str]  = None  # iOS: base64 receipt
    purchase_token:  Optional[str]  = None  # Android: Google Play purchase token
    transaction_id:  Optional[str]  = None  # client-known id, used as idempotency fallback

class SpendCoinsRequest(BaseModel):
    reason:      str   # must be a key in SPEND_COSTS
    description: str   # human-readable label stored in transaction

class MpesaCallbackBody(BaseModel):
    Body: dict

class WithdrawRequest(BaseModel):
    amount_coins: int
    mpesa_number: str   # format 2547XXXXXXXX

MIN_WITHDRAWAL_COINS = 100


@router.get("/packages")
async def list_packages():
    return {"packages": COIN_PACKAGES}


@router.get("/balance")
async def get_coin_balance(
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    user = await db.users.find_one({"_id": ObjectId(current_user_id)}, {"coin_balance": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"balance": user.get("coin_balance", 0)}


@router.get("/transactions")
async def get_transactions(
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    txns = await db.coin_transactions.find(
        {"user_id": current_user_id}
    ).sort("created_at", -1).limit(50).to_list(None)
    return [
        {
            "id":               str(t["_id"]),
            "amount":           t["amount"],
            "balance_after":    t["balance_after"],
            "transaction_type": t["transaction_type"],
            "reason":           t["reason"],
            "description":      t.get("description", ""),
            "created_at":       t["created_at"].isoformat(),
        }
        for t in txns
    ]


@router.post("/spend")
async def spend_coins(
    data:            SpendCoinsRequest,
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    """
    Deduct coins for a specific action (connect unlock, drop reveal, circle entry, etc.).
    Returns the new balance.  Raises 402 if balance is insufficient.
    """
    amount = SPEND_COSTS.get(data.reason)
    if amount is None:
        raise HTTPException(status_code=400, detail="Unknown spend reason.")

    try:
        new_balance = await debit_coins(
            db          = db,
            user_id     = current_user_id,
            amount      = amount,
            reason      = data.reason,
            description = data.description,
        )
    except ValueError as e:
        if "Insufficient" in str(e):
            raise HTTPException(status_code=402, detail="Not enough coins.")
        raise HTTPException(status_code=404, detail="User not found.")

    return {"new_balance": new_balance, "spent": amount, "reason": data.reason}


@router.get("/costs")
async def get_spend_costs():
    """Returns the coin cost for each action — used by the frontend to display prices."""
    return {"costs": SPEND_COSTS}


@router.post("/withdraw")
async def request_withdrawal(
    data:            WithdrawRequest,
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    """
    Queue a cash withdrawal for coins earned via drop-unlock revenue share.
    Mirrors the circle_payouts accumulator pattern in circles.py — coins are
    debited immediately, the request lands in `withdrawal_requests` as
    "pending", and an admin pays it out manually (no automated M-Pesa B2C
    integration exists yet). If a request is later rejected, the coins
    should be credited back via `credit_coins(reason="withdrawal_request")`
    — that reversal path is an admin-tool follow-up, not built here.
    """
    if data.amount_coins < MIN_WITHDRAWAL_COINS:
        raise HTTPException(status_code=400, detail=f"Minimum withdrawal is {MIN_WITHDRAWAL_COINS} coins.")
    if not data.mpesa_number.strip():
        raise HTTPException(status_code=400, detail="M-Pesa number is required.")

    try:
        new_balance = await debit_coins(
            db          = db,
            user_id     = current_user_id,
            amount      = data.amount_coins,
            reason      = "withdrawal_request",
            description = f"Withdrawal request — {data.amount_coins} coins",
        )
    except ValueError as e:
        if "Insufficient" in str(e):
            raise HTTPException(status_code=402, detail="Not enough coins.")
        raise HTTPException(status_code=404, detail="User not found.")

    doc = {
        "_id":          ObjectId(),
        "user_id":      current_user_id,
        "amount_coins": data.amount_coins,
        "mpesa_number": data.mpesa_number.strip(),
        "status":       "pending",   # pending | paid | rejected
        "created_at":   _now(),
    }
    await db.withdrawal_requests.insert_one(doc)

    return {
        "id":          str(doc["_id"]),
        "status":      "pending",
        "new_balance": new_balance,
    }


@router.get("/withdraw/history")
async def withdrawal_history(
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    docs = await db.withdrawal_requests.find(
        {"user_id": current_user_id}
    ).sort("created_at", -1).to_list(None)

    return [
        {
            "id":           str(d["_id"]),
            "amount_coins": d["amount_coins"],
            "mpesa_number": d["mpesa_number"],
            "status":       d["status"],
            "created_at":   d["created_at"].isoformat(),
        }
        for d in docs
    ]


@router.post("/buy/mpesa")
async def buy_coins_mpesa(
    data:            BuyCoinsRequest,
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    package = _PACKAGE_MAP.get(data.package_id)
    if not package:
        raise HTTPException(status_code=400, detail="Invalid package.")

    phone = data.phone_number.strip().replace(" ", "")
    if phone.startswith("0"):
        phone = "254" + phone[1:]
    elif phone.startswith("7") or phone.startswith("1"):
        phone = "254" + phone
    if len(phone) < 12:
        raise HTTPException(status_code=400, detail="Invalid M-Pesa number.")

    existing = await db.coin_purchases.find_one({"user_id": current_user_id, "status": "pending"})
    if existing:
        return {
            "checkout_request_id": existing["checkout_request_id"],
            "message": "A payment is already pending. Check your phone.",
            "package": package,
        }

    mpesa    = MPesaClient()
    response = await mpesa.stk_push(
        phone=phone, amount=package["kes"],
        reference="ANON-COINS", description=f"Anonixx {package['coins']} coins",
    )
    if not response.get("success"):
        raise HTTPException(status_code=502, detail="Could not reach M-Pesa. Try again.")

    checkout_id = response.get("CheckoutRequestID")
    if not checkout_id:
        raise HTTPException(status_code=502, detail="Could not initiate payment.")

    await db.coin_purchases.insert_one({
        "user_id": current_user_id, "package_id": package["id"],
        "coins": package["coins"], "kes": package["kes"], "phone": phone,
        "checkout_request_id": checkout_id,
        "status": "pending", "created_at": _now(), "completed_at": None,
    })
    await db.users.update_one(
        {"_id": ObjectId(current_user_id)}, {"$set": {"mpesa_phone": phone}}
    )
    return {
        "checkout_request_id": checkout_id,
        "message": "Check your phone — enter your M-Pesa PIN to complete.",
        "package": package,
    }


@router.get("/buy/status/{checkout_request_id}")
async def check_purchase_status(
    checkout_request_id: str,
    current_user_id:     str = Depends(get_current_user_id),
    db                   = Depends(get_database),
):
    purchase = await db.coin_purchases.find_one({
        "checkout_request_id": checkout_request_id, "user_id": current_user_id,
    })
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found.")
    return {"status": purchase["status"], "coins": purchase["coins"], "package": purchase.get("package_id")}


@router.post("/buy/mpesa/callback")
async def mpesa_coins_callback(payload: MpesaCallbackBody, db=Depends(get_database)):
    """Safaricom callback. Register: https://anonixx-app.onrender.com/api/v1/coins/buy/mpesa/callback"""
    try:
        stk         = payload.Body.get("stkCallback", {})
        result_code = stk.get("ResultCode")
        checkout_id = stk.get("CheckoutRequestID")
        if not checkout_id:
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        purchase = await db.coin_purchases.find_one({"checkout_request_id": checkout_id, "status": "pending"})
        if not purchase:
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        if result_code == 0:
            items     = stk.get("CallbackMetadata", {}).get("Item", [])
            mpesa_ref = next((i.get("Value") for i in items if i.get("Name") == "MpesaReceiptNumber"), checkout_id)
            await credit_coins(
                db=db, user_id=purchase["user_id"], amount=purchase["coins"],
                reason="mpesa_purchase", description=f"Bought {purchase['coins']} coins via M-Pesa",
                meta={"mpesa_ref": mpesa_ref, "package_id": purchase["package_id"], "kes": purchase["kes"]},
            )
            await db.coin_purchases.update_one(
                {"_id": purchase["_id"]},
                {"$set": {"status": "completed", "mpesa_ref": mpesa_ref, "completed_at": _now()}},
            )
        else:
            await db.coin_purchases.update_one(
                {"_id": purchase["_id"]},
                {"$set": {"status": "failed", "result_code": result_code, "result_desc": stk.get("ResultDesc")}},
            )
    except Exception:
        pass
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


# ─── Stripe: create PaymentIntent (geo-priced) ───────────────────────────────

@router.post("/buy/stripe/create-intent")
async def buy_coins_stripe_create_intent(
    data:            BuyCoinsStripeRequest,
    request:         Request,
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    """
    Creates a Stripe PaymentIntent for a coin package purchase.
    Price is determined server-side from the user's IP (PPP tiers) —
    the client cannot manipulate the amount.

    Returns { client_secret, payment_intent_id, amount, currency, coins }
    The frontend passes client_secret to Stripe's PaymentSheet.
    Coins are credited via the /buy/stripe/webhook once payment succeeds.
    """
    from app.api.v1.geo_pricing import (
        country_from_ip, TIER_MAP, STRIPE_PRICES, _PACKAGES_BASE,
    )

    pkg = next((p for p in _PACKAGES_BASE if p["id"] == data.package_id), None)
    if not pkg:
        raise HTTPException(status_code=400, detail="Invalid package.")

    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Card payments are not configured yet.")

    # Derive tier from IP — prevents price manipulation from the client
    forwarded    = request.headers.get("X-Forwarded-For", "")
    ip           = forwarded.split(",")[0].strip() if forwarded else (request.client.host or "")
    country      = await country_from_ip(ip)
    tier         = TIER_MAP.get(country, 1)     # unknown → Tier 1 (safest for revenue)
    stripe_tier  = min(tier, 2)                 # Tier 3 M-Pesa countries → Tier 2 USD
    amount_cents = STRIPE_PRICES[stripe_tier][data.package_id]

    try:
        import stripe as stripe_sdk
        stripe_sdk.api_key = settings.STRIPE_SECRET_KEY
        intent = stripe_sdk.PaymentIntent.create(
            amount=amount_cents,
            currency="usd",
            automatic_payment_methods={"enabled": True},
            metadata={
                "product":    "anonixx_coins",
                "user_id":    current_user_id,
                "package_id": data.package_id,
                "coins":      str(pkg["coins"]),
                "tier":       str(stripe_tier),
                "country":    country,
            },
        )
    except Exception as e:
        msg = getattr(e, "user_message", None) or str(e)
        raise HTTPException(status_code=400, detail=msg)

    # Record pending purchase so the webhook can credit coins
    await db.coin_purchases.insert_one({
        "user_id":           current_user_id,
        "package_id":        data.package_id,
        "coins":             pkg["coins"],
        "amount_cents":      amount_cents,
        "currency":          "usd",
        "payment_intent_id": intent.id,
        "provider":          "stripe",
        "tier":              stripe_tier,
        "country":           country,
        "status":            "pending",
        "created_at":        _now(),
        "completed_at":      None,
    })

    return {
        "client_secret":      intent.client_secret,
        "payment_intent_id":  intent.id,
        "amount":             amount_cents,
        "currency":           "usd",
        "coins":              pkg["coins"],
    }


# ─── Stripe: webhook (coins credit) ──────────────────────────────────────────

@router.post("/buy/stripe/webhook")
async def buy_coins_stripe_webhook(
    request:          Request,
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature"),
    db                = Depends(get_database),
):
    """
    Stripe posts here when a payment_intent.succeeded / failed event fires.
    Register this URL in your Stripe dashboard:
        https://anonixx-app.onrender.com/api/v1/coins/buy/stripe/webhook
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

        if meta.get("product") != "anonixx_coins":
            return {"received": True}               # not our product

        purchase = await db.coin_purchases.find_one({
            "payment_intent_id": pi["id"],
            "provider":          "stripe",
        })
        if not purchase or purchase.get("status") != "pending":
            return {"received": True}               # idempotent

        if event["type"] == "payment_intent.succeeded":
            await credit_coins(
                db          = db,
                user_id     = purchase["user_id"],
                amount      = purchase["coins"],
                reason      = "stripe_purchase",
                description = f"Bought {purchase['coins']} coins via card",
                meta        = {
                    "payment_intent_id": pi["id"],
                    "package_id":        purchase["package_id"],
                    "amount_cents":      purchase["amount_cents"],
                },
            )
            await db.coin_purchases.update_one(
                {"_id": purchase["_id"]},
                {"$set": {"status": "completed", "completed_at": _now()}},
            )

        elif event["type"] == "payment_intent.payment_failed":
            await db.coin_purchases.update_one(
                {"_id": purchase["_id"]},
                {"$set": {
                    "status":      "failed",
                    "fail_reason": pi.get("last_payment_error", {}).get("message", ""),
                }},
            )
    except Exception:
        pass                                        # always return 200 to Stripe

    return {"received": True}


# ─── IAP: Apple / Google Play receipt verification ───────────────────────────

@router.get("/iap/products")
async def list_iap_products():
    """
    Returns the canonical Apple/Google product IDs alongside each coin package.
    The frontend uses this to match StoreKit/Play Billing SKUs back to packages.
    """
    return {
        "products": [
            {
                **pkg,
                "ios_product_id":     IAP_PRODUCT_IDS[pkg["id"]],
                "android_product_id": IAP_PRODUCT_IDS[pkg["id"]],
            }
            for pkg in COIN_PACKAGES
        ],
    }


@router.post("/buy/iap/verify")
async def verify_iap_purchase(
    data:            BuyCoinsIAPRequest,
    current_user_id: str = Depends(get_current_user_id),
    db                  = Depends(get_database),
):
    """
    Server-side validation of an Apple App Store or Google Play in-app purchase.
    Credits the matching coin package atomically. Idempotent — replaying the
    same transaction_id will return the original credit without double-paying.

    Required to comply with Apple/Google policy: digital goods sold inside the
    iOS/Android app MUST flow through the platform's IAP (StoreKit / Play Billing).
    """
    from app.utils.iap_validator import verify_apple_receipt, verify_google_purchase

    if data.platform not in ("ios", "android"):
        raise HTTPException(status_code=400, detail="Invalid platform.")

    package_id = IAP_PRODUCT_TO_PACKAGE.get(data.product_id)
    if not package_id:
        raise HTTPException(status_code=400, detail="Unknown IAP product.")
    pkg = _PACKAGE_MAP[package_id]

    # ── Validate the receipt with the relevant store ──────────────────────
    if data.platform == "ios":
        if not data.receipt:
            raise HTTPException(status_code=400, detail="Missing receipt.")
        result = await verify_apple_receipt(
            receipt_data=data.receipt,
            expected_product_id=data.product_id,
        )
    else:
        if not data.purchase_token:
            raise HTTPException(status_code=400, detail="Missing purchase_token.")
        result = await verify_google_purchase(
            package_name=settings.GOOGLE_PLAY_PACKAGE_NAME,
            product_id=data.product_id,
            purchase_token=data.purchase_token,
        )

    if not result.get("valid"):
        raise HTTPException(
            status_code=402,
            detail=f"Receipt invalid: {result.get('error', 'unknown')}",
        )

    transaction_id = (
        result.get("transaction_id")
        or data.transaction_id
        or (data.receipt or data.purchase_token or "")[:40]
    )
    if not transaction_id:
        raise HTTPException(status_code=400, detail="No transaction id.")

    # ── Idempotency: reject (or no-op) repeats of the same transaction ────
    existing = await db.coin_purchases.find_one({
        "iap_transaction_id": transaction_id,
        "provider":           "iap",
    })
    if existing:
        if existing.get("status") == "completed":
            balance_doc = await db.users.find_one(
                {"_id": ObjectId(current_user_id)}, {"coin_balance": 1},
            )
            return {
                "already_credited": True,
                "coins":            existing.get("coins", pkg["coins"]),
                "new_balance":      (balance_doc or {}).get("coin_balance", 0),
            }

    # ── Credit coins atomically ───────────────────────────────────────────
    new_balance = await credit_coins(
        db          = db,
        user_id     = current_user_id,
        amount      = pkg["coins"],
        reason      = "iap_purchase",
        description = f"Bought {pkg['coins']} coins via {data.platform.upper()} IAP",
        meta        = {
            "platform":       data.platform,
            "product_id":     data.product_id,
            "transaction_id": transaction_id,
        },
    )

    await db.coin_purchases.insert_one({
        "user_id":             current_user_id,
        "package_id":          package_id,
        "coins":               pkg["coins"],
        "provider":            "iap",
        "platform":            data.platform,
        "iap_product_id":      data.product_id,
        "iap_transaction_id":  transaction_id,
        "status":              "completed",
        "created_at":          _now(),
        "completed_at":        _now(),
    })

    return {
        "already_credited": False,
        "coins":            pkg["coins"],
        "new_balance":      new_balance,
        "package":          pkg,
    }
