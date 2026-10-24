"""
Guided hookup confessions: the AI writer behind the step-by-step composer.

POST /guided/generate  answers + tone -> a confession draft the poster can edit
GET  /guided/status    whether the writer is on, and how many drafts are left today

Posting still goes through POST /drops (kind="hookup"), which re-runs every
check, so nothing generated here reaches the feed without the normal gates.
"""

from datetime import timedelta
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.v1.drops import (
    AGE_GATE_DETAIL, HOOKUP_CRAVINGS, HOOKUP_HOSTING, HOOKUP_TONES,
    HOOKUP_TRAITS, HOOKUP_VIBES, now_utc,
)
from app.database import get_database
from app.dependencies import get_current_user_id
from app.services import confession_writer as writer
from app.utils.contact_filter import CONTACT_INFO_ERROR, contains_contact_info
from app.utils.moderation import MODERATION_ERROR, violates_policy

router = APIRouter(prefix="/guided", tags=["guided"])

DAILY_DRAFTS = 20          # AI drafts per person per rolling 24h
DRAFT_MEMORY = 4           # earlier drafts sent back so a regenerate reads differently
RECENT_OPENINGS = 12       # platform-wide openings to steer away from

_LOOKING_WORDS = {"woman": "a woman", "man": "a man", "anyone": "anyone, whoever feels right"}
_HOSTING_WORDS = {
    "can_host": "they can host",
    "can_travel": "they can come to the other person",
    "either": "either hosting or travelling works for them",
    "decide": "they would rather decide together",
}


class GenerateRequest(BaseModel):
    craving: Optional[str] = None
    craving_custom: Optional[str] = Field(None, max_length=40)
    age: int
    gender: Optional[str] = None
    area: str = Field(..., max_length=60)
    looking_for: Optional[str] = None
    age_min: Optional[int] = None
    age_max: Optional[int] = None
    connection: Optional[List[str]] = None
    traits: Optional[List[str]] = None
    secret: Optional[str] = Field(None, max_length=200)
    hosting: Optional[str] = None
    public_first: bool = False
    tone: str = "vulnerable"
    previous: Optional[List[str]] = None   # this session's earlier drafts


def _opening(text: str) -> str:
    return " ".join(text.split()[:6])


async def _used_today(db, user_id: str) -> int:
    return await db["guided_generations"].count_documents(
        {"user_id": user_id, "created_at": {"$gte": now_utc() - timedelta(hours=24)}}
    )


@router.get("/status")
async def status(current_user_id: str = Depends(get_current_user_id), db=Depends(get_database)):
    used = await _used_today(db, current_user_id)
    return {"enabled": writer.is_configured(), "remaining": max(0, DAILY_DRAFTS - used), "daily": DAILY_DRAFTS}


@router.post("/generate")
async def generate(
    data: GenerateRequest,
    current_user_id: str = Depends(get_current_user_id),
    db=Depends(get_database),
):
    if not writer.is_configured():
        raise HTTPException(status_code=503, detail="The writer is resting right now. Write it in your own words instead.")

    user = await db["users"].find_one({"_id": ObjectId(current_user_id)}, {"age_verified": 1, "is_admin": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.get("age_verified") and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail=AGE_GATE_DETAIL)

    if data.age < 18 or data.age > 99:
        raise HTTPException(status_code=400, detail="You must be 18 or older to post a hookup confession.")
    area = " ".join(data.area.split())
    if not area:
        raise HTTPException(status_code=400, detail="Add where you are.")
    lo = data.age_min if data.age_min and 18 <= data.age_min <= 99 else None
    hi = data.age_max if data.age_max and 18 <= data.age_max <= 99 else None
    if lo and hi and lo > hi:
        lo, hi = hi, lo

    custom = " ".join((data.craving_custom or "").split())
    secret = " ".join((data.secret or "").split())
    for t in (area, custom, secret):
        if contains_contact_info(t):
            raise HTTPException(status_code=400, detail=CONTACT_INFO_ERROR)
        if violates_policy(t):
            raise HTTPException(status_code=400, detail=MODERATION_ERROR)
    if writer.MONEY.search(f"{custom} {secret}"):
        raise HTTPException(status_code=400, detail="Leave money and gifts out of it. On Anonixx nobody pays for company.")

    used = await _used_today(db, current_user_id)
    if used >= DAILY_DRAFTS:
        raise HTTPException(status_code=429, detail="That's all the drafts for today. Edit the last one, or write it yourself.")

    craving = custom if (custom and data.craving not in HOOKUP_CRAVINGS) else data.craving
    meeting = "somewhere public first" if data.public_first else None
    answers = {
        "craving": craving,
        "age": data.age,
        "gender": data.gender if data.gender in ("woman", "man") else None,
        "area": area,
        "looking_for": _LOOKING_WORDS.get(data.looking_for or "anyone"),
        "age_range": f"{lo or 18} to {hi}" if hi else (f"{lo}+" if lo else None),
        "connection": [v for v in (data.connection or []) if v in HOOKUP_VIBES][:4],
        "traits": [t for t in (data.traits or []) if t in HOOKUP_TRAITS][:3],
        "secret": secret or None,
        "hosting": _HOSTING_WORDS.get(data.hosting) if data.hosting in HOOKUP_HOSTING else None,
        "meeting": meeting,
    }

    recent = await db["drops"].find(
        {"kind": "hookup", "hookup.guided.ai_generated": True, "confession": {"$ne": None}},
        {"confession": 1},
    ).sort("created_at", -1).limit(RECENT_OPENINGS).to_list(RECENT_OPENINGS)
    previous = [" ".join(p.split())[:500] for p in (data.previous or []) if p and p.strip()][-DRAFT_MEMORY:]

    tone = data.tone if data.tone in HOOKUP_TONES else "vulnerable"
    try:
        text = await writer.write_confession(
            answers, tone,
            avoid_openings=[_opening(d["confession"]) for d in recent],
            previous_drafts=previous,
        )
    except writer.WriterUnavailable:
        raise HTTPException(status_code=503, detail="The writer is resting right now. Write it in your own words instead.")
    except writer.WriterFailed:
        raise HTTPException(status_code=502, detail="Couldn't find the words this time. Try again, or try another tone.")

    await db["guided_generations"].insert_one({"user_id": current_user_id, "created_at": now_utc(), "tone": tone})
    return {"confession": text, "tone": tone, "remaining": max(0, DAILY_DRAFTS - used - 1)}
