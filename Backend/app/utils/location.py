"""Location helpers: country > county > sub_county > estate."""
import re
from typing import Optional

MAX_LOCATION_PART_LEN = 60

LOCATION_LEVELS = ["country", "county", "sub_county", "estate"]


def build_location(country, county, sub_county, estate):
    """(structured dict, display string) from the 4 location parts, or (None, None) if empty."""
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
    """Feed filter matching the user's location at `scope`. Posts without a location are always
    included. None when scope is off or the user has no location at that level."""
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
    """Filter for an explicit location search: must match every level given. None if none given."""
    match = {}
    for level, val in (
        ("country", country), ("county", county),
        ("sub_county", sub_county), ("estate", estate),
    ):
        val = (val or "").strip()
        if val:
            match[f"location_detail.{level}"] = {"$regex": f"^{re.escape(val)}$", "$options": "i"}
    return match or None
