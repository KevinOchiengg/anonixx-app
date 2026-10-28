"""Rejects phone numbers, emails and social handles in posts and comments (not in chats),
so contact only happens through Link Up. Catches casual sharing, not every trick."""
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
    """True if the text looks like it contains a phone number, email or social handle."""
    if not text:
        return False
    return any(p.search(text) for p in _CONTACT_INFO_PATTERNS)
