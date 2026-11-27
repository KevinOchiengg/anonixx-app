"""Search upkeep, every few minutes: learn which drops people pick for each search, fold
recent comments into drops' search text, tag video/audio/photo drops (when configured),
build embeddings (when configured), and send saved-search alerts."""
import asyncio
import json
import logging
import re
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings
from app.utils import search_engine as se
from app.utils import search_lexicon as lex

log = logging.getLogger(__name__)

EVERY = 300
AFFINITY_EVERY = 1800
ALERT_GAP = timedelta(days=1)
TAP_WEIGHT = {"open": 1.0, "watch_done": 1.5, "like": 2.0}

_task: asyncio.Task | None = None
_last_affinity = 0.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def build_affinity(db) -> None:
    """search_affinity {q, drop_id, score, viewers}: one vote per person, worth more when they
    dug further down the results or liked what they found."""
    since = _now() - timedelta(days=90)
    await db["search_events"].aggregate([
        {"$match": {"type": "tap", "at": {"$gte": since}}},
        {"$addFields": {"w": {"$multiply": [
            {"$switch": {"branches": [{"case": {"$eq": ["$action", k]}, "then": v} for k, v in TAP_WEIGHT.items()],
                         "default": 1.0}},
            {"$add": [1, {"$multiply": [0.3, {"$ln": {"$add": [1, "$position"]}}]}]},
        ]}}},
        {"$group": {"_id": {"q": "$q", "d": "$drop_id", "v": "$viewer_key"}, "w": {"$max": "$w"}}},
        {"$group": {"_id": {"q": "$_id.q", "d": "$_id.d"}, "score": {"$sum": "$w"}, "viewers": {"$sum": 1}}},
        {"$project": {"_id": {"$concat": ["$_id.q", "|", "$_id.d"]}, "q": "$_id.q", "drop_id": "$_id.d",
                      "score": 1, "viewers": 1, "at": "$$NOW"}},
        {"$merge": {"into": "search_affinity", "on": "_id", "whenMatched": "replace", "whenNotMatched": "insert"}},
    ]).to_list(None)
    await db["search_affinity"].delete_many({"at": {"$lt": _now() - timedelta(days=1)}})


async def _fold_comments(db, did: str) -> None:
    from bson import ObjectId
    if not ObjectId.is_valid(did):
        return
    rows = await db["drop_threads"].find({"drop_id": did, "content": {"$type": "string"}}, {"content": 1}) \
        .sort("created_at", -1).limit(50).to_list(50)
    text = " ".join(r["content"] for r in rows)[:4000]
    await db["drops"].update_one({"_id": ObjectId(did)}, {"$set": {"comment_text": text}})


async def refresh_comment_text(db, backfill: int = 300) -> None:
    """Latest 50 comments' words on drops commented on since the last run, plus older
    commented drops that were never folded in."""
    since = _now() - timedelta(seconds=EVERY * 2)
    ids = await db["drop_threads"].distinct("drop_id", {"created_at": {"$gte": since}})
    old = await db["drops"].find(
        {"comment_text": {"$exists": False}, "thread_count": {"$gt": 0}}, {"_id": 1},
    ).limit(backfill).to_list(backfill)
    for did in dict.fromkeys(ids[:200] + [str(d["_id"]) for d in old]):
        await _fold_comments(db, did)


async def _transcribe(src: str) -> str:
    from app.utils.audio_extract import extract_audio, ExtractError
    try:
        audio, _ = await extract_audio(src, 0.0, 300.0)
    except ExtractError:
        return ""
    async with httpx.AsyncClient(timeout=120.0) as c:
        r = await c.post(
            settings.SEARCH_STT_URL,
            headers={"Authorization": f"Bearer {settings.SEARCH_STT_KEY}"},
            data={"model": settings.SEARCH_STT_MODEL},
            files={"file": ("audio.m4a", audio, "audio/mp4")},
        )
        r.raise_for_status()
        return (r.json().get("text") or "").strip()[:6000]


_VISION_SCHEMA = {
    "type": "object",
    "properties": {"tags": {"type": "array", "items": {"type": "string"}}},
    "required": ["tags"],
    "additionalProperties": False,
}


async def _vision_tags(image_url: str) -> list:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0, max_retries=1)
    msg = await client.messages.create(
        model=settings.SEARCH_AI_MODEL,
        max_tokens=300,
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": _VISION_SCHEMA}},
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "url", "url": image_url}},
            {"type": "text", "text": "Give up to 8 short, plain search tags (1-2 words each) for what this image shows: "
                                     "setting, mood, people count, activity. No names."},
        ]}],
    )
    if msg.stop_reason != "end_turn":
        return []
    tags = json.loads(next(b.text for b in msg.content if b.type == "text")).get("tags") or []
    return [t.strip().lower()[:30] for t in tags if isinstance(t, str) and t.strip()][:8]


def _topics_in(text: str) -> list:
    low = (text or "").lower()
    return [t for t, ws in lex.TOPICS.items() if any(re.search(r"\b" + re.escape(w) + r"\b", low) for w in ws)]


