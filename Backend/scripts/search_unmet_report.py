"""Weekly list of searches people made and found nothing for, written to reports/search/ for
the content-scout agent. Run from Backend/: venv/Scripts/python.exe scripts/search_unmet_report.py"""
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from app.api.v1.search import unmet_searches  # noqa: E402
from app.config import settings  # noqa: E402


async def main() -> None:
    db = AsyncIOMotorClient(settings.MONGODB_URL)[settings.DATABASE_NAME]
    rows = await unmet_searches(db, days=7, limit=20)
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out_dir = os.path.join(os.path.dirname(__file__), "..", "..", "reports", "search")
    os.makedirs(out_dir, exist_ok=True)
    lines = [f"# Searches with nothing to find, week to {day}", "",
             "Draft original drops for these. Never write anything for a search that involves minors or non-consent.", ""]
    lines += [f"- **{r['q']}**: {r['people']} people, {r['searches']} searches"
              f"{' (no results)' if r['no_results'] else ' (results, no taps)'}" for r in rows] or ["- Nothing unmet this week."]
    path = os.path.join(out_dir, f"{day}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(path)


if __name__ == "__main__":
    asyncio.run(main())
