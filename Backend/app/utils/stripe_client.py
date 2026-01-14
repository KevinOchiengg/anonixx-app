import stripe
from app.config import settings
from typing import Optional


class StripeClient:
    def __init__(self):
        stripe.api_key = settings.STRIPE_SECRET_KEY

    async def create_payment_intent(
        self,
        amount: int,
        currency: str,
        metadata: dict
    ) -> dict:
        """Create Stripe PaymentIntent"""
        try:
            intent = stripe.PaymentIntent.create(
                amount=amount,
                currency=currency,
                metadata=metadata,
                automatic_payment_methods={"enabled": True}
            )
            return {
                "id": intent.id,
                "client_secret": intent.client_secret,
                "status": intent.status
            }
        except stripe.error.StripeError as e:
            print(f"Stripe error: {e}")
            raise

    async def retrieve_payment_intent(self, payment_intent_id: str) -> Optional[dict]:
        """Retrieve PaymentIntent details"""
        try:
            intent = stripe.PaymentIntent.retrieve(payment_intent_id)
            return {
                "id": intent.id,
                "status": intent.status,
                "amount": intent.amount,
                "metadata": intent.metadata
            }
        except stripe.error.StripeError as e:
            print(f"Stripe retrieve error: {e}")
            return None

    def verify_webhook_signature(self, payload: bytes, sig_header: str) -> Optional[dict]:
        """Verify Stripe webhook signature"""
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
            return event
        except ValueError:
            print("Invalid payload")
            return None
        except stripe.error.SignatureVerificationError:
            print("Invalid signature")
            return None