"""
app/services/card_generator.py

Server-side teaser card generator — the "blurred teaser" growth hook.

Auto-posting to social needs SOMETHING visual for every drop (Instagram
can't post text-only at all; Facebook/Telegram engagement drops without an
image). Rather than post the raw content, this renders a small branded
card: the confession is teased/cut mid-thought, and any attached image or
video thumbnail is Gaussian-blurred behind the text with a lock icon and
"Unlock on Anonixx" caption — the unblur becomes the click-through hook.

This is a simplified, server-side approximation of
Frontend/src/components/drops/DropCardRenderer.jsx's visual language (all
3 curated theme gradients) — not a pixel-perfect port. Uses Pillow's
built-in scalable default font so no font asset needs to be bundled or
linked.
"""

import io
import logging
from typing import Optional

import httpx
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import cloudinary
import cloudinary.uploader

from app.config import settings

log = logging.getLogger(__name__)

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
)

CARD_SIZE = 1080

# Ported directly from DropCardRenderer.jsx's DROP_THEMES (bgFrom, bgTo,
# textColor) — kept in exact sync with the frontend's 3 curated themes and
# Backend/app/api/v1/drops.py's TIER_1_THEMES/TIER_2_THEMES.
_THEME_GRADIENTS: dict[str, tuple[tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]]] = {
    "desire":       ((20, 6, 10),  (42, 15, 24), (246, 230, 236)),
    "after-dark":   ((8, 2, 12),   (26, 8, 36),  (238, 221, 255)),
    "midnight-sin": ((2, 3, 10),   (10, 4, 24),  (242, 216, 228)),
}
_DEFAULT_GRADIENT = _THEME_GRADIENTS["desire"]


def _lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def _gradient_background(theme: str) -> Image.Image:
    top, bottom, _ = _THEME_GRADIENTS.get(theme, _DEFAULT_GRADIENT)
    img = Image.new("RGB", (CARD_SIZE, CARD_SIZE))
    px = img.load()
    for y in range(CARD_SIZE):
        t = y / CARD_SIZE
        row = (_lerp(top[0], bottom[0], t), _lerp(top[1], bottom[1], t), _lerp(top[2], bottom[2], t))
        for x in range(CARD_SIZE):
            px[x, y] = row
    return img


def _tease(confession: str, limit: int = 140) -> str:
    """Cut a confession mid-thought at the nearest punctuation before `limit`."""
    text = (confession or "").strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    for punct in (". ", "! ", "? ", ", "):
        idx = cut.rfind(punct)
        if idx > limit * 0.4:
            return cut[:idx + 1].strip() + "…"
    return cut.strip() + "…"


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=font) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


async def _fetch_thumbnail(url: str) -> Optional[Image.Image]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(url)
            res.raise_for_status()
            return Image.open(io.BytesIO(res.content)).convert("RGB")
    except Exception as e:
        log.warning("card_generator: failed to fetch media thumbnail %s: %s", url, e)
        return None


async def generate_teaser_card(drop: dict) -> bytes:
    """
    Render a blurred/teased social teaser card for a drop.
    Returns JPEG bytes.
    """
    theme = drop.get("theme") or "desire"
    _, _, text_color = _THEME_GRADIENTS.get(theme, _DEFAULT_GRADIENT)

    card = _gradient_background(theme)

    # Blurred media backdrop, if the drop has a preview image (poster frame
    # for videos, direct URL for images) — this is the "blur the content"
    # curiosity-gap hook.
    preview_url = drop.get("card_image_url")
    if preview_url:
        thumb = await _fetch_thumbnail(preview_url)
        if thumb:
            thumb = thumb.resize((CARD_SIZE, CARD_SIZE))
            thumb = thumb.filter(ImageFilter.GaussianBlur(radius=22))
            card = Image.blend(card, thumb, alpha=0.65)

    draw = ImageDraw.Draw(card)

    # Dark scrim so text stays legible over whatever's behind it.
    scrim = Image.new("RGBA", card.size, (0, 0, 0, 90))
    card = Image.alpha_composite(card.convert("RGBA"), scrim).convert("RGB")
    draw = ImageDraw.Draw(card)

    body_font = ImageFont.load_default(size=54)
    small_font = ImageFont.load_default(size=32)

    teased = _tease(drop.get("confession") or "")
    if not teased:
        teased = "someone dropped a confession…"

    lines = _wrap_text(draw, teased, body_font, CARD_SIZE - 160)
    total_h = len(lines) * 68
    y = (CARD_SIZE - total_h) // 2 - 60
    for line in lines:
        w = draw.textlength(line, font=body_font)
        draw.text(((CARD_SIZE - w) / 2, y), line, font=body_font, fill=text_color)
        y += 68

    # Lock badge + CTA near the bottom.
    lock_cx, lock_cy, r = CARD_SIZE / 2, CARD_SIZE - 170, 30
    draw.ellipse([lock_cx - r, lock_cy - r, lock_cx + r, lock_cy + r], outline=text_color, width=4)
    draw.rectangle([lock_cx - 14, lock_cy - 4, lock_cx + 14, lock_cy + 20], outline=text_color, width=4)

    cta = "unlock on anonixx"
    w = draw.textlength(cta, font=small_font)
    draw.text(((CARD_SIZE - w) / 2, CARD_SIZE - 110), cta, font=small_font, fill=text_color)

    buf = io.BytesIO()
    card.save(buf, format="JPEG", quality=88)
    return buf.getvalue()


def upload_teaser_card(image_bytes: bytes, drop_id: str) -> Optional[str]:
    """Upload the generated teaser JPEG to Cloudinary, return its secure URL."""
    try:
        result = cloudinary.uploader.upload(
            io.BytesIO(image_bytes),
            resource_type="image",
            folder="drop_teasers",
            public_id=f"teaser_{drop_id}",
            overwrite=True,
        )
        return result.get("secure_url")
    except Exception as e:
        log.warning("card_generator: Cloudinary upload failed for drop %s: %s", drop_id, e)
        return None
