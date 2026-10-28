"""IP to country for pricing, from a local DB-IP Lite database (CC BY 4.0) refreshed monthly.
Until it's loaded, falls back to ip-api.com, then the client's X-Country."""
import asyncio
import gzip
import logging
import os
import re
import tempfile
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Optional

import httpx

log = logging.getLogger(__name__)

DB_PATH = os.path.join(tempfile.gettempdir(), "dbip-country-lite.mmdb")
DB_URL = "https://download.db-ip.com/free/dbip-country-lite-{month}.mmdb.gz"
DB_MAX_AGE = 35 * 24 * 3600
CACHE_SIZE = 20_000
LOCAL_IPS = {"127.0.0.1", "::1", "testclient", "", "localhost"}

_reader = None
_loading: Optional[asyncio.Task] = None
_cache: "OrderedDict[str, Optional[str]]" = OrderedDict()


def _months() -> list[str]:
    now = datetime.now(timezone.utc)
    prev = (now.year, now.month - 1) if now.month > 1 else (now.year - 1, 12)
    return [f"{now.year}-{now.month:02d}", f"{prev[0]}-{prev[1]:02d}"]   # this month's may not be out yet


async def _download() -> bool:
    for month in _months():
        try:
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
                r = await client.get(DB_URL.format(month=month))
            if r.status_code != 200:
                continue
            raw = await asyncio.to_thread(gzip.decompress, r.content)
            tmp = DB_PATH + ".part"
            with open(tmp, "wb") as f:
                f.write(raw)
            os.replace(tmp, DB_PATH)
            log.info("geoip: DB-IP country database %s ready (%d KB)", month, len(raw) // 1024)
            return True
        except Exception as e:
            log.warning("geoip: download of %s failed: %s", month, e)
    return False


async def load() -> None:
    """Opens the local database, downloading it first if missing or stale."""
    global _reader
    try:
        import maxminddb
        fresh = os.path.exists(DB_PATH) and time.time() - os.path.getmtime(DB_PATH) < DB_MAX_AGE
        if not fresh and not await _download():
            return
        _reader = maxminddb.open_database(DB_PATH)
        _cache.clear()
    except Exception as e:
        log.warning("geoip: database unavailable, using the API fallback: %s", e)


def start_loading() -> None:
    global _loading
    if _loading is None or _loading.done():
        _loading = asyncio.create_task(load())


def client_ip(request) -> str:
    """The visitor's address: a CDN's own header if one is in front (it overwrites
    anything the client sent), else the first X-Forwarded-For hop (Render's proxy)."""
    for h in ("CF-Connecting-IP", "True-Client-IP"):
        if request.headers.get(h):
            return request.headers[h].strip()
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


async def _api_lookup(ip: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"http://ip-api.com/json/{ip}?fields=status,countryCode")
        data = r.json() if r.status_code == 200 else {}
        return data.get("countryCode") if data.get("status") == "success" else None
    except Exception:
        return None


async def country_of(ip: str) -> Optional[str]:
    """ISO alpha-2 code for an address, or None if it can't be placed."""
    if ip in _cache:
        _cache.move_to_end(ip)
        return _cache[ip]
    code = None
    if _reader is not None:
        try:
            rec = _reader.get(ip) or {}
            code = (rec.get("country") or {}).get("iso_code")
        except Exception:
            code = None
    else:
        start_loading()
        code = await _api_lookup(ip)
        if code is None:
            return None   # don't cache a miss from the fallback; the database may be ready next time
    _cache[ip] = code
    if len(_cache) > CACHE_SIZE:
        _cache.popitem(last=False)
    return code


async def request_country(request, use_hint: bool = False, local_default: str = "KE") -> Optional[str]:
    """Country for a request. use_hint allows the client's X-Country only for display choices, never prices."""
    ip = client_ip(request)
    if ip in LOCAL_IPS:
        return local_default   # local development
    code = await country_of(ip)
    if code or not use_hint:
        return code
    hint = (request.headers.get("X-Country") or "").strip().upper()
    return hint if re.fullmatch(r"[A-Z]{2}", hint) else None
