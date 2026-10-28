"""Admin insights: growth, money, system health, per-user views, audit log and A/B tests."""
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.config import settings
from app.database import get_database
from app.dependencies import (
    ADMIN_ROLES, admin_scopes, is_super_admin_user, require_admin, require_scope, require_super_admin,
)
from app.utils.audit import audit

router = APIRouter(tags=["Admin insights"])

DROP_PATH = re.compile(r"^/drop/([0-9a-f]{24})")
UNTRACKED = "before tracking"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt):
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _iso(dt) -> Optional[str]:
    return _aware(dt).isoformat() if dt else None


def _oid(raw: str) -> ObjectId:
    try:
        return ObjectId(raw)
    except Exception:
        raise HTTPException(400, "Invalid ID")


async def _completed_purchases(db, match: Optional[dict] = None) -> list:
    return await db["coin_purchases"].find(
        {"status": "completed", **(match or {})},
        {"user_id": 1, "amount_cents": 1, "currency": 1, "kes": 1, "provider": 1, "coins": 1, "completed_at": 1, "created_at": 1},
    ).to_list(None)


def _money(rows: list) -> dict:
    usd = sum((r.get("amount_cents") or 0) for r in rows if (r.get("currency") or "usd") == "usd") / 100
    kes = sum((r.get("kes") or 0) for r in rows)
    return {"usd": round(usd, 2), "kes": int(kes), "count": len(rows)}


# ─── Growth: channels ────────────────────────────────────────────────────────

@router.get("/admin/insights/channels", summary="Signups and what they became, by signup channel")
async def channels(
    days: int = Query(90, ge=1, le=365),
    admin_id: str = Depends(require_scope("growth")),
    db=Depends(get_database),
):
    since = _now() - timedelta(days=days)
    users = await db["users"].find(
        {"created_at": {"$gte": since}}, {"signup_source": 1, "referred_by": 1, "created_at": 1},
    ).to_list(None)
    ids = [str(u["_id"]) for u in users]
    posters = set(await db["drops"].distinct("sender_id", {"sender_id": {"$in": ids}})) if ids else set()
    week_ago = (_now() - timedelta(days=7)).strftime("%Y-%m-%d")
    active = set(await db["user_activity_days"].distinct("user_id", {"user_id": {"$in": ids}, "day": {"$gte": week_ago}})) if ids else set()
    purchases = await _completed_purchases(db, {"user_id": {"$in": ids}}) if ids else []
    by_user = defaultdict(list)
    for p in purchases:
        by_user[p["user_id"]].append(p)

    rows: dict = {}
    for u in users:
        src = u.get("signup_source") or {}
        ch = src.get("channel") or ("referral" if u.get("referred_by") else UNTRACKED)
        r = rows.setdefault(ch, {"channel": ch, "signups": 0, "posted": 0, "active_7d": 0, "payers": 0, "usd": 0.0, "kes": 0})
        uid = str(u["_id"])
        r["signups"] += 1
        r["posted"] += uid in posters
        r["active_7d"] += uid in active
        if by_user.get(uid):
            r["payers"] += 1
            m = _money(by_user[uid])
            r["usd"] = round(r["usd"] + m["usd"], 2)
            r["kes"] += m["kes"]
    out = sorted(rows.values(), key=lambda r: -r["signups"])
    for r in out:
        n = r["signups"] or 1
        r["posted_pct"] = round(100 * r["posted"] / n)
        r["active_pct"] = round(100 * r["active_7d"] / n)
        r["payer_pct"] = round(100 * r["payers"] / n)
    return {"days": days, "total_signups": len(users), "channels": out}


# ─── Growth: retention ───────────────────────────────────────────────────────

