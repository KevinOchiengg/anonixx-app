"""
circles.py — Anonixx Circles

A Circle is a permanent anonymous audio room with a topic.
Free to join. When the creator goes live (video), members get a 5-min free preview
on paid events, then locked out until they pay.

Two modes:
  ROOM   → always-on anonymous audio room, free for all members
  LIVE   → creator triggers video live, members get 5-min preview (paid events only)

Roles:
  CREATOR → permanent access, full controls, cannot be kicked
  ADMIN   → permanent access, can approve hand raises + kick members
  MEMBER  → free audio room, 5-min preview on paid live events

Collections:
  circles                — circle entity
  circle_members         — followers + role
  circle_events          — scheduled/live video events
  circle_event_payments  — paid entry + preview timer records
  circle_gifts           — anonymous gifts during live
  circle_hand_raises     — hand raise requests in audio room
  circle_kicks           — kicked member records
  circle_hot_seats       — hot seat invitations
  circle_payouts         — creator payout accumulator
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import Optional
from bson import ObjectId
from app.core.security import get_current_user
from app.database import get_database
from app.models.user import User
from app.config import settings

router = APIRouter(prefix="/circles", tags=["circles"])

CREATOR_CUT     = 0.80
ANONIXX_CUT     = 0.20
TOKEN_EXPIRY    = 86400       # 24 hours in seconds
MAX_STAGE       = 5           # max speakers on stage at once
PREVIEW_SECONDS = 300         # 5-minute free preview on paid live events
GIFT_TIERS      = {
    "spark":   10,
    "bolt":    50,
    "crystal": 200,
    "crown":   500,
}
TIER_EMOJIS = {"spark": "🔥", "bolt": "⚡", "crystal": "💎", "crown": "👑"}

ROLE_CREATOR = "creator"
ROLE_ADMIN   = "admin"
ROLE_MEMBER  = "member"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def oid(id_str: str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


def fmt_id(doc: dict) -> str:
    return str(doc["_id"])


async def get_circle_or_404(db, circle_id: str) -> dict:
    circle = await db.circles.find_one({"_id": oid(circle_id), "is_active": True})
    if not circle:
        raise HTTPException(status_code=404, detail="This circle no longer exists.")
    return circle


async def get_member_doc(db, circle_id: str, user_id: str) -> Optional[dict]:
    return await db.circle_members.find_one({
        "circle_id": circle_id,
        "user_id":   user_id,
    })


async def assert_creator(circle: dict, user_id: str):
    if str(circle.get("creator_id", "")) != str(user_id):
        raise HTTPException(status_code=403, detail="Only the creator can do this.")


async def assert_creator_or_admin(db, circle: dict, user_id: str):
    if str(circle.get("creator_id", "")) == str(user_id):
        return
    m = await get_member_doc(db, fmt_id(circle), user_id)
    if not m or m.get("role") != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Only the creator or admins can do this.")


def member_range_label(count: int) -> str:
    if count < 5:   return "Intimate"
    if count < 20:  return "Small"
    if count < 50:  return "Growing"
    if count < 100: return "Active"
    return "Thriving"


def generate_agora_token(channel: str, uid: int, role: str = "publisher") -> str:
    if not settings.AGORA_APP_ID or not settings.AGORA_APP_CERTIFICATE:
        raise HTTPException(
            status_code=503,
            detail="Audio rooms are not configured yet. Add AGORA_APP_ID and AGORA_APP_CERTIFICATE to your .env file."
        )
    from agora_token_builder import RtcTokenBuilder
    expire_at  = int(_now().timestamp()) + TOKEN_EXPIRY
    agora_role = 1 if role == "publisher" else 2
    return RtcTokenBuilder.buildTokenWithUid(
        settings.AGORA_APP_ID,
        settings.AGORA_APP_CERTIFICATE,
        channel,
        uid,
        agora_role,
        expire_at,
    )


def format_circle(circle: dict, member_doc: Optional[dict], user_id: str) -> dict:
    count      = circle.get("member_count", 0)
    is_creator = str(circle.get("creator_id", "")) == str(user_id)
    role       = (
        ROLE_CREATOR if is_creator
        else member_doc.get("role", ROLE_MEMBER) if member_doc
        else None
    )
    return {
        "id":            fmt_id(circle),
        "name":          circle["name"],
        "bio":           circle.get("bio", ""),
        "category":      circle.get("category"),
        "aura_color":    circle.get("aura_color", "#FF634A"),
        "avatar_emoji":  circle.get("avatar_emoji", "🎭"),
        "avatar_url":    circle.get("avatar_url"),
        "member_count":  count,
        "member_range":  member_range_label(count),
        "is_creator":    is_creator,
        "is_admin":      role == ROLE_ADMIN,
        "is_member":     member_doc is not None,
        "role":          role,
        "room_open":     circle.get("room_open", False),
        "is_live":       circle.get("is_live", False),
        "live_event_id": circle.get("live_event_id"),
        "created_at":    circle.get("created_at", _now()).isoformat(),
    }


def _format_event(event: dict) -> dict:
    return {
        "id":           fmt_id(event),
        "title":        event["title"],
        "description":  event.get("description", ""),
        "entry_fee":    event.get("entry_fee", 0),
        "scheduled_at": event["scheduled_at"].isoformat() if event.get("scheduled_at") else None,
        "status":       event["status"],
        "is_live":      event.get("is_live", False),
        "viewer_count": event.get("viewer_count", 0),
        "peak_viewers": event.get("peak_viewers", 0),
        "total_gifts":  event.get("total_gifts", 0),
        "started_at":   event["started_at"].isoformat() if event.get("started_at") else None,
    }


# ─── Preview timer helpers ────────────────────────────────────────────────────

async def get_preview_record(db, event_id: str, user_id: str) -> Optional[dict]:
    return await db.circle_event_payments.find_one({
        "event_id": event_id,
        "user_id":  user_id,
    })


async def get_preview_seconds_remaining(preview: Optional[dict]) -> int:
    if not preview:
        return PREVIEW_SECONDS
    used = preview.get("preview_seconds_used", 0)
    return max(0, PREVIEW_SECONDS - used)


async def tick_preview_timer(db, preview: Optional[dict]) -> int:
    """Record join time — elapsed will be calculated on next pause."""
    if not preview:
        return PREVIEW_SECONDS
    remaining = await get_preview_seconds_remaining(preview)
    if remaining <= 0:
        return 0
    await db.circle_event_payments.update_one(
        {"_id": preview["_id"]},
        {"$set": {"preview_joined_at": _now()}}
    )
    return remaining


async def pause_preview_timer(db, preview: Optional[dict]):
    """Add elapsed seconds since last join to preview_seconds_used."""
    if not preview:
        return
    joined_at = preview.get("preview_joined_at")
    if not joined_at:
        return
    if joined_at.tzinfo is None:
        joined_at = joined_at.replace(tzinfo=timezone.utc)
    elapsed  = int((_now() - joined_at).total_seconds())
    new_used = min(
        preview.get("preview_seconds_used", 0) + elapsed,
        PREVIEW_SECONDS,
    )
    await db.circle_event_payments.update_one(
        {"_id": preview["_id"]},
        {"$set": {
            "preview_seconds_used": new_used,
            "preview_joined_at":    None,
            "preview_locked":       new_used >= PREVIEW_SECONDS,
        }}
    )


# ─── Request models ───────────────────────────────────────────────────────────

class CircleCreate(BaseModel):
    name:         str
    bio:          str
    category:     str
    aura_color:   str = "#FF634A"
    avatar_emoji: Optional[str] = "🎭"
    avatar_url:   Optional[str] = None


class EventSchedule(BaseModel):
    title:        str
    description:  str = ""
    entry_fee:    int = 0
    scheduled_at: str


class JoinEventRequest(BaseModel):
    phone_number: Optional[str] = None


class GiftRequest(BaseModel):
    tier: str


# ─── Create circle ────────────────────────────────────────────────────────────

@router.post("/create", status_code=201)
async def create_circle(
    data:         CircleCreate,
    current_user: User = Depends(get_current_user),
):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Your circle needs a name.")
    if not data.bio.strip():
        raise HTTPException(status_code=400, detail="Tell people what your circle is about.")
    if not data.category:
        raise HTTPException(status_code=400, detail="Choose a category.")

    db  = await get_database()
    now = _now()

    result    = await db.circles.insert_one({
        "name":          data.name.strip(),
        "bio":           data.bio.strip(),
        "category":      data.category,
        "aura_color":    data.aura_color,
        "avatar_emoji":  data.avatar_emoji or "🎭",
        "avatar_url":    data.avatar_url,
        "creator_id":    str(current_user.id),
        "member_count":  1,
        "room_open":     False,
        "is_live":       False,
        "live_event_id": None,
        "is_active":     True,
        "created_at":    now,
        "updated_at":    now,
    })
    circle_id = str(result.inserted_id)

    await db.circle_members.insert_one({
        "circle_id": circle_id,
        "user_id":   str(current_user.id),
        "role":      ROLE_CREATOR,
        "joined_at": now,
    })

    return {"id": circle_id, "message": "Your circle is alive."}


# ─── Browse circles ───────────────────────────────────────────────────────────

@router.get("/")
async def list_circles(
    skip:     int = Query(0, ge=0),
    limit:    int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    db    = await get_database()
    query: dict = {"is_active": True}
    if category:
        query["category"] = category

    circles = (
        await db.circles.find(query)
        .sort([("is_live", -1), ("room_open", -1), ("member_count", -1)])
        .skip(skip)
        .limit(limit)
        .to_list(None)
    )

    result = []
    for c in circles:
        cid = fmt_id(c)
        m   = await get_member_doc(db, cid, str(current_user.id))
        result.append(format_circle(c, m, str(current_user.id)))

    return {"circles": result, "has_more": len(result) == limit}


# ─── My circles ───────────────────────────────────────────────────────────────

@router.get("/my/created")
async def my_created(current_user: User = Depends(get_current_user)):
    db      = await get_database()
    circles = await db.circles.find({
        "creator_id": str(current_user.id),
        "is_active":  True,
    }).to_list(None)

    result = []
    for c in circles:
        m = await get_member_doc(db, fmt_id(c), str(current_user.id))
        result.append(format_circle(c, m, str(current_user.id)))
    return {"circles": result}


@router.get("/my/joined")
async def my_joined(current_user: User = Depends(get_current_user)):
    db          = await get_database()
    memberships = await db.circle_members.find({
        "user_id": str(current_user.id),
    }).to_list(None)

    result = []
    for mem in memberships:
        c = await db.circles.find_one({"_id": oid(mem["circle_id"]), "is_active": True})
        if c:
            result.append(format_circle(c, mem, str(current_user.id)))
    return {"circles": result}


# ─── Circle detail ────────────────────────────────────────────────────────────

@router.get("/{circle_id}")
async def get_circle(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    m      = await get_member_doc(db, circle_id, str(current_user.id))
    return format_circle(circle, m, str(current_user.id))


# ─── Join / leave ─────────────────────────────────────────────────────────────

@router.post("/{circle_id}/join")
async def join_circle(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    m      = await get_member_doc(db, circle_id, str(current_user.id))

    if m:
        return {"message": "You're already in this circle."}

    now = _now()
    await db.circle_members.insert_one({
        "circle_id": circle_id,
        "user_id":   str(current_user.id),
        "role":      ROLE_MEMBER,
        "joined_at": now,
    })
    await db.circles.update_one(
        {"_id": oid(circle_id)},
        {"$inc": {"member_count": 1}}
    )
    return {"message": "You're in the circle."}


@router.post("/{circle_id}/leave")
async def leave_circle(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)

    if str(circle.get("creator_id", "")) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Creators can't leave their own circle.")

    m = await get_member_doc(db, circle_id, str(current_user.id))
    if not m:
        raise HTTPException(status_code=400, detail="You're not in this circle.")

    await db.circle_members.delete_one({"_id": m["_id"]})
    await db.circles.update_one(
        {"_id": oid(circle_id)},
        {"$inc": {"member_count": -1}}
    )
    return {"message": "You've left the circle."}


# ─── Admin management ─────────────────────────────────────────────────────────

@router.post("/{circle_id}/admins/{user_id}")
async def elevate_to_admin(
    circle_id:    str,
    user_id:      str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator(circle, str(current_user.id))

    if str(user_id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="You're already the creator.")

    m = await get_member_doc(db, circle_id, user_id)
    if not m:
        raise HTTPException(status_code=404, detail="This person isn't in your circle.")

    await db.circle_members.update_one(
        {"_id": m["_id"]},
        {"$set": {"role": ROLE_ADMIN, "elevated_at": _now()}}
    )
    return {"message": "They're now an admin of this circle."}


@router.delete("/{circle_id}/admins/{user_id}")
async def remove_admin(
    circle_id:    str,
    user_id:      str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator(circle, str(current_user.id))

    m = await get_member_doc(db, circle_id, user_id)
    if not m or m.get("role") != ROLE_ADMIN:
        raise HTTPException(status_code=404, detail="Admin not found.")

    await db.circle_members.update_one(
        {"_id": m["_id"]},
        {"$set": {"role": ROLE_MEMBER}}
    )
    return {"message": "Admin role removed."}


@router.get("/{circle_id}/admins")
async def list_admins(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db = await get_database()
    await get_circle_or_404(db, circle_id)

    admins = await db.circle_members.find({
        "circle_id": circle_id,
        "role":      ROLE_ADMIN,
    }).to_list(None)

    return {
        "admins": [
            {"user_id": a["user_id"], "elevated_at": a.get("elevated_at")}
            for a in admins
        ]
    }


# ─── Audio Room ───────────────────────────────────────────────────────────────

@router.post("/{circle_id}/room/open")
async def open_room(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator(circle, str(current_user.id))

    if circle.get("is_live"):
        raise HTTPException(status_code=400, detail="End the live event before opening the audio room.")

    await db.circles.update_one(
        {"_id": oid(circle_id)},
        {"$set": {"room_open": True, "room_opened_at": _now()}}
    )
    return {"message": "The room is open. People can hear you now."}


@router.post("/{circle_id}/room/close")
async def close_room(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator(circle, str(current_user.id))

    await db.circles.update_one(
        {"_id": oid(circle_id)},
        {"$set": {"room_open": False}}
    )
    await db.circle_hand_raises.delete_many({"circle_id": circle_id})
    return {"message": "The room is closed."}


@router.get("/{circle_id}/room/token")
async def get_room_token(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)

    if not circle.get("room_open"):
        raise HTTPException(status_code=403, detail="The room isn't open yet.")

    is_creator = str(circle.get("creator_id", "")) == str(current_user.id)
    m          = await get_member_doc(db, circle_id, str(current_user.id))

    if not m and not is_creator:
        raise HTTPException(status_code=403, detail="Join the circle first.")

    kicked = await db.circle_kicks.find_one({
        "circle_id": circle_id,
        "user_id":   str(current_user.id),
    })
    if kicked:
        raise HTTPException(status_code=403, detail="You've been removed from this room.")

    is_admin   = bool(m and m.get("role") == ROLE_ADMIN)
    hand_raise = await db.circle_hand_raises.find_one({
        "circle_id": circle_id,
        "user_id":   str(current_user.id),
        "status":    "approved",
    })

    role    = "publisher" if (is_creator or is_admin or hand_raise) else "subscriber"
    channel = f"circle_room_{circle_id}"
    uid     = abs(hash(str(current_user.id))) % (2**32)
    token   = generate_agora_token(channel, uid, role)

    return {
        "token":   token,
        "channel": channel,
        "uid":     uid,
        "role":    role,
        "app_id":  settings.AGORA_APP_ID,
    }


# ─── Hand raises ─────────────────────────────────────────────────────────────

@router.post("/{circle_id}/room/raise")
async def raise_hand(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)

    if not circle.get("room_open"):
        raise HTTPException(status_code=403, detail="The room isn't open.")

    m = await get_member_doc(db, circle_id, str(current_user.id))
    if not m:
        raise HTTPException(status_code=403, detail="Join the circle first.")

    existing = await db.circle_hand_raises.find_one({
        "circle_id": circle_id,
        "user_id":   str(current_user.id),
        "status":    {"$in": ["pending", "approved"]},
    })
    if existing:
        return {"message": "Your hand is already raised."}

    await db.circle_hand_raises.insert_one({
        "circle_id": circle_id,
        "user_id":   str(current_user.id),
        "status":    "pending",
        "raised_at": _now(),
    })
    return {"message": "Hand raised. Waiting for the host."}


@router.get("/{circle_id}/room/raises")
async def get_pending_raises(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator_or_admin(db, circle, str(current_user.id))

    raises = await db.circle_hand_raises.find(
        {"circle_id": circle_id, "status": "pending"}
    ).sort("raised_at", 1).to_list(50)

    result = []
    for r in raises:
        user = await db.users.find_one({"_id": oid(r["user_id"])})
        anon_name = (user or {}).get("anonymous_name") or "Anonymous"
        result.append({"id": r["user_id"], "anon_name": anon_name})

    return {"raises": result}


@router.post("/{circle_id}/room/approve/{user_id}")
async def approve_speaker(
    circle_id:    str,
    user_id:      str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator_or_admin(db, circle, str(current_user.id))

    approved_count = await db.circle_hand_raises.count_documents({
        "circle_id": circle_id,
        "status":    "approved",
    })
    if approved_count >= MAX_STAGE:
        raise HTTPException(
            status_code=400,
            detail=f"Stage is full. Maximum {MAX_STAGE} speakers at once."
        )

    result = await db.circle_hand_raises.update_one(
        {"circle_id": circle_id, "user_id": user_id, "status": "pending"},
        {"$set": {"status": "approved", "approved_at": _now()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Hand raise not found.")

    return {"message": "Speaker approved."}


@router.post("/{circle_id}/room/kick/{user_id}")
async def kick_from_room(
    circle_id:    str,
    user_id:      str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator_or_admin(db, circle, str(current_user.id))

    if str(user_id) == str(circle.get("creator_id", "")):
        raise HTTPException(status_code=403, detail="Cannot kick the creator.")

    await db.circle_hand_raises.update_many(
        {"circle_id": circle_id, "user_id": user_id},
        {"$set": {"status": "kicked"}}
    )
    await db.circle_kicks.update_one(
        {"circle_id": circle_id, "user_id": user_id},
        {"$set": {"kicked_at": _now(), "kicked_by": str(current_user.id)}},
        upsert=True,
    )
    return {"message": "They've been removed from the room."}


@router.get("/{circle_id}/room/status")
async def room_status(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db         = await get_database()
    circle     = await get_circle_or_404(db, circle_id)
    is_creator = str(circle.get("creator_id", "")) == str(current_user.id)
    m          = await get_member_doc(db, circle_id, str(current_user.id))
    is_admin   = bool(m and m.get("role") == ROLE_ADMIN)

    speakers = await db.circle_hand_raises.find({
        "circle_id": circle_id, "status": "approved",
    }).to_list(None)

    pending = await db.circle_hand_raises.find({
        "circle_id": circle_id, "status": "pending",
    }).to_list(None)

    my_raise = await db.circle_hand_raises.find_one({
        "circle_id": circle_id,
        "user_id":   str(current_user.id),
        "status":    {"$in": ["pending", "approved"]},
    })

    kicked = await db.circle_kicks.find_one({
        "circle_id": circle_id, "user_id": str(current_user.id),
    })

    return {
        "room_open":      circle.get("room_open", False),
        "speaker_count":  len(speakers),
        "pending_raises": len(pending) if (is_creator or is_admin) else None,
        "my_hand_status": my_raise["status"] if my_raise else None,
        "is_kicked":      kicked is not None,
    }


# ─── Live Events ──────────────────────────────────────────────────────────────

@router.post("/{circle_id}/events/schedule", status_code=201)
async def schedule_event(
    circle_id:    str,
    data:         EventSchedule,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator(circle, str(current_user.id))

    if not data.title.strip():
        raise HTTPException(status_code=400, detail="Give your event a title.")

    try:
        scheduled_at = datetime.fromisoformat(data.scheduled_at.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format.")

    if scheduled_at <= _now():
        raise HTTPException(status_code=400, detail="Schedule your event in the future.")

    result = await db.circle_events.insert_one({
        "circle_id":    circle_id,
        "creator_id":   str(current_user.id),
        "title":        data.title.strip(),
        "description":  data.description.strip(),
        "entry_fee":    data.entry_fee,
        "scheduled_at": scheduled_at,
        "status":       "scheduled",
        "is_live":      False,
        "started_at":   None,
        "ended_at":     None,
        "viewer_count": 0,
        "peak_viewers": 0,
        "total_gifts":  0,
        "created_at":   _now(),
    })
    return {"id": str(result.inserted_id), "message": "Event scheduled. Your circle will be notified."}


@router.get("/{circle_id}/events")
async def list_events(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db = await get_database()
    await get_circle_or_404(db, circle_id)
    events = await db.circle_events.find({
        "circle_id": circle_id,
        "status":    {"$in": ["scheduled", "live"]},
    }).sort("scheduled_at", 1).to_list(None)
    return {"events": [_format_event(e) for e in events]}


@router.post("/{circle_id}/events/{event_id}/go-live")
async def go_live(
    circle_id:    str,
    event_id:     str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator(circle, str(current_user.id))

    event = await db.circle_events.find_one({"_id": oid(event_id), "circle_id": circle_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    if event["status"] == "live":
        raise HTTPException(status_code=400, detail="Already live.")
    if event["status"] == "ended":
        raise HTTPException(status_code=400, detail="This event has ended.")

    now = _now()
    await db.circle_events.update_one(
        {"_id": oid(event_id)},
        {"$set": {"status": "live", "is_live": True, "started_at": now}}
    )
    await db.circles.update_one(
        {"_id": oid(circle_id)},
        {"$set": {"is_live": True, "live_event_id": event_id, "room_open": False}}
    )
    await db.circle_hand_raises.delete_many({"circle_id": circle_id})
    await db.circle_kicks.delete_many({"circle_id": circle_id})

    return {"message": "You're live. The world is listening."}


@router.post("/{circle_id}/events/{event_id}/end-live")
async def end_live(
    circle_id:    str,
    event_id:     str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator(circle, str(current_user.id))

    now = _now()
    await db.circle_events.update_one(
        {"_id": oid(event_id)},
        {"$set": {"status": "ended", "is_live": False, "ended_at": now}}
    )
    await db.circles.update_one(
        {"_id": oid(circle_id)},
        {"$set": {"is_live": False, "live_event_id": None}}
    )
    await db.circle_hot_seats.delete_many({"event_id": event_id})
    return {"message": "The circle has closed. It was real while it lasted."}


# ─── Join live event (preview + payment) ─────────────────────────────────────

@router.post("/{circle_id}/events/{event_id}/join")
async def join_live_event(
    circle_id:    str,
    event_id:     str,
    data:         JoinEventRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Join a live event.
    Free events  → instant permanent access.
    Paid events  → 5-min preview, timer pauses on leave, resumes on rejoin.
                   Preview expires → locked. Pay to unlock permanently.
    Creator/Admin → always instant access.
    """
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    event  = await db.circle_events.find_one({"_id": oid(event_id), "circle_id": circle_id})

    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    if event["status"] == "ended":
        raise HTTPException(status_code=400, detail="This live has ended. It only existed in the moment.")
    if event["status"] != "live":
        raise HTTPException(status_code=400, detail="This event hasn't started yet.")

    user_id    = str(current_user.id)
    is_creator = str(circle.get("creator_id", "")) == user_id
    m          = await get_member_doc(db, circle_id, user_id)
    is_admin   = bool(m and m.get("role") == ROLE_ADMIN)
    entry_fee  = event.get("entry_fee", 0)

    # Creator and admins — permanent access always
    if is_creator or is_admin:
        return {"status": "granted", "access": "permanent", "message": "You're in."}

    preview = await get_preview_record(db, event_id, user_id)

    # Already paid
    if preview and preview.get("status") == "completed":
        await tick_preview_timer(db, preview)
        return {"status": "granted", "access": "permanent", "message": "Welcome back."}

    # Free event
    if entry_fee == 0:
        if not preview:
            await db.circle_event_payments.insert_one({
                "circle_id":            circle_id,
                "event_id":             event_id,
                "user_id":              user_id,
                "amount_kes":           0,
                "status":               "completed",
                "provider":             "free",
                "preview_seconds_used": 0,
                "preview_joined_at":    None,
                "preview_locked":       False,
                "created_at":           _now(),
                "paid_at":              _now(),
            })
        return {"status": "granted", "access": "permanent", "message": "You're in."}

    # Paid event — handle preview timer
    if preview:
        await pause_preview_timer(db, preview)
        preview   = await get_preview_record(db, event_id, user_id)
        remaining = await get_preview_seconds_remaining(preview)

        if preview.get("preview_locked") or remaining <= 0:
            raise HTTPException(
                status_code=402,
                detail="Your preview has ended. Pay to stay in the circle."
            )

        remaining = await tick_preview_timer(db, preview)
        return {
            "status":               "preview",
            "access":               "preview",
            "preview_seconds_left": remaining,
            "message":              f"You have {remaining // 60}m {remaining % 60}s left.",
        }

    # First time on paid event — start preview
    now = _now()
    await db.circle_event_payments.insert_one({
        "circle_id":            circle_id,
        "event_id":             event_id,
        "user_id":              user_id,
        "amount_kes":           entry_fee,
        "creator_cut_kes":      round(entry_fee * CREATOR_CUT),
        "anonixx_cut_kes":      round(entry_fee * ANONIXX_CUT),
        "checkout_request_id":  None,
        "status":               "preview",
        "provider":             None,
        "preview_seconds_used": 0,
        "preview_joined_at":    now,
        "preview_locked":       False,
        "created_at":           now,
        "paid_at":              None,
    })

    return {
        "status":               "preview",
        "access":               "preview",
        "preview_seconds_left": PREVIEW_SECONDS,
        "message":              "You have 5 minutes. Make them count.",
    }


