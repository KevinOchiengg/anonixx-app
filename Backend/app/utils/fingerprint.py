"""Salted hash for device ids and IPs, so we can spot repeats without storing them."""
import hashlib

from app.config import settings


def fingerprint_hash(value: str) -> str:
    """Salted hash so raw device IDs/IPs are never stored at rest."""
    return hashlib.sha256(f"{settings.SECRET_KEY}:{value}".encode()).hexdigest()
