"""
payment_schemas.py — Anonixx payment request/response models.

Two payment flows:
  1. Connect unlock  — M-Pesa (KES) or Stripe (USD)
  2. Group entry     — handled in groups.py schemas
"""

from pydantic import BaseModel
from typing import Optional


# ─── Connect unlock ───────────────────────────────────────────────────────────


class MpesaUnlockRequest(BaseModel):
    chat_id: str
    phone_number: str  # Accepts 07XX, 254XX, or +254XX — normalized in router


class StripeUnlockRequest(BaseModel):
    chat_id: str
    payment_method_id: str  # From Stripe.js / Stripe SDK on the frontend


class UnlockStatusResponse(BaseModel):
    status: str  # pending | completed | failed | unlocked
    chat_id: Optional[str] = None
    message: Optional[str] = None


# ─── Callbacks / webhooks (Safaricom and Stripe POST to these) ────────────────


class MpesaCallbackRequest(BaseModel):
    """Safaricom Daraja STK callback body."""

    Body: dict


class StripeWebhookRequest(BaseModel):
    """Stripe webhook event envelope."""

    type: str
    data: dict
