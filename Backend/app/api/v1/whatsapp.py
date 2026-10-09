"""
WhatsApp relay — send a confession to one person without revealing who sent it.

Flow
  1. Sender writes a confession + the recipient's WhatsApp number (POST /whatsapp/send).
  2. Anonixx's own WhatsApp number sends the recipient a consent template that
     contains NO confession text — only "someone sent you an anonymous message"
     plus Accept / Decline / Block buttons.
  3. Only if the recipient taps Accept (webhook) is the confession delivered.
     Decline drops it; Block opts the number out of every future message.

The sender's identity is never sent to WhatsApp. Opted-out numbers are silently
treated as "declined" so a sender can't probe who has blocked Anonixx.
"""
import hashlib
import hmac
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel

from app.api.v1.drops import create_drop, CreateDropRequest, is_premium_user_id, DROP_POST_COST
from app.config import settings
from app.utils.coin_service import credit_coins
from app.database import get_database
from app.dependencies import get_current_user_id
from app.utils.contact_filter import contains_contact_info, CONTACT_INFO_ERROR
from app.utils.moderation import violates_policy, MODERATION_ERROR

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])

SHARE_BASE_URL = "https://anonixx.app/drop"
GRAPH_URL = "https://graph.facebook.com/v20.0"
MAX_TEXT_LEN = 500
SENDER_DAILY_LIMIT = 5
RECIPIENT_DAILY_LIMIT = 3
REQUEST_TTL = timedelta(days=7)
DEFAULT_COUNTRY_CODE = "254"   # Kenya — local 07xx / 01xx numbers get this prefix


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _configured() -> bool:
    return bool(settings.WHATSAPP_PHONE_NUMBER_ID and settings.WHATSAPP_ACCESS_TOKEN)


def normalize_phone(raw: str) -> Optional[str]:
    """Return digits-only E.164 (no '+'), or None if it can't be a real number."""
    digits = re.sub(r"[^\d+]", "", raw or "")
    if digits.startswith("+"):
        digits = digits[1:]
    elif digits.startswith("00"):
        digits = digits[2:]
    elif digits.startswith("0"):
        digits = DEFAULT_COUNTRY_CODE + digits[1:]
    if not digits.isdigit() or not (8 <= len(digits) <= 15):
        return None
    return digits


def _mask(phone: str) -> str:
    return f"+{phone[:3]}••••{phone[-2:]}" if len(phone) > 6 else "••••"


async def _graph_post(payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(
            f"{GRAPH_URL}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages",
            headers={"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"},
            json={"messaging_product": "whatsapp", **payload},
        )
    if res.status_code >= 400:
        logger.warning("WhatsApp send failed %s: %s", res.status_code, res.text[:300])
        raise RuntimeError(res.text[:200])
    return res.json()


async def _send_text(to: str, body: str) -> None:
    await _graph_post({"to": to, "type": "text", "text": {"body": body, "preview_url": False}})


async def _send_consent_template(to: str, request_id: str) -> str:
    def btn(index: int, payload: str) -> dict:
        return {
            "type": "button", "sub_type": "quick_reply", "index": str(index),
            "parameters": [{"type": "payload", "payload": payload}],
        }

    data = await _graph_post({
        "to": to,
        "type": "template",
        "template": {
            "name": settings.WHATSAPP_TEMPLATE_NAME,
            "language": {"code": settings.WHATSAPP_TEMPLATE_LANG},
            "components": [
                btn(0, f"accept:{request_id}"),
                btn(1, f"decline:{request_id}"),
                btn(2, f"block:{request_id}"),
            ],
        },
    })
    return (data.get("messages") or [{}])[0].get("id", "")


# ───────────────────────── sender side ─────────────────────────

class SendRequest(BaseModel):
    phone: str
    text: str


@router.post("/send")
async def send_anonymous_message(
    data: SendRequest,
    current_user_id: str = Depends(get_current_user_id),
    db=Depends(get_database),
):
    if not _configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Sending to WhatsApp isn't available yet.")

    text = (data.text or "").strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Write your confession first.")
    if len(text) > MAX_TEXT_LEN:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail=f"Keep it under {MAX_TEXT_LEN} characters.")
    if contains_contact_info(text):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=CONTACT_INFO_ERROR)
    if violates_policy(text):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=MODERATION_ERROR)

    phone = normalize_phone(data.phone)
    if not phone:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail="Enter a valid WhatsApp number with country code.")

    user = await db["users"].find_one({"_id": ObjectId(current_user_id)}, {"is_active": 1})
    if not user or user.get("is_active") is False:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Account unavailable.")

    day_ago = _now() - timedelta(days=1)
    sent_today = await db["whatsapp_messages"].count_documents(
        {"sender_id": current_user_id, "created_at": {"$gte": day_ago}})
    if sent_today >= SENDER_DAILY_LIMIT:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            detail="Daily limit reached. Try again tomorrow.")

    pending_same = await db["whatsapp_messages"].find_one({
        "sender_id": current_user_id, "to_phone": phone, "status": "pending",
        "created_at": {"$gte": _now() - REQUEST_TTL},
    })
    if pending_same:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail="They haven't replied to your last one yet.")

    to_recipient_today = await db["whatsapp_messages"].count_documents(
        {"to_phone": phone, "created_at": {"$gte": day_ago}})

    # The confession also goes live on Anonixx as an ordinary drop (same cost
    # as posting one); the WhatsApp message links back to it. Raises 402 if
    # the sender can't afford it, before anything is sent to WhatsApp.
    drop = await create_drop(CreateDropRequest(confession=text), current_user_id, db)

    now = _now()
    doc = {
        "sender_id":  current_user_id,
        "to_phone":   phone,
        "text":       text,
        "drop_id":    drop["id"],
        "status":     "pending",
        "created_at": now,
    }

    opted_out = await db["whatsapp_optouts"].find_one({"phone": phone})
    if opted_out or to_recipient_today >= RECIPIENT_DAILY_LIMIT:
        # Look identical to a decline so nobody can probe blocks or limits.
        doc["status"] = "declined"
        await db["whatsapp_messages"].insert_one(doc)
        return {"status": "pending", "message": "Sent. They'll be asked before anything is shown."}

    result = await db["whatsapp_messages"].insert_one(doc)
    try:
        wa_id = await _send_consent_template(phone, str(result.inserted_id))
        await db["whatsapp_messages"].update_one(
            {"_id": result.inserted_id}, {"$set": {"wa_message_id": wa_id}})
    except Exception:
        await db["whatsapp_messages"].update_one(
            {"_id": result.inserted_id}, {"$set": {"status": "failed"}})
        # Nothing was delivered — take the drop back down and refund the post fee.
        await db["drops"].update_one({"_id": ObjectId(drop["id"])}, {"$set": {"is_active": False}})
        if drop.get("coins_spent") and not await is_premium_user_id(current_user_id, db):
            await credit_coins(db, current_user_id, DROP_POST_COST, "refund",
                               "WhatsApp message couldn't be delivered", {"drop_id": drop["id"]})
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            detail="Couldn't reach WhatsApp. Check the number and try again.")

    return {"status": "pending", "message": "Sent. They'll be asked before anything is shown."}


