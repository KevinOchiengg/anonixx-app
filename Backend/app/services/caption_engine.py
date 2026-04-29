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
Platform = Literal["tiktok", "facebook", "instagram"]

# ── Category → emotional tone mapping ───────────────────────────────────────
_CATEGORY_EMOJI: dict[str, str] = {
    "love":                  "💔",
    "fun":                   "✨",
    "friendship":            "🤝",
    "adventure":             "🌍",
    "spicy":                 "🌶️",
    "carrying this alone":   "🌑",
    "starting over":         "🌱",
    "need stability":        "⚓",
    "open to connection":    "🤲",
    "just need to be heard": "🌙",
    "anxiety":               "🫀",
    "depression":            "🌧️",
    "grief":                 "🕯️",
    "addiction":             "🔒",
    "relationships":         "💔",
    "family":                "🏚️",
    "identity":              "🪞",
    "loneliness":            "🌌",
    "trauma":                "🩹",
    "school_career":         "📓",
    "financial":             "💸",
    "lgbtq":                 "🏳️‍🌈",
    "health":                "🩺",
    "wins":                  "✨",
    "sleep":                 "🌙",
    "general":               "💬",
}

# ── Opening hooks (rotate — never the same line twice in a row) ───────────────
# Keyed by category → list of hooks. Falls back to _GENERIC_HOOKS if category
# isn't in the map.
_CATEGORY_HOOKS: dict[str, list[str]] = {
    "love": [
        "someone wrote this about a person who will never read it.",
        "they haven't moved on. they just stopped saying it out loud.",
        "this is what loving someone in silence looks like.",
        "they typed this at 3am and almost deleted it.",
        "some feelings don't have a name. this one almost does.",
    ],
    "carrying this alone": [
        "this person hasn't told a single soul.",
        "some weight is carried alone. this is one of those.",
        "they've been holding this for a long time.",
        "they finally said it. just not to anyone they know.",
        "this is what quiet suffering sounds like.",
    ],
    "just need to be heard": [
        "they're not asking for advice. just for someone to read this.",
        "sometimes you just need one person to hear it.",
        "they dropped this into the void. we're passing it on.",
        "this was never meant to stay silent.",
        "they said the thing they couldn't say anywhere else.",
    ],
    "starting over": [
        "they're rebuilding from scratch. this is where they are.",
        "some people are quietly starting over right now.",
        "this is what a turning point actually feels like.",
        "before the rebuild, there's usually a moment like this.",
        "they're not who they were. they're not yet who they'll be.",
    ],
    "anxiety": [
        "this is what it's like inside their head right now.",
        "anxiety looks like this for some people. you might know them.",
        "they think about this every single day.",
        "their mind doesn't stop. this is what it says.",
        "most people who feel this never say it.",
    ],
    "depression": [
        "they're still showing up. this is what it costs them.",
        "this is the part people don't see.",
        "some days feel like this. they wrote it down.",
        "they look fine. they wrote this.",
        "depression speaks differently than it looks from the outside.",
    ],
    "grief": [
        "grief doesn't look the same for everyone. this is theirs.",
        "they wrote this about someone they lost.",
        "loss changes how you see everything. this is the proof.",
        "some grief never fully goes away. this person knows.",
        "this is the kind of thing you carry without showing it.",
    ],
    "addiction": [
        "they haven't told anyone about this. not one person.",
        "this is the version of the story nobody hears.",
        "they're fighting something privately. this is what they wrote.",
        "some battles are fought completely alone. this is one.",
        "this is what they haven't been able to say out loud.",
    ],
    "loneliness": [
        "this person is surrounded by people and still feels this.",
        "loneliness is louder than most people think.",
        "they dropped this at midnight. read it carefully.",
        "some of the loneliest people are the least likely ones.",
        "this is what isolation actually feels like from the inside.",
    ],
    "identity": [
        "they're still figuring out who they are. this is where they are.",
        "some people are quietly questioning everything right now.",
        "this is what becoming yourself actually feels like.",
        "they wrote this because they couldn't say it to anyone.",
        "identity is rarely a straight line. this is proof.",
    ],
    "relationships": [
        "this is the conversation that never happened.",
        "there's a relationship underneath this that nobody knows about.",
        "they never said this to the person. they said it here.",
        "some things stay unspoken. this almost did.",
        "this was written about someone specific. they'll never know.",
    ],
    "trauma": [
        "this took years to say. they said it anonymously.",
        "some things take a long time to name. they finally did.",
        "this is the thing they've never told anyone.",
        "they wrote this and it cost them something.",
        "this is the part of their story that lives in the dark.",
    ],
    "family": [
        "some things about home are never said at home.",
        "family is complicated. this person knows.",
        "this doesn't leave the family. except it did, here.",
        "they've been holding this about someone they love.",
        "home isn't always safe. sometimes it just looks like it is.",
    ],
}

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


def _hook(confession: str, category: str) -> str:
    pool = _CATEGORY_HOOKS.get(category) or _GENERIC_HOOKS
    return _pick(pool, confession[:40])


# ── Public API ────────────────────────────────────────────────────────────────

def build_caption(confession: str, category: str, platform: Platform) -> str:
    """
    Build a platform-native caption for a confession drop.

    Args:
        confession: The raw confession text.
        category:   The drop's category (e.g. "love", "anxiety").
        platform:   One of "tiktok", "facebook", "instagram".

    Returns:
        A fully formatted caption string, truncated to the platform's character
        limit.
    """
    confession = (confession or "").strip()
    emoji      = _CATEGORY_EMOJI.get(category, "💬")
    hook       = _hook(confession, category)

    if platform == "tiktok":
        return _tiktok_caption(confession, emoji, hook, category)
    if platform == "facebook":
        return _facebook_caption(confession, emoji, hook, category)
    if platform == "instagram":
        return _instagram_caption(confession, emoji, hook, category)

    # Fallback — should never happen
    return _tiktok_caption(confession, emoji, hook, category)


# ── Platform formatters ───────────────────────────────────────────────────────

def _tiktok_caption(confession: str, emoji: str, hook: str, category: str) -> str:
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


def _facebook_caption(confession: str, emoji: str, hook: str, category: str) -> str:
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
        f'{emoji}  "{confession}"\n\n'
        f"{cta}\n\n"
        f"#anonixx #confession #anonymousconfessions"
    )
    return body[:63206]


def _instagram_caption(confession: str, emoji: str, hook: str, category: str) -> str:
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
