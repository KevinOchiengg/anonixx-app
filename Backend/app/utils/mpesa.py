import httpx
import base64
import logging
from datetime import datetime, timezone
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class MPesaClient:
    def __init__(self, callback_url: Optional[str] = None):
        self.consumer_key    = settings.MPESA_CONSUMER_KEY
        self.consumer_secret = settings.MPESA_CONSUMER_SECRET
        self.shortcode       = settings.MPESA_SHORTCODE
        self.passkey         = settings.MPESA_PASSKEY
        # Allow per-call override; fall back to global setting
        self.callback_url    = callback_url or settings.MPESA_CALLBACK_URL

        if settings.MPESA_ENVIRONMENT == "sandbox":
            self.base_url = "https://sandbox.safaricom.co.ke"
        else:
            self.base_url = "https://api.safaricom.co.ke"

        logger.info(
            "MPesaClient init | env=%s base_url=%s shortcode=%s",
            settings.MPESA_ENVIRONMENT, self.base_url, self.shortcode,
        )

    async def get_access_token(self) -> Optional[str]:
        url = f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    url,
                    auth=(self.consumer_key, self.consumer_secret),
                    timeout=10.0,
                )
                data = response.json()
                token = data.get("access_token")
                if not token:
                    logger.error(
                        "M-Pesa access token missing | status=%s body=%s",
                        response.status_code, data,
                    )
                return token
            except Exception as exc:
                logger.error("M-Pesa access token request failed: %s", exc)
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
            return {"success": False, "message": "Failed to get M-Pesa access token. Check consumer key/secret."}

        # Normalize phone to 254XXXXXXXXX
        phone = phone.replace("+", "").replace(" ", "")
        if phone.startswith("0"):
            phone = "254" + phone[1:]

        if not phone.startswith("254") or len(phone) != 12:
            return {"success": False, "message": f"Invalid phone format after normalization: {phone}"}

        timestamp = _now().strftime("%Y%m%d%H%M%S")
        password = base64.b64encode(
            f"{self.shortcode}{self.passkey}{timestamp}".encode()
        ).decode()

        payload = {
            "BusinessShortCode": self.shortcode,
            "Password":          password,
            "Timestamp":         timestamp,
            "TransactionType":   "CustomerPayBillOnline",
            "Amount":            amount,
            "PartyA":            phone,
            "PartyB":            self.shortcode,
            "PhoneNumber":       phone,
            "CallBackURL":       self.callback_url,
            "AccountReference":  reference,
            "TransactionDesc":   description,
        }

        logger.info(
            "STK Push → phone=%s amount=%s ref=%s callback=%s",
            phone, amount, reference, self.callback_url,
        )

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/mpesa/stkpush/v1/processrequest",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type":  "application/json",
                    },
                    timeout=15.0,
                )
                data = response.json()
                logger.info("STK Push response | status=%s body=%s", response.status_code, data)

                if data.get("ResponseCode") == "0":
                    return {
                        "success":           True,
                        "CheckoutRequestID": data.get("CheckoutRequestID"),
                        "MerchantRequestID": data.get("MerchantRequestID"),
                    }

                # Surface Safaricom's actual error message
                safaricom_error = (
                    data.get("errorMessage")
                    or data.get("ResponseDescription")
                    or data.get("ResultDesc")
                    or "STK Push failed."
                )
                logger.error("STK Push rejected by Safaricom: %s | full=%s", safaricom_error, data)
                return {"success": False, "message": safaricom_error, "raw": data}

            except Exception as exc:
                logger.error("STK Push HTTP error: %s", exc)
                return {"success": False, "message": f"STK Push request failed: {exc}"}

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
