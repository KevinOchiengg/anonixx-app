"""Captions for drops posted to Anonixx's social accounts: an intrigue hook (rotated), the
confession, then a short call to action, formatted per platform."""

import hashlib
from typing import Literal

# ── Platform type ────────────────────────────────────────────────────────────
Platform = Literal["tiktok", "facebook", "instagram", "telegram"]

# ── Opening hooks (rotated) ───────────────────────────────────────────────────
_GENERIC_EMOJI = "💬"

_GENERIC_HOOKS: list[str] = [
    "someone dropped this anonymously. read it.",
    "they couldn't tell anyone. so they told us.",
    "this was typed by a real person. someone you might know.",
    "this landed in our confession box tonight.",
    "someone finally said the thing they've been holding.",
    "this is a real thought from a real person. no name attached.",
    "they've been carrying this. they put it down here.",
    "anonymous. unfiltered. real.",
    "this is what people are actually thinking.",
    "they typed this out and couldn't delete it.",
    "some confessions don't need a name. this is one.",
    "this person exists somewhere right now, carrying this.",
]

# ── Closing CTAs (rotated) ────────────────────────────────────────────────────
_TIKTOK_CTAS: list[str] = [
    "they're on Anonixx. so is the person you've been thinking about → anonixx.com",
    "say something. it stays anonymous → anonixx.com",
    "your confession is safe with us → anonixx.com",
    "thousands are confessing right now → anonixx.com",
    "read more at anonixx.com — where real feelings live",
    "join the conversation. no real name needed → anonixx.com",
    "drop your own → anonixx.com",
]

_FACEBOOK_CTAS: list[str] = [
    "Someone in your life might feel exactly like this.\n\nAnonixx — where people say the things they can't say anywhere else. → anonixx.com",
    "You're not alone in feeling this. Thousands of people are confessing anonymously right now.\n\nAnonixx → anonixx.com",
    "This is what people are really feeling. What would yours say?\n\nAnonixx — Anonymous. Safe. Real. → anonixx.com",
    "Some things are easier to say when no one knows your name.\n\nAnonixx → anonixx.com",
    "Real feelings. No names. No judgement.\n\nAnonixx → anonixx.com",
]

_INSTAGRAM_CTAS: list[str] = [
    "anonymous. safe. real.\n\nanonixx.com",
    "say the thing you can't say anywhere else.\n\nanonixx.com",
    "thousands are confessing right now. anonymously.\n\nanonixx.com",
    "you are not alone in this.\n\nanonixx.com",
    "your confession is safe with us.\n\nanonixx.com",
]

_TELEGRAM_CTAS: list[str] = [
    "Someone's waiting to hear from you. Unlock the full confession on Anonixx → anonixx.com",
    "This is only part of it. The rest is on Anonixx → anonixx.com",
    "Real people, real confessions, completely anonymous. → anonixx.com",
    "You can respond to this one — anonymously — on Anonixx → anonixx.com",
    "Thousands are confessing right now on Anonixx → anonixx.com",
]

# ── Hashtag banks ─────────────────────────────────────────────────────────────
_TIKTOK_TAGS = "#anonixx #anonymous #confession #mentalhealth #anonymousconfessions #secrets #vulnerability"

_IG_TAGS_POOL: list[str] = [
    "#anonixx #anonymous #confession #mentalhealth #anonymousconfessions "
    "#MentalHealthMatters #secrets #anonymousstories #feelingsheard "
    "#youarenotalone #healing #realstories #vulnerability #emotionalhealth "
    "#innervoice #deepfeelings #confessiontime #unsaidfeelings #rawemotion",

    "#anonixx #anonymous #confessions #mentalhealth #secretconfessions "
    "#anonymousstory #emotionaldump #unspoken #realfeelings #noguiltnoshame "
    "#youmatter #selfreflection #truestory #openup #itsokaytonotbeokay "
    "#innermonologue #rawest #nofilterneeded",

    "#anonixx #anonymous #confession #mentalwellness #emotionalwellbeing "
    "#sharetheburden #anonymouspost #secretstory #mentalstrength "
    "#heartfelt #unfiltered #realpeople #deepthoughts #lettinggo "
    "#breathe #gentlereminder #youareheard #anonymoussupport",
]

