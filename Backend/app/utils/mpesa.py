import httpx
import base64
from datetime import datetime, timezone
from typing import Optional
from app.config import settings


def _now() -> datetime:
    return datetime.now(timezone.utc)


class MPesaClient:
    def __init__(self):
        self.consumer_key = settings.MPESA_CONSUMER_KEY
        self.consumer_secret = settings.MPESA_CONSUMER_SECRET
        self.shortcode = settings.MPESA_SHORTCODE
        self.passkey = settings.MPESA_PASSKEY
        self.callback_url = settings.MPESA_CALLBACK_URL

        if settings.MPESA_ENVIRONMENT == "sandbox":
            self.base_url = "https://sandbox.safaricom.co.ke"
        else:
            self.base_url = "https://api.safaricom.co.ke"

    async def get_access_token(self) -> Optional[str]:
        url = f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials"
        auth_string = f"{self.consumer_key}:{self.consumer_secret}"
        auth_b64 = base64.b64encode(auth_string.encode("ascii")).decode("ascii")

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    url, headers={"Authorization": f"Basic {auth_b64}"}
                )
                response.raise_for_status()
                return response.json().get("access_token")
            except Exception:
                return None

    async def stk_push(
        self,
        phone: str,
        amount: int,
        reference: str,
        description: str,
    ) -> dict:
        access_token = await self.get_access_token()
        if not access_token:
            return {"success": False, "message": "Failed to get access token."}

        # Normalize phone to 254XXXXXXXXX
        phone = phone.replace("+", "").replace(" ", "")
        if phone.startswith("0"):
            phone = "254" + phone[1:]

        timestamp = _now().strftime("%Y%m%d%H%M%S")
        password = base64.b64encode(
            f"{self.shortcode}{self.passkey}{timestamp}".encode()
        ).decode()

        payload = {
            "BusinessShortCode": self.shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": amount,
            "PartyA": phone,
            "PartyB": self.shortcode,
            "PhoneNumber": phone,
            "CallBackURL": self.callback_url,
            "AccountReference": reference,
            "TransactionDesc": description,
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/mpesa/stkpush/v1/processrequest",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                    },
                )
                data = response.json()
                if data.get("ResponseCode") == "0":
                    return {
                        "success": True,
                        "CheckoutRequestID": data.get("CheckoutRequestID"),
                        "MerchantRequestID": data.get("MerchantRequestID"),
                    }
                return {
                    "success": False,
                    "message": data.get("ResponseDescription", "STK Push failed."),
                }
            except Exception:
                return {"success": False, "message": "STK Push request failed."}

    async def query_transaction(self, checkout_request_id: str) -> dict:
        """Query STK push transaction status directly from Safaricom."""
        access_token = await self.get_access_token()
        if not access_token:
            return {"success": False}

        timestamp = _now().strftime("%Y%m%d%H%M%S")
        password = base64.b64encode(
            f"{self.shortcode}{self.passkey}{timestamp}".encode()
        ).decode()

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/mpesa/stkpushquery/v1/query",
                    json={
                        "BusinessShortCode": self.shortcode,
                        "Password": password,
                        "Timestamp": timestamp,
                        "CheckoutRequestID": checkout_request_id,
                    },
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                    },
                )
                return response.json()
            except Exception:
                return {"success": False}
