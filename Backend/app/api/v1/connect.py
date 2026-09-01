"""
app/api/v1/connect.py
Anonymous Profile — the sheet shown when tapping someone's anonymous name.

The old free "Connect" request/chat/call/reveal system that used to live in
this file (and the connect_chats/connect_requests/connect_messages
collections it wrote to) has been removed. The only way to actually reach
someone is Link Up (coins → unlock_requests.py / drops.py → drop_connections
→ DropChatScreen) — this file now only serves the read-only profile view.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from datetime import datetime, timezone, date
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id
from app.api.v1.drops import INTENT_LABELS

router = APIRouter(prefix="/connect", tags=["Connect"])


# ==================== HELPERS ====================

async def get_user_by_anonymous_name(anonymous_name: str, db):
    """Look up a user by their anonymous_name"""
    return await db["users"].find_one({"anonymous_name": anonymous_name})


# ==================== ANONYMOUS PROFILE ====================

# Declared before /profile/{anonymous_name} so "id" is never swallowed as a name.
@router.get("/profile/id/{user_id}")
async def get_anonymous_profile_by_id(
    user_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """
    Same profile as the by-name route, resolved by user id.

    Preferred over the name lookup: anonymous_name is randomly generated and
    not unique, so looking a profile up by name can land on the wrong person
    (and make is_self resolve incorrectly). Clients that have the id — every
    feed card does — should use this.
    """
    try:
        user = await db["users"].find_one({"_id": ObjectId(user_id)})
    except Exception:
        user = None
    if not user:
        raise HTTPException(status_code=404, detail="Profile not found")
    return await _build_anonymous_profile(user, current_user_id, db)


@router.get("/profile/{anonymous_name}")
async def get_anonymous_profile(
    anonymous_name: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """
    Get a user's anonymous profile by name.

    Kept for already-installed app builds. Prefer /profile/id/{user_id} —
    anonymous names aren't unique, so this can resolve to the wrong user.
    """
    user = await get_user_by_anonymous_name(anonymous_name, db)

    if not user:
        raise HTTPException(status_code=404, detail="Profile not found")

    return await _build_anonymous_profile(user, current_user_id, db)


async def _build_anonymous_profile(user: dict, current_user_id: str, db) -> dict:
    """Shared profile payload for both lookup routes."""
    target_id = str(user["_id"])

    # Viewing yourself is allowed — it doubles as a "this is how others see
    # you" preview.
    is_self = target_id == current_user_id

    # Get confession count
    confession_count = await db["posts"].count_documents({
        "user_id": target_id,
        "post_type": {"$ne": "response"}
    })

    # Join date — month + year only
    created_at = user.get("created_at", datetime.now(timezone.utc))
    join_date = created_at.strftime("%B %Y")

    # How many people they've actually linked up with.
    connections_count = await db["drop_connections"].count_documents({
        "$or": [{"sender_id": target_id}, {"unlocker_id": target_id}]
    })

    # Posting streak — the "shows up consistently" signal.
    streak_doc = await db["confession_streaks"].find_one(
        {"user_id": target_id}, {"streak": 1, "longest_streak": 1}
    ) or {}

    vibe_doc = await db["vibe_scores"].find_one({"user_id": target_id}, {"events": 1})
    reactions_received = ((vibe_doc or {}).get("events", {}) or {}).get("reaction_received", 0)

    # "Here for" — what they're actually here for, on-theme, computed from
    # their own drops rather than a self-reported label. Whichever intent
    # they've posted under most often (real-connection / no-strings /
    # just-talk / general — same vocabulary as the drop compose picker).
    here_for = None
    intent_counts = {}
    async for d in db["drops"].find(
        {"sender_id": target_id, "intent": {"$ne": None}}, {"intent": 1},
    ):
        intent = d.get("intent")
        if intent:
            intent_counts[intent] = intent_counts.get(intent, 0) + 1
    if intent_counts:
        top_intent = max(intent_counts, key=intent_counts.get)
        here_for = INTENT_LABELS.get(top_intent)

    # Age, not date of birth — a number is standard profile info, an exact
    # birthday is identifying.
    age = None
    dob = user.get("date_of_birth")
    if dob:
        try:
            if isinstance(dob, str):
                dob = date.fromisoformat(dob)
            elif isinstance(dob, datetime):
                dob = dob.date()
            today = datetime.now(timezone.utc).date()
            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        except Exception:
            age = None

    # Location is deliberately coarse — county + country only. Anonixx users
    # set sub-county and estate for feed scoping, but showing that on a public
    # profile would narrow an "anonymous" poster down to a neighbourhood.
    location = ", ".join(
        v for v in [user.get("location_county"), user.get("location_country")]
        if v and str(v).strip()
    ) or None

    # Coarse recency instead of an exact timestamp — enough to know whether
    # a reply is likely, without publishing someone's activity pattern.
    from app.websockets.events import is_user_online
    is_online = is_user_online(target_id)
    last_seen = None
    if not is_online and user.get("last_login"):
        ll = user["last_login"]
        if ll.tzinfo is None:
            ll = ll.replace(tzinfo=timezone.utc)
        days = (datetime.now(timezone.utc) - ll).days
        last_seen = (
            "Active today"      if days <= 0 else
            "Active yesterday"  if days == 1 else
            f"Active {days} days ago" if days < 7 else
            "Active this month" if days < 31 else
            "Active a while ago"
        )

    return {
        "user_id": target_id,               # internal id — needed for Link Up routing
        "is_self": is_self,                 # viewing your own profile preview
        "anonymous_name": user["anonymous_name"],
        "avatar_url": user.get("avatar_url"),   # real photo if set — client falls back to initials
        "confession_count": confession_count,
        "connections_count": connections_count,
        "here_for": here_for,               # "Relationship" | "No Strings" | "Generous Arrangement" | "General" | null
        "reactions_received": reactions_received,
        "streak": streak_doc.get("streak", 0),
        "longest_streak": streak_doc.get("longest_streak", 0),
        "join_date": join_date,
        "age": age,
        "location": location,
        "is_premium": bool(user.get("is_premium")),
        "is_online": is_online,
        "last_seen": last_seen,
        "gender": user.get("gender"),       # male | female | nonbinary | prefer_not_to_say | null
    }