# ── Selector helpers ──────────────────────────────────────────────────────────

def _pick(items: list[str], seed: str) -> str:
    """Pick from a list by a seed, so the same confession always gets the same variant."""
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    return items[h % len(items)]


def _hook(seed: str) -> str:
    return _pick(_GENERIC_HOOKS, seed[:40])


# ── Public API ────────────────────────────────────────────────────────────────

def build_caption(confession: str, platform: Platform) -> str:
    """Caption for `platform` ("tiktok", "facebook", "instagram", "telegram"), within its length limit."""
    confession = (confession or "").strip()
    hook       = _hook(confession)

    if platform == "tiktok":
        return _tiktok_caption(confession, hook)
    if platform == "facebook":
        return _facebook_caption(confession, hook)
    if platform == "instagram":
        return _instagram_caption(confession, hook)
    if platform == "telegram":
        return _telegram_caption(confession, hook)

    # Fallback — should never happen
    return _tiktok_caption(confession, hook)


def build_teaser_caption(link: str, seed: str) -> str:
    """Facebook caption for a teaser card: hook only, no confession text. `seed` is the drop id."""
    hook    = _hook(seed)
    fb_hook = hook[0].upper() + hook[1:] if hook else hook
    body = (
        f"{fb_hook}\n\n"
        f"{_GENERIC_EMOJI} The rest of it is on the card above.\n\n"
        f"See it → {link}\n\n"
        f"#anonixx #confession #anonymousconfessions"
    )
    return body[:63206]


# ── Platform formatters ───────────────────────────────────────────────────────

def _tiktok_caption(confession: str, hook: str) -> str:
    """TikTok: hook, quoted confession, CTA, hashtags (max 2200 chars)."""
    cta  = _pick(_TIKTOK_CTAS, confession[-20:])
    body = (
        f"{hook}\n\n"
        f'"{confession}"\n\n'
        f"{cta}\n\n"
        f"{_TIKTOK_TAGS}"
    )
    return body[:2200]


def _facebook_caption(confession: str, hook: str) -> str:
    """Facebook: hook, quoted confession, CTA, 2-3 hashtags."""
    cta     = _pick(_FACEBOOK_CTAS, confession[-20:])
    # Capitalise first letter of the hook for FB's more editorial feel
    fb_hook = hook[0].upper() + hook[1:] if hook else hook
    body = (
        f"{fb_hook}\n\n"
        f'{_GENERIC_EMOJI}  "{confession}"\n\n'
        f"{cta}\n\n"
        f"#anonixx #confession #anonymousconfessions"
    )
    return body[:63206]


def _instagram_caption(confession: str, hook: str) -> str:
    """Instagram: lower-case hook, confession, short CTA, hashtags below the fold (max 2200 chars)."""
    cta  = _pick(_INSTAGRAM_CTAS, confession[-20:])
    tags = _pick(_IG_TAGS_POOL,   confession[:30])

    # IG caption uses line-break rhythm intentionally
    body = (
        f"{hook}\n\n"
        f"— {confession}\n\n"
        f"{cta}\n\n"
        f"·\n\n"
        f"{tags}"
    )
    return body[:2200]


def _telegram_caption(confession: str, hook: str) -> str:
    """Telegram: hook, confession, CTA; no hashtags."""
    cta = _pick(_TELEGRAM_CTAS, confession[-20:])
    tg_hook = hook[0].upper() + hook[1:] if hook else hook
    body = (
        f"{tg_hook}\n\n"
        f'{_GENERIC_EMOJI} "{confession}"\n\n'
        f"{cta}"
    )
    return body[:1024]
