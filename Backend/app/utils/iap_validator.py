"""
iap_validator.py — Apple App Store + Google Play receipt validation.

Both platforms require server-side verification of in-app purchases.
NEVER trust client-reported success — always validate the receipt server-side.

Apple flow:
  Client receives base64 receipt → sends to backend → backend POSTs to Apple's
  verifyReceipt endpoint → Apple returns parsed receipt + status.
  status == 0  →  valid

Google Play flow:
  Client receives purchaseToken → sends to backend with productId + packageName
  → backend calls Android Publisher API (purchases.products.get) using a
  service-account JWT → Google returns purchase state.
  purchaseState == 0  →  purchased

Required env (set in Backend/.env):
  APPLE_SHARED_SECRET           — App Store Connect → Manage In-App Purchases → Master Shared Secret
  GOOGLE_PLAY_PACKAGE_NAME      — e.g. com.anonixx.app
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON — full JSON of the service account, OR path to file
"""

from __future__ import annotations

import base64
import json
import logging
import time
from typing import Optional

import httpx

from app.config import settings

log = logging.getLogger(__name__)

APPLE_PROD_URL    = "https://buy.itunes.apple.com/verifyReceipt"
APPLE_SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt"


# ─── Apple ────────────────────────────────────────────────────────────────────

async def verify_apple_receipt(
    receipt_data: str,
    expected_product_id: Optional[str] = None,
) -> dict:
    """
    Verifies a base64-encoded App Store receipt. Returns:
        { valid: bool, product_id: str|None, transaction_id: str|None, raw: dict, error: str|None }

    Auto-handles the sandbox-vs-production retry per Apple's docs.
    Pass `expected_product_id` to enforce that the receipt matches the
    product the client claims to have purchased.
    """
    shared_secret = getattr(settings, "APPLE_SHARED_SECRET", "") or ""
    if not shared_secret:
        return {"valid": False, "error": "APPLE_SHARED_SECRET not configured."}

    payload = {
        "receipt-data":            receipt_data,
        "password":                shared_secret,
        "exclude-old-transactions": True,
    }

    async def _post(url: str) -> dict:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(url, json=payload)
            r.raise_for_status()
            return r.json()

    try:
        data = await _post(APPLE_PROD_URL)
        # 21007 → this is a sandbox receipt sent to prod, retry sandbox
        if data.get("status") == 21007:
            data = await _post(APPLE_SANDBOX_URL)
    except Exception as exc:
        log.exception("Apple receipt verification HTTP error")
        return {"valid": False, "error": f"Apple verifyReceipt failed: {exc}"}

    if data.get("status") != 0:
        return {
            "valid":   False,
            "error":   f"Apple status {data.get('status')}",
            "raw":     data,
        }

    # Pick the most recent in-app entry
    in_apps = data.get("receipt", {}).get("in_app") or data.get("latest_receipt_info") or []
    if not in_apps:
        return {"valid": False, "error": "No in_app entries.", "raw": data}

    # Newest first by purchase_date_ms
    in_apps_sorted = sorted(
        in_apps,
        key=lambda x: int(x.get("purchase_date_ms", 0)),
        reverse=True,
    )
    latest = in_apps_sorted[0]
    product_id     = latest.get("product_id")
    transaction_id = latest.get("transaction_id")

    if expected_product_id and product_id != expected_product_id:
        return {
            "valid": False,
            "error": f"Product mismatch: receipt={product_id} expected={expected_product_id}",
            "raw":   data,
        }

    return {
        "valid":          True,
        "product_id":     product_id,
        "transaction_id": transaction_id,
        "raw":            latest,
        "error":          None,
    }


# ─── Google Play ──────────────────────────────────────────────────────────────

def _get_google_credentials() -> Optional[dict]:
    """Loads the Google service-account JSON from settings (raw JSON or file path)."""
    raw = getattr(settings, "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "") or ""
    if not raw:
        return None
    raw = raw.strip()
    # If it looks like a path, read the file
    if not raw.startswith("{"):
        try:
            with open(raw, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            log.warning("Could not read GOOGLE_PLAY_SERVICE_ACCOUNT_JSON file: %s", exc)
            return None
    try:
        return json.loads(raw)
    except Exception:
        return None


async def _get_google_access_token(creds: dict) -> Optional[str]:
    """Exchanges a service-account JWT for a Google OAuth2 access token."""
    try:
        # We do JWT signing manually to avoid pulling another dependency
        import jwt  # PyJWT — already used by app.core.jwt
    except Exception:
        log.warning("PyJWT not available for Google IAP validation.")
        return None

    now    = int(time.time())
    claims = {
        "iss":   creds["client_email"],
        "scope": "https://www.googleapis.com/auth/androidpublisher",
        "aud":   "https://oauth2.googleapis.com/token",
        "iat":   now,
        "exp":   now + 3600,
    }
    try:
        assertion = jwt.encode(claims, creds["private_key"], algorithm="RS256")
    except Exception as exc:
        log.exception("Failed to sign Google JWT: %s", exc)
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    "assertion":  assertion,
                },
            )
            r.raise_for_status()
            return r.json().get("access_token")
    except Exception as exc:
        log.exception("Google token exchange failed: %s", exc)
        return None


async def verify_google_purchase(
    package_name: str,
    product_id:   str,
    purchase_token: str,
) -> dict:
    """
    Verifies a Google Play in-app purchase token via the Android Publisher API.
    Returns:
        { valid, product_id, transaction_id, raw, error }
    """
    creds = _get_google_credentials()
    if not creds:
        return {"valid": False, "error": "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not configured."}

    access_token = await _get_google_access_token(creds)
    if not access_token:
        return {"valid": False, "error": "Could not obtain Google access token."}

    url = (
        f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/"
        f"{package_name}/purchases/products/{product_id}/tokens/{purchase_token}"
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, headers={"Authorization": f"Bearer {access_token}"})
            data = r.json() if r.content else {}
    except Exception as exc:
        log.exception("Google Play API call failed: %s", exc)
        return {"valid": False, "error": f"Google API error: {exc}"}

    # purchaseState: 0 = purchased, 1 = canceled, 2 = pending
    if data.get("purchaseState") != 0:
        return {
            "valid": False,
            "error": f"purchaseState={data.get('purchaseState')}",
            "raw":   data,
        }

    return {
        "valid":          True,
        "product_id":     product_id,
        "transaction_id": data.get("orderId") or purchase_token[:32],
        "raw":            data,
        "error":          None,
    }