@router.get("/sent")
async def my_sent_messages(
    current_user_id: str = Depends(get_current_user_id),
    db=Depends(get_database),
):
    cursor = db["whatsapp_messages"].find({"sender_id": current_user_id}).sort("created_at", -1).limit(50)
    items = []
    async for m in cursor:
        st = m["status"]
        if st == "pending" and _now() - _aware(m["created_at"]) > REQUEST_TTL:
            st = "expired"
        items.append({
            "id":         str(m["_id"]),
            "to":         _mask(m["to_phone"]),
            "text":       m["text"],
            "status":     st,
            "created_at": m["created_at"].isoformat(),
        })
    return {"messages": items}


# ───────────────────────── recipient side (webhook) ─────────────────────────

@router.get("/webhook")
async def verify_webhook(
    mode: str = Query(None, alias="hub.mode"),
    token: str = Query(None, alias="hub.verify_token"),
    challenge: str = Query(None, alias="hub.challenge"),
):
    if mode == "subscribe" and settings.WHATSAPP_VERIFY_TOKEN and token == settings.WHATSAPP_VERIFY_TOKEN:
        return Response(content=challenge or "", media_type="text/plain")
    raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _signature_ok(raw: bytes, header: Optional[str]) -> bool:
    if not settings.WHATSAPP_APP_SECRET:
        return False
    expected = "sha256=" + hmac.new(
        settings.WHATSAPP_APP_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header or "")


async def _handle_reply(db, from_phone: str, action: str, request_id: Optional[str]) -> None:
    if action == "block":
        await db["whatsapp_optouts"].update_one(
            {"phone": from_phone}, {"$set": {"phone": from_phone, "created_at": _now()}}, upsert=True)
        await db["whatsapp_messages"].update_many(
            {"to_phone": from_phone, "status": "pending"}, {"$set": {"status": "declined"}})
        await _send_text(from_phone, "Done. You won't receive anonymous messages from Anonixx again.")
        return

    msg = None
    if request_id and ObjectId.is_valid(request_id):
        msg = await db["whatsapp_messages"].find_one({"_id": ObjectId(request_id)})
    # A button can only act on a request addressed to the number that tapped it.
    if not msg or msg["to_phone"] != from_phone or msg["status"] != "pending":
        return

    if _now() - _aware(msg["created_at"]) > REQUEST_TTL:
        await db["whatsapp_messages"].update_one({"_id": msg["_id"]}, {"$set": {"status": "expired"}})
        await _send_text(from_phone, "That message has expired.")
        return

    if action == "decline":
        await db["whatsapp_messages"].update_one({"_id": msg["_id"]}, {"$set": {"status": "declined"}})
        await _send_text(from_phone, "Declined. Nothing was shown and the sender isn't told who you are.")
        return

    if action == "accept":
        await _send_text(
            from_phone,
            f"“{msg['text']}”\n\n— An anonymous message sent through Anonixx.\n"
            + (f"See the post: {SHARE_BASE_URL}/{msg['drop_id']}\n" if msg.get("drop_id") else "")
            + "Reply STOP to block all anonymous messages.",
        )
        await db["whatsapp_messages"].update_one(
            {"_id": msg["_id"]}, {"$set": {"status": "delivered", "delivered_at": _now()}})


@router.post("/webhook")
async def receive_webhook(request: Request, db=Depends(get_database)):
    raw = await request.body()
    if not _signature_ok(raw, request.headers.get("X-Hub-Signature-256")):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Bad signature")

    try:
        body = await request.json()
    except Exception:
        return {"ok": True}

    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            for m in (change.get("value") or {}).get("messages", []) or []:
                from_phone = m.get("from", "")
                try:
                    if m.get("type") == "button":
                        payload = (m.get("button") or {}).get("payload", "")
                        action, _, rid = payload.partition(":")
                        if action in ("accept", "decline", "block"):
                            await _handle_reply(db, from_phone, action, rid)
                    elif m.get("type") == "text":
                        if (m.get("text") or {}).get("body", "").strip().lower() in ("stop", "block"):
                            await _handle_reply(db, from_phone, "block", None)
                except Exception:
                    logger.exception("WhatsApp webhook handling failed")
    return {"ok": True}
