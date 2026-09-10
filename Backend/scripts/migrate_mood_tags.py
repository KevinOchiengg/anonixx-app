"""
migrate_mood_tags.py

One-off migration for the 2026-09-10 mood tag rename:
    unsent   -> untold      (Skeleton In The Closet)
    reckless -> horny       (Just Tonight)
    quiet    -> discreet    (The Exchange)
    longing  -> longing     (Meet Me — unchanged)

Updates the `mood_tag` field on every drop in the `drops` collection that
still carries an old word, so /search?mood_tag= and the affinity tracker
in app/api/v1/drops.py (get_behavioral_interests / VALID_MOOD_TAGS) keep
matching existing drops correctly.

Usage:
    python scripts/migrate_mood_tags.py           # dry run — counts only
    python scripts/migrate_mood_tags.py --apply    # actually writes

Safe to re-run — matches only the old words, so a second run finds nothing
left to update.
"""
import asyncio
import sys

from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings

TAG_MAP = {
    "unsent":   "untold",
    "reckless": "horny",
    "quiet":    "discreet",
}


async def main(apply: bool):
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    drops = db["drops"]

    print(f"Database: {settings.DATABASE_NAME}")
    print(f"Mode: {'APPLY' if apply else 'DRY RUN (pass --apply to write)'}\n")

    total = 0
    for old_tag, new_tag in TAG_MAP.items():
        count = await drops.count_documents({"mood_tag": old_tag})
        total += count
        print(f"  {old_tag!r:12} -> {new_tag!r:12} {count} drop(s)")
        if apply and count:
            result = await drops.update_many(
                {"mood_tag": old_tag}, {"$set": {"mood_tag": new_tag}},
            )
            print(f"    updated {result.modified_count}")

    print(f"\nTotal matching old tags: {total}")
    if not apply and total:
        print("Dry run only — re-run with --apply to write these changes.")

    client.close()


if __name__ == "__main__":
    asyncio.run(main(apply="--apply" in sys.argv))
