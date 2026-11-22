"""Paid lives on Agora.

A host goes live (or schedules a live) and sets an entry price in coins. Anyone may watch a
PREVIEW_SECONDS preview once; after that the server stops minting tokens and they pay to become a
member until the live ends. Members chat with the host and send gifts.

Money: entry fees are split HOST_ENTRY_SHARE to the host, the rest to Anonixx; gifts go wholly to
the host. Host earnings accrue in `live_earnings` and are paid out weekly by an admin to the host's
verified payout method (`live_payout_profiles`): M-Pesa in Kenya, PayPal or bank transfer anywhere. Hosts can promote a live in the main feed with coins.

Adult lives exist only when ADULT_LIVES_ENABLED is set, and only on the website for age-verified
viewers; the app never lists them.
"""
import asyncio
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.config import settings
from app.database import get_database
from app.dependencies import get_current_user_id, get_optional_user_id, require_admin, require_super_admin
from app.utils import activity
from app.utils.audit import audit
from app.utils.coin_service import debit_coins
from app.utils.geoip import request_country
from app.utils.contact_filter import CONTACT_INFO_ERROR, contains_contact_info
from app.utils.moderation import MODERATION_ERROR, violates_policy

router = APIRouter(prefix="/lives", tags=["Lives"])
admin_router = APIRouter(prefix="/admin/lives", tags=["Admin Lives"])

PREVIEW_SECONDS = 30
HOST_ENTRY_SHARE = 0.8
PRICE_MIN, PRICE_MAX = 1, 500
TITLE_MAX, ABOUT_MAX, CHAT_MAX = 80, 300, 300
TOKEN_TTL_SECONDS = 3600
PRESENCE_SECONDS = 45
MESSAGES_PAGE = 60
SCHEDULE_MAX_DAYS = 30

GIFTS: dict[str, dict] = {
    "rose":    {"label": "Rose",    "coins": 1},
    "heart":   {"label": "Heart",   "coins": 2},
    "fire":    {"label": "Fire",    "coins": 5},
    "diamond": {"label": "Diamond", "coins": 10},
    "crown":   {"label": "Crown",   "coins": 25},
}
PROMO_COST_BY_HOURS = {1: 3, 6: 10, 24: 25}

ROLE_PUBLISHER, ROLE_SUBSCRIBER = 1, 2
MPESA_RE = re.compile(r"^(?:\+?254|0)?(7\d{8}|1\d{8})$")


# ─── helpers ────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return _aware(dt).isoformat() if dt else None


