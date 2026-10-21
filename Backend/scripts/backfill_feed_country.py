"""
backfill_feed_country.py

Tags drops posted before the local-first feed with `feed_country`, the
field app/utils/feed_mix.py matches on (new drops get it at creation):

  1. the location the author picked for the drop (location_detail.country), else
  2. for user confessions, the country on the author's profile, if set.

Official (admin) drops are only tagged from an explicit location — they're
meant for everyone otherwise. Drops that can't be placed stay untagged,
which the feed treats as global: they still show for everyone.

Usage:
    python scripts/backfill_feed_country.py           # dry run — counts only
    python scripts/backfill_feed_country.py --apply    # actually writes

Safe to re-run: only drops without feed_country are touched.
"""
import asyncio
import sys

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings
from app.utils.countries import known_country


async def main(apply: bool):
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    todo = await db["drops"].find(
        {"feed_country": {"$in": [None]}},
        {"location_detail": 1, "sender_id": 1, "is_admin_drop": 1},
    ).to_list(None)

    sender_ids = {d["sender_id"] for d in todo if d.get("sender_id") and not d.get("is_admin_drop")}
    homes = {}
    if sender_ids:
        oids = [ObjectId(s) for s in sender_ids if ObjectId.is_valid(s)]
        async for u in db["users"].find({"_id": {"$in": oids}}, {"location_country": 1}):
            homes[str(u["_id"])] = known_country(u.get("location_country"))

    by_country: dict = {}
    for d in todo:
        country = known_country((d.get("location_detail") or {}).get("country"))
        if not country and not d.get("is_admin_drop"):
            country = homes.get(d.get("sender_id"))
        if country:
            by_country.setdefault(country, []).append(d["_id"])

    tagged = sum(len(v) for v in by_country.values())
    print(f"{len(todo)} untagged drop(s); {tagged} can be placed, {len(todo) - tagged} stay global.")
    for country, ids in sorted(by_country.items(), key=lambda kv: -len(kv[1])):
        print(f"  {country}: {len(ids)}")
    if not apply:
        print("\nDry run. Re-run with --apply to write.")
        return
    for country, ids in by_country.items():
        await db["drops"].update_many({"_id": {"$in": ids}}, {"$set": {"feed_country": country}})
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
