"""
app/utils/ai_refine.py

AI-assisted confession refinement for Anonixx Drops.

Uses Anthropic Claude (claude-3-5-haiku) to help users express their feelings
with greater emotional clarity — without changing their original meaning.

Three modes (emotionally framed, not task-framed):
  holding_back  — removes the filter, surfaces suppressed emotion
  distill       — cuts to the single most powerful feeling
  find_words    — reconstructs with more emotional precision

The AI is prompted to write like a real person at 2am — never a writing coach.
Output is always raw, human, slightly imperfect.
"""

import httpx
import logging
from typing import Optional

from app.config import settings

log = logging.getLogger(__name__)

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
MODEL             = "claude-3-5-haiku-20241022"
MAX_TOKENS        = 400

# ── Refinement modes ─────────────────────────────────────────────────────────

MODES: dict[str, dict] = {
    "holding_back": {
        "label":       "I'm holding back — say it fully",
        "instruction": (
            "This person is filtering themselves. They feel more than they're saying. "
            "Help them say the thing they're afraid to say. "
            "Make it more vulnerable, more specific, more emotionally honest. "
            "Don't add drama — remove the wall. Keep their exact voice. "
            "Just take the filter off."
        ),
    },
    "distill": {
        "label":       "Get to the heart of it",
        "instruction": (
            "This person said too much or lost the thread. "
            "Find the single most powerful feeling buried in their words and say only that. "
            "Cut everything that isn't essential. "
            "The shorter, more distilled version should hit harder than the original."
        ),
    },
    "find_words": {
        "label":       "Find the words for me",
        "instruction": (
            "This person knows exactly what they feel but can't articulate it clearly. "
            "Reconstruct this confession into something that captures the core emotion "
            "with more precision and impact. "
            "Stay completely true to their intent — just say it better."
        ),
    },
}

# ── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a ghostwriter for Anonixx — an anonymous confession platform where people \
say things they can't say out loud.

Your job: take a user's raw confession and refine it so it hits harder, feels more \
true, and lands more deeply — while keeping their voice and intent completely intact.

NON-NEGOTIABLE RULES:
- Never change what they mean. Only change how clearly it's expressed.
- Keep it raw and human. Imperfect grammar is fine. Short sentences are fine.
- Never use polished, therapeutic, corporate, or self-help language.
- Never add phrases like "I realize", "I've come to understand", "deep down I know".
- Write like a real person at 2am — not a writing coach, not a therapist.
- Match or go shorter than the original length. Never pad it out.
- Preserve the original perspective (first person stays first person, etc.)
- Output ONLY the refined confession. No preamble, no explanation, no quotes.\
"""


# ── Main function ─────────────────────────────────────────────────────────────

async def refine_confession(confession: str, mode: str) -> Optional[str]:
    """
    Call Anthropic Claude to refine a confession.

    Returns the refined text string, or None if:
      - ANTHROPIC_API_KEY is not configured
      - The API call fails or times out
      - The mode is unrecognised

    Callers should treat None as "refinement unavailable" and surface
    the original confession unchanged.
    """
    api_key = settings.ANTHROPIC_API_KEY
    if not api_key:
        log.warning("ai_refine: ANTHROPIC_API_KEY not set — skipping")
        return None

    mode_config = MODES.get(mode)
    if not mode_config:
        log.warning("ai_refine: unknown mode '%s'", mode)
        return None

    user_prompt = (
        f"Refinement instruction: {mode_config['instruction']}\n\n"
        f"Original confession:\n{confession.strip()}"
    )

    payload = {
        "model":    MODEL,
        "max_tokens": MAX_TOKENS,
        "system":   _SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_prompt}],
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                ANTHROPIC_API_URL,
                json=payload,
                headers={
                    "x-api-key":          api_key,
                    "anthropic-version":  "2023-06-01",
                    "content-type":       "application/json",
                },
            )

        if response.status_code != 200:
            log.error(
                "ai_refine: API returned %s — %s",
                response.status_code,
                response.text[:200],
            )
            return None

        data    = response.json()
        content = data.get("content", [])
        if content and content[0].get("type") == "text":
            refined = content[0]["text"].strip()

            # Safety gate: never return something >2× longer than the original
            # (the model hallucinated / went off-rails)
            if len(refined) > len(confession) * 2.2:
                log.warning(
                    "ai_refine: output suspiciously long (%d chars vs %d original) — returning original",
                    len(refined), len(confession),
                )
                return confession

            return refined

    except httpx.TimeoutException:
        log.warning("ai_refine: request timed out for mode '%s'", mode)
    except Exception as exc:
        log.error("ai_refine: unexpected error — %s", exc)

    return None
