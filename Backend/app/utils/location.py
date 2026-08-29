"""
app/utils/location.py

Shared structured-location helpers — used by Drops (compose-time location
capture) and Posts (location-scoped feed filtering). Kept in one place so
both features agree on structure: country -> county -> sub_county -> estate,
most-specific to least.
"""
import re
from typing import Optional

MAX_LOCATION_PART_LEN = 60

LOCATION_LEVELS = ["country", "county", "sub_county", "estate"]


def build_location(country, county, sub_county, estate):
    """Turns the 4 structured location inputs into (structured dict, display
    string) — most-specific to least, e.g. "Kilimani, Westlands, Nairobi,
    Kenya". Returns (None, None) if every part is empty."""
    parts = {
        "country":    (country or "").strip()[:MAX_LOCATION_PART_LEN] or None,
        "county":     (county or "").strip()[:MAX_LOCATION_PART_LEN] or None,
        "sub_county": (sub_county or "").strip()[:MAX_LOCATION_PART_LEN] or None,
        "estate":     (estate or "").strip()[:MAX_LOCATION_PART_LEN] or None,
    }
    if not any(parts.values()):
        return None, None
    display = ", ".join(
        v for v in [parts["estate"], parts["sub_county"], parts["county"], parts["country"]] if v
    )
    return parts, display


def build_feed_location_filter(user_location: Optional[dict], scope: Optional[str]) -> Optional[dict]:
    """
    Builds a Mongo filter fragment that scopes the feed pool to posts whose
    location matches the user's own location down to `scope`'s granularity.

    Posts with no location of their own are always included — most existing
    posts predate structured location, and excluding them would make a
    freshly-scoped feed look empty/broken rather than just "smaller."

    Returns None when no filtering should apply: scope is off/unset, or the
    user hasn't set their own location at the requested granularity.
    """
    if not scope or scope == "off" or scope not in LOCATION_LEVELS:
        return None

    user_location = user_location or {}
    required_levels = LOCATION_LEVELS[:LOCATION_LEVELS.index(scope) + 1]

    match = {}
    for level in required_levels:
        val = (user_location.get(level) or "").strip()
        if not val:
            return None  # user hasn't set location this precisely yet
        match[f"location_detail.{level}"] = {"$regex": f"^{re.escape(val)}$", "$options": "i"}

    return {
        "$or": [
            {"location_detail.country": {"$in": [None, ""]}},
            {"location_detail.country": {"$exists": False}},
            match,
        ]
    }


def build_location_search_filter(
    country: Optional[str] = None,
    county: Optional[str] = None,
    sub_county: Optional[str] = None,
    estate: Optional[str] = None,
) -> Optional[dict]:
    """Builds a Mongo filter for an explicit "search by location" request —
    unlike build_feed_location_filter (which deliberately still includes
    location-less posts so a user's own passively-scoped feed never looks
    empty), this requires a match at every level the caller actually
    supplied, since here the user is deliberately asking for a specific
    place. Returns None if no level was given."""
    match = {}
    for level, val in (
        ("country", country), ("county", county),
        ("sub_county", sub_county), ("estate", estate),
    ):
        val = (val or "").strip()
        if val:
            match[f"location_detail.{level}"] = {"$regex": f"^{re.escape(val)}$", "$options": "i"}
    return match or None
