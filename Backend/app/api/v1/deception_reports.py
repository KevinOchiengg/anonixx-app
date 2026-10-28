"""Reports of deceptive hookup posts. Only someone who linked up can report; an admin
reviews. If confirmed: refund the reporter, claw back the poster's reward and add a strike
(2nd = 7-day posting ban, 3rd = account disabled)."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta, timezone
from bson import ObjectId

from app.database import get_database
from app.dependencies import get_current_user_id
from app.utils.notifications import send_push_notification

from app.dependencies import require_scope
from app.utils.audit import audit
router = APIRouter(prefix="/deception-reports", tags=["Deception Reports"])


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


POSTING_SUSPENSION_DAYS = 7  # 2nd strike


class FileDeceptionReportRequest(BaseModel):
    connection_id: str
    note: Optional[str] = None  # what specifically felt fake — shown to the admin reviewer


# ==================== FILE A REPORT (the unlocker) ====================

@router.post("")
async def file_deception_report(
    data: FileDeceptionReportRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database),
):
    """Report a Link Up as deceptive. Only the person who paid to link up can file it."""
    try:
        conn_oid = ObjectId(data.connection_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid connection ID.")

    conn = await db["drop_connections"].find_one({"_id": conn_oid})
    if not conn:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Connection not found.")

    if conn.get("unlocker_id") != current_user_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only the person who linked up can report this.",
        )

    existing = await db["deception_reports"].find_one({
        "connection_id": data.connection_id,
        "reporter_id":   current_user_id,
    })
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You've already reported this.")

    report = {
        "_id":            ObjectId(),
        "connection_id":  data.connection_id,
        "drop_id":        conn.get("drop_id"),
        "sender_id":      conn.get("sender_id"),
        "reporter_id":    current_user_id,
        "confession":     conn.get("confession", ""),
        "note":           (data.note or "").strip()[:500],
        "status":         "pending",   # "pending" | "confirmed" | "dismissed"
        "created_at":     now_utc(),
        "resolved_at":    None,
        "resolved_by":    None,
    }
    await db["deception_reports"].insert_one(report)

    return {"id": str(report["_id"]), "status": "pending"}


# ==================== ADMIN REVIEW ====================

async def _find_transaction_amount(db, user_id: str, target_id: str, reasons: list, key: str) -> Optional[int]:
    """What the unlocker actually paid, read from their transaction history."""
    tx = await db["coin_transactions"].find_one({
        "user_id": user_id,
        "reason":  {"$in": reasons},
        f"meta.{key}": target_id,
    })
    if not tx:
        return None
    return abs(tx["amount"])


@router.get("", summary="List pending deception reports")
async def list_deception_reports(
    skip:     int = Query(0,  ge=0),
    limit:    int = Query(20, ge=1, le=100),
    status_filter: str = Query("pending", alias="status"),
    admin_id: str = Depends(require_scope("moderation")),
    db = Depends(get_database),
):
    query = {"status": status_filter} if status_filter != "all" else {}
    total = await db["deception_reports"].count_documents(query)
    cursor = db["deception_reports"].find(query).sort("created_at", -1).skip(skip).limit(limit)

    reports = []
    async for r in cursor:
        sender = await db["users"].find_one(
            {"_id": ObjectId(r["sender_id"])}, {"anonymous_name": 1, "deception_strikes": 1},
        ) if r.get("sender_id") else None
        reporter = await db["users"].find_one(
            {"_id": ObjectId(r["reporter_id"])}, {"anonymous_name": 1},
        ) if r.get("reporter_id") else None

        reports.append({
            "id":               str(r["_id"]),
            "connection_id":    r["connection_id"],
            "confession":       r.get("confession", "")[:300],
            "note":             r.get("note"),
            "sender_id":        r.get("sender_id"),
            "sender_name":      (sender or {}).get("anonymous_name", "Unknown"),
            "sender_strikes":   (sender or {}).get("deception_strikes", 0),
            "reporter_name":    (reporter or {}).get("anonymous_name", "Unknown"),
            "status":           r["status"],
            "created_at":       r["created_at"].isoformat(),
        })

    return {"total": total, "skip": skip, "limit": limit, "reports": reports}


@router.post("/{report_id}/confirm", summary="Confirm a report — refunds, claws back, and strikes the poster")
async def confirm_deception_report(
    report_id: str,
    admin_id:  str = Depends(require_scope("moderation")),
    db = Depends(get_database),
):
    try:
        report_oid = ObjectId(report_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid report ID.")

    report = await db["deception_reports"].find_one({"_id": report_oid})
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found.")
    if report["status"] != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Already {report['status']}.")

    conn = await db["drop_connections"].find_one({"_id": ObjectId(report["connection_id"])})
    if not conn:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Underlying connection no longer exists.")

    unlocker_id = conn["unlocker_id"]
    sender_id   = conn["sender_id"]
    drop_id     = conn["drop_id"]   # posts and drops share this id space post-unlock

    # ── Refund the unlocker — look up what they actually paid ──────────
    refund_amount = await _find_transaction_amount(
        db, unlocker_id, drop_id, ["drop_reveal", "post_reveal"], "drop_id",
    )
    if refund_amount is None:
        refund_amount = await _find_transaction_amount(
            db, unlocker_id, drop_id, ["drop_reveal", "post_reveal"], "post_id",
        )
    if refund_amount:
        from app.utils.coin_service import credit_coins
        await credit_coins(
            db=db, user_id=unlocker_id, amount=refund_amount,
            reason="deception_refund",
            description="Refund — confession you unlocked was confirmed deceptive",
            meta={"report_id": report_id, "connection_id": report["connection_id"]},
        )
        await send_push_notification(
            unlocker_id, "deception_refund", db,
            body_override=f"The confession you reported was confirmed deceptive. {refund_amount} coins are back in your balance.",
        )

    # ── Claw back the poster's reward (may go negative, so it can't be dodged by spending it).
    clawback_amount = await _find_transaction_amount(
        db, sender_id, drop_id, ["drop_unlock_reward"], "drop_id",
    )
    if clawback_amount is None:
        clawback_amount = await _find_transaction_amount(
            db, sender_id, drop_id, ["drop_unlock_reward"], "post_id",
        )
    if clawback_amount:
        result = await db["users"].find_one_and_update(
            {"_id": ObjectId(sender_id)},
            {"$inc": {"coin_balance": -clawback_amount}},
            return_document=True,
        )
        if result:
            await db["coin_transactions"].insert_one({
                "user_id":          sender_id,
                "amount":           -clawback_amount,
                "balance_after":    result["coin_balance"],
                "transaction_type": "spend",
                "reason":           "deception_clawback",
                "description":      "Reward clawed back — confirmed deceptive confession",
                "meta":             {"report_id": report_id, "connection_id": report["connection_id"]},
                "created_at":       now_utc(),
            })

    # ── Strike the poster, escalate ──────────────────────────────────────
    sender = await db["users"].find_one_and_update(
        {"_id": ObjectId(sender_id)},
        {"$inc": {"deception_strikes": 1}},
        return_document=True,
    )
    strikes = (sender or {}).get("deception_strikes", 1)

    escalation = "none"
    strike_template = "deception_strike_warning"
    if strikes == 2:
        await db["users"].update_one(
            {"_id": ObjectId(sender_id)},
            {"$set": {"posting_suspended_until": now_utc() + timedelta(days=POSTING_SUSPENSION_DAYS)}},
        )
        escalation = "posting_suspended_7d"
        strike_template = "deception_strike_suspended"
    elif strikes >= 3:
        await db["users"].update_one(
            {"_id": ObjectId(sender_id)},
            {"$set": {"is_active": False}},
        )
        escalation = "account_deactivated"
        strike_template = "deception_strike_banned"

    await send_push_notification(sender_id, strike_template, db)

    await db["deception_reports"].update_one(
        {"_id": report_oid},
        {"$set": {"status": "confirmed", "resolved_at": now_utc(), "resolved_by": admin_id}},
    )

    await audit(db, admin_id, "deception.confirm", "deception_report", report_id)
    return {
        "report_id":       report_id,
        "status":          "confirmed",
        "refunded":        refund_amount or 0,
        "clawed_back":     clawback_amount or 0,
        "sender_strikes":  strikes,
        "escalation":      escalation,
    }


@router.post("/{report_id}/dismiss", summary="Dismiss a report — no side effects")
async def dismiss_deception_report(
    report_id: str,
    admin_id:  str = Depends(require_scope("moderation")),
    db = Depends(get_database),
):
    try:
        report_oid = ObjectId(report_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid report ID.")

    result = await db["deception_reports"].update_one(
        {"_id": report_oid, "status": "pending"},
        {"$set": {"status": "dismissed", "resolved_at": now_utc(), "resolved_by": admin_id}},
    )
    if result.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found or already resolved.")

    await audit(db, admin_id, "deception.dismiss", "deception_report", report_id)
    return {"report_id": report_id, "status": "dismissed"}
