"""
api/v1/sounds.py — Ambient sounds for text confessions.

Admins drop audio files (mp3 / m4a, up to 5 MB each); each gets a title and a
mood. Files live in R2, details in the `sounds` collection. Everyone can read
the active list; the clients pick one per confession by its mood.
"""
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.database import get_database
from app.dependencies import require_admin
from app.utils import r2_storage

router = APIRouter(prefix="/sounds", tags=["sounds"])

MAX_BYTES = 5 * 1024 * 1024
ALLOWED_TYPES = {"audio/mpeg", "audio/mp3", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac"}
MOODS = {"any", "longing", "untold", "horny", "discreet"}


def _out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "mood": doc.get("mood", "any"),
        "url": doc.get("url", ""),
        "active": bool(doc.get("active", True)),
        "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
    }


def _oid(sound_id: str) -> ObjectId:
    try:
        return ObjectId(sound_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Sound not found.")


@router.get("")
async def list_active_sounds(db=Depends(get_database)):
    docs = await db["sounds"].find({"active": True}).sort("created_at", 1).to_list(500)
    return {"sounds": [{k: v for k, v in _out(d).items() if k != "active"} for d in docs]}


@router.get("/admin")
async def list_all_sounds(_: str = Depends(require_admin), db=Depends(get_database)):
    docs = await db["sounds"].find({}).sort("created_at", -1).to_list(1000)
    return {"sounds": [_out(d) for d in docs]}


@router.post("/admin", status_code=201)
async def add_sound(
    file: UploadFile = File(...),
    title: str = Form(...),
    mood: str = Form("any"),
    admin_id: str = Depends(require_admin),
    db=Depends(get_database),
):
    title = title.strip()[:80]
    mood = mood.strip().lower()
    if not title:
        raise HTTPException(status_code=400, detail="Give the sound a title.")
    if mood not in MOODS:
        raise HTTPException(status_code=400, detail="Unknown mood.")
    ctype = (file.content_type or "").lower()
    if ctype not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only mp3 or m4a files.")
    r2_storage.require_configured()
    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Max 5MB.")
    try:
        url = r2_storage.upload_bytes(contents, "audio", ctype)
    except Exception:
        raise HTTPException(status_code=500, detail="Upload failed. Try again.")

    doc = {
        "title": title,
        "mood": mood,
        "url": url,
        "active": True,
        "created_by": admin_id,
        "created_at": datetime.now(timezone.utc),
    }
    res = await db["sounds"].insert_one(doc)
    doc["_id"] = res.inserted_id
    return _out(doc)


class SoundPatch(BaseModel):
    title: Optional[str] = None
    mood: Optional[str] = None
    active: Optional[bool] = None


@router.patch("/admin/{sound_id}")
async def edit_sound(
    sound_id: str,
    data: SoundPatch,
    _: str = Depends(require_admin),
    db=Depends(get_database),
):
    changes: dict = {}
    if data.title is not None:
        t = data.title.strip()[:80]
        if not t:
            raise HTTPException(status_code=400, detail="Give the sound a title.")
        changes["title"] = t
    if data.mood is not None:
        m = data.mood.strip().lower()
        if m not in MOODS:
            raise HTTPException(status_code=400, detail="Unknown mood.")
        changes["mood"] = m
    if data.active is not None:
        changes["active"] = data.active
    if not changes:
        raise HTTPException(status_code=400, detail="Nothing to change.")
    doc = await db["sounds"].find_one_and_update(
        {"_id": _oid(sound_id)}, {"$set": changes}, return_document=True
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Sound not found.")
    return _out(doc)


@router.delete("/admin/{sound_id}")
async def delete_sound(sound_id: str, _: str = Depends(require_admin), db=Depends(get_database)):
    doc = await db["sounds"].find_one_and_delete({"_id": _oid(sound_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Sound not found.")
    r2_storage.delete_by_url(doc.get("url"))
    return {"ok": True}
