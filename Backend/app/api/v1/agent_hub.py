"""
Agent hub: the agent team's reports on the admin dashboard, and one-click
Approve / Reject for the content scout's drafts.

The reports live in the GitHub repo (reports/**), written by the scheduled
agents, so the hub reads and writes them through the GitHub contents API
(GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH in settings). The backend's own
deploy doesn't include reports/.

Approving a draft does what the posting manager does by hand: it schedules the
drop through the normal /admin/scheduled path (as "Anonixx", at its suggested
time, or 10 minutes from now if that's passed) and writes `status: scheduled`
and `scheduled_id:` back into the draft. Rejecting writes `status: rejected`.
A decision is recorded in `agent_decisions` first, so a draft is never
scheduled twice even if the GitHub write fails.
"""
import base64
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.config import settings
from app.database import get_database
from app.dependencies import require_scope
from app.utils.audit import audit

router = APIRouter(prefix="/admin/agents", tags=["Agent hub"])

API = "https://api.github.com"
PATH_RE = re.compile(r"^reports/[A-Za-z0-9_./-]+\.md$")
FIELD_RE = re.compile(r"^([a-z_]+):\s?(.*)$")
FOLDERS = {
    "weekly": "Chief of staff", "growth": "Growth hacker", "research": "Researcher", "content": "Content scout",
    "seo": "SEO manager", "revenue": "Revenue manager", "tiktok": "TikTok manager", "marketing": "Marketing manager",
    "product": "Product manager",
}


def _configured() -> bool:
    return bool(settings.GITHUB_TOKEN and settings.GITHUB_REPO)


def _headers() -> dict:
    return {"Authorization": f"Bearer {settings.GITHUB_TOKEN}", "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"}


async def _gh(method: str, url: str, **kw) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.request(method, f"{API}{url}", headers=_headers(), **kw)
    if r.status_code == 401:
        raise HTTPException(502, "GitHub refused the token. Check GITHUB_TOKEN on the server.")
    if r.status_code == 404:
        raise HTTPException(404, "Not found on GitHub (check GITHUB_REPO and that the token can read it).")
    if r.status_code >= 400:
        raise HTTPException(502, f"GitHub error {r.status_code}: {r.text[:200]}")
    return r.json()


async def _read(path: str) -> tuple[str, str]:
    data = await _gh("GET", f"/repos/{settings.GITHUB_REPO}/contents/{path}", params={"ref": settings.GITHUB_BRANCH})
    return base64.b64decode(data["content"]).decode("utf-8"), data["sha"]


def _check_path(path: str) -> str:
    if not PATH_RE.match(path) or ".." in path:
        raise HTTPException(400, "Only report files under reports/ can be opened here.")
    return path


def parse_drafts(text: str) -> list[dict]:
    """The content scout's queue format: '### title' then 'key: value' lines;
    poll_options continues on the following lines until the next key."""
    drafts, cur, key = [], None, None
    for line in text.splitlines():
        if line.startswith("### "):
            if cur:
                drafts.append(cur)
            cur, key = {"title": line[4:].strip(), "fields": {}}, None
            continue
        if cur is None:
            continue
        m = FIELD_RE.match(line.strip())
        if m and m.group(1) in ("status", "type", "suggested_time", "confession", "poll_options", "teaser", "why", "scheduled_id", "error"):
            key = m.group(1)
            cur["fields"][key] = m.group(2).strip()
        elif key == "poll_options" and line.strip() and not line.startswith("#"):
            cur["fields"]["poll_options"] = (cur["fields"]["poll_options"] + "\n" + line.strip().lstrip("-* ").strip()).strip()
        elif line.startswith("## "):
            key = None
    if cur:
        drafts.append(cur)
    out = []
    for i, d in enumerate(drafts):
        f = d["fields"]
        if "status" not in f:
            continue
        out.append({"index": i, "title": d["title"], "status": f.get("status", "").lower(), "type": f.get("type"),
                    "suggested_time": f.get("suggested_time"), "confession": f.get("confession", ""),
                    "poll_options": [o for o in f.get("poll_options", "").split("\n") if o.strip()],
                    "teaser": f.get("teaser"), "why": f.get("why"), "scheduled_id": f.get("scheduled_id"), "error": f.get("error")})
    return out


def set_status(text: str, title: str, status: str, extra: Optional[dict] = None) -> str:
    """Rewrite `status:` (and add lines like scheduled_id) inside the draft headed `### title`."""
    lines = text.splitlines()
    inside = False
    for i, line in enumerate(lines):
        if line.startswith("### "):
            inside = line[4:].strip() == title
            continue
        if inside and line.strip().startswith("status:"):
            indent = line[: len(line) - len(line.lstrip())]
            lines[i] = f"{indent}status: {status}"
            for j, (k, v) in enumerate((extra or {}).items()):
                lines.insert(i + 1 + j, f"{indent}{k}: {v}")
            return "\n".join(lines) + ("\n" if text.endswith("\n") else "")
    raise HTTPException(409, "That draft changed on GitHub. Refresh and try again.")