@router.get("/admin/insights/retention", summary="Weekly signup cohorts: who came back")
async def retention(
    weeks: int = Query(8, ge=2, le=26),
    admin_id: str = Depends(require_scope("growth")),
    db=Depends(get_database),
):
    today = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    this_monday = today - timedelta(days=today.weekday())
    start = this_monday - timedelta(weeks=weeks - 1)
    users = await db["users"].find({"created_at": {"$gte": start}}, {"created_at": 1}).to_list(None)
    joined = {str(u["_id"]): _aware(u["created_at"]).replace(hour=0, minute=0, second=0, microsecond=0) for u in users if u.get("created_at")}

    # Days each user was active: signed-in requests (user_activity_days, from 27 Oct 2026),
    # plus days they posted, so cohorts from before the tracker started still show something.
    active = defaultdict(set)
    if joined:
        ids = list(joined)
        async for a in db["user_activity_days"].find({"user_id": {"$in": ids}}, {"user_id": 1, "day": 1}):
            active[a["user_id"]].add(a["day"])
        async for d in db["drops"].find({"sender_id": {"$in": ids}}, {"sender_id": 1, "created_at": 1}):
            if d.get("created_at"):
                active[d["sender_id"]].add(_aware(d["created_at"]).strftime("%Y-%m-%d"))

    def back(uid: str, lo: int, hi: int) -> bool:
        base = joined[uid]
        return any((base + timedelta(days=n)).strftime("%Y-%m-%d") in active[uid] for n in range(lo, hi + 1))

    cohorts = []
    for w in range(weeks):
        wk = start + timedelta(weeks=w)
        members = [uid for uid, d in joined.items() if wk <= d < wk + timedelta(weeks=1)]
        age = (today - wk).days
        row = {"week": wk.strftime("%Y-%m-%d"), "users": len(members), "d1": None, "d7": None, "d30": None}
        if members:
            for key, lo, hi, need in (("d1", 1, 1, 1), ("d7", 7, 13, 13), ("d30", 30, 36, 36)):
                ripe = [uid for uid in members if (today - joined[uid]).days >= need]
                if ripe:
                    row[key] = round(100 * sum(back(uid, lo, hi) for uid in ripe) / len(ripe))
        row["age_days"] = age
        cohorts.append(row)
    return {"weeks": weeks, "cohorts": cohorts, "tracking_since": "2026-10-27"}


# ─── Growth: which drops bring signups ──────────────────────────────────────

@router.get("/admin/insights/drop-conversions", summary="Drops that turned visitors into signups (super admin)")
async def drop_conversions(
    days: int = Query(30, ge=1, le=180),
    admin_id: str = Depends(require_super_admin),
    db=Depends(get_database),
):
    since = _now() - timedelta(days=days)
    signups = await db["site_events"].find({"type": "signup", "created_at": {"$gte": since}}, {"vid": 1, "created_at": 1}).to_list(None)
    signed = {}
    for s in signups:
        signed.setdefault(s["vid"], s["created_at"])
    views = await db["site_events"].find(
        {"type": "view", "created_at": {"$gte": since}, "path": {"$regex": "^/drop/"}}, {"vid": 1, "path": 1, "created_at": 1},
    ).sort("created_at", 1).to_list(None)

    viewers = defaultdict(set)
    last_touch = defaultdict(int)
    assisted = defaultdict(int)
    seen_before = defaultdict(list)      # vid -> drop paths viewed before their signup
    for v in views:
        viewers[v["path"]].add(v["vid"])
        t = signed.get(v["vid"])
        if t and v["created_at"] <= t:
            seen_before[v["vid"]].append(v["path"])
    for vid, paths in seen_before.items():
        last_touch[paths[-1]] += 1
        for p in set(paths):
            assisted[p] += 1

    paths = sorted(viewers, key=lambda p: (-last_touch[p], -assisted[p], -len(viewers[p])))[:25]
    ids = [ObjectId(m.group(1)) for p in paths if (m := DROP_PATH.match(p))]
    drops = {str(d["_id"]): d async for d in db["drops"].find({"_id": {"$in": ids}}, {"confession": 1, "kind": 1, "mood_tag": 1, "media_type": 1})}
    rows = []
    for p in paths:
        m = DROP_PATH.match(p)
        d = drops.get(m.group(1)) if m else None
        text = (d or {}).get("confession") or ""
        n = len(viewers[p])
        rows.append({
            "path": p, "id": m.group(1) if m else None,
            "teaser": (text[:110] + "…") if len(text) > 110 else (text or "(deleted or media-only)"),
            "kind": (d or {}).get("kind") or "confession", "media": (d or {}).get("media_type"),
            "viewers": n, "signups": last_touch[p], "assisted": assisted[p],
            "rate": round(100 * last_touch[p] / n, 1) if n else 0,
        })
    return {"days": days, "signups_total": len(signed), "signups_after_a_drop": len(seen_before), "drops": rows}


# ─── Growth: best time to post ───────────────────────────────────────────────

