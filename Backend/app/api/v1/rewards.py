"""
api/v1/rewards.py — Daily claim, streak tracking, milestone awards.

Anti-abuse guards (all server-side):
  1. Account must be ≥ 7 days old
  2. 22-hour cooldown between claims (not calendar day — allows timezone flex)
  3. Monthly cap of 28 claims per user
  4. Streak logic: consecutive 22–48 hr windows keep streak alive; gap > 48hr resets
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from typing import Optional
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id
from app.utils.coin_service import credit_coins

router = APIRouter(prefix="/rewards", tags=["rewards"])

# ─── Constants ────────────────────────────────────────────────────────────────

DAILY_COINS        = 5      # Base daily claim
ACCOUNT_AGE_DAYS   = 7      # Minimum account age to earn
CLAIM_COOLDOWN_HRS = 22     # Hours between claims
STREAK_RESET_HRS   = 48     # Gap that resets streak
MONTHLY_CLAIM_CAP  = 28     # Max claims per calendar month

STREAK_MILESTONES = {
    7:   15,   # Bonus coins at day 7
    14:  25,
    30:  50,
    60:  100,
    100: 200,
}

ONE_TIME_MILESTONES = {
    "first_post":    {"coins": 10, "description": "Posted your first confession"},
    "first_drop":    {"coins": 10, "description": "Dropped your first confession"},
    "first_circle":  {"coins": 10, "description": "Joined your first Circle"},
    "complete_profile": {"coins": 15, "description": "Completed your profile"},
    "ten_connections":  {"coins": 20, "description": "Made 10 connections"},
    "five_referrals":   {"coins": 75, "description": "Referred 5 friends"},
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    """Ensure a datetime is timezone-aware (UTC). MongoDB stores naive datetimes."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _current_month(dt: datetime) -> str:
    return dt.strftime("%Y-%m")


# ─── Models ───────────────────────────────────────────────────────────────────

class ClaimRequest(BaseModel):
    device_id: Optional[str] = None   # Expo getDeviceIdAsync() — optional extra guard