@router.get("", summary="The agents' latest reports and drafts waiting for a decision")
async def overview(admin_id: str = Depends(require_scope("content")), db=Depends(get_database)):
    if not _configured():
        return {"configured": False, "repo": settings.GITHUB_REPO, "agents": [], "drafts": []}
    tree = await _gh("GET", f"/repos/{settings.GITHUB_REPO}/git/trees/{settings.GITHUB_BRANCH}", params={"recursive": "1"})
    files = sorted((t["path"] for t in tree.get("tree", []) if t["type"] == "blob" and PATH_RE.match(t["path"])), reverse=True)
    agents = []
    for folder, who in FOLDERS.items():
        mine = [f for f in files if f.startswith(f"reports/{folder}/") and "/queue/" not in f]
        if mine:
            agents.append({"folder": folder, "agent": who, "latest": mine[0], "count": len(mine), "recent": mine[:6]})
    queue_files = [f for f in files if f.startswith("reports/content/queue/")][:4]
    drafts = []
    for path in queue_files:
        text, _ = await _read(path)
        for d in parse_drafts(text):
            drafts.append({**d, "path": path})
    pending = [d for d in drafts if d["status"] == "draft"]
    recent = [d for d in drafts if d["status"] != "draft"][:20]
    return {"configured": True, "repo": settings.GITHUB_REPO, "agents": agents, "drafts": pending, "decided": recent,
            "other": [f for f in files if f.count("/") == 1][:10]}


@router.get("/file", summary="One report's text")
async def read_file(path: str = Query(...), admin_id: str = Depends(require_scope("content"))):
    if not _configured():
        raise HTTPException(503, "Connect GitHub first (GITHUB_TOKEN).")
    text, _ = await _read(_check_path(path))
    return {"path": path, "text": text}


class Decision(BaseModel):
    path: str
    title: str
    decision: str            # approve | reject


def _publish_time(raw: Optional[str]) -> datetime:
    now = datetime.now(timezone.utc)
    when = None
    if raw:
        m = re.match(r"(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})", raw)
        if m:
            try:
                when = datetime.fromisoformat(f"{m.group(1)}T{m.group(2)}:{m.group(3)}:00+00:00")
            except ValueError:
                when = None
    if not when or when < now + timedelta(minutes=5):
        when = now + timedelta(minutes=10)
    return when


@router.post("/decide", summary="Approve (schedule) or reject one draft")
async def decide(body: Decision, admin_id: str = Depends(require_scope("content")), db=Depends(get_database)):
    from app.api.v1.admin import ScheduleRequest, schedule_drop
    if not _configured():
        raise HTTPException(503, "Connect GitHub first (GITHUB_TOKEN).")
    if body.decision not in ("approve", "reject"):
        raise HTTPException(400, "Decision must be approve or reject")
    path = _check_path(body.path)
    if not path.startswith("reports/content/queue/"):
        raise HTTPException(400, "Only content-queue drafts can be approved here.")
    text, sha = await _read(path)
    draft = next((d for d in parse_drafts(text) if d["title"] == body.title), None)
    if not draft:
        raise HTTPException(404, "Draft not found. It may have been renamed.")
    key = f"{path}#{body.title}"
    done = await db["agent_decisions"].find_one({"_id": key})
    if draft["status"] != "draft" and not done:
        raise HTTPException(409, f"Already {draft['status']}.")

    scheduled_id = (done or {}).get("scheduled_id")
    if body.decision == "approve" and not scheduled_id:
        if not draft["confession"].strip():
            raise HTTPException(400, "This draft has no text to post.")
        drop: dict = {"confession": draft["confession"].strip(), "kind": "confession"}
        if draft["type"] == "poll" and len(draft["poll_options"]) >= 2:
            drop["poll"] = {"question": draft["confession"].strip()[:200], "options": draft["poll_options"][:4]}
        res = await schedule_drop(ScheduleRequest(publish_at=_publish_time(draft["suggested_time"]), drop=drop), admin_id=admin_id, db=db)
        scheduled_id = res.get("id") if isinstance(res, dict) else None
    await db["agent_decisions"].update_one(
        {"_id": key},
        {"$set": {"decision": body.decision, "scheduled_id": scheduled_id, "admin_id": admin_id, "at": datetime.now(timezone.utc)}},
        upsert=True,
    )

    status = "scheduled" if body.decision == "approve" else "rejected"
    new_text = set_status(text, body.title, status, {"scheduled_id": scheduled_id} if scheduled_id else None)
    written = True
    try:
        await _gh("PUT", f"/repos/{settings.GITHUB_REPO}/contents/{path}", json={
            "message": f"chore(content): {status} \"{body.title}\" from the admin dashboard",
            "content": base64.b64encode(new_text.encode("utf-8")).decode(),
            "sha": sha, "branch": settings.GITHUB_BRANCH,
        })
    except HTTPException:
        written = False
    await audit(db, admin_id, f"draft.{body.decision}", "draft", key, {"scheduled_id": scheduled_id, "github_updated": written})
    return {"status": status, "scheduled_id": scheduled_id, "github_updated": written,
            "note": None if written else "Scheduled, but the draft file on GitHub couldn't be updated. It won't be scheduled twice."}
