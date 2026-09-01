"""
contact_filter.py — blocks phone numbers, emails, and social/messaging
handles from post/drop/comment text at submission time.

Anonixx's whole business model runs on paid unlocks (Link Up) to actually
reach someone — if a confession's text already contains their number,
email, or Instagram/Snap/WhatsApp handle, the unlock is worthless. This is
a hard reject, not a redact: silently stripping the contact info would let
the post through looking fine while quietly breaking whatever the poster
meant to say. Chat messages after unlock are exempt — the whole point of
paying to unlock is to actually be able to exchange this stuff.

Not airtight by design — a determined user can still spell digits out as
words, split a number across two posts, or put it in an image. This raises
the bar for casual sharing without false-positiving on ordinary text (dates,
prices, drop ids); it isn't meant to catch everything.
"""
import re

_CONTACT_INFO_PATTERNS = [
    re.compile(r"[\w.+-]+@[\w-]+\.[a-z]{2,}", re.IGNORECASE),           # email
    # Word-obfuscated email — "name at gmail dot com" / "name[at]gmail(dot)com"
    re.compile(
        r"[a-z0-9._%+\-]+"                            # local part
        r"\s*[\(\[]?\s*(?:@|\bat\b)\s*[\)\]]?\s*"      # @ or "at"
        r"[a-z0-9.\-]+"                                # domain
        r"\s*[\(\[]?\s*(?:\.|\bdot\b)\s*[\)\]]?\s*"    # . or "dot"
        r"[a-z]{2,}",                                   # tld
        re.IGNORECASE,
    ),
    re.compile(r"(\+?\d[\d\-\s()]{7,}\d)"),                              # phone number
    re.compile(r"(?:^|\s)@[a-z0-9._]{2,}", re.IGNORECASE),               # @handle
    re.compile(r"\b(wa\.me|t\.me|snapchat\.com|instagram\.com|tiktok\.com|facebook\.com)\/\S+", re.IGNORECASE),
    re.compile(r"\bsnap(?:chat)?\s*[:：]\s*\S+", re.IGNORECASE),
    re.compile(r"\btelegram\s*[:：]\s*\S+", re.IGNORECASE),
    re.compile(r"\b(whatsapp|whats app)\b", re.IGNORECASE),
]

CONTACT_INFO_ERROR = (
    "Save the digits 😉 No phone numbers, emails, or socials in here — "
    "Link Up is how they actually reach you."
)


def contains_contact_info(text) -> bool:
    """True if `text` contains something that looks like a phone number,
    email, or social/messaging handle (including simple word-obfuscated
    email variants)."""
    if not text:
        return False
    return any(p.search(text) for p in _CONTACT_INFO_PATTERNS)
