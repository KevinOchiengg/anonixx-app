"""
migrate_videos_to_stream.py

Moves existing video drops from R2 to Cloudflare Stream, the same way new
ones are made (app/tasks/scheduled_publisher.py): Stream copies the R2 file
by its public URL, the posted window is cut out of it with the Anonixx
watermark, the copied original is deleted, and the drop is pointed at the
clip's HLS manifest. Text overlays carry over; the smart-trim window
becomes the clip itself.

The R2 file is only deleted with --delete-r2, after the drop already plays
from Stream, so a failed or half-finished run never leaves a drop broken.

Usage:
    python scripts/migrate_videos_to_stream.py                 # dry run — lists what would move
    python scripts/migrate_videos_to_stream.py --apply         # move them, keep the R2 files
    python scripts/migrate_videos_to_stream.py --apply --delete-r2

Safe to re-run: drops that already have a stream_uid are skipped.
"""
import asyncio
import sys

import httpx
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings
from app.utils import r2_storage, stream

MAX_CLIP_SECONDS = 180
POLL_SECONDS = 5
GIVE_UP_AFTER = 30 * 60   # per video


async def copy_from_url(url: str, name: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            stream._url("/copy"), headers=stream._auth(),
            json={"url": url, "meta": {"name": name[:100] or "anonixx video"}},
        )
    if r.status_code >= 300:
        raise RuntimeError(f"copy refused ({r.status_code}): {r.text[:200]}")
    return r.json()["result"]["uid"]


async def wait_ready(uid: str) -> dict:
    waited = 0
    while waited < GIVE_UP_AFTER:
        v = await stream.get_video(uid)
        if (reason := stream.failure(v)):
            raise RuntimeError(reason)
        if stream.is_ready(v):
            return v
        await asyncio.sleep(POLL_SECONDS)
        waited += POLL_SECONDS
    raise RuntimeError("timed out waiting for Stream")


async def migrate(drops, d: dict, delete_r2: bool) -> None:
    name = (d.get("confession") or "")[:80]
    copied = await copy_from_url(d["media_url"], name)
    clip_uid = None
    try:
        original = await wait_ready(copied)
        duration = float(original.get("duration") or 0)
        edit = d.get("video_edit") or {}
        start = float(edit.get("start") or 0)
        end = min(float(edit.get("end") or duration), duration, start + MAX_CLIP_SECONDS)
        clip_uid = (await stream.create_clip(copied, start, end, name))["uid"]
        clip = await wait_ready(clip_uid)
    except Exception:
        await stream.delete_video(clip_uid)
        await stream.delete_video(copied)
        raise
    await stream.delete_video(copied)

    update = {
        "media_url": clip["playback"]["hls"],
        "stream_uid": clip_uid,
        "media_download_url": await stream.enable_download(clip_uid),
        "r2_media_url": d["media_url"],      # kept for the record / rollback
    }
    if not d.get("cover_url") and clip.get("thumbnail"):
        update["cover_url"] = clip["thumbnail"]
    if (d.get("video_edit") or {}).get("overlays"):
        update["video_edit"] = {"start": 0, "end": round(min(float(clip.get("duration") or end - start), MAX_CLIP_SECONDS), 2),
                                "overlays": d["video_edit"]["overlays"]}
    else:
        update["video_edit"] = None
    await drops.update_one({"_id": d["_id"]}, {"$set": update})
    if delete_r2:
        r2_storage.delete_by_url(d["media_url"])


async def main(apply: bool, delete_r2: bool):
    if not stream.is_configured():
        sys.exit("Set CF_ACCOUNT_ID and CF_STREAM_TOKEN first.")
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    drops = client[settings.DATABASE_NAME]["drops"]
    todo = await drops.find(
        {"media_type": "video", "media_url": {"$nin": [None, ""]}, "stream_uid": {"$in": [None]}},
        {"media_url": 1, "confession": 1, "video_edit": 1, "cover_url": 1},
    ).to_list(None)
    todo = [d for d in todo if ".m3u8" not in d["media_url"]]
    print(f"{len(todo)} video drop(s) on R2.")
    if not apply:
        for d in todo:
            print(" ", d["_id"], d["media_url"])
        print("\nDry run. Re-run with --apply to move them.")
        return
    moved = failed = 0
    for i, d in enumerate(todo, 1):
        try:
            await migrate(drops, d, delete_r2)
            moved += 1
            print(f"[{i}/{len(todo)}] moved {d['_id']}")
        except Exception as e:
            failed += 1
            print(f"[{i}/{len(todo)}] FAILED {d['_id']}: {e}")
    print(f"\nDone: {moved} moved, {failed} failed (failed ones still play from R2).")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv, "--delete-r2" in sys.argv))