@router.post("/{circle_id}/events/{event_id}/pay")
async def pay_for_event(
    circle_id:    str,
    event_id:     str,
    data:         JoinEventRequest,
    current_user: User = Depends(get_current_user),
):
    """Pay to unlock permanent access after preview expires."""
    db    = await get_database()
    event = await db.circle_events.find_one({"_id": oid(event_id), "circle_id": circle_id})

    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    if event["status"] == "ended":
        raise HTTPException(status_code=400, detail="This live has ended.")

    user_id   = str(current_user.id)
    entry_fee = event.get("entry_fee", 0)

    if entry_fee == 0:
        raise HTTPException(status_code=400, detail="This event is free.")

    preview = await get_preview_record(db, event_id, user_id)
    if preview and preview.get("status") == "completed":
        return {"message": "You already have full access."}

    if not data.phone_number:
        raise HTTPException(status_code=400, detail="Phone number required.")

    phone = data.phone_number.strip().replace(" ", "")
    if phone.startswith("0"):
        phone = "254" + phone[1:]
    elif phone.startswith("7") or phone.startswith("1"):
        phone = "254" + phone
    if len(phone) < 12:
        raise HTTPException(status_code=400, detail="Invalid M-Pesa number.")

    try:
        from app.utils.mpesa import MPesaClient
        mpesa    = MPesaClient()
        response = await mpesa.stk_push(
            phone=phone,
            amount=entry_fee,
            reference=f"LIVE-{event_id[:8]}",
            description=f"Enter: {event.get('title', 'Circle Live')}",
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Payment service unavailable.")

    if not response.get("success"):
        raise HTTPException(status_code=502, detail="Could not initiate payment.")

    checkout_id = response.get("CheckoutRequestID")
    now         = _now()

    if preview:
        await db.circle_event_payments.update_one(
            {"_id": preview["_id"]},
            {"$set": {
                "checkout_request_id": checkout_id,
                "status":              "pending",
                "provider":            "mpesa",
            }}
        )
    else:
        await db.circle_event_payments.insert_one({
            "circle_id":            circle_id,
            "event_id":             event_id,
            "user_id":              user_id,
            "amount_kes":           entry_fee,
            "creator_cut_kes":      round(entry_fee * CREATOR_CUT),
            "anonixx_cut_kes":      round(entry_fee * ANONIXX_CUT),
            "checkout_request_id":  checkout_id,
            "status":               "pending",
            "provider":             "mpesa",
            "preview_seconds_used": PREVIEW_SECONDS,
            "preview_joined_at":    None,
            "preview_locked":       True,
            "created_at":           now,
            "paid_at":              None,
        })

    return {"checkout_request_id": checkout_id, "status": "pending"}


@router.get("/{circle_id}/events/{event_id}/pay/status/{checkout_id}")
async def pay_status(
    circle_id:   str,
    event_id:    str,
    checkout_id: str,
    current_user: User = Depends(get_current_user),
):
    db      = await get_database()
    payment = await db.circle_event_payments.find_one({
        "checkout_request_id": checkout_id,
        "user_id":             str(current_user.id),
        "event_id":            event_id,
    })
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found.")
    return {"status": payment.get("status", "pending")}


@router.post("/events/pay/callback")
async def live_payment_callback(callback_data: dict):
    """Safaricom callback — register URL in M-Pesa dashboard."""
    try:
        stk         = callback_data.get("Body", {}).get("stkCallback", {})
        result_code = stk.get("ResultCode")
        checkout_id = stk.get("CheckoutRequestID")

        if not checkout_id:
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        db      = await get_database()
        payment = await db.circle_event_payments.find_one({
            "checkout_request_id": checkout_id,
        })
        if not payment or payment.get("status") == "completed":
            return {"ResultCode": 0, "ResultDesc": "Accepted"}

        now = _now()
        if result_code == 0:
            await db.circle_event_payments.update_one(
                {"_id": payment["_id"]},
                {"$set": {
                    "status":         "completed",
                    "paid_at":        now,
                    "preview_locked": False,
                }}
            )
            circle = await db.circles.find_one({"_id": oid(payment["circle_id"])})
            if circle:
                creator_cut = payment.get("creator_cut_kes", 0)
                await db.circle_payouts.update_one(
                    {
                        "circle_id":  payment["circle_id"],
                        "creator_id": str(circle.get("creator_id", "")),
                        "status":     "pending",
                    },
                    {
                        "$inc": {"amount_kes": creator_cut},
                        "$setOnInsert": {
                            "circle_id":  payment["circle_id"],
                            "creator_id": str(circle.get("creator_id", "")),
                            "status":     "pending",
                            "created_at": now,
                        },
                        "$set": {"updated_at": now},
                    },
                    upsert=True,
                )
        else:
            await db.circle_event_payments.update_one(
                {"_id": payment["_id"]},
                {"$set": {"status": "failed"}}
            )
    except Exception:
        pass

    return {"ResultCode": 0, "ResultDesc": "Accepted"}


# ─── Live event token ─────────────────────────────────────────────────────────

@router.get("/{circle_id}/events/{event_id}/token")
async def get_live_token(
    circle_id:    str,
    event_id:     str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    event  = await db.circle_events.find_one({"_id": oid(event_id), "circle_id": circle_id})

    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    if event["status"] != "live":
        raise HTTPException(status_code=403, detail="This event isn't live yet.")

    user_id    = str(current_user.id)
    is_creator = str(circle.get("creator_id", "")) == user_id
    m          = await get_member_doc(db, circle_id, user_id)
    is_admin   = bool(m and m.get("role") == ROLE_ADMIN)

    if not is_creator and not is_admin:
        preview = await get_preview_record(db, event_id, user_id)
        if not preview:
            raise HTTPException(status_code=403, detail="Join the event first.")

        if preview.get("status") == "completed":
            pass  # full access
        else:
            await pause_preview_timer(db, preview)
            preview   = await get_preview_record(db, event_id, user_id)
            remaining = await get_preview_seconds_remaining(preview)
            if remaining <= 0 or preview.get("preview_locked"):
                raise HTTPException(
                    status_code=402,
                    detail="Your preview has ended. Pay to stay in the circle."
                )
            await tick_preview_timer(db, preview)

    role    = "publisher" if is_creator else "subscriber"
    channel = f"circle_live_{event_id}"
    uid     = abs(hash(user_id)) % (2**32)
    token   = generate_agora_token(channel, uid, role)

    await db.circle_events.update_one(
        {"_id": oid(event_id)},
        {"$inc": {"viewer_count": 1}}
    )

    return {
        "token":   token,
        "channel": channel,
        "uid":     uid,
        "role":    role,
        "app_id":  settings.AGORA_APP_ID,
    }


# ─── Preview status poll ──────────────────────────────────────────────────────

@router.get("/{circle_id}/events/{event_id}/preview/status")
async def preview_status(
    circle_id:    str,
    event_id:     str,
    current_user: User = Depends(get_current_user),
):
    """Frontend polls every 15s during preview to know remaining time."""
    db      = await get_database()
    preview = await get_preview_record(db, event_id, str(current_user.id))

    if not preview:
        return {"status": "not_joined"}

    if preview.get("status") == "completed":
        return {"status": "paid", "seconds_left": None}

    await pause_preview_timer(db, preview)
    preview = await get_preview_record(db, event_id, str(current_user.id))
    if not preview:
        return {"status": "not_joined"}

    remaining = await get_preview_seconds_remaining(preview)

    if remaining <= 0 or preview.get("preview_locked"):
        return {"status": "locked", "seconds_left": 0}

    await tick_preview_timer(db, preview)
    return {"status": "preview", "seconds_left": remaining}


# ─── Anonymous Gifts ──────────────────────────────────────────────────────────

@router.post("/{circle_id}/events/{event_id}/gift")
async def send_gift(
    circle_id:    str,
    event_id:     str,
    data:         GiftRequest,
    current_user: User = Depends(get_current_user),
):
    db    = await get_database()
    event = await db.circle_events.find_one({"_id": oid(event_id), "circle_id": circle_id})

    if not event or event["status"] != "live":
        raise HTTPException(status_code=400, detail="Gifts are only for live events.")

    tier_amount = GIFT_TIERS.get(data.tier)
    if not tier_amount:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid gift tier. Choose: {', '.join(GIFT_TIERS.keys())}"
        )

    now = _now()
    await db.circle_gifts.insert_one({
        "circle_id":       circle_id,
        "event_id":        event_id,
        "sender_id":       str(current_user.id),
        "tier":            data.tier,
        "amount_kes":      tier_amount,
        "creator_cut_kes": round(tier_amount * CREATOR_CUT),
        "anonixx_cut_kes": round(tier_amount * ANONIXX_CUT),
        "sent_at":         now,
    })
    await db.circle_events.update_one(
        {"_id": oid(event_id)},
        {"$inc": {"total_gifts": tier_amount}}
    )

    return {
        "message":    f"A stranger sent {TIER_EMOJIS.get(data.tier, '🎁')}",
        "tier":       data.tier,
        "amount_kes": tier_amount,
    }


# ─── Hot Seat ─────────────────────────────────────────────────────────────────

@router.post("/{circle_id}/events/{event_id}/hotseat/pull")
async def pull_to_hotseat(
    circle_id:    str,
    event_id:     str,
    current_user: User = Depends(get_current_user),
):
    import random
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator(circle, str(current_user.id))

    paid_viewers = await db.circle_event_payments.find({
        "event_id": event_id,
        "status":   "completed",
        "user_id":  {"$ne": str(current_user.id)},
    }).to_list(None)

    if not paid_viewers:
        raise HTTPException(status_code=400, detail="No paid members in the live to pull.")

    selected = random.choice(paid_viewers)
    now      = _now()

    await db.circle_hot_seats.insert_one({
        "circle_id":  circle_id,
        "event_id":   event_id,
        "user_id":    selected["user_id"],
        "status":     "pending",
        "created_at": now,
        "expires_at": now + timedelta(seconds=15),
    })

    return {
        "user_id": selected["user_id"],
        "message": "Hot Seat request sent. They have 15 seconds to decide.",
    }


@router.post("/{circle_id}/events/{event_id}/hotseat/accept")
async def accept_hotseat(
    circle_id:    str,
    event_id:     str,
    current_user: User = Depends(get_current_user),
):
    db = await get_database()
    hs = await db.circle_hot_seats.find_one({
        "event_id": event_id,
        "user_id":  str(current_user.id),
        "status":   "pending",
    })
    if not hs:
        raise HTTPException(status_code=404, detail="No Hot Seat invitation found.")

    expires_at = hs.get("expires_at")
    if not expires_at:
        raise HTTPException(status_code=400, detail="The invitation expired.")
    if getattr(expires_at, "tzinfo", None) is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < _now():
        raise HTTPException(status_code=400, detail="The invitation expired.")

    await db.circle_hot_seats.update_one(
        {"_id": hs["_id"]},
        {"$set": {"status": "accepted", "accepted_at": _now()}}
    )

    channel = f"circle_live_{event_id}"
    uid     = abs(hash(str(current_user.id))) % (2**32)
    token   = generate_agora_token(channel, uid, "publisher")

    return {
        "token":   token,
        "channel": channel,
        "uid":     uid,
        "app_id":  settings.AGORA_APP_ID,
        "message": "You're on. Speak your truth.",
    }


@router.post("/{circle_id}/events/{event_id}/hotseat/decline")
async def decline_hotseat(
    circle_id:    str,
    event_id:     str,
    current_user: User = Depends(get_current_user),
):
    db = await get_database()
    await db.circle_hot_seats.update_one(
        {"event_id": event_id, "user_id": str(current_user.id), "status": "pending"},
        {"$set": {"status": "declined"}}
    )
    return {"message": "You stayed in the shadows."}


# ─── Creator Dashboard ────────────────────────────────────────────────────────

@router.get("/{circle_id}/dashboard")
async def creator_dashboard(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator(circle, str(current_user.id))

    event_agg = await db.circle_event_payments.aggregate([
        {"$match": {"circle_id": circle_id, "status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": "$creator_cut_kes"}}},
    ]).to_list(None)
    event_earn = event_agg[0]["total"] if event_agg else 0

    gift_agg = await db.circle_gifts.aggregate([
        {"$match": {"circle_id": circle_id}},
        {"$group": {"_id": None, "total": {"$sum": "$creator_cut_kes"}}},
    ]).to_list(None)
    gift_earn = gift_agg[0]["total"] if gift_agg else 0

    pending_doc    = await db.circle_payouts.find_one({
        "circle_id":  circle_id,
        "creator_id": str(current_user.id),
        "status":     "pending",
    })
    pending_payout = pending_doc["amount_kes"] if pending_doc else 0

    today       = _now()
    days_ahead  = (7 - today.weekday()) % 7 or 7
    next_monday = (today + timedelta(days=days_ahead)).strftime("%a %b %-d")

    past_events = await db.circle_events.find({
        "circle_id": circle_id,
        "status":    "ended",
    }).sort("ended_at", -1).limit(10).to_list(None)

    admin_count = await db.circle_members.count_documents({
        "circle_id": circle_id,
        "role":      ROLE_ADMIN,
    })

    return {
        "circle": {
            "id":           fmt_id(circle),
            "name":         circle["name"],
            "member_count": circle.get("member_count", 0),
            "member_range": member_range_label(circle.get("member_count", 0)),
            "admin_count":  admin_count,
        },
        "total_earnings_kes": event_earn + gift_earn,
        "event_earnings_kes": event_earn,
        "gift_earnings_kes":  gift_earn,
        "pending_payout_kes": pending_payout,
        "next_payout_date":   next_monday,
        "past_events": [
            {
                "id":           fmt_id(e),
                "title":        e["title"],
                "peak_viewers": e.get("peak_viewers", 0),
                "total_gifts":  e.get("total_gifts", 0),
                "entry_fee":    e.get("entry_fee", 0),
                "ended_at":     e["ended_at"].isoformat() if e.get("ended_at") else None,
            }
            for e in past_events
        ],
    }


# ─── Delete circle ────────────────────────────────────────────────────────────

@router.delete("/{circle_id}")
async def delete_circle(
    circle_id:    str,
    current_user: User = Depends(get_current_user),
):
    db     = await get_database()
    circle = await get_circle_or_404(db, circle_id)
    await assert_creator(circle, str(current_user.id))

    await db.circles.update_one(
        {"_id": oid(circle_id)},
        {"$set": {"is_active": False, "deleted_at": _now()}}
    )
    return {"message": "Your circle has dissolved."}
