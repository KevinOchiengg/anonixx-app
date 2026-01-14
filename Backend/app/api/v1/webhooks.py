from fastapi import APIRouter, Request, Header, HTTPException
from app.services.payment import PaymentService
from app.services.coin import CoinService
from app.repositories.user import UserRepository
from app.repositories.coin import CoinTransactionRepository
from app.database import get_database
from typing import Optional
import hmac
import hashlib


router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


@router.post("/mpesa")
async def mpesa_callback(request: Request):
    """M-Pesa payment callback"""
    body = await request.json()
    
    db = await get_database()
    user_repo = UserRepository(db)
    transaction_repo = CoinTransactionRepository(db)
    coin_service = CoinService(user_repo, transaction_repo)
    payment_service = PaymentService(coin_service, transaction_repo)
    
    success = await payment_service.handle_mpesa_callback(body)
    
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None)
):
    """Stripe webhook handler"""
    payload = await request.body()
    
    # Verify signature
    from app.utils.stripe_client import StripeClient
    stripe_client = StripeClient()
    event = stripe_client.verify_webhook_signature(payload, stripe_signature)
    
    if not event:
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    db = await get_database()
    user_repo = UserRepository(db)
    transaction_repo = CoinTransactionRepository(db)
    coin_service = CoinService(user_repo, transaction_repo)
    payment_service = PaymentService(coin_service, transaction_repo)
    
    await payment_service.handle_stripe_webhook(
        event_type=event["type"],
        data=event["data"]
    )
    
    return {"status": "success"}


@router.post("/paypal")
async def paypal_webhook(request: Request):
    """PayPal webhook handler"""
    body = await request.json()
    
    # TODO: Verify PayPal webhook signature
    
    db = await get_database()
    user_repo = UserRepository(db)
    transaction_repo = CoinTransactionRepository(db)
    coin_service = CoinService(user_repo, transaction_repo)
    payment_service = PaymentService(coin_service, transaction_repo)
    
    await payment_service.handle_paypal_webhook(
        event_type=body.get("event_type"),
        resource=body.get("resource", {})
    )
    
    return {"status": "success"}