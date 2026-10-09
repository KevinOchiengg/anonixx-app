"""Hard-reject text that Google Play and basic safety rules forbid.

A blocklist is a floor, not a moderator: it catches the obvious cases at
submission time. Everything else is handled by user reports (auto-hide at
REPORT_THRESHOLD) and manual review.
"""
import re

_MINOR = r"(?:child(?:ren)?|kid|kids|minor|minors|underage|under\s*age|toddler|infant|baby|preteen|pre-teen|schoolgirl|schoolboy|school\s*girl|school\s*boy|loli(?:ta)?|shota|teen\s*girl|teen\s*boy|\b(?:[0-9]|1[0-7])\s*(?:yo|y/o|yr\s*old|years?\s*old|year-old))"
_SEXUAL = r"(?:sex|sexual|nude|nudes|naked|porn|rape|molest|fuck|fucking|horny|blowjob|suck|cum|explicit)"

_PATTERNS = [
    # Sexual content involving minors
    (re.compile(rf"{_MINOR}\W+(?:\w+\W+){{0,6}}{_SEXUAL}|{_SEXUAL}\W+(?:\w+\W+){{0,6}}{_MINOR}", re.IGNORECASE), "minors"),
    (re.compile(r"\b(?:child\s*porn\w*|cp\s*(?:link|vid|videos?|pics?)|jailbait)\b", re.IGNORECASE), "minors"),
    # Paid sex / escort solicitation
    (re.compile(r"\b(?:escort|escorts|call\s*girl|prostitut\w*|sex\s*for\s*(?:money|cash|pay)|pay(?:ing)?\s*for\s*sex|selling\s*(?:my\s*)?nudes|buy(?:ing)?\s*nudes|nudes\s*for\s*sale|sugar\s*(?:daddy|daddies|mummy|mommy|mama))\b", re.IGNORECASE), "solicitation"),
    # Direct threats of violence or sexual violence
    (re.compile(r"\b(?:i(?:'ll|\s*will|\s*am\s*going\s*to|'m\s*going\s*to|\s*wanna|\s*want\s*to)\s*(?:kill|rape|murder|stab|shoot))\s+(?:you|u|her|him|them)\b", re.IGNORECASE), "threat"),
    (re.compile(r"\b(?:kill\s*yourself|kys)\b", re.IGNORECASE), "threat"),
]

MODERATION_ERROR = (
    "That can't be posted here. Anonixx doesn't allow sexual content involving minors, "
    "paid sex or escort offers, or threats of violence."
)


def violates_policy(*texts) -> bool:
    for text in texts:
        if not text:
            continue
        if any(p.search(text) for p, _ in _PATTERNS):
            return True
    return False