@router.get("/admin/insights/best-times", summary="When visitors are on the site (weekday x hour)")
async def best_times(
    days: int = Query(28, ge=7, le=90),
    tz: int = Query(0, ge=-720, le=840, description="Viewer's offset from UTC in minutes, e.g. 180 for UTC+3"),
    admin_id: str = Depends(require_scope("content")),
    db=Depends(get_database),
):
    since = _now() - timedelta(days=days)
    grid = [[set() for _ in range(24)] for _ in range(7)]
    async for e in db["site_events"].find({"type": "view", "created_at": {"$gte": since}}, {"vid": 1, "created_at": 1}):
        local = _aware(e["created_at"]) + timedelta(minutes=tz)
        grid[local.weekday()][local.hour].add(e["vid"])
    counts = [[len(c) for c in row] for row in grid]
    slots = sorted(((counts[d][h], d, h) for d in range(7) for h in range(24)), reverse=True)
    top = [(d, h, n) for n, d, h in slots if n > 0][:5]

    # The next real date/time (UTC) for each top slot, for the Post Studio's schedule box.
    now_local = _now() + timedelta(minutes=tz)
    suggestions = []
    for d, h, n in top:
        ahead = (d - now_local.weekday()) % 7
        when = (now_local + timedelta(days=ahead)).replace(hour=h, minute=0, second=0, microsecond=0)
        if when <= now_local + timedelta(minutes=10):
            when += timedelta(days=7)
        suggestions.append({"weekday": d, "hour": h, "visitors": n, "at_utc": (when - timedelta(minutes=tz)).isoformat()})
    return {"days": days, "tz": tz, "grid": counts, "suggestions": suggestions,
            "enough_data": sum(map(sum, counts)) >= 30}


# ─── Money ───────────────────────────────────────────────────────────────────

@router.get("/admin/insights/money", summary="Payers, conversion, ARPPU, coin economy, refunds")
async def money(
    days: int = Query(30, ge=1, le=365),
    admin_id: str = Depends(require_scope("finance")),
    db=Depends(get_database),
):
    now = _now()
    since = now - timedelta(days=days)
    all_paid = await _completed_purchases(db)
    period = [p for p in all_paid if _aware(p.get("completed_at") or p.get("created_at")) and _aware(p.get("completed_at") or p.get("created_at")) >= since]
    first_buy = {}
    for p in all_paid:
        t = _aware(p.get("completed_at") or p.get("created_at"))
        if t and (p["user_id"] not in first_buy or t < first_buy[p["user_id"]]):
            first_buy[p["user_id"]] = t
    payers_all = set(first_buy)
    payers_period = {p["user_id"] for p in period}
    new_payers = [u for u, t in first_buy.items() if t >= since]
    total_users = await db["users"].count_documents({})
    new_users = await db["users"].count_documents({"created_at": {"$gte": since}})
    m = _money(period)

    issued = spent = 0
    async for row in db["coin_transactions"].aggregate([
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": {"$gt": ["$amount", 0]}, "sum": {"$sum": "$amount"}}},
    ]):
        if row["_id"]:
            issued = row["sum"]
        else:
            spent = -row["sum"]
    circulating = 0
    async for row in db["users"].aggregate([{"$group": {"_id": None, "s": {"$sum": {"$ifNull": ["$coin_balance", 0]}}}}]):
        circulating = row["s"]

    refunds = {r["_id"] or "unknown": r["n"] async for r in db["refund_requests"].aggregate([
        {"$match": {"created_at": {"$gte": since}}}, {"$group": {"_id": "$status", "n": {"$sum": 1}}},
    ])}
    accepted = refunds.get("accepted", 0) + refunds.get("approved", 0)

    labels, usd_series, kes_series = [], [], []
    by_day_usd, by_day_kes = defaultdict(float), defaultdict(int)
    for p in period:
        day = _aware(p.get("completed_at") or p.get("created_at")).strftime("%Y-%m-%d")
        if (p.get("currency") or "usd") == "usd":
            by_day_usd[day] += (p.get("amount_cents") or 0) / 100
        by_day_kes[day] += p.get("kes") or 0
    for i in range(min(days, 90)):
        day = (now - timedelta(days=min(days, 90) - 1 - i)).strftime("%Y-%m-%d")
        labels.append(day[5:])
        usd_series.append(round(by_day_usd.get(day, 0), 2))
        kes_series.append(by_day_kes.get(day, 0))

    by_provider = defaultdict(int)
    for p in period:
        by_provider[p.get("provider") or ("mpesa" if p.get("kes") else "unknown")] += 1

    return {
        "days": days,
        "revenue": m,
        "payers_period": len(payers_period),
        "payers_all_time": len(payers_all),
        "new_payers": len(new_payers),
        "conversion_all_pct": round(100 * len(payers_all) / total_users, 1) if total_users else 0,
        "new_user_conversion_pct": round(100 * len([u for u in new_payers]) / new_users, 1) if new_users else 0,
        "arppu_usd": round(m["usd"] / len(payers_period), 2) if payers_period else 0,
        "arppu_kes": round(m["kes"] / len(payers_period)) if payers_period else 0,
        "coins": {"issued": int(issued), "spent": int(spent), "circulating": int(circulating)},
        "refunds": {"by_status": refunds, "accepted": accepted,
                    "rate_pct": round(100 * accepted / m["count"], 1) if m["count"] else 0},
        "by_provider": dict(by_provider),
        "series": {"labels": labels, "usd": usd_series, "kes": kes_series},
    }


