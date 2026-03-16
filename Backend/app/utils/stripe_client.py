import stripe
from typing import Optional
from app.config import settings


class StripeClient:
    def __init__(self):
        stripe.api_key = settings.STRIPE_SECRET_KEY

    async def create_payment_intent(
        self,
        amount: int,
        currency: str,
        metadata: dict,
    ) -> dict:
        """Create a Stripe PaymentIntent. Amount in smallest currency unit (cents)."""
        intent = stripe.PaymentIntent.create(
            amount=amount,
            currency=currency,
            metadata=metadata,
            automatic_payment_methods={"enabled": True},
        )
        return {
            "id": intent.id,
            "client_secret": intent.client_secret,
            "status": intent.status,
        }

    async def retrieve_payment_intent(self, payment_intent_id: str) -> Optional[dict]:
        """Retrieve a PaymentIntent by ID."""
        try:
            intent = stripe.PaymentIntent.retrieve(payment_intent_id)
            return {
                "id": intent.id,
                "status": intent.status,
                "amount": intent.amount,
                "metadata": intent.metadata,
            }
        except stripe.error.StripeError:
            return None

    def verify_webhook_signature(
        self,
        payload: bytes,
        sig_header: str,
    ) -> Optional[dict]:
        """Verify Stripe webhook signature. Returns the event or None."""
        try:
            return stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except (ValueError, stripe.error.SignatureVerificationError):
            return None