def week_start(dt: datetime) -> datetime:
    """Monday 00:00 UTC of dt's week; payouts cover whole weeks."""
    dt = _aware(dt)
    return (dt - timedelta(days=dt.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


def _oid(raw: str) -> ObjectId:
    if not ObjectId.is_valid(raw):
        raise HTTPException(status_code=404, detail="Live not found.")
    return ObjectId(raw)


def _agora_token(channel: str, uid: int, role: int, expires_at: datetime) -> str:
    if not settings.AGORA_APP_ID or not settings.AGORA_APP_CERTIFICATE:
        raise HTTPException(status_code=503, detail="Lives aren't configured yet.")
    from agora_token_builder import RtcTokenBuilder
    return RtcTokenBuilder.buildTokenWithUid(
        settings.AGORA_APP_ID, settings.AGORA_APP_CERTIFICATE, channel, uid, role, int(expires_at.timestamp()),
    )


def _stream(live: dict, uid: int, role: int, expires_at: datetime) -> dict:
    return {
        "app_id": settings.AGORA_APP_ID,
        "channel": live["channel"],
        "uid": uid,
        "token": _agora_token(live["channel"], uid, role, expires_at),
        "host_uid": live["host_uid"],
        "expires_at": expires_at.isoformat(),
    }


def _clean_text(text: str, limit: int) -> str:
    text = " ".join((text or "").split())[:limit]
    if contains_contact_info(text):
        raise HTTPException(status_code=400, detail=CONTACT_INFO_ERROR)
    if violates_policy(text):
        raise HTTPException(status_code=400, detail=MODERATION_ERROR)
    return text


async def _emit(event: str, payload: dict, user_ids) -> None:
    try:
        from app.sio import sio
        for uid in set(user_ids):
            await sio.emit(event, payload, room=f"user_{uid}")
    except Exception:
        pass


def _push(db, user_ids, title: str, body: str, data: dict) -> None:
    from app.api.v1.drops import send_push_notification
    for uid in set(user_ids):
        asyncio.create_task(send_push_notification(uid, title, body, db, data, kind="live"))


async def _people(db, ids) -> dict:
    oids = [ObjectId(i) for i in set(ids) if i and ObjectId.is_valid(i)]
    out: dict = {}
    if oids:
        async for u in db["users"].find({"_id": {"$in": oids}}, {"anonymous_name": 1, "avatar_url": 1, "gender": 1}):
            out[str(u["_id"])] = {
                "name": u.get("anonymous_name") or "Anonymous",
                "avatar_url": u.get("avatar_url"),
                "gender": u.get("gender") if u.get("gender") in {"male", "female", "nonbinary"} else None,
            }
    return out


async def _viewer(db, user_id: Optional[str]) -> dict:
    if not user_id:
        return {}
    return await db["users"].find_one({"_id": ObjectId(user_id)}, {"age_verified": 1, "is_admin": 1}) or {}


def _adult_visible(viewer: dict, platform: str) -> bool:
    return settings.ADULT_LIVES_ENABLED and platform == "web" and bool(viewer.get("age_verified"))


async def _load(db, live_id: str) -> dict:
    live = await db["lives"].find_one({"_id": _oid(live_id)})
    if not live:
        raise HTTPException(status_code=404, detail="Live not found.")
    return live


async def _is_member(db, live_id: str, user_id: Optional[str]) -> bool:
    if not user_id:
        return False
    return bool(await db["live_members"].find_one({"live_id": live_id, "user_id": user_id}, {"_id": 1}))


async def _member_ids(db, live: dict) -> list[str]:
    ids = await db["live_members"].distinct("user_id", {"live_id": str(live["_id"])})
    return [live["host_id"], *ids]


async def _viewers_now(db, live_ids: list[str]) -> dict:
    if not live_ids:
        return {}
    since = _now() - timedelta(seconds=PRESENCE_SECONDS)
    rows = db["live_presence"].aggregate([
        {"$match": {"live_id": {"$in": live_ids}, "seen_at": {"$gte": since}}},
        {"$group": {"_id": "$live_id", "n": {"$sum": 1}}},
    ])
    return {r["_id"]: r["n"] async for r in rows}


def _card(live: dict, host: dict, viewers: int = 0) -> dict:
    promo = _aware(live.get("promo_until"))
    return {
        "id": str(live["_id"]),
        "title": live["title"],
        "about": live.get("about"),
        "cover_url": live.get("cover_url"),
        "price": live["price"],
        "adult": bool(live.get("adult")),
        "status": live["status"],
        "starts_at": _iso(live.get("starts_at")),
        "started_at": _iso(live.get("started_at")),
        "ended_at": _iso(live.get("ended_at")),
        "members": live.get("members", 0),
        "viewers": viewers,
        "promoted": bool(promo and promo > _now()),
        "host": {"id": live["host_id"], **host},
    }


# ─── payout profile (hosts) ─────────────────────────────────────

# M-Pesa only where it works (Kenya); PayPal and bank transfer everywhere.
PAYOUT_CURRENCY = {"mpesa": "KES", "paypal": "USD", "bank": "USD"}
PAYOUT_LABEL = {"mpesa": "M-Pesa", "paypal": "PayPal", "bank": "bank account"}
MPESA_COUNTRIES = {"KE"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.IGNORECASE)
ACCOUNT_RE = re.compile(r"^[A-Z0-9]{4,34}$")
SWIFT_RE = re.compile(r"^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$")


class PayoutProfileBody(BaseModel):
    legal_name: str = Field(..., min_length=3, max_length=80)
    id_number: str = Field(..., min_length=5, max_length=20)
    method: Literal["mpesa", "paypal", "bank"] = "mpesa"
    mpesa_phone: Optional[str] = Field(None, max_length=15)
    paypal_email: Optional[str] = Field(None, max_length=120)
    bank_name: Optional[str] = Field(None, max_length=80)
    account_number: Optional[str] = Field(None, max_length=40)
    swift_code: Optional[str] = Field(None, max_length=11)


def _normalize_mpesa(raw: str) -> str:
    m = MPESA_RE.match(re.sub(r"[\s\-]", "", raw or ""))
    if not m:
        raise HTTPException(status_code=400, detail="Enter a valid Safaricom number, e.g. 0712 345 678.")
    return f"254{m.group(1)}"


def _method_of(p: dict) -> str:
    return p.get("method") or "mpesa"   # profiles saved before PayPal/bank existed are M-Pesa


def _currency_of(p: Optional[dict], country: Optional[str]) -> str:
    if p:
        return PAYOUT_CURRENCY[_method_of(p)]
    return "KES" if country in MPESA_COUNTRIES else "USD"


def _rate(currency: str) -> float:
    return settings.LIVE_PAYOUT_KES_PER_COIN if currency == "KES" else settings.LIVE_PAYOUT_USD_PER_COIN


def _amount(coins: float, currency: str) -> float:
    value = coins * _rate(currency)
    return round(value) if currency == "KES" else round(value, 2)


def _details(p: dict) -> dict:
    if _method_of(p) == "mpesa" and "details" not in p:
        return {"phone": p.get("mpesa_phone")}
    return p.get("details") or {}


def _destination(p: dict, full: bool = False) -> str:
    method, d = _method_of(p), _details(p)
    if method == "mpesa":
        local = f"0{d['phone'][3:]}"
        return f"M-Pesa {local}" if full else f"M-Pesa {local[:4]} ••• {local[-3:]}"
    if method == "paypal":
        email = d["email"]
        if full:
            return f"PayPal {email}"
        name, _, domain = email.partition("@")
        return f"PayPal {name[:1]}•••@{domain}"
    acct = d["account_number"]
    if full:
        swift = f" · SWIFT {d['swift_code']}" if d.get("swift_code") else ""
        return f"{d['bank_name']} · {acct}{swift}"
    return f"{d['bank_name']} ••{acct[-4:]}"


def _profile_out(p: Optional[dict], full: bool = False) -> Optional[dict]:
    if not p:
        return None
    out = {
        "legal_name": p["legal_name"],
        "id_number_last4": p["id_number"][-4:],
        "method": _method_of(p),
        "currency": PAYOUT_CURRENCY[_method_of(p)],
        "destination": _destination(p, full=full),
        "verified": bool(p.get("verified_at")),
        "submitted_at": _iso(p.get("submitted_at")),
    }
    if full:
        out["id_number"] = p["id_number"]
    return out


def _methods_for(country: Optional[str]) -> list[str]:
    return (["mpesa"] if country in MPESA_COUNTRIES else []) + ["paypal", "bank"]


@router.get("/payout-profile")
async def get_payout_profile(request: Request, user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    country = await request_country(request)
    return {
        "profile": _profile_out(await db["live_payout_profiles"].find_one({"user_id": user_id})),
        "methods": _methods_for(country),
        "country": country,
    }


@router.put("/payout-profile")
async def save_payout_profile(
    body: PayoutProfileBody, request: Request, user_id: str = Depends(get_current_user_id), db=Depends(get_database),
):
    country = await request_country(request)
    if body.method == "mpesa":
        if country not in MPESA_COUNTRIES:
            raise HTTPException(status_code=400, detail="M-Pesa payouts are only available in Kenya. Choose PayPal or bank transfer.")
        details = {"phone": _normalize_mpesa(body.mpesa_phone)}
    elif body.method == "paypal":
        email = (body.paypal_email or "").strip().lower()
        if not EMAIL_RE.match(email):
            raise HTTPException(status_code=400, detail="Enter the email address of your PayPal account.")
        details = {"email": email}
    else:
        bank = " ".join((body.bank_name or "").split())
        account = re.sub(r"[\s\-]", "", body.account_number or "").upper()
        swift = re.sub(r"\s", "", body.swift_code or "").upper()
        if len(bank) < 2:
            raise HTTPException(status_code=400, detail="Enter your bank's name.")
        if not ACCOUNT_RE.match(account):
            raise HTTPException(status_code=400, detail="Enter a valid account number or IBAN.")
        if swift and not SWIFT_RE.match(swift):
            raise HTTPException(status_code=400, detail="A SWIFT/BIC code has 8 or 11 letters and numbers.")
        details = {"bank_name": bank, "account_number": account, "swift_code": swift or None}

    doc = {
        "legal_name": " ".join(body.legal_name.split()),
        "id_number": re.sub(r"\s", "", body.id_number),
        "method": body.method,
        "details": details,
        "country": country,
        "submitted_at": _now(),
        "verified_at": None,
    }
    await db["live_payout_profiles"].update_one(
        {"user_id": user_id}, {"$set": doc, "$unset": {"mpesa_phone": ""}, "$setOnInsert": {"user_id": user_id}}, upsert=True,
    )
    return {"profile": _profile_out({**doc, "user_id": user_id})}


# ─── browse ─────────────────────────────────────────────────────

@router.get("")
async def browse(
    tab: Literal["live", "upcoming", "mine"] = "live",
    platform: Literal["web", "app"] = "app",
    user_id: Optional[str] = Depends(get_optional_user_id),
    db=Depends(get_database),
):
    if tab == "mine":
        if not user_id:
            raise HTTPException(status_code=401, detail="Sign in to see your lives.")
        query: dict = {"host_id": user_id}
        sort = [("created_at", -1)]
    elif tab == "live":
        query = {"status": "live"}
        sort = [("promo_until", -1), ("members", -1), ("started_at", -1)]
    else:
        query = {"status": "scheduled", "starts_at": {"$gte": _now() - timedelta(hours=1)}}
        sort = [("starts_at", 1)]
    if tab != "mine" and not _adult_visible(await _viewer(db, user_id), platform):
        query["adult"] = {"$ne": True}

    rows = await db["lives"].find(query).sort(sort).to_list(60)
    hosts = await _people(db, [r["host_id"] for r in rows])
    viewers = await _viewers_now(db, [str(r["_id"]) for r in rows if r["status"] == "live"])
    return {"lives": [_card(r, hosts.get(r["host_id"], {}), viewers.get(str(r["_id"]), 0)) for r in rows]}


@router.get("/promoted")
async def promoted(db=Depends(get_database)):
    """Lives paid to appear in the main feed. Never adult."""
    now = _now()
    rows = await db["lives"].find({
        "status": {"$in": ["live", "scheduled"]}, "adult": {"$ne": True}, "promo_until": {"$gt": now},
    }).sort("promo_until", -1).to_list(10)
    hosts = await _people(db, [r["host_id"] for r in rows])
    return {"lives": [_card(r, hosts.get(r["host_id"], {})) for r in rows]}


# ─── host earnings ──────────────────────────────────────────────

@router.get("/earnings")
async def my_earnings(request: Request, user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    rows = db["live_earnings"].aggregate([
        {"$match": {"host_id": user_id}},
        {"$group": {"_id": {"week": "$week", "paid": "$paid_out"}, "coins": {"$sum": "$coins"}}},
    ])
    weeks: dict[str, dict] = {}
    async for r in rows:
        key = _aware(r["_id"]["week"]).isoformat()
        w = weeks.setdefault(key, {"week": key, "coins": 0, "paid_coins": 0})
        w["coins"] += r["coins"]
        if r["_id"]["paid"]:
            w["paid_coins"] += r["coins"]
    profile = await db["live_payout_profiles"].find_one({"user_id": user_id})
    currency = _currency_of(profile, None if profile else await request_country(request))
    current = week_start(_now()).isoformat()
    out = sorted(weeks.values(), key=lambda w: w["week"], reverse=True)
    for w in out:
        w["amount"] = _amount(w["coins"], currency)
        w["status"] = "in_progress" if w["week"] == current else "paid" if w["paid_coins"] >= w["coins"] else "due"
    owed = sum(w["coins"] - w["paid_coins"] for w in out if w["status"] == "due")
    return {
        "weeks": out[:26],
        "owed_coins": owed,
        "owed_amount": _amount(owed, currency),
        "currency": currency,
        "rate": _rate(currency),
        "host_share": HOST_ENTRY_SHARE,
        "profile": _profile_out(profile),
    }


@router.get("/gifts")
async def gift_catalog():
    return {"gifts": [{"id": k, **v} for k, v in GIFTS.items()]}


# ─── create / host controls ─────────────────────────────────────

class CreateLiveBody(BaseModel):
    title: str = Field(..., min_length=3, max_length=TITLE_MAX)
    about: Optional[str] = Field(None, max_length=ABOUT_MAX)
    cover_url: Optional[str] = Field(None, max_length=600)
    price: int = Field(..., ge=PRICE_MIN, le=PRICE_MAX)
    starts_at: Optional[datetime] = None   # None = going live now
    adult: bool = False


@router.post("", status_code=201)
async def create_live(body: CreateLiveBody, user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    host = await db["users"].find_one({"_id": ObjectId(user_id)}, {"age_verified": 1})
    if not host or not host.get("age_verified"):
        raise HTTPException(status_code=403, detail="Confirm you're 18 or older before hosting a live.")
    if not await db["live_payout_profiles"].find_one({"user_id": user_id}, {"_id": 1}):
        raise HTTPException(status_code=400, detail={"code": "payout_profile_required", "message": "Add your payout details first so you can get paid."})
    if body.adult and not settings.ADULT_LIVES_ENABLED:
        raise HTTPException(status_code=400, detail="Adult lives aren't available.")
    if await db["lives"].find_one({"host_id": user_id, "status": "live"}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="You're already live. End that live first.")

    now = _now()
    starts_at = _aware(body.starts_at)
    if starts_at and not (now <= starts_at <= now + timedelta(days=SCHEDULE_MAX_DAYS)):
        raise HTTPException(status_code=400, detail=f"Pick a time within the next {SCHEDULE_MAX_DAYS} days.")

    doc = {
        "host_id": user_id,
        "title": _clean_text(body.title, TITLE_MAX),
        "about": _clean_text(body.about, ABOUT_MAX) if body.about else None,
        "cover_url": body.cover_url,
        "price": body.price,
        "adult": body.adult,
        "status": "scheduled",
        "starts_at": starts_at or now,
        "channel": f"live_{secrets.token_hex(8)}",
        "host_uid": secrets.randbelow(2 ** 31 - 2) + 1,
        "members": 0,
        "entry_coins": 0,
        "gift_coins": 0,
        "created_at": now,
    }
    res = await db["lives"].insert_one(doc)
    doc["_id"] = res.inserted_id
    return {"live": _card(doc, (await _people(db, [user_id])).get(user_id, {}))}


def _host_only(live: dict, user_id: str) -> None:
    if live["host_id"] != user_id:
        raise HTTPException(status_code=403, detail="Only the host can do that.")


@router.post("/{live_id}/start")
async def start_live(live_id: str, user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    live = await _load(db, live_id)
    _host_only(live, user_id)
    if live["status"] == "ended":
        raise HTTPException(status_code=400, detail="This live has ended. Create a new one.")
    if live["status"] == "scheduled":
        if await db["lives"].find_one({"host_id": user_id, "status": "live", "_id": {"$ne": live["_id"]}}, {"_id": 1}):
            raise HTTPException(status_code=409, detail="You're already live. End that live first.")
        now = _now()
        await db["lives"].update_one({"_id": live["_id"]}, {"$set": {"status": "live", "started_at": now}})
        live.update(status="live", started_at=now)
        await _announce_start(db, live)
    return {"stream": _stream(live, live["host_uid"], ROLE_PUBLISHER, _now() + timedelta(seconds=TOKEN_TTL_SECONDS))}


async def _announce_start(db, live: dict) -> None:
    host = (await _people(db, [live["host_id"]])).get(live["host_id"], {})
    followers = await db["live_follows"].distinct("user_id", {"host_id": live["host_id"]})
    reminded = await db["live_reminders"].distinct("user_id", {"live_id": str(live["_id"])})
    audience = [u for u in {*followers, *reminded} if u != live["host_id"]]
    if audience:
        await activity.record_many(db, audience, "live_started", actor_id=live["host_id"], text=live["title"],
                                   live_id=str(live["_id"]))
        _push(db, audience, f"{host.get('name', 'Someone')} is live", live["title"],
              {"type": "live", "live_id": str(live["_id"]), "url": f"/lives/{live['_id']}"})


@router.post("/{live_id}/end")
async def end_live(live_id: str, user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    live = await _load(db, live_id)
    _host_only(live, user_id)
    await _finish(db, live)
    return {"status": "ended"}


async def _finish(db, live: dict) -> None:
    if live["status"] == "ended":
        return
    await db["lives"].update_one({"_id": live["_id"]}, {"$set": {"status": "ended", "ended_at": _now(), "promo_until": None}})
    await _emit("live_ended", {"live_id": str(live["_id"])}, await _member_ids(db, live))


@router.post("/{live_id}/renew")
async def renew_token(live_id: str, user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    live = await _load(db, live_id)
    if live["status"] != "live":
        raise HTTPException(status_code=400, detail="This live isn't on.")
    expires = _now() + timedelta(seconds=TOKEN_TTL_SECONDS)
    if live["host_id"] == user_id:
        return {"stream": _stream(live, live["host_uid"], ROLE_PUBLISHER, expires)}
    member = await db["live_members"].find_one({"live_id": live_id, "user_id": user_id})
    if not member:
        raise HTTPException(status_code=402, detail={"code": "preview_over", "message": "Join to keep watching."})
    return {"stream": _stream(live, member["uid"], ROLE_SUBSCRIBER, expires)}


class PromoteBody(BaseModel):
    hours: int


@router.post("/{live_id}/promote")
async def promote_live(live_id: str, body: PromoteBody, user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    live = await _load(db, live_id)
    _host_only(live, user_id)
    cost = PROMO_COST_BY_HOURS.get(body.hours)
    if cost is None:
        raise HTTPException(status_code=400, detail="Pick 1, 6 or 24 hours.")
    if live["status"] == "ended":
        raise HTTPException(status_code=400, detail="This live has ended.")
    if live.get("adult"):
        raise HTTPException(status_code=400, detail="Adult lives can't be promoted in the feed.")
    try:
        await debit_coins(db, user_id, cost, "live_promo", f"Promoted live for {body.hours}h", {"live_id": live_id})
    except ValueError:
        raise HTTPException(status_code=402, detail={"code": "coins_short", "cost": cost, "message": "Not enough coins."})
    base = max(_now(), _aware(live.get("promo_until")) or _now())
    until = base + timedelta(hours=body.hours)
    await db["lives"].update_one({"_id": live["_id"]}, {"$set": {"promo_until": until}})
    return {"promo_until": until.isoformat()}


# ─── detail / watching ──────────────────────────────────────────

@router.get("/{live_id}")
async def live_detail(
    live_id: str,
    platform: Literal["web", "app"] = "app",
    user_id: Optional[str] = Depends(get_optional_user_id),
    db=Depends(get_database),
):
    live = await _load(db, live_id)
    viewer = await _viewer(db, user_id)
    if live.get("adult") and live["host_id"] != user_id and not _adult_visible(viewer, platform):
        raise HTTPException(status_code=404, detail="Live not found.")

    host = (await _people(db, [live["host_id"]])).get(live["host_id"], {})
    viewers = (await _viewers_now(db, [live_id])).get(live_id, 0)
    preview = await db["live_previews"].find_one({"live_id": live_id, "user_id": user_id}) if user_id else None
    preview_left = PREVIEW_SECONDS
    if preview:
        preview_left = max(0, PREVIEW_SECONDS - int((_now() - _aware(preview["started_at"])).total_seconds()))

    top = db["live_earnings"].aggregate([
        {"$match": {"live_id": live_id, "kind": "gift"}},
        {"$group": {"_id": "$from_user_id", "coins": {"$sum": "$coins"}}},
        {"$sort": {"coins": -1}}, {"$limit": 5},
    ])
    top_rows = [r async for r in top]
    gifters = await _people(db, [r["_id"] for r in top_rows])

    return {
        "live": _card(live, host, viewers),
        "viewer": {
            "is_host": live["host_id"] == user_id,
            "is_member": await _is_member(db, live_id, user_id),
            "preview_left": preview_left,
            "reminded": bool(user_id and await db["live_reminders"].find_one({"live_id": live_id, "user_id": user_id}, {"_id": 1})),
            "following": bool(user_id and await db["live_follows"].find_one({"host_id": live["host_id"], "user_id": user_id}, {"_id": 1})),
        },
        "host_followers": await db["live_follows"].count_documents({"host_id": live["host_id"]}),
        "top_gifters": [{"user_id": r["_id"], "coins": r["coins"], **gifters.get(r["_id"], {})} for r in top_rows],
        "preview_seconds": PREVIEW_SECONDS,
    }


@router.post("/{live_id}/watch")
async def watch(live_id: str, user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    """Token for watching: full for members, PREVIEW_SECONDS once for everyone else."""
    live = await _load(db, live_id)
    if live["status"] != "live":
        raise HTTPException(status_code=400, detail="This live isn't on right now.")
    now = _now()
    if live["host_id"] == user_id:
        return {"stream": _stream(live, live["host_uid"], ROLE_PUBLISHER, now + timedelta(seconds=TOKEN_TTL_SECONDS)), "member": True}

    member = await db["live_members"].find_one({"live_id": live_id, "user_id": user_id})
    if member:
        return {"stream": _stream(live, member["uid"], ROLE_SUBSCRIBER, now + timedelta(seconds=TOKEN_TTL_SECONDS)), "member": True}

    preview = await db["live_previews"].find_one_and_update(
        {"live_id": live_id, "user_id": user_id},
        {"$setOnInsert": {"started_at": now, "uid": secrets.randbelow(2 ** 31 - 2) + 1}},
        upsert=True, return_document=True,
    )
    ends = _aware(preview["started_at"]) + timedelta(seconds=PREVIEW_SECONDS)
    if ends <= now + timedelta(seconds=1):
        raise HTTPException(status_code=402, detail={"code": "preview_over", "price": live["price"], "message": "Your preview is over. Join to keep watching."})
    return {"stream": _stream(live, preview["uid"], ROLE_SUBSCRIBER, ends), "member": False, "preview_ends_at": ends.isoformat()}


@router.post("/{live_id}/join")
async def join(live_id: str, user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    live = await _load(db, live_id)
    if live["status"] != "live":
        raise HTTPException(status_code=400, detail="You can join once the live starts.")
    if live["host_id"] == user_id:
        raise HTTPException(status_code=400, detail="You're the host.")
    expires = _now() + timedelta(seconds=TOKEN_TTL_SECONDS)
    existing = await db["live_members"].find_one({"live_id": live_id, "user_id": user_id})
    if existing:
        return {"stream": _stream(live, existing["uid"], ROLE_SUBSCRIBER, expires), "member": True}

    price = live["price"]
    try:
        await debit_coins(db, user_id, price, "live_entry", f"Joined live: {live['title'][:40]}", {"live_id": live_id})
    except ValueError:
        raise HTTPException(status_code=402, detail={"code": "coins_short", "cost": price, "message": "Not enough coins."})

    now = _now()
    uid = secrets.randbelow(2 ** 31 - 2) + 1
    await db["live_members"].insert_one({"live_id": live_id, "user_id": user_id, "uid": uid, "paid": price, "joined_at": now})
    await db["live_earnings"].insert_one({
        "host_id": live["host_id"], "live_id": live_id, "kind": "entry", "from_user_id": user_id,
        "gross": price, "coins": round(price * HOST_ENTRY_SHARE, 2),
        "week": week_start(now), "paid_out": False, "created_at": now,
    })
    await db["lives"].update_one({"_id": live["_id"]}, {"$inc": {"members": 1, "entry_coins": price}})
    await activity.record(db, live["host_id"], "live_join", actor_id=user_id, text=live["title"], live_id=live_id,
                          coins=price)
    who = (await _people(db, [user_id])).get(user_id, {})
    await _post_message(db, live, user_id, "join", f"{who.get('name', 'Someone')} joined")
    return {"stream": _stream(live, uid, ROLE_SUBSCRIBER, expires), "member": True}


@router.post("/{live_id}/heartbeat")
async def heartbeat(live_id: str, user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    await db["live_presence"].update_one({"live_id": live_id, "user_id": user_id}, {"$set": {"seen_at": _now()}}, upsert=True)
    return {"viewers": (await _viewers_now(db, [live_id])).get(live_id, 0)}


# ─── chat & gifts ───────────────────────────────────────────────

def _message_out(m: dict, people: dict) -> dict:
    return {
        "id": str(m["_id"]),
        "kind": m["kind"],
        "text": m.get("text"),
        "gift": m.get("gift"),
        "coins": m.get("coins"),
        "user": {"id": m["user_id"], **people.get(m["user_id"], {})},
        "created_at": _iso(m["created_at"]),
    }


async def _post_message(db, live: dict, user_id: str, kind: str, text: Optional[str] = None, gift: Optional[str] = None, coins: int = 0) -> dict:
    doc = {"live_id": str(live["_id"]), "user_id": user_id, "kind": kind, "text": text, "gift": gift, "coins": coins, "created_at": _now()}
    res = await db["live_messages"].insert_one(doc)
    doc["_id"] = res.inserted_id
    out = _message_out(doc, await _people(db, [user_id]))
    await _emit("live_message", {"live_id": str(live["_id"]), "message": out}, await _member_ids(db, live))
    return out


async def _require_member_or_host(db, live: dict, user_id: str) -> None:
    if live["host_id"] != user_id and not await _is_member(db, str(live["_id"]), user_id):
        raise HTTPException(status_code=403, detail="Join the live to take part.")


@router.get("/{live_id}/messages")
async def messages(live_id: str, after: Optional[str] = Query(None), user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    live = await _load(db, live_id)
    await _require_member_or_host(db, live, user_id)
    query: dict = {"live_id": live_id}
    if after and ObjectId.is_valid(after):
        query["_id"] = {"$gt": ObjectId(after)}
        rows = await db["live_messages"].find(query).sort("_id", 1).to_list(MESSAGES_PAGE)
    else:
        rows = list(reversed(await db["live_messages"].find(query).sort("_id", -1).to_list(MESSAGES_PAGE)))
    people = await _people(db, [r["user_id"] for r in rows])
    return {"messages": [_message_out(r, people) for r in rows], "status": live["status"]}


class MessageBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=CHAT_MAX)


@router.post("/{live_id}/messages", status_code=201)
async def send_message(live_id: str, body: MessageBody, user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    live = await _load(db, live_id)
    if live["status"] != "live":
        raise HTTPException(status_code=400, detail="This live isn't on.")
    await _require_member_or_host(db, live, user_id)
    text = _clean_text(body.text, CHAT_MAX)
    if not text:
        raise HTTPException(status_code=400, detail="Write something first.")
    return {"message": await _post_message(db, live, user_id, "chat", text)}


class GiftBody(BaseModel):
    gift: str


@router.post("/{live_id}/gifts", status_code=201)
async def send_gift(live_id: str, body: GiftBody, user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    live = await _load(db, live_id)
    if live["status"] != "live":
        raise HTTPException(status_code=400, detail="This live isn't on.")
    if live["host_id"] == user_id:
        raise HTTPException(status_code=400, detail="You can't gift yourself.")
    await _require_member_or_host(db, live, user_id)
    gift = GIFTS.get(body.gift)
    if not gift:
        raise HTTPException(status_code=400, detail="Unknown gift.")
    try:
        await debit_coins(db, user_id, gift["coins"], "live_gift", f"Sent a {gift['label']}", {"live_id": live_id})
    except ValueError:
        raise HTTPException(status_code=402, detail={"code": "coins_short", "cost": gift["coins"], "message": "Not enough coins."})
    now = _now()
    await db["live_earnings"].insert_one({
        "host_id": live["host_id"], "live_id": live_id, "kind": "gift", "from_user_id": user_id,
        "gross": gift["coins"], "coins": gift["coins"], "week": week_start(now), "paid_out": False, "created_at": now,
    })
    await db["lives"].update_one({"_id": live["_id"]}, {"$inc": {"gift_coins": gift["coins"]}})
    await activity.record(db, live["host_id"], "gift", actor_id=user_id, text=live["title"], live_id=live_id,
                          coins=gift["coins"])
    return {"message": await _post_message(db, live, user_id, "gift", gift=body.gift, coins=gift["coins"])}


# ─── reminders, follows, reports ────────────────────────────────

@router.post("/{live_id}/remind")
async def toggle_reminder(live_id: str, user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    await _load(db, live_id)
    key = {"live_id": live_id, "user_id": user_id}
    if await db["live_reminders"].find_one(key, {"_id": 1}):
        await db["live_reminders"].delete_one(key)
        return {"reminded": False}
    await db["live_reminders"].insert_one({**key, "created_at": _now()})
    return {"reminded": True}


@router.post("/hosts/{host_id}/follow")
async def toggle_follow(host_id: str, user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    if host_id == user_id:
        raise HTTPException(status_code=400, detail="You can't follow yourself.")
    key = {"host_id": host_id, "user_id": user_id}
    if await db["live_follows"].find_one(key, {"_id": 1}):
        await db["live_follows"].delete_one(key)
        following = False
    else:
        await db["live_follows"].insert_one({**key, "created_at": _now()})
        following = True
    return {"following": following, "followers": await db["live_follows"].count_documents({"host_id": host_id})}


class ReportBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=300)


@router.post("/{live_id}/report", status_code=201)
async def report_live(live_id: str, body: ReportBody, user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    await _load(db, live_id)
    await db["live_reports"].insert_one({"live_id": live_id, "user_id": user_id, "reason": body.reason.strip(), "created_at": _now()})
    return {"reported": True}


# ─── admin ──────────────────────────────────────────────────────

@admin_router.get("")
async def admin_list(status: Optional[str] = None, admin_id: str = Depends(require_admin), db=Depends(get_database)):
    query = {"status": status} if status in {"live", "scheduled", "ended"} else {}
    rows = await db["lives"].find(query).sort("created_at", -1).to_list(100)
    ids = [str(r["_id"]) for r in rows]
    hosts = await _people(db, [r["host_id"] for r in rows])
    viewers = await _viewers_now(db, ids)
    reports = {r["_id"]: r["n"] async for r in db["live_reports"].aggregate([
        {"$match": {"live_id": {"$in": ids}}}, {"$group": {"_id": "$live_id", "n": {"$sum": 1}}},
    ])}
    out = []
    for r in rows:
        card = _card(r, hosts.get(r["host_id"], {}), viewers.get(str(r["_id"]), 0))
        card.update(entry_coins=r.get("entry_coins", 0), gift_coins=r.get("gift_coins", 0), reports=reports.get(str(r["_id"]), 0))
        out.append(card)
    return {"lives": out}


@admin_router.post("/{live_id}/end")
async def admin_end(live_id: str, admin_id: str = Depends(require_admin), db=Depends(get_database)):
    live = await _load(db, live_id)
    await _finish(db, live)
    await audit(db, admin_id, "live.end", "live", live_id)
    return {"status": "ended"}


@admin_router.get("/payouts")
async def admin_payouts(admin_id: str = Depends(require_super_admin), db=Depends(get_database)):
    """Unpaid host earnings from finished weeks, one row per host."""
    current = week_start(_now())
    rows = db["live_earnings"].aggregate([
        {"$match": {"paid_out": False, "week": {"$lt": current}}},
        {"$group": {"_id": "$host_id", "coins": {"$sum": "$coins"}, "weeks": {"$addToSet": "$week"}}},
        {"$sort": {"coins": -1}},
    ])
    hosts = [r async for r in rows]
    people = await _people(db, [h["_id"] for h in hosts])
    profiles = {p["user_id"]: p async for p in db["live_payout_profiles"].find({"user_id": {"$in": [h["_id"] for h in hosts]}})}
    recent = await db["live_payouts"].find().sort("created_at", -1).to_list(30)
    recent_people = await _people(db, [p["host_id"] for p in recent])
    def due_row(h: dict) -> dict:
        profile = profiles.get(h["_id"])
        currency = _currency_of(profile, None)
        return {
            "host_id": h["_id"],
            "host": people.get(h["_id"], {}),
            "coins": round(h["coins"], 2),
            "amount": _amount(h["coins"], currency),
            "currency": currency,
            "weeks": sorted(w.date().isoformat() for w in h["weeks"]),
            "profile": _profile_out(profile, full=True),
        }

    return {
        "rates": {"KES": settings.LIVE_PAYOUT_KES_PER_COIN, "USD": settings.LIVE_PAYOUT_USD_PER_COIN},
        "due": [due_row(h) for h in hosts],
        "recent": [{
            "id": str(p["_id"]), "host": recent_people.get(p["host_id"], {}), "coins": p["coins"],
            "amount": p.get("amount", p.get("kes")), "currency": p.get("currency", "KES"),
            "reference": p.get("reference"), "created_at": _iso(p["created_at"]),
        } for p in recent],
    }


class MarkPaidBody(BaseModel):
    reference: str = Field(..., min_length=4, max_length=40)


@admin_router.post("/payouts/{host_id}/paid")
async def admin_mark_paid(host_id: str, body: MarkPaidBody, admin_id: str = Depends(require_super_admin), db=Depends(get_database)):
    profile = await db["live_payout_profiles"].find_one({"user_id": host_id})
    if not profile or not profile.get("verified_at"):
        raise HTTPException(status_code=400, detail="Verify this host's ID before paying them.")
    current = week_start(_now())
    match = {"host_id": host_id, "paid_out": False, "week": {"$lt": current}}
    total = [r async for r in db["live_earnings"].aggregate([{"$match": match}, {"$group": {"_id": None, "coins": {"$sum": "$coins"}}}])]
    coins = round(total[0]["coins"], 2) if total else 0
    if not coins:
        raise HTTPException(status_code=400, detail="Nothing is owed to this host.")
    currency = _currency_of(profile, None)
    payout = {
        "host_id": host_id, "coins": coins, "amount": _amount(coins, currency), "currency": currency,
        "method": _method_of(profile), "destination": _destination(profile, full=True),
        "reference": body.reference.strip(), "admin_id": admin_id, "created_at": _now(),
    }
    res = await db["live_payouts"].insert_one(payout)
    await db["live_earnings"].update_many(match, {"$set": {"paid_out": True, "payout_id": str(res.inserted_id)}})
    await audit(db, admin_id, "live.payout", "user", host_id)
    sent = f"{currency} {payout['amount']:,}"
    await activity.record(db, host_id, "live_payout", title="You've been paid",
                          text=f"{sent} sent to your {PAYOUT_LABEL[payout['method']]}.", url="/lives/earnings")
    _push(db, [host_id], "You've been paid", f"{sent} from your lives was sent to your {PAYOUT_LABEL[payout['method']]}.",
          {"type": "live_payout", "url": "/lives/earnings"})
    return {"paid": True, "amount": payout["amount"], "currency": currency}


@admin_router.get("/hosts")
async def admin_hosts(admin_id: str = Depends(require_super_admin), db=Depends(get_database)):
    rows = await db["live_payout_profiles"].find().sort("submitted_at", -1).to_list(200)
    people = await _people(db, [r["user_id"] for r in rows])
    return {"hosts": [{
        "user_id": r["user_id"], "host": people.get(r["user_id"], {}), **_profile_out(r, full=True),
    } for r in rows]}


@admin_router.post("/hosts/{host_id}/verify")
async def admin_verify_host(host_id: str, admin_id: str = Depends(require_super_admin), db=Depends(get_database)):
    res = await db["live_payout_profiles"].update_one({"user_id": host_id}, {"$set": {"verified_at": _now(), "verified_by": admin_id}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="No payout details for this host.")
    await audit(db, admin_id, "live.host_verify", "user", host_id)
    return {"verified": True}
