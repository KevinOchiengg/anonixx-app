"""
Watches Anonixx for the founder: alerts when something breaks or spikes, a
morning summary, and AI risk scores for newly flagged posts.

Every CHECK_EVERY seconds while the server is up:
  - alerts (rows in `admin_alerts`, pushed and emailed to super admins), each
    type at most once per COOLDOWN:
      no_signups        no new accounts in 24h after a week that had some
      payments_failing  purchases failing or stuck pending
      publisher_failing social auto-posts failing
      scheduled_failed  a scheduled drop failed to publish
      reports_spike     many posts flagged within an hour
      traffic_spike     visits well above normal (good news, but worth knowing)
  - the daily digest at ADMIN_DIGEST_HOUR_UTC, once per day
  - risk scores for flagged drops that don't have one yet (services/risk_screen)
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.config import settings

log = logging.getLogger(__name__)

CHECK_EVERY = 15 * 60
COOLDOWN = timedelta(hours=6)
_task: asyncio.Task | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _super_admins(db) -> list[dict]:
    emails = [e.strip().lower() for e in settings.SUPER_ADMIN_EMAILS.split(",") if e.strip()]
    if not emails:
        return []
    return await db["users"].find({"is_admin": True, "email": {"$in": emails}}, {"email": 1}).to_list(None)


async def _notify(db, title: str, body: str, link: str = "/admin") -> None:
    from app.api.v1.drops import send_push_notification
    from app.utils.email import send_admin_email
    for u in await _super_admins(db):
        try:
            await send_push_notification(str(u["_id"]), title, body, db, data={"type": "admin", "url": link})
        except Exception as e:
            log.warning("admin push failed: %s", e)
        try:
            await asyncio.to_thread(send_admin_email, u["email"], title, body, link)
        except Exception as e:
            log.warning("admin email failed: %s", e)


async def raise_alert(db, kind: str, level: str, title: str, body: str, link: str = "/admin") -> bool:
    recent = await db["admin_alerts"].find_one({"type": kind, "created_at": {"$gte": _now() - COOLDOWN}})
    if recent:
        return False
    await db["admin_alerts"].insert_one({"type": kind, "level": level, "title": title, "body": body, "link": link,
                                         "created_at": _now(), "dismissed_at": None})
    await _notify(db, title, body, link)
    return True


async def check_alerts(db) -> None:
    now = _now()
    day, week = now - timedelta(days=1), now - timedelta(days=8)
    signups_24h = await db["users"].count_documents({"created_at": {"$gte": day}})
    signups_week = await db["users"].count_documents({"created_at": {"$gte": week, "$lt": day}})
    if signups_24h == 0 and signups_week > 0:
        await raise_alert(db, "no_signups", "warn", "No signups in 24 hours",
                          f"{signups_week} people joined in the week before, none today. Check signup and the site.", "/admin/visitors")

    failed = await db["coin_purchases"].count_documents({"status": {"$in": ["failed", "cancelled"]}, "created_at": {"$gte": now - timedelta(hours=2)}})
    stuck = await db["coin_purchases"].count_documents({"status": "pending", "created_at": {"$lt": now - timedelta(minutes=30), "$gte": now - timedelta(hours=6)}})
    if failed >= 3 or stuck >= 3:
        await raise_alert(db, "payments_failing", "bad", "Payments are failing",
                          f"{failed} failed in 2 hours, {stuck} stuck pending over 30 minutes.", "/admin/money")

    pub_failed = await db["publisher_queue"].count_documents({"status": "failed", "_id": {"$gte": _oid_at(now - timedelta(hours=6))}})
    if pub_failed >= 3:
        await raise_alert(db, "publisher_failing", "warn", "Social auto-posting is failing",
                          f"{pub_failed} posts to TikTok/Instagram/Facebook/Telegram failed in 6 hours.", "/admin/health")

    sched_failed = await db["scheduled_drops"].count_documents({"status": "failed", "updated_at": {"$gte": now - timedelta(hours=6)}}) \
        or await db["scheduled_drops"].count_documents({"status": "failed", "created_at": {"$gte": now - timedelta(hours=6)}})
    if sched_failed:
        await raise_alert(db, "scheduled_failed", "warn", "A scheduled drop didn't publish",
                          f"{sched_failed} scheduled drop(s) failed. Open the calendar to retry.", "/admin/calendar")

    flagged = await db["drops"].count_documents({"flagged_at": {"$gte": now - timedelta(hours=1)}})
    if flagged >= 5:
        await raise_alert(db, "reports_spike", "bad", "Reports are spiking",
                          f"{flagged} posts were flagged in the last hour.", "/admin/moderation")

    hour = await db["site_events"].count_documents({"type": "view", "created_at": {"$gte": now - timedelta(hours=1)}})
    week_views = await db["site_events"].count_documents({"type": "view", "created_at": {"$gte": now - timedelta(days=7), "$lt": now - timedelta(hours=1)}})
    avg = week_views / (7 * 24 - 1)
    if hour >= 50 and hour > 3 * max(avg, 1):
        await raise_alert(db, "traffic_spike", "good", "Traffic spike",
                          f"{hour} page views in the last hour, about {round(hour / max(avg, 1))}x normal. See where it's coming from.", "/admin/visitors")


def _oid_at(dt: datetime):
    from bson import ObjectId
    return ObjectId.from_datetime(dt)


async def daily_digest(db, force: bool = False) -> dict:
    now = _now()
    today = now.strftime("%Y-%m-%d")
    state = await db["admin_state"].find_one({"_id": "digest"}) or {}
    if not force and (state.get("last_day") == today or now.hour < settings.ADMIN_DIGEST_HOUR_UTC):
        return {}
    start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    span = {"$gte": start, "$lt": end}
    visitors = len(await db["site_events"].distinct("vid", {"created_at": span}))
    signups = await db["users"].count_documents({"created_at": span})
    drops = await db["drops"].count_documents({"created_at": span})
    posters = len(await db["drops"].distinct("sender_id", {"created_at": span, "is_admin_drop": {"$ne": True}}))
    active = await db["user_activity_days"].count_documents({"day": start.strftime("%Y-%m-%d")})
    paid = await db["coin_purchases"].find({"status": "completed", "completed_at": span}, {"amount_cents": 1, "kes": 1}).to_list(None)
    usd = sum((p.get("amount_cents") or 0) for p in paid) / 100
    kes = sum((p.get("kes") or 0) for p in paid)
    flagged = await db["drops"].count_documents({"moderation_status": {"$in": ["flagged", "hidden"]}})
    open_alerts = await db["admin_alerts"].count_documents({"dismissed_at": None})
    refunds = await db["refund_requests"].count_documents({"status": "pending"})
    summary = {
        "day": start.strftime("%a %d %b"), "visitors": visitors, "signups": signups, "active_users": active,
        "drops": drops, "posters": posters, "purchases": len(paid), "usd": round(usd, 2), "kes": int(kes),
        "flagged_waiting": flagged, "refunds_waiting": refunds, "open_alerts": open_alerts,
    }
    money = " + ".join(x for x in (f"${usd:.2f}" if usd else "", f"KES {int(kes):,}" if kes else "") if x) or "no sales"
    body = (f"{summary['day']}: {visitors} visitors, {signups} signups, {active} active, {drops} drops from {posters} people, {money}. "
            f"Waiting: {flagged} to moderate, {refunds} refunds, {open_alerts} alerts.")
    await _notify(db, "Your Anonixx morning", body, "/admin")
    await db["admin_state"].update_one({"_id": "digest"}, {"$set": {"last_day": today, "last": summary, "sent_at": now}}, upsert=True)
    return summary


async def score_flagged(db, limit: int = 10) -> int:
    from app.services.risk_screen import screen
    rows = await db["drops"].find(
        {"moderation_status": {"$in": ["flagged", "hidden"]}, "risk_scored_at": None},
        {"confession": 1, "kind": 1, "media_type": 1, "report_count": 1, "moderation_status": 1},
    ).limit(limit).to_list(None)
    for d in rows:
        reasons = [f"{r.get('reason') or ''} {r.get('note') or ''}".strip() async for r in db["drop_reports"].find({"drop_id": str(d["_id"])}, {"reason": 1, "note": 1}).limit(20)]
        res = await screen(d, reasons)
        await db["drops"].update_one({"_id": d["_id"]}, {"$set": {
            "risk_score": res["score"], "risk_category": res["category"], "risk_reason": res["reason"],
            "risk_by": res["by"], "risk_scored_at": _now(),
        }})
    return len(rows)


async def run_once(db) -> None:
    for step in (check_alerts, daily_digest, score_flagged):
        try:
            await step(db)
        except Exception as e:
            log.warning("admin monitor step %s failed: %s", step.__name__, e)


async def _loop() -> None:
    from app.database import get_database
    await asyncio.sleep(30)      # let startup finish first
    while True:
        try:
            await run_once(await get_database())
        except Exception as e:
            log.warning("admin monitor: %s", e)
        await asyncio.sleep(CHECK_EVERY)


async def start() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop())


async def stop() -> None:
    if _task and not _task.done():
        _task.cancel()
