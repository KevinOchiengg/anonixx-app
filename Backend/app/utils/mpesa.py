import httpx
import base64
from datetime import datetime
from typing import Optional
from app.config import settings


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
        """Get M-Pesa OAuth access token"""
        url = f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials"
        
        auth_string = f"{self.consumer_key}:{self.consumer_secret}"
        auth_bytes = auth_string.encode('ascii')
        auth_b64 = base64.b64encode(auth_bytes).decode('ascii')
        
        headers = {
            "Authorization": f"Basic {auth_b64}"
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                data = response.json()
                return data.get("access_token")
            except Exception as e:
                print(f"M-Pesa token error: {e}")
                return None

    async def stk_push(
        self,
        phone: str,
        amount: int,
        reference: str,
        description: str
    ) -> dict:
        """Initiate STK Push"""
        access_token = await self.get_access_token()
        if not access_token:
            return {"success": False, "message": "Failed to get access token"}

        # Format phone number (remove + and ensure 254 prefix)
        phone = phone.replace("+", "").replace(" ", "")
        if phone.startswith("0"):
            phone = "254" + phone[1:]

        # Generate timestamp and password
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        password_string = f"{self.shortcode}{self.passkey}{timestamp}"
        password = base64.b64encode(password_string.encode()).decode()

        url = f"{self.base_url}/mpesa/stkpush/v1/processrequest"
        
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

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
            "TransactionDesc": description
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, headers=headers)
                data = response.json()
                
                if data.get("ResponseCode") == "0":
                    return {
                        "success": True,
                        "CheckoutRequestID": data.get("CheckoutRequestID"),
                        "MerchantRequestID": data.get("MerchantRequestID")
                    }
                else:
                    return {
                        "success": False,
                        "message": data.get("ResponseDescription", "STK Push failed")
                    }
            except Exception as e:
                print(f"M-Pesa STK Push error: {e}")
                return {"success": False, "message": str(e)}

    async def query_transaction(self, checkout_request_id: str) -> dict:
        """Query STK Push transaction status"""
        access_token = await self.get_access_token()
        if not access_token:
            return {"success": False}

        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        password_string = f"{self.shortcode}{self.passkey}{timestamp}"
        password = base64.b64encode(password_string.encode()).decode()

        url = f"{self.base_url}/mpesa/stkpushquery/v1/query"
        
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

        payload = {
            "BusinessShortCode": self.shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "CheckoutRequestID": checkout_request_id
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, headers=headers)
                return response.json()
            except Exception as e:
                print(f"M-Pesa query error: {e}")
                return {"success": False}