# ─── System health ───────────────────────────────────────────────────────────

def _set(v: str) -> bool:
    return bool(v) and not v.startswith("your-")


@router.get("/admin/health", summary="Workers, queues, payments and switches at a glance")
async def health(
    admin_id: str = Depends(require_scope("system")),
    db=Depends(get_database),
):
    import time as _t
    from app.tasks import scheduled_publisher, admin_monitor
    from app.utils import geoip, stream
    now = _now()
    t0 = _t.perf_counter()
    await db.command("ping")
    ping_ms = round((_t.perf_counter() - t0) * 1000)

    queue = {r["_id"] or "unknown": r["n"] async for r in db["publisher_queue"].aggregate([{"$group": {"_id": "$status", "n": {"$sum": 1}}}])}
    failed_posts = [
        {"id": str(q["_id"]), "platform": q.get("platform"), "error": (q.get("error") or q.get("last_error") or "")[:200], "at": _iso(q.get("updated_at") or q.get("submitted_at"))}
        async for q in db["publisher_queue"].find({"status": "failed"}).sort([("_id", -1)]).limit(5)
    ]
    sched_failed = await db["scheduled_drops"].count_documents({"status": "failed", "created_at": {"$gte": now - timedelta(days=7)}})
    sched_overdue = await db["scheduled_drops"].count_documents({"status": "pending", "publish_at": {"$lt": now - timedelta(minutes=10)}})
    stuck = await db["coin_purchases"].count_documents({"status": "pending", "created_at": {"$lt": now - timedelta(minutes=30), "$gte": now - timedelta(days=2)}})
    failed_pay = await db["coin_purchases"].count_documents({"status": {"$in": ["failed", "cancelled"]}, "created_at": {"$gte": now - timedelta(hours=24)}})
    events_hour = await db["site_events"].count_documents({"created_at": {"$gte": now - timedelta(hours=1)}})

    def alive(mod) -> Optional[bool]:
        task = getattr(mod, "_task", None)
        return None if task is None else not task.done()

    checks = [
        {"name": "Database", "ok": ping_ms < 1500, "detail": f"{ping_ms} ms"},
        {"name": "Scheduled-drop publisher", "ok": alive(scheduled_publisher) is not False, "detail": "running" if alive(scheduled_publisher) else "not started"},
        {"name": "Admin monitor (alerts, digest)", "ok": alive(admin_monitor) is not False, "detail": "running" if alive(admin_monitor) else "not started"},
        {"name": "Scheduled drops", "ok": sched_failed == 0 and sched_overdue == 0, "detail": f"{sched_failed} failed this week, {sched_overdue} overdue"},
        {"name": "Social auto-posting", "ok": queue.get("failed", 0) < 5, "detail": ", ".join(f"{k}: {v}" for k, v in sorted(queue.items())) or "nothing queued"},
        {"name": "Payments", "ok": stuck < 3 and failed_pay < 5, "detail": f"{stuck} stuck pending, {failed_pay} failed in 24h"},
        {"name": "Visitor tracking", "ok": True, "detail": f"{events_hour} events in the last hour"},
        {"name": "IP country lookup", "ok": geoip._reader is not None, "detail": "database loaded" if geoip._reader is not None else "using fallback"},
    ]
    switches = {
        "AI writer & risk screening (ANTHROPIC_API_KEY)": _set(settings.ANTHROPIC_API_KEY),
        "Email (RESEND_API_KEY)": _set(settings.RESEND_API_KEY),
        "Web push (VAPID keys)": _set(settings.VAPID_PRIVATE_KEY),
        "Agent hub (GITHUB_TOKEN)": _set(settings.GITHUB_TOKEN),
        "Video uploads (Cloudflare Stream)": stream.is_configured(),
        "TikTok auto-post": _set(getattr(settings, "TIKTOK_ACCESS_TOKEN", "")),
        "Facebook auto-post": _set(getattr(settings, "FACEBOOK_PAGE_ACCESS_TOKEN", "")),
        "Stripe": _set(getattr(settings, "STRIPE_SECRET_KEY", "")),
        "Super admins set (SUPER_ADMIN_EMAILS)": bool(settings.SUPER_ADMIN_EMAILS.strip()),
    }
    return {"checked_at": now.isoformat(), "ok": all(c["ok"] for c in checks), "checks": checks,
            "failed_posts": failed_posts, "switches": switches}


# ─── Alerts ──────────────────────────────────────────────────────────────────

