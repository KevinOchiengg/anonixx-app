"""The AI writer and reword tools are retired: posts are written by people, in their own words.
These routes stay so older app builds get a clear answer instead of a 404."""

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user_id

router = APIRouter(prefix="/guided", tags=["guided"])

RETIRED = "Write it in your own words."


@router.get("/status")
async def status(current_user_id: str = Depends(get_current_user_id)):
    return {"enabled": False, "remaining": 0, "daily": 0}


@router.post("/generate")
async def generate(current_user_id: str = Depends(get_current_user_id)):
    raise HTTPException(status_code=410, detail=RETIRED)


@router.post("/reword")
async def reword(current_user_id: str = Depends(get_current_user_id)):
    raise HTTPException(status_code=410, detail=RETIRED)
