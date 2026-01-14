import httpx
import base64
from typing import Optional
from app.config import settings


class PayPalClient:
    def __init__(self):
        self.client_id = settings.PAYPAL_CLIENT_ID
        self.client_secret = settings.PAYPAL_CLIENT_SECRET
        
        if settings.PAYPAL_MODE == "sandbox":
            self.base_url = "https://api-m.sandbox.paypal.com"
        else:
            self.base_url = "https://api-m.paypal.com"

    async def get_access_token(self) -> Optional[str]:
        """Get PayPal OAuth token"""
        url = f"{self.base_url}/v1/oauth2/token"
        
        auth_string = f"{self.client_id}:{self.client_secret}"
        auth_bytes = auth_string.encode('ascii')
        auth_b64 = base64.b64encode(auth_bytes).decode('ascii')
        
        headers = {
            "Authorization": f"Basic {auth_b64}",
            "Content-Type": "application/x-www-form-urlencoded"
        }

        data = {"grant_type": "client_credentials"}

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, headers=headers, data=data)
                response.raise_for_status()
                result = response.json()
                return result.get("access_token")
            except Exception as e:
                print(f"PayPal token error: {e}")
                return None

    async def create_order(
        self,
        amount: float,
        currency: str,
        reference_id: str,
        description: str
    ) -> dict:
        """Create PayPal order"""
        access_token = await self.get_access_token()
        if not access_token:
            return {"success": False}

        url = f"{self.base_url}/v2/checkout/orders"
        
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

        payload = {
            "intent": "CAPTURE",
            "purchase_units": [{
                "amount": {
                    "currency_code": currency,
                    "value": str(amount)
                },
                "description": description,
                "custom_id": reference_id
            }],
            "application_context": {
                "return_url": f"{settings.CORS_ORIGINS[0]}/payment/success",
                "cancel_url": f"{settings.CORS_ORIGINS[0]}/payment/cancel"
            }
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()
                
                # Get approval URL
                approval_url = None
                for link in data.get("links", []):
                    if link.get("rel") == "approve":
                        approval_url = link.get("href")
                        break

                return {
                    "success": True,
                    "id": data.get("id"),
                    "approval_url": approval_url
                }
            except Exception as e:
                print(f"PayPal create order error: {e}")
                return {"success": False}

    async def capture_order(self, order_id: str) -> dict:
        """Capture PayPal order"""
        access_token = await self.get_access_token()
        if not access_token:
            return {"success": False}

        url = f"{self.base_url}/v2/checkout/orders/{order_id}/capture"
        
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, headers=headers)
                response.raise_for_status()
                data = response.json()
                
                return {
                    "success": data.get("status") == "COMPLETED",
                    "data": data
                }
            except Exception as e:
                print(f"PayPal capture error: {e}")
                return {"success": False}