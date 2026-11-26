"""Fills official media drops that have no caption with one from the caption bank.
Least-used captions go first, so nothing repeats until the whole bank has been used."""
import random

SETTING_ID = "auto_caption"
MAX_CAPTION = 500


def uncaptioned_query(mature: bool | None = None) -> dict:
    q: dict = {
        "is_admin_drop": True,
        "is_active": True,
        "media_url": {"$nin": [None, ""]},
        "$or": [{"confession": None}, {"confession": ""}, {"confession": {"$exists": False}}],
    }
    if mature is True:
        q["sensitivity"] = "mature"
    elif mature is False:
        q["sensitivity"] = {"$ne": "mature"}
    return q


async def is_on(db) -> bool:
    doc = await db["admin_settings"].find_one({"_id": SETTING_ID}, {"on": 1})
    return bool(doc and doc.get("on"))


async def set_on(db, on: bool) -> None:
    await db["admin_settings"].update_one({"_id": SETTING_ID}, {"$set": {"on": on}}, upsert=True)


async def pick(db, mature: bool) -> dict | None:
    least = await db["caption_bank"].find_one({"mature": mature}, {"uses": 1}, sort=[("uses", 1)])
    if not least:
        return None
    pool = await db["caption_bank"].find(
        {"mature": mature, "uses": least.get("uses", 0)}, {"text": 1},
    ).to_list(length=500)
    return random.choice(pool) if pool else None


def _topics(text: str, drop: dict):
    from app.utils.search_lexicon import detect_topics
    return detect_topics(text, drop.get("transcript")) or drop.get("topics") or None


async def fill(db, drop: dict) -> str | None:
    """Give one drop a caption. Returns the caption, or None if the bank has none."""
    caption = await pick(db, drop.get("sensitivity") == "mature")
    if not caption:
        return None
    text = caption["text"]
    done = await db["drops"].update_one(
        {"_id": drop["_id"], "$or": uncaptioned_query()["$or"]},
        {"$set": {"confession": text, "auto_caption": True, "topics": _topics(text, drop), "topics_auto": True}},
    )
    if not done.modified_count:
        return None
    await db["caption_bank"].update_one({"_id": caption["_id"]}, {"$inc": {"uses": 1}})
    await db["publisher_queue"].update_many(
        {"drop_id": str(drop["_id"]), "status": {"$in": ["queued", "failed"]}},
        {"$set": {"confession": text}},
    )
    return text


async def fill_batch(db, limit: int = 50) -> int:
    if not await is_on(db):
        return 0
    drops = await db["drops"].find(uncaptioned_query(), {"sensitivity": 1}).sort("_id", -1).limit(limit).to_list(length=limit)
    filled = 0
    for d in drops:
        if await fill(db, d):
            filled += 1
    return filled
