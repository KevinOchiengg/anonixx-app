"""
api/v1/referrals.py — Referral code generation and conversion.

Flow:
  1. GET  /referrals/my-code   — get (or generate) your unique referral code
  2. POST /referrals/apply     — new user applies a code during onboarding
  3. POST /referrals/complete  — called after onboarding finishes → credits both parties
  4. GET  /referrals/stats     — see your referral history
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional
import random
import string
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id
from app.utils.coin_service import credit_coins

router = APIRouter(prefix="/referrals", tags=["referrals"])

# ─── Constants ────────────────────────────────────────────────────────────────

REFERRER_REWARD  = 30    # Coins credited to the person who referred
REFERRED_REWARD  = 10    # Bonus coins for the person who was referred (on top of welcome)
MONTHLY_REF_CAP  = 20    # Max referral credits per month


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _generate_code(length: int = 8) -> str:
    """8-char uppercase alphanumeric, e.g. ANX7K2MQ"""
    chars = string.ascii_uppercase + string.digits
    return "ANX" + "".join(random.choices(chars, k=length - 3))


# ─── Models ───────────────────────────────────────────────────────────────────

class ApplyReferralRequest(BaseModel):
    code: str


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/my-code")
async def get_my_referral_code(
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    user = await db.users.find_one(
        {"_id": ObjectId(current_user_id)},
        {"referral_code": 1, "username": 1, "anonymous_name": 1},
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    code = user.get("referral_code")

    # Generate and persist if not yet set
    if not code:
        while True:
            code = _generate_code()
            clash = await db.users.find_one({"referral_code": code})
            if not clash:
                break

        await db.users.update_one(
            {"_id": ObjectId(current_user_id)},
            {"$set": {"referral_code": code}},
        )

    share_link = f"https://anonixx.app/join?ref={code}"

    return {
        "code":       code,
        "share_link": share_link,
        "message":    "Share this link. You earn 30 coins for every friend who joins.",
    }


@router.post("/apply")
async def apply_referral_code(
    body:            ApplyReferralRequest,
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    """
    Called during onboarding when a new user enters a referral code.
    Records the referral but does NOT credit yet — credit happens at /complete.
    """
    code = body.code.strip().upper()

    # Can't refer yourself
    self_user = await db.users.find_one(
        {"_id": ObjectId(current_user_id)},
        {"referred_by": 1, "referral_code": 1},
    )
    if not self_user:
        raise HTTPException(status_code=404, detail="User not found.")
    if self_user.get("referred_by"):
        return {"message": "Referral already applied.", "applied": False}
    if self_user.get("referral_code") == code:
        raise HTTPException(status_code=400, detail="You cannot refer yourself.")

    # Find the referrer
    referrer = await db.users.find_one({"referral_code": code}, {"_id": 1})
    if not referrer:
        raise HTTPException(status_code=404, detail="Invalid referral code.")

    referrer_id = str(referrer["_id"])
    if referrer_id == current_user_id:
        raise HTTPException(status_code=400, detail="You cannot refer yourself.")

    await db.users.update_one(
        {"_id": ObjectId(current_user_id)},
        {"$set": {"referred_by": code, "referred_by_user_id": referrer_id}},
    )

    return {"message": "Code applied! You'll both earn coins once you complete onboarding.", "applied": True}


@router.post("/complete")
async def complete_referral(
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    """
    Called once when a referred user completes onboarding (interest selection).
    Credits both the referrer (30 coins) and the referred user (10 bonus coins).
    Idempotent — safe to call multiple times.
    """
    user = await db.users.find_one(
        {"_id": ObjectId(current_user_id)},
        {"referred_by_user_id": 1, "referral_completed": 1},
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if user.get("referral_completed"):
        return {"message": "Already processed.", "processed": False}

    referrer_id = user.get("referred_by_user_id")
    if not referrer_id:
        return {"message": "No referral to process.", "processed": False}

    now = _now()

    # ── Monthly cap check for referrer ────────────────────────
    current_month = now.strftime("%Y-%m")
    referrer_doc  = await db.users.find_one(
        {"_id": ObjectId(referrer_id)},
        {"monthly_ref_count": 1, "monthly_ref_month": 1},
    )
    if referrer_doc:
        stored_month  = referrer_doc.get("monthly_ref_month", "")
        monthly_count = referrer_doc.get("monthly_ref_count", 0) if stored_month == current_month else 0

        if monthly_count < MONTHLY_REF_CAP:
            await credit_coins(
                db          = db,
                user_id     = referrer_id,
                amount      = REFERRER_REWARD,
                reason      = "referral_bonus",
                description = "A friend joined using your link",
                meta        = {"referred_user_id": current_user_id},
            )
            await db.users.update_one(
                {"_id": ObjectId(referrer_id)},
                {"$set": {
                    "monthly_ref_month": current_month,
                    "monthly_ref_count": monthly_count + 1,
                }, "$inc": {"total_referrals": 1}},
            )

    # ── Bonus coins for the referred user ─────────────────────
    await credit_coins(
        db          = db,
        user_id     = current_user_id,
        amount      = REFERRED_REWARD,
        reason      = "referral_bonus",
        description = "Joined via a friend's referral",
        meta        = {"referrer_id": referrer_id},
    )

    # ── Mark as processed ────────────────────────────────────
    await db.users.update_one(
        {"_id": ObjectId(current_user_id)},
        {"$set": {"referral_completed": True, "referral_completed_at": now}},
    )

    return {"message": f"+{REFERRED_REWARD} coins added. Your friend earned {REFERRER_REWARD} too.", "processed": True}


@router.get("/stats")
async def get_referral_stats(
    current_user_id: str = Depends(get_current_user_id),
    db               = Depends(get_database),
):
    user = await db.users.find_one(
        {"_id": ObjectId(current_user_id)},
        {"referral_code": 1, "total_referrals": 1},
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    code = user.get("referral_code")

    # Count coins earned via referrals
    pipeline = [
        {"$match": {"user_id": current_user_id, "reason": "referral_bonus", "transaction_type": "earn"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    agg    = await db.coin_transactions.aggregate(pipeline).to_list(1)
    earned = agg[0]["total"] if agg else 0

    return {
        "referral_code":    code,
        "share_link":       f"https://anonixx.app/join?ref={code}" if code else None,
        "total_referred":   user.get("total_referrals", 0),
        "coins_earned":     earned,
        "reward_per_ref":   REFERRER_REWARD,
    }
