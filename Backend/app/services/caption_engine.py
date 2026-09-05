"""
app/services/caption_engine.py

Anonixx Social Caption Engine
──────────────────────────────
Generates platform-native, psychologically compelling captions for confession
drops published to TikTok, Facebook, and Instagram.

Design rules
  1. The hook is NEVER a brand announcement — it creates intrigue first.
  2. Every post rotates through multiple hook variants so the account
     never sounds robotic to the algorithm or the audience.
  3. Each platform gets a format tuned to how users actually read there.
  4. The confession text is the PAYOFF — the hook earns it.
  5. The brand/CTA only appears at the end, in the form of intrigue, not a pitch.
"""

import hashlib
import random
from typing import Literal

# ── Platform type ────────────────────────────────────────────────────────────
Platform = Literal["tiktok", "facebook", "instagram", "telegram"]

# ── Opening hooks (rotate — never the same line twice in a row) ───────────────
# Used for every drop regardless of content — there's no per-category hook
# variation anymore (the `category` field was dropped from the data model
# entirely; it had no compose-screen UI and its only consumer was this file).
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
    "they're on Anonixx. so is the person you've been thinking about → anonixx.app",
    "say something. it stays anonymous → anonixx.app",
    "your confession is safe with us → anonixx.app",
    "thousands are confessing right now → anonixx.app",
    "read more at anonixx.app — where real feelings live",
    "join the conversation. no real name needed → anonixx.app",
    "drop your own → anonixx.app",
]

_FACEBOOK_CTAS: list[str] = [
    "Someone in your life might feel exactly like this.\n\nAnonixx — where people say the things they can't say anywhere else. → anonixx.app",
    "You're not alone in feeling this. Thousands of people are confessing anonymously right now.\n\nAnonixx → anonixx.app",
    "This is what people are really feeling. What would yours say?\n\nAnonixx — Anonymous. Safe. Real. → anonixx.app",
    "Some things are easier to say when no one knows your name.\n\nAnonixx → anonixx.app",
    "Real feelings. No names. No judgement.\n\nAnonixx → anonixx.app",
]

_INSTAGRAM_CTAS: list[str] = [
    "anonymous. safe. real.\n\nanonixx.app",
    "say the thing you can't say anywhere else.\n\nanonixx.app",
    "thousands are confessing right now. anonymously.\n\nanonixx.app",
    "you are not alone in this.\n\nanonixx.app",
    "your confession is safe with us.\n\nanonixx.app",
]

_TELEGRAM_CTAS: list[str] = [
    "Someone's waiting to hear from you. Unlock the full confession on Anonixx → anonixx.app",
    "This is only part of it. The rest is on Anonixx → anonixx.app",
    "Real people, real confessions, completely anonymous. → anonixx.app",
    "You can respond to this one — anonymously — on Anonixx → anonixx.app",
    "Thousands are confessing right now on Anonixx → anonixx.app",
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
    """
    Deterministically pick from a list using a content-derived seed,
    so the same confession always gets the same variant (idempotent retries),
    but different confessions get different variants.
    """
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    return items[h % len(items)]


def _hook(seed: str) -> str:
    return _pick(_GENERIC_HOOKS, seed[:40])


# ── Public API ────────────────────────────────────────────────────────────────

def build_caption(confession: str, platform: Platform) -> str:
    """
    Build a platform-native caption for a confession drop.

    Args:
        confession: The raw confession text.
        platform:   One of "tiktok", "facebook", "instagram", "telegram".

    Returns:
        A fully formatted caption string, truncated to the platform's character
        limit.
    """
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
    """
    Facebook-only caption to accompany a blurred teaser CARD (not the raw
    drop content). The card image already carries the tease — repeating the
    full confession in the caption text underneath it would spoil the exact
    curiosity gap the card exists to create. `seed` should be the drop_id
    (not the confession) so the hook rotates without ever touching the
    actual text.
    """
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
    """
    TikTok format — maximum 2200 characters.

    Structure:
        [hook — lower case, single line, no period OR with period if it's a statement]
        [blank line]
        [confession in quotes]
        [blank line]
        [CTA]
        [blank line]
        [hashtags]
    """
    cta  = _pick(_TIKTOK_CTAS, confession[-20:])
    body = (
        f"{hook}\n\n"
        f'"{confession}"\n\n'
        f"{cta}\n\n"
        f"{_TIKTOK_TAGS}"
    )
    return body[:2200]


def _facebook_caption(confession: str, hook: str) -> str:
    """
    Facebook format — up to 63k chars, but we keep it digestible.

    Structure:
        [hook — sentence case]
        [blank line]
        [confession in quotes with emoji framing]
        [blank line]
        [CTA with brand context]
        [blank line]
        [2-3 core hashtags only — FB doesn't reward hashtag spam]
    """
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
    """
    Instagram format — maximum 2200 characters.

    Structure:
        [hook — all lower case, poetic line rhythm]
        [blank line]
        [confession — indented with em-dash, no quotes]
        [blank line]
        [minimalist CTA]
        [blank line]
        ·
        [blank line]
        [hashtag block — below the fold on 'more']
    """
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
    """
    Telegram format — long captions are fine (up to ~1024 for media, ~4096
    for text messages), closer in spirit to the Facebook formatter than
    TikTok's hashtag-heavy style. No hashtag spam — Telegram audiences read
    channels more like a newsletter.
    """
    cta = _pick(_TELEGRAM_CTAS, confession[-20:])
    tg_hook = hook[0].upper() + hook[1:] if hook else hook
    body = (
        f"{tg_hook}\n\n"
        f'{_GENERIC_EMOJI} "{confession}"\n\n'
        f"{cta}"
    )
    return body[:1024]
