from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class CoinPack(str, Enum):
    PACK_100 = "100"
    PACK_500 = "500"
    PACK_1000 = "1000"


class Currency(str, Enum):
    KES = "KES"
    USD = "USD"


class InitiatePaymentRequest(BaseModel):
    coin_pack: CoinPack
    provider: str  # "mpesa", "stripe", "paypal"
    phone: Optional[str] = None  # For M-Pesa
    currency: Currency = Currency.USD


class PaymentResponse(BaseModel):
    transaction_id: str
    provider: str
    amount: float
    currency: str
    coins: int
    status: str
    payment_url: Optional[str] = None  # For Stripe/PayPal redirect
    checkout_request_id: Optional[str] = None  # For M-Pesa STK


class MPesaCallbackRequest(BaseModel):
    """M-Pesa Daraja callback structure"""
    Body: dict


class StripeWebhookRequest(BaseModel):
    """Stripe webhook structure"""
    type: str
    data: dict


class PayPalWebhookRequest(BaseModel):
    """PayPal webhook structure"""
    event_type: str
    resource: dict