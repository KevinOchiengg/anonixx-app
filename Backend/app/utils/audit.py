"""
Admin audit log: who did what, to what, and when.

Every destructive or money-moving admin action calls `audit(...)`. Rows live in
`admin_audit` and are shown to the super admin on /admin/audit. Writing a row
never blocks or breaks the action itself.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger(__name__)


async def audit(db, admin_id: str, action: str, target_type: str, target_id: Optional[str] = None,
                details: Optional[dict] = None) -> None:
    try:
        await db["admin_audit"].insert_one({
            "admin_id":    admin_id,
            "action":      action,          # e.g. "user.ban", "drop.delete", "refund.accept"
            "target_type": target_type,     # "user" | "drop" | "refund" | "ad" | ...
            "target_id":   target_id,
            "details":     details or {},
            "created_at":  datetime.now(timezone.utc),
        })
    except Exception as e:   # the log must never cost the action
        log.warning("audit write failed (%s %s): %s", action, target_id, e)
