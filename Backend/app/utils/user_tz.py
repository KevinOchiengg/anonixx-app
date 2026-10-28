"""Each user's device time zone (IANA name, e.g. "Europe/Paris"), so admins see their local time."""
import re

from bson import ObjectId

_TZ = re.compile(r"^[A-Za-z]+(?:/[A-Za-z0-9_+\-]+){0,2}$")


def valid_tz(tz) -> str | None:
    return tz if isinstance(tz, str) and len(tz) <= 64 and _TZ.match(tz) else None


async def save_tz(db, user_id: str, tz) -> None:
    if not valid_tz(tz) or not ObjectId.is_valid(user_id):
        return
    await db["users"].update_one({"_id": ObjectId(user_id), "tz": {"$ne": tz}}, {"$set": {"tz": tz}})