class MilestoneRequest(BaseModel):
    milestone_key: str   # e.g. "first_post"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _compute_streak(last_claim_at: Optional[datetime], current_streak: int, now: datetime) -> int:
    """
    Returns the new streak count after a successful claim.
    - No previous claim → streak = 1
    - Last claim was 22–48 hours ago → streak += 1
    - Last claim was > 48 hours ago → streak resets to 1
    """
    if not last_claim_at:
        return 1
    hours_since = (now - _as_utc(last_claim_at)).total_seconds() / 3600
    if hours_since <= STREAK_RESET_HRS:
        return current_streak + 1
    return 1


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/claim")
async def claim_daily_reward(
    body:            ClaimRequest,
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    now  = _now()
    user = await db.users.find_one({"_id": ObjectId(current_user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # ── Guard 1: Account age ──────────────────────────────────
    created_at = _as_utc(user.get("created_at", now))
    if (now - created_at).days < ACCOUNT_AGE_DAYS:
        days_left = ACCOUNT_AGE_DAYS - (now - created_at).days
        raise HTTPException(
            status_code=403,
            detail=f"Daily rewards unlock in {days_left} day(s). Keep showing up."
        )

    # ── Guard 2: 22-hour cooldown ─────────────────────────────
    last_claim_at: Optional[datetime] = _as_utc(user.get("last_claim_at"))
    if last_claim_at:
        hours_since = (now - last_claim_at).total_seconds() / 3600
        if hours_since < CLAIM_COOLDOWN_HRS:
            hours_left = int(CLAIM_COOLDOWN_HRS - hours_since) + 1
            raise HTTPException(
                status_code=400,
                detail=f"Already claimed today. Come back in {hours_left}h."
            )

    # ── Guard 3: Monthly cap ──────────────────────────────────
    current_month  = _current_month(now)
    stored_month   = user.get("monthly_claim_month", "")
    monthly_count  = user.get("monthly_claim_count", 0) if stored_month == current_month else 0

    if monthly_count >= MONTHLY_CLAIM_CAP:
        raise HTTPException(
            status_code=400,
            detail="Monthly claim limit reached. Resets on the 1st."
        )

    # ── Streak calculation ────────────────────────────────────
    current_streak = user.get("streak_count", 0)
    new_streak     = _compute_streak(last_claim_at, current_streak, now)
    milestone_bonus = STREAK_MILESTONES.get(new_streak, 0)
    total_coins    = DAILY_COINS + milestone_bonus

    # ── Credit coins ──────────────────────────────────────────
    new_balance = await credit_coins(
        db          = db,
        user_id     = current_user_id,
        amount      = DAILY_COINS,
        reason      = "daily_login",
        description = f"Day {new_streak} streak — daily reward",
        meta        = {"streak": new_streak, "device_id": body.device_id},
    )

    if milestone_bonus > 0:
        new_balance = await credit_coins(
            db          = db,
            user_id     = current_user_id,
            amount      = milestone_bonus,
            reason      = "streak_milestone",
            description = f"🔥 {new_streak}-day streak bonus!",
            meta        = {"streak": new_streak},
        )

    # ── Update user streak / claim metadata ───────────────────
    await db.users.update_one(
        {"_id": ObjectId(current_user_id)},
        {"$set": {
            "streak_count":        new_streak,
            "last_claim_at":       now,
            "monthly_claim_month": current_month,
            "monthly_claim_count": monthly_count + 1,
        }},
    )

    return {
        "coins_earned":   total_coins,
        "streak":         new_streak,
        "new_balance":    new_balance,
        "milestone_bonus": milestone_bonus,
        "milestone_hit":  new_streak in STREAK_MILESTONES,
        "message":        f"+{total_coins} coins" + (f" — {new_streak}-day streak! 🔥" if milestone_bonus else ""),
    }


@router.get("/streak")
async def get_streak(
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    user = await db.users.find_one(
        {"_id": ObjectId(current_user_id)},
        {"streak_count": 1, "last_claim_at": 1, "monthly_claim_count": 1,
         "monthly_claim_month": 1, "created_at": 1, "coin_balance": 1},
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    now          = _now()
    last_claim   = _as_utc(user.get("last_claim_at"))
    streak       = user.get("streak_count", 0)
    created_at   = _as_utc(user.get("created_at", now))
    account_days = (now - created_at).days

    # Can they claim right now?
    can_claim = True
    hours_until_next = 0
    reason_blocked = None

    if account_days < ACCOUNT_AGE_DAYS:
        can_claim = False
        reason_blocked = f"Unlocks in {ACCOUNT_AGE_DAYS - account_days} day(s)"
    elif last_claim:
        hours_since = (now - last_claim).total_seconds() / 3600
        if hours_since < CLAIM_COOLDOWN_HRS:
            can_claim = False
            hours_until_next = int(CLAIM_COOLDOWN_HRS - hours_since) + 1
            reason_blocked = f"Come back in {hours_until_next}h"

    current_month = _current_month(now)
    stored_month  = user.get("monthly_claim_month", "")
    monthly_count = user.get("monthly_claim_count", 0) if stored_month == current_month else 0

    if monthly_count >= MONTHLY_CLAIM_CAP:
        can_claim = False
        reason_blocked = "Monthly limit reached"

    # Streak danger: will reset if not claimed within window
    streak_in_danger = False
    if last_claim and streak > 0:
        hours_since = (now - last_claim).total_seconds() / 3600
        streak_in_danger = hours_since > CLAIM_COOLDOWN_HRS

    next_milestone = next(
        (m for m in sorted(STREAK_MILESTONES.keys()) if m > streak), None
    )

    return {
        "streak":           streak,
        "can_claim":        can_claim,
        "reason_blocked":   reason_blocked,
        "hours_until_next": hours_until_next,
        "streak_in_danger": streak_in_danger,
        "next_milestone":   next_milestone,
        "next_milestone_bonus": STREAK_MILESTONES.get(next_milestone, 0),
        "monthly_claims":   monthly_count,
        "monthly_cap":      MONTHLY_CLAIM_CAP,
        "coin_balance":     user.get("coin_balance", 0),
    }


@router.post("/milestone")
async def award_milestone(
    body:            MilestoneRequest,
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    """
    Award a one-time milestone bonus.
    Called from within the app when user completes the milestone action.
    Idempotent — awarding the same key twice is a no-op.
    """
    key = body.milestone_key
    if key not in ONE_TIME_MILESTONES:
        raise HTTPException(status_code=400, detail="Unknown milestone.")

    milestone = ONE_TIME_MILESTONES[key]

    # Idempotency check
    already = await db.coin_transactions.find_one({
        "user_id": current_user_id,
        "reason":  "milestone",
        "meta.milestone_key": key,
    })
    if already:
        return {"message": "Already awarded.", "awarded": False}

    new_balance = await credit_coins(
        db          = db,
        user_id     = current_user_id,
        amount      = milestone["coins"],
        reason      = "milestone",
        description = milestone["description"],
        meta        = {"milestone_key": key},
    )

    return {
        "awarded":     True,
        "coins":       milestone["coins"],
        "new_balance": new_balance,
        "message":     f"+{milestone['coins']} coins — {milestone['description']}",
    }
