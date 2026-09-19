"""
Shared salted-hash helper for device/IP fingerprinting.

Used wherever the app needs to recognize "the same device/network as
before" without storing anything that identifies it directly — signup
abuse detection (auth.py) and anonymous view deduplication (drops.py)
both hash through this so a leaked DB dump never exposes raw device IDs
or IP addresses, and both features stay consistent if the hashing
scheme ever changes.
"""
import hashlib

from app.config import settings


def fingerprint_hash(value: str) -> str:
    """Salted hash so raw device IDs/IPs are never stored at rest."""
    return hashlib.sha256(f"{settings.SECRET_KEY}:{value}".encode()).hexdigest()