@router.get("/admin/alerts", summary="Problems and spikes the monitor found")
async def list_alerts(
    include_dismissed: bool = False,
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    q = {} if include_dismissed else {"dismissed_at": None}
    rows = await db["admin_alerts"].find(q).sort("created_at", -1).limit(50).to_list(None)
    return {"alerts": [{
        "id": str(a["_id"]), "type": a.get("type"), "level": a.get("level"), "title": a.get("title"),
        "body": a.get("body"), "link": a.get("link"), "created_at": _iso(a.get("created_at")),
        "dismissed": bool(a.get("dismissed_at")),
    } for a in rows], "open": await db["admin_alerts"].count_documents({"dismissed_at": None})}


@router.post("/admin/alerts/{alert_id}/dismiss", summary="Mark an alert handled")
async def dismiss_alert(alert_id: str, admin_id: str = Depends(require_admin), db=Depends(get_database)):
    await db["admin_alerts"].update_one({"_id": _oid(alert_id)}, {"$set": {"dismissed_at": _now(), "dismissed_by": admin_id}})
    return {"ok": True}


# ─── Audit log ───────────────────────────────────────────────────────────────

@router.get("/admin/audit", summary="Who did what (super admin)")
async def audit_log(
    action: Optional[str] = Query(None, max_length=40),
    actor: Optional[str] = Query(None, max_length=40, description="admin user id"),
    target: Optional[str] = Query(None, max_length=40),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    admin_id: str = Depends(require_super_admin),
    db=Depends(get_database),
):
    q: dict = {}
    if action:
        q["action"] = {"$regex": f"^{re.escape(action)}"}
    if actor:
        q["admin_id"] = actor
    if target:
        q["target_id"] = target
    total = await db["admin_audit"].count_documents(q)
    rows = await db["admin_audit"].find(q).sort("created_at", -1).skip(skip).limit(limit).to_list(None)
    admins = {str(u["_id"]): u.get("anonymous_name") or u.get("email") async for u in db["users"].find(
        {"_id": {"$in": [ObjectId(r["admin_id"]) for r in rows if ObjectId.is_valid(r.get("admin_id", ""))]}},
        {"anonymous_name": 1, "email": 1},
    )}
    return {"total": total, "skip": skip, "limit": limit, "entries": [{
        "id": str(r["_id"]), "admin_id": r.get("admin_id"), "admin": admins.get(r.get("admin_id"), r.get("admin_id")),
        "action": r.get("action"), "target_type": r.get("target_type"), "target_id": r.get("target_id"),
        "details": r.get("details") or {}, "created_at": _iso(r.get("created_at")),
    } for r in rows]}


# ─── One user, everything ────────────────────────────────────────────────────

@router.get("/admin/users/{user_id}/full", summary="Everything about one user, for moderation and refunds")
async def user_full(user_id: str, admin_id: str = Depends(require_admin), db=Depends(get_database)):
    oid = _oid(user_id)
    u = await db["users"].find_one({"_id": oid}, {"password": 0})
    if not u:
        raise HTTPException(404, "User not found")
    drops = await db["drops"].find({"sender_id": user_id}, {"confession": 1, "kind": 1, "media_type": 1, "created_at": 1, "likes_count": 1, "views_count": 1, "report_count": 1, "moderation_status": 1, "is_active": 1}).sort("created_at", -1).limit(20).to_list(None)
    drop_ids = [str(d["_id"]) for d in await db["drops"].find({"sender_id": user_id}, {"_id": 1}).to_list(None)]
    reports = await db["drop_reports"].find({"drop_id": {"$in": drop_ids}}).sort("created_at", -1).limit(20).to_list(None) if drop_ids else []
    deception = await db["deception_reports"].find({"$or": [{"poster_id": user_id}, {"reported_user_id": user_id}]}).sort("created_at", -1).limit(10).to_list(None)
    purchases = await db["coin_purchases"].find({"user_id": user_id}).sort("created_at", -1).limit(20).to_list(None)
    txns = await db["coin_transactions"].find({"user_id": user_id}).sort("created_at", -1).limit(20).to_list(None)
    refunds = await db["refund_requests"].find({"user_id": user_id}).sort("created_at", -1).limit(10).to_list(None)
    knocks_sent = await db["drop_unlock_requests"].count_documents({"requester_id": user_id})
    knocks_got = await db["drop_unlock_requests"].count_documents({"owner_id": user_id})
    reports_made = await db["drop_reports"].count_documents({"reporter_id": user_id})
    days_active = await db["user_activity_days"].count_documents({"user_id": user_id, "day": {"$gte": (_now() - timedelta(days=30)).strftime("%Y-%m-%d")}})

    # Other accounts made from the same device or network (signup fingerprints).
    fps = await db["signup_fingerprints"].find({"user_id": user_id}).to_list(None)
    linked = []
    if fps:
        ors = [{"device_hash": f["device_hash"]} for f in fps if f.get("device_hash")] + [{"ip_hash": f["ip_hash"]} for f in fps if f.get("ip_hash")]
        if ors:
            others = await db["signup_fingerprints"].find({"$or": ors, "user_id": {"$ne": user_id}}).to_list(50)
            dev = {f.get("device_hash") for f in fps if f.get("device_hash")}
            names = {str(x["_id"]): x async for x in db["users"].find(
                {"_id": {"$in": [ObjectId(o["user_id"]) for o in others if ObjectId.is_valid(o.get("user_id", ""))]}},
                {"anonymous_name": 1, "is_active": 1, "created_at": 1},
            )}
            seen = set()
            for o in others:
                if o["user_id"] in seen:
                    continue
                seen.add(o["user_id"])
                x = names.get(o["user_id"], {})
                linked.append({"user_id": o["user_id"], "name": x.get("anonymous_name"), "banned": x.get("is_active") is False,
                               "same": "device" if o.get("device_hash") in dev else "network", "created_at": _iso(x.get("created_at"))})
    history = await db["admin_audit"].find({"target_id": user_id}).sort("created_at", -1).limit(20).to_list(None)

    s = lambda v: str(v) if isinstance(v, ObjectId) else v
    return {
        "user": {
            "id": user_id, "email": u.get("email"), "name": u.get("anonymous_name"), "username": u.get("username"),
            "avatar_url": u.get("avatar_url"), "created_at": _iso(u.get("created_at")), "last_login": _iso(u.get("last_login")),
            "is_active": u.get("is_active", True), "is_admin": bool(u.get("is_admin")), "admin_role": u.get("admin_role") or ("admin" if u.get("is_admin") else None),
            "is_super_admin": is_super_admin_user(u), "is_premium": bool(u.get("is_premium")), "is_verified": bool(u.get("is_verified")),
            "coin_balance": u.get("coin_balance", 0), "gender": u.get("gender"), "tz": u.get("tz"), "age_attested": u.get("age_attested"),
            "signup_source": u.get("signup_source") or {}, "referred_by": u.get("referred_by"),
            "strikes": u.get("deception_strikes") or u.get("strikes") or 0, "notes": u.get("admin_notes") or "",
        },
        "counts": {"drops": len(drop_ids), "knocks_sent": knocks_sent, "knocks_received": knocks_got,
                   "reports_against": len(reports), "reports_made": reports_made, "days_active_30d": days_active},
        "drops": [{"id": str(d["_id"]), "text": (d.get("confession") or "")[:160], "kind": d.get("kind"), "media_type": d.get("media_type"),
                   "likes": d.get("likes_count", 0), "views": d.get("views_count", 0), "reports": d.get("report_count", 0),
                   "status": d.get("moderation_status") or ("removed" if d.get("is_active") is False else "visible"), "created_at": _iso(d.get("created_at"))} for d in drops],
        "reports": [{"drop_id": r.get("drop_id"), "reason": r.get("reason"), "note": r.get("note"), "created_at": _iso(r.get("created_at"))} for r in reports],
        "deception": [{"id": str(r["_id"]), "status": r.get("status"), "reason": r.get("reason"), "created_at": _iso(r.get("created_at"))} for r in deception],
        "purchases": [{"id": str(p["_id"]), "status": p.get("status"), "provider": p.get("provider") or ("mpesa" if p.get("kes") else None),
                       "coins": p.get("coins"), "usd": (p.get("amount_cents") or 0) / 100 if p.get("amount_cents") else None, "kes": p.get("kes"),
                       "created_at": _iso(p.get("created_at"))} for p in purchases],
        "transactions": [{"amount": t.get("amount"), "reason": t.get("reason") or t.get("transaction_type"), "description": t.get("description"),
                          "created_at": _iso(t.get("created_at"))} for t in txns],
        "refunds": [{"id": str(r["_id"]), "status": r.get("status"), "reason": r.get("reason"), "created_at": _iso(r.get("created_at"))} for r in refunds],
        "linked_accounts": linked,
        "history": [{"action": h.get("action"), "admin_id": h.get("admin_id"), "details": {k: s(v) for k, v in (h.get("details") or {}).items()},
                     "created_at": _iso(h.get("created_at"))} for h in history],
    }


# What one user consumes, not what they post: the drops they open, react to,
# like, save and vote on, weighted by how much each says about taste.
TASTE_WEIGHTS = {"view": 1, "vote": 1, "react": 2, "save": 2, "like": 3}


@router.get("/admin/users/{user_id}/taste", summary="What one user loves to see: kinds, moods, top drops (super admin)")
async def user_taste(
    user_id: str,
    days: int = Query(90, ge=7, le=365),
    admin_id: str = Depends(require_super_admin),
    db=Depends(get_database),
):
    _oid(user_id)
    since = _now() - timedelta(days=days)
    acts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    reactions: dict[str, int] = defaultdict(int)

    async for v in db["drop_views"].find({"user_id": user_id, "viewed_at": {"$gte": since}}, {"drop_id": 1}).sort("viewed_at", -1).limit(1000):
        acts[v["drop_id"]]["view"] += 1
    async for r in db["drop_reactions"].find({"reactor_id": user_id, "updated_at": {"$gte": since}}, {"drop_id": 1, "reaction": 1}).limit(500):
        acts[r["drop_id"]]["react"] += 1
        if r.get("reaction"):
            reactions[r["reaction"]] += 1
    async for s in db["saved_drops"].find({"user_id": user_id, "created_at": {"$gte": since}}, {"drop_id": 1}).limit(500):
        acts[s["drop_id"]]["save"] += 1
    async for p in db["drop_poll_votes"].find({"user_id": user_id, "created_at": {"$gte": since}}, {"drop_id": 1}).limit(500):
        acts[p["drop_id"]]["vote"] += 1
    async for d in db["drops"].find({"liked_by": user_id, "created_at": {"$gte": since}}, {"_id": 1}).limit(500):
        acts[str(d["_id"])]["like"] += 1

    ids = [ObjectId(i) for i in acts if ObjectId.is_valid(i)]
    drops = {}
    if ids:
        async for d in db["drops"].find({"_id": {"$in": ids}}, {"confession": 1, "content": 1, "kind": 1, "mood_tag": 1, "category": 1, "media_type": 1, "sender_id": 1}):
            drops[str(d["_id"])] = d

    kinds, moods, media = defaultdict(int), defaultdict(int), defaultdict(int)
    scored = []
    for did, a in acts.items():
        d = drops.get(did)
        if not d or d.get("sender_id") == user_id:
            continue
        score = sum(TASTE_WEIGHTS[k] * n for k, n in a.items())
        kinds[d.get("kind") or "confession"] += score
        mood = d.get("mood_tag") or d.get("category")
        if mood:
            moods[mood] += score
        media[d.get("media_type") or "text"] += score
        scored.append((score, did, d, a))
    scored.sort(key=lambda x: -x[0])

    aff = await db["user_affinities"].find_one({"user_id": user_id}) or {}
    rows = lambda m: sorted([{"key": k, "count": v} for k, v in m.items()], key=lambda x: -x["count"])
    totals = defaultdict(int)
    for _, _, _, a in scored:
        for k, n in a.items():
            totals[k] += n
    return {
        "days": days,
        "totals": {k: totals.get(k, 0) for k in TASTE_WEIGHTS},
        "kinds": rows(kinds),
        "moods": rows(moods)[:8],
        "media": rows(media),
        "reactions": rows(reactions),
        "all_time_moods": rows(aff.get("affinities") or {}),
        "top_drops": [{
            "id": did, "score": score, "kind": d.get("kind") or "confession",
            "mood": d.get("mood_tag") or d.get("category"),
            "teaser": ((d.get("confession") or d.get("content") or "")[:110]) or f"[{d.get('media_type') or 'media'}]",
            "did": sorted(a.keys(), key=lambda k: -TASTE_WEIGHTS[k]),
        } for score, did, d, a in scored[:10]],
    }


class NotesBody(BaseModel):
    notes: str


@router.patch("/admin/users/{user_id}/notes", summary="Private admin notes on a user")
async def set_notes(user_id: str, body: NotesBody, admin_id: str = Depends(require_admin), db=Depends(get_database)):
    notes = body.notes.strip()[:2000]
    res = await db["users"].update_one({"_id": _oid(user_id)}, {"$set": {"admin_notes": notes}})
    if not res.matched_count:
        raise HTTPException(404, "User not found")
    await audit(db, admin_id, "user.notes", "user", user_id, {"length": len(notes)})
    return {"notes": notes}


class RoleBody(BaseModel):
    role: str


@router.patch("/admin/users/{user_id}/role", summary="Set an admin's role (super admin)")
async def set_role(user_id: str, body: RoleBody, admin_id: str = Depends(require_super_admin), db=Depends(get_database)):
    if body.role not in ADMIN_ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(ADMIN_ROLES)}")
    u = await db["users"].find_one({"_id": _oid(user_id)}, {"is_admin": 1, "email": 1})
    if not u or not u.get("is_admin"):
        raise HTTPException(400, "Make them an admin first")
    if is_super_admin_user(u):
        raise HTTPException(403, "Super admins always have full access")
    await db["users"].update_one({"_id": u["_id"]}, {"$set": {"admin_role": body.role}})
    await audit(db, admin_id, "user.role", "user", user_id, {"role": body.role})
    return {"role": body.role, "scopes": sorted(ADMIN_ROLES[body.role])}


