"""
migrate_intent_ids.py

One-off migration for the 2026-09-10 confession-type rename:
    real-connection      -> meet-me
    general               -> skeleton-in-the-closet
    no-strings            -> just-tonight
    generous-arrangement  -> the-exchange

Updates the `intent` field on every drop in the `drops` collection that
still carries one of the old ids. Labels (CARD_INTENTS/INTENT_LABELS) were
already renamed in code — this just catches up existing rows so `/search`,
`here_for`, and the compose picker's default selection keep matching old
drops correctly.

Usage:
    python scripts/migrate_intent_ids.py           # dry run — counts only
    python scripts/migrate_intent_ids.py --apply    # actually writes

Safe to re-run — matches only the old ids, so a second run finds nothing
left to update.
"""
import asyncio
import sys

from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings

ID_MAP = {
    "real-connection":      "meet-me",
    "general":              "skeleton-in-the-closet",
    "no-strings":           "just-tonight",
    "generous-arrangement": "the-exchange",
}


async def main(apply: bool):
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    drops = db["drops"]

    print(f"Database: {settings.DATABASE_NAME}")
    print(f"Mode: {'APPLY' if apply else 'DRY RUN (pass --apply to write)'}\n")

    total = 0
    for old_id, new_id in ID_MAP.items():
        count = await drops.count_documents({"intent": old_id})
        total += count
        print(f"  {old_id!r:26} -> {new_id!r:26} {count} drop(s)")
        if apply and count:
            result = await drops.update_many(
                {"intent": old_id}, {"$set": {"intent": new_id}},
            )
            print(f"    updated {result.modified_count}")

    print(f"\nTotal matching old ids: {total}")
    if not apply and total:
        print("Dry run only — re-run with --apply to write these changes.")

    client.close()


if __name__ == "__main__":
    asyncio.run(main(apply="--apply" in sys.argv))