async def autotag(db, batch: int = 24) -> None:
    stt = bool(settings.SEARCH_STT_KEY)
    vision = bool(settings.SEARCH_AUTOTAG_VISION and settings.ANTHROPIC_API_KEY)
    if not (stt or vision):
        return
    docs = await db["drops"].find(
        {"autotag_at": {"$exists": False}, "media_url": {"$nin": [None, ""]}, "is_active": {"$ne": False},
         "media_type": {"$in": ["video", "voice", "audio", "image"]}},
        {"media_type": 1, "media_url": 1, "media_download_url": 1, "cover_url": 1, "images": 1, "topics": 1},
    ).sort("created_at", -1).limit(batch).to_list(batch)
    gate = asyncio.Semaphore(4)

    async def one(d):
        async with gate:
            update: dict = {"autotag_at": _now()}
            tags: list = []
            try:
                if stt and d["media_type"] in ("video", "voice", "audio"):
                    transcript = await _transcribe(d.get("media_download_url") or d["media_url"])
                    if transcript:
                        update["transcript"] = transcript
                        tags += _topics_in(transcript)
                        spoken = lex.detect_topics(transcript)
                        if spoken and not d.get("topics"):
                            update["topics"] = spoken
                if vision:
                    image = d["media_url"] if d["media_type"] == "image" else d.get("cover_url")
                    if image and image.startswith("https://"):
                        tags += await _vision_tags(image)
            except Exception as e:
                log.info("autotag %s skipped: %s", d["_id"], e)
            if tags:
                update["auto_tags"] = list(dict.fromkeys(tags))[:16]
            await db["drops"].update_one({"_id": d["_id"]}, {"$set": update})

    await asyncio.gather(*(one(d) for d in docs))


async def detect_moods(db, batch: int = 300) -> None:
    """Older drops: work out moods from their words. Moods an author already picked stay."""
    docs = await db["drops"].find(
        {"topics_auto": {"$exists": False}, "kind": {"$ne": "hookup"}},
        {"confession": 1, "poll": 1, "transcript": 1, "topics": 1},
    ).limit(batch).to_list(batch)
    for d in docs:
        topics = d.get("topics") or lex.detect_topics(
            d.get("confession"), (d.get("poll") or {}).get("question"), d.get("transcript"),
        ) or None
        await db["drops"].update_one({"_id": d["_id"]}, {"$set": {"topics": topics, "topics_auto": True}})


async def build_embeddings(db, batch: int = 32) -> None:
    if not settings.SEARCH_EMBED_KEY:
        return
    docs = await db["drops"].find(
        {"embedding": {"$exists": False}, "is_active": {"$ne": False}},
        {"confession": 1, "transcript": 1, "auto_tags": 1, "topics": 1, "mood_tag": 1, "kind": 1},
    ).sort("created_at", -1).limit(batch).to_list(batch)
    texts = [" ".join(filter(None, [
        d.get("kind"), d.get("mood_tag"), " ".join(d.get("topics") or []), " ".join(d.get("auto_tags") or []),
        d.get("confession"), (d.get("transcript") or "")[:1500],
    ]))[:4000] or "drop" for d in docs]
    vecs = await se.embed(texts)
    if not vecs:
        return
    for d, v in zip(docs, vecs):
        await db["drops"].update_one({"_id": d["_id"]}, {"$set": {"embedding": v}})


async def saved_alerts(db) -> None:
    from app.utils.discovery import eligible, viewer_context
    from app.utils.notifications import send_push_notification

    now = _now()
    rows = await db["saved_searches"].find({"checked_at": {"$lt": now - timedelta(minutes=15)}}).limit(200).to_list(200)
    for s in rows:
        await db["saved_searches"].update_one({"_id": s["_id"]}, {"$set": {"checked_at": now}})
        if s.get("notified_at") and now - se._aware(s["notified_at"]) < ALERT_GAP:
            continue
        ctx = await viewer_context(db, s["user_id"], "full")
        conds = eligible(ctx, now) + se.filters(s.get("kind"), s.get("media"), None, s.get("topic"), now) + [
            {"created_at": {"$gt": se._aware(s["checked_at"])}},
            {"sender_id": {"$ne": s["user_id"]}},
        ]
        hits = await se.search(db, conds, s.get("q") or "", None)
        if not hits:
            continue
        label = s.get("q") or lex.TOPIC_LABELS.get(s.get("topic") or "", "your search")
        sent = await send_push_notification(
            s["user_id"], "saved_search", db,
            extra_data={"q": s.get("q") or "", "drop_id": str(hits[0]["_id"])},
            body_override=f"New drops for “{label}”.",
        )
        if sent:
            await db["saved_searches"].update_one({"_id": s["_id"]}, {"$set": {"notified_at": now}})


async def run_once(db) -> None:
    global _last_affinity
    loop = asyncio.get_running_loop()
    for step in (refresh_comment_text, detect_moods, autotag, build_embeddings, saved_alerts):
        try:
            await step(db)
        except Exception as e:
            log.warning("search %s failed: %s", step.__name__, e)
    if loop.time() - _last_affinity >= AFFINITY_EVERY:
        try:
            await build_affinity(db)
            _last_affinity = loop.time()
        except Exception as e:
            log.warning("search affinity failed: %s", e)


async def _loop():
    from app.database import get_database
    await asyncio.sleep(30)
    while True:
        await run_once(await get_database())
        await asyncio.sleep(EVERY)


async def start():
    global _task
    if _task is None:
        _task = asyncio.create_task(_loop())
