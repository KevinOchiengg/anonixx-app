"""
backfill_hookup_places.py

Hookup posts made with the guided form carried only a free-text area, so Near
(api/v1/discover.py) couldn't place them. New posts get a structured place in
create_drop (drops.hookup_place); this gives existing ones the same: from their
area text, else the poster's profile area, else nothing (they stay findable
under "Anywhere").

Usage:
    python scripts/backfill_hookup_places.py           # dry run: counts only
    python scripts/backfill_hookup_places.py --apply   # writes location_detail + location

Safe to re-run: only touches hookup posts with no location_detail.
"""
import asyncio
import sys

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

from app.api.v1.drops import hookup_place
from app.config import settings


async def main(apply: bool):
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    todo = await db["drops"].find(
        {"kind": "hookup", "$or": [{"location_detail": None}, {"location_detail": {"$exists": False}}]},
        {"hookup": 1, "sender_id": 1},
    ).to_list(None)

    oids = [ObjectId(s) for s in {d.get("sender_id") for d in todo} if s and ObjectId.is_valid(s)]
    users = {str(u["_id"]): u async for u in db["users"].find(
        {"_id": {"$in": oids}}, {"location_country": 1, "location_county": 1, "location_sub_county": 1, "detected_country": 1})}

    placed, by_county = [], {}
    for d in todo:
        place = hookup_place(d.get("hookup"), users.get(d.get("sender_id")))
        if place:
            placed.append((d["_id"], place))
            key = place.get("county") or place.get("country")
            by_county[key] = by_county.get(key, 0) + 1

    print(f"{len(todo)} hookup post(s) without a place; {len(placed)} can be placed.")
    for k, n in sorted(by_county.items(), key=lambda kv: -kv[1])[:20]:
        print(f"  {k}: {n}")
    if not apply:
        print("\nDry run. Re-run with --apply to write.")
        return
    for oid, place in placed:
        display = ", ".join(v for v in (place.get("sub_county"), place.get("county"), place.get("country")) if v)
        await db["drops"].update_one({"_id": oid}, {"$set": {"location_detail": place, "location": display}})
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
