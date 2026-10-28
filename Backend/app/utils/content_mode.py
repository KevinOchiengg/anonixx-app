"""Content modes. safe: app store builds, guests, crawlers (no mature posts). full: web,
signed-in and age-verified only (mature posts, blurred until tapped). "full" from the
X-Content-Mode header is only honoured for age-verified users."""
import re
from typing import Optional


# Anything the filter matches is auto-marked `mature`. Deliberately conservative:
# a false positive only hides a post from the app/SEO surfaces.
_MATURE_WORDS = [
    "sex", "sexy", "sexual", "nude", "nudes", "naked", "horny", "orgasm",
    "fuck", "fucking", "fucked", "cock", "dick", "pussy", "boobs", "tits",
    "blowjob", "handjob", "anal", "threesome", "cum", "cumming", "masturbat\\w*",
    "erotic", "kinky", "fetish", "bdsm", "porn", "stripper", "orgy", "onlyfans",
]
_MATURE_RE = re.compile(r"\b(?:" + "|".join(_MATURE_WORDS) + r")\b", re.IGNORECASE)

SAFE_FILTER = {"sensitivity": {"$ne": "mature"}}


def classify_sensitivity(*texts: Optional[str], marked_mature: bool = False) -> str:
    if marked_mature:
        return "mature"
    for t in texts:
        if t and _MATURE_RE.search(t):
            return "mature"
    return "general"


def mature_allowed(mode_header: Optional[str], user_doc: Optional[dict]) -> bool:
    if (mode_header or "").strip().lower() != "full":
        return False
    return bool(user_doc and user_doc.get("age_verified"))


def apply_content_mode(query: dict, allow_mature: bool) -> dict:
    """Return `query` with the safe filter AND-ed in unless mature is allowed."""
    if allow_mature:
        return query
    return {"$and": [query, SAFE_FILTER]} if query else dict(SAFE_FILTER)