# ─── A/B experiments ─────────────────────────────────────────────────────────

KEY_RE = re.compile(r"^[a-z0-9_]{3,40}$")


class Variant(BaseModel):
    id: str
    value: str


class ExperimentBody(BaseModel):
    key: str
    name: str
    description: str = ""
    variants: list[Variant]
    active: bool = True


@router.get("/experiments/active", summary="Running A/B tests (public; the web picks a variant per visitor)")
async def active_experiments(db=Depends(get_database)):
    rows = await db["experiments"].find({"active": True}, {"variants": 1}).to_list(None)
    return {"experiments": [{"key": r["_id"], "variants": [{"id": v["id"], "value": v["value"]} for v in r.get("variants", [])]} for r in rows]}


@router.get("/admin/experiments", summary="A/B tests and their results")
async def list_experiments(admin_id: str = Depends(require_scope("growth")), db=Depends(get_database)):
    rows = await db["experiments"].find({}).sort("created_at", -1).to_list(None)
    out = []
    for r in rows:
        out.append({"key": r["_id"], "name": r.get("name"), "description": r.get("description"), "active": r.get("active", False),
                    "variants": r.get("variants", []), "created_at": _iso(r.get("created_at")),
                    "results": await _experiment_results(db, r["_id"], r.get("variants", []))})
    return {"experiments": out}


