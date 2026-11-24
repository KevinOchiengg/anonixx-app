"""Every few minutes, captions official media drops that have none, old and new."""
import asyncio
import logging

from app.utils.auto_caption import fill_batch

log = logging.getLogger(__name__)

CHECK_EVERY = 120

_task: asyncio.Task | None = None


async def _loop():
    from app.database import get_database
    while True:
        try:
            n = await fill_batch(await get_database())
            if n:
                log.info("auto caption: filled %d drops", n)
        except Exception as e:
            log.warning("auto caption failed: %s", e)
        await asyncio.sleep(CHECK_EVERY)


async def start():
    global _task
    if _task is None:
        _task = asyncio.create_task(_loop())


async def stop():
    global _task
    if _task:
        _task.cancel()
        _task = None
