from typing import Optional
from app.services.coin import CoinService
from app.repositories.coin import CoinTransactionRepository
from app.config import settings
from app.core.exceptions import PaymentFailedException, BadRequestException
import secrets


class PaymentService:
    def __init__(self, coin_service: CoinService, transaction_repo: CoinTransactionRepository):
        self.coin_service = coin_service
        self.transaction_repo = transaction_repo

    def get_coin_pack_details(self, pack: str, currency: str) -> dict:
        """Get coin pack pricing"""
        packs = {
            "100": {"coins": 100, "KES": settings.COIN_PACK_100_KES, "USD": settings.COIN_PACK_100_USD},
            "500": {"coins": 500, "KES": settings.COIN_PACK_500_KES, "USD": settings.COIN_PACK_500_USD},
            "1000": {"coins": 1000, "KES": settings.COIN_PACK_1000_KES, "USD": settings.COIN_PACK_1000_USD},
        }

        pack_details = packs.get(pack)
        if not pack_details:
            raise BadRequestException("Invalid coin pack")

        amount = pack_details.get(currency)
        if not amount:
            raise BadRequestException(f"Currency {currency} not supported")

        return {
            "coins": pack_details["coins"],
            "amount": amount,
            "currency": currency
        }

    async def initiate_mpesa_payment(
        self,
        user_id: str,
        phone: str,
        coin_pack: str,
        currency: str = "KES"
    ) -> dict:
        """Initiate M-Pesa STK Push"""
        from app.utils.mpesa import MPesaClient

        pack_details = self.get_coin_pack_details(coin_pack, currency)

        # Create pending transaction
        reference_id = f"MPESA-{secrets.token_hex(8).upper()}"
        transaction = await self.coin_service.create_purchase_transaction(
            user_id=user_id,
            coins=pack_details["coins"],
            amount=pack_details["amount"],
            provider="mpesa",
            reference_id=reference_id
        )

        # Initiate STK Push
        mpesa_client = MPesaClient()
        response = await mpesa_client.stk_push(
            phone=phone,
            amount=int(pack_details["amount"]),
            reference=reference_id,
            description=f"Echo Coins - {pack_details['coins']} coins"
        )

        if not response.get("success"):
            await self.coin_service.fail_purchase(transaction.id)
            raise PaymentFailedException("Failed to initiate M-Pesa payment")

        return {
            "transaction_id": transaction.id,
            "provider": "mpesa",
            "amount": pack_details["amount"],
            "currency": currency,
            "coins": pack_details["coins"],
            "status": "pending",
            "checkout_request_id": response.get("CheckoutRequestID")
        }

    async def initiate_stripe_payment(
        self,
        user_id: str,
        coin_pack: str,
        currency: str = "USD"
    ) -> dict:
        """Initiate Stripe payment"""
        from app.utils.stripe_client import StripeClient

        pack_details = self.get_coin_pack_details(coin_pack, currency)

        # Create pending transaction
        reference_id = f"STRIPE-{secrets.token_hex(8).upper()}"
        transaction = await self.coin_service.create_purchase_transaction(
            user_id=user_id,
            coins=pack_details["coins"],
            amount=pack_details["amount"],
            provider="stripe",
            reference_id=reference_id
        )

        # Create Stripe Payment Intent
        stripe_client = StripeClient()
        payment_intent = await stripe_client.create_payment_intent(
            amount=int(pack_details["amount"] * 100),  # Cents
            currency=currency.lower(),
            metadata={
                "transaction_id": transaction.id,
                "user_id": user_id,
                "coins": pack_details["coins"]
            }
        )

        return {
            "transaction_id": transaction.id,
            "provider": "stripe",
            "amount": pack_details["amount"],
            "currency": currency,
            "coins": pack_details["coins"],
            "status": "pending",
            "payment_url": None,  # Frontend handles with client_secret
            "client_secret": payment_intent["client_secret"]
        }

    async def initiate_paypal_payment(
        self,
        user_id: str,
        coin_pack: str,
        currency: str = "USD"
    ) -> dict:
        """Initiate PayPal payment"""
        from app.utils.paypal_client import PayPalClient

        pack_details = self.get_coin_pack_details(coin_pack, currency)

        # Create pending transaction
        reference_id = f"PAYPAL-{secrets.token_hex(8).upper()}"
        transaction = await self.coin_service.create_purchase_transaction(
            user_id=user_id,
            coins=pack_details["coins"],
            amount=pack_details["amount"],
            provider="paypal",
            reference_id=reference_id
        )

        # Create PayPal order
        paypal_client = PayPalClient()
        order = await paypal_client.create_order(
            amount=pack_details["amount"],
            currency=currency,
            reference_id=reference_id,
            description=f"Echo Coins - {pack_details['coins']} coins"
        )

        return {
            "transaction_id": transaction.id,
            "provider": "paypal",
            "amount": pack_details["amount"],
            "currency": currency,
            "coins": pack_details["coins"],
            "status": "pending",
            "payment_url": order.get("approval_url"),
            "order_id": order.get("id")
        }

    async def handle_mpesa_callback(self, callback_data: dict) -> bool:
        """Handle M-Pesa payment callback"""
        try:
            result_code = callback_data.get("Body", {}).get("stkCallback", {}).get("ResultCode")
            checkout_id = callback_data.get("Body", {}).get("stkCallback", {}).get("CheckoutRequestID")

            # Find transaction by checkout ID (you'd need to store this)
            # For now, extract from callback metadata
            
            if result_code == 0:
                # Payment successful
                transaction_id = callback_data.get("transaction_id")  # Extract from your stored mapping
                await self.coin_service.complete_purchase(transaction_id)
                return True
            else:
                # Payment failed
                transaction_id = callback_data.get("transaction_id")
                await self.coin_service.fail_purchase(transaction_id)
                return False

        except Exception as e:
            print(f"M-Pesa callback error: {e}")
            return False

    async def handle_stripe_webhook(self, event_type: str, data async def handle_stripe_webhook(self, event_type: str, data: dict) -> bool:
        """Handle Stripe webhook events"""
        try:
            if event_type == "payment_intent.succeeded":
                payment_intent = data.get("object", {})
                metadata = payment_intent.get("metadata", {})
                transaction_id = metadata.get("transaction_id")

                if not transaction_id:
                    print("No transaction_id in Stripe webhook")
                    return False

                # Check for idempotency (prevent duplicate processing)
                transaction = await self.transaction_repo.find_by_transaction_id(transaction_id)
                if not transaction or transaction["status"] != "pending":
                    return True  # Already processed or doesn't exist

                # Complete purchase
                await self.coin_service.complete_purchase(transaction_id)
                return True

            elif event_type == "payment_intent.payment_failed":
                payment_intent = data.get("object", {})
                metadata = payment_intent.get("metadata", {})
                transaction_id = metadata.get("transaction_id")

                if transaction_id:
                    await self.coin_service.fail_purchase(transaction_id)
                return True

            return False

        except Exception as e:
            print(f"Stripe webhook error: {e}")
            return False

    async def handle_paypal_webhook(self, event_type: str, resource: dict) -> bool:
        """Handle PayPal webhook events"""
        try:
            if event_type == "PAYMENT.CAPTURE.COMPLETED":
                custom_id = resource.get("custom_id")  # Your reference_id
                
                if not custom_id:
                    return False

                # Find transaction
                transaction = await self.transaction_repo.find_by_reference_id(custom_id)
                if not transaction or transaction["status"] != "pending":
                    return True  # Already processed

                # Complete purchase
                await self.coin_service.complete_purchase(transaction["transaction_id"])
                return True

            elif event_type in ["PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED"]:
                custom_id = resource.get("custom_id")
                
                if custom_id:
                    transaction = await self.transaction_repo.find_by_reference_id(custom_id)
                    if transaction:
                        await self.coin_service.fail_purchase(transaction["transaction_id"])
                return True

            return False

        except Exception as e:
            print(f"PayPal webhook error: {e}")
            return False