async def _experiment_results(db, key: str, variants: list) -> list:
    exposed = defaultdict(dict)    # variant -> vid -> first exposure time
    async for e in db["site_events"].find({"type": "exp", "exp": key}, {"vid": 1, "variant": 1, "created_at": 1}).sort("created_at", 1):
        exposed[e.get("variant")].setdefault(e["vid"], e["created_at"])
    vids = {vid for m in exposed.values() for vid in m}
    signed = {}
    if vids:
        async for s in db["site_events"].find({"type": "signup", "vid": {"$in": list(vids)}}, {"vid": 1, "created_at": 1}):
            signed.setdefault(s["vid"], s["created_at"])
    res = []
    for v in variants:
        m = exposed.get(v["id"], {})
        conv = sum(1 for vid, t in m.items() if vid in signed and signed[vid] >= t)
        res.append({"variant": v["id"], "visitors": len(m), "signups": conv,
                    "rate": round(100 * conv / len(m), 1) if m else 0})
    return res


@router.post("/admin/experiments", summary="Create or replace an A/B test")
async def save_experiment(body: ExperimentBody, admin_id: str = Depends(require_scope("growth")), db=Depends(get_database)):
    if not KEY_RE.match(body.key):
        raise HTTPException(400, "Key: 3–40 lowercase letters, numbers or underscores")
    vs = [Variant(id=v.id.strip()[:20], value=v.value.strip()[:300]) for v in body.variants if v.id.strip() and v.value.strip()]
    if not 2 <= len(vs) <= 4 or len({v.id for v in vs}) != len(vs):
        raise HTTPException(400, "Give 2 to 4 variants with different ids")
    await db["experiments"].update_one(
        {"_id": body.key},
        {"$set": {"name": body.name.strip()[:80], "description": body.description.strip()[:300],
                  "variants": [v.model_dump() for v in vs], "active": body.active, "updated_at": _now()},
         "$setOnInsert": {"created_at": _now()}},
        upsert=True,
    )
    await audit(db, admin_id, "experiment.save", "experiment", body.key, {"active": body.active, "variants": len(vs)})
    return {"ok": True}


@router.patch("/admin/experiments/{key}", summary="Start or stop an A/B test")
async def toggle_experiment(key: str, active: bool = Query(...), admin_id: str = Depends(require_scope("growth")), db=Depends(get_database)):
    res = await db["experiments"].update_one({"_id": key}, {"$set": {"active": active, "updated_at": _now()}})
    if not res.matched_count:
        raise HTTPException(404, "No such experiment")
    await audit(db, admin_id, "experiment.toggle", "experiment", key, {"active": active})
    return {"ok": True}


# ─── Who am I (role + scopes) ────────────────────────────────────────────────

@router.get("/admin/me/scopes", summary="The caller's admin role and what it covers")
async def my_scopes(admin_id: str = Depends(require_admin), db=Depends(get_database)):
    u = await db["users"].find_one({"_id": ObjectId(admin_id)}, {"email": 1, "is_admin": 1, "admin_role": 1})
    sup = is_super_admin_user(u or {})
    return {"role": "super_admin" if sup else (u or {}).get("admin_role") or "admin",
            "scopes": sorted(admin_scopes(u or {})), "roles": {k: sorted(v) for k, v in ADMIN_ROLES.items()}}
