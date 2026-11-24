"""Caption bank for official drops (super admin)."""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import get_database
from app.dependencies import require_super_admin
from app.utils.audit import audit
from app.utils.auto_caption import MAX_CAPTION, fill_batch, is_on, set_on, uncaptioned_query

router = APIRouter(prefix="/admin/captions", tags=["Admin"])


class AddCaptions(BaseModel):
    text: str
    mature: bool = False


class EditCaption(BaseModel):
    text: str | None = None
    mature: bool | None = None


class Toggle(BaseModel):
    on: bool


def _oid(cid: str) -> ObjectId:
    try:
        return ObjectId(cid)
    except Exception:
        raise HTTPException(400, "Invalid caption id")


@router.get("")
async def list_captions(_: str = Depends(require_super_admin), db=Depends(get_database)):
    rows = await db["caption_bank"].find({}).sort("created_at", -1).to_list(length=5000)
    return {
        "on": await is_on(db),
        "captions": [
            {"id": str(r["_id"]), "text": r["text"], "mature": r.get("mature", False), "uses": r.get("uses", 0)}
            for r in rows
        ],
        "waiting": {
            "general": await db["drops"].count_documents(uncaptioned_query(False)),
            "mature": await db["drops"].count_documents(uncaptioned_query(True)),
        },
    }


@router.post("")
async def add_captions(data: AddCaptions, admin_id: str = Depends(require_super_admin), db=Depends(get_database)):
    lines = {line.strip()[:MAX_CAPTION] for line in data.text.splitlines() if line.strip()}
    if not lines:
        raise HTTPException(400, "Add at least one caption.")
    existing = {
        r["text"] for r in await db["caption_bank"].find({"text": {"$in": list(lines)}}, {"text": 1}).to_list(length=len(lines))
    }
    fresh = [t for t in lines if t not in existing]
    if fresh:
        now = datetime.now(timezone.utc)
        await db["caption_bank"].insert_many(
            [{"text": t, "mature": data.mature, "uses": 0, "created_at": now, "by": admin_id} for t in fresh]
        )
    await audit(db, admin_id, "captions.add", "caption", None, {"added": len(fresh)})
    return {"added": len(fresh), "duplicates": len(lines) - len(fresh)}


@router.patch("/{cid}")
async def edit_caption(cid: str, data: EditCaption, _: str = Depends(require_super_admin), db=Depends(get_database)):
    fields: dict = {}
    if data.text is not None:
        if not data.text.strip():
            raise HTTPException(400, "Caption can't be empty.")
        fields["text"] = data.text.strip()[:MAX_CAPTION]
    if data.mature is not None:
        fields["mature"] = data.mature
    if fields:
        await db["caption_bank"].update_one({"_id": _oid(cid)}, {"$set": fields})
    return {"ok": True}


@router.delete("/{cid}")
async def delete_caption(cid: str, _: str = Depends(require_super_admin), db=Depends(get_database)):
    await db["caption_bank"].delete_one({"_id": _oid(cid)})
    return {"ok": True}


@router.put("/settings")
async def toggle(data: Toggle, admin_id: str = Depends(require_super_admin), db=Depends(get_database)):
    await set_on(db, data.on)
    await audit(db, admin_id, "captions.auto_on" if data.on else "captions.auto_off", "caption")
    filled = await fill_batch(db) if data.on else 0
    return {"on": data.on, "filled": filled}
