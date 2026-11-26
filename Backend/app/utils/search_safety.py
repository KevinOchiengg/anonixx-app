"""Searches that must never return anything: minors, non-consent, bestiality and the like.
Matching is done on a folded copy of the query (lowercase, leetspeak undone, separators and
repeated letters squeezed), so "t33n", "t.e.e.n" and "teeeen" all match "teen"."""
import re
from datetime import datetime, timezone
from typing import Optional

# Always blocked (whole words, after folding).
_HARD = {
    "teen", "teens", "teenage", "teenager", "underage", "under age", "preteen", "pre teen", "jailbait", "loli",
    "lolita", "shota", "schoolgirl", "school girl", "schoolboy", "school boy", "young girl", "young boy",
    "little girl", "little boy", "cp", "pthc", "pedo", "pedophile", "paedo", "kiddie", "barely legal",
    "high school girl", "msichana mdogo",
    *{f"{n} yo" for n in range(1, 18)}, *{f"{n} year old" for n in range(1, 18)},
    *{f"{n} years old" for n in range(1, 18)},
    "rape", "raped", "raping", "rapist", "non consent", "nonconsent", "noncon", "drugged", "molest", "molested",
    "incest", "kubaka", "alibakwa", "bestiality", "zoophilia", "animal sex", "snuff", "revenge porn",
    "hidden cam", "hidden camera", "upskirt", "spycam", "spy cam", "leaked nudes",
}
# Everyday words ("my kids", "child support") blocked only next to a sexual word.
_SOFT = {
    "minor", "minors", "child", "children", "kid", "kids", "toddler", "infant", "baby", "mtoto", "watoto",
    "kijana mdogo", "form one", "form two", "form three", "form four", "primary school", "high school",
    "forced", "force", "unconscious", "passed out", "asleep", "sleeping", "kulazimishwa", "daughter", "son",
    "niece", "nephew", "stepdaughter", "stepson", "sister", "brother", "mum", "mom", "dad",
}
_SEXUAL = {
    "sex", "sexy", "porn", "porno", "nude", "nudes", "naked", "fuck", "fucking", "horny", "hookup", "hook up",
    "pussy", "dick", "cock", "boobs", "tits", "xxx", "erotic", "blowjob", "anal", "cum", "orgasm", "strip",
    "kinky", "fetish", "nsfw", "onlyfans", "leaked", "video", "videos", "pics", "kuma", "mboo", "kutombana",
}

_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"})
_SEP = re.compile(r"[^a-z0-9 ]+")
_REPEAT = re.compile(r"([a-z])\1{2,}")


def _rx(words: set) -> re.Pattern:
    return re.compile(r"\b(?:" + "|".join(re.escape(w) for w in sorted(words, key=len, reverse=True)) + r")\b")


_HARD_RX, _SOFT_RX, _SEXUAL_RX = _rx(_HARD), _rx(_SOFT), _rx(_SEXUAL)


def fold(text: str) -> str:
    t = (text or "").lower()
    t = re.sub(r"(?<=\d)\s*(?=yo\b)", " ", t)          # keep "16yo" readable before leet folding
    digits_kept = re.sub(r"[^\w\s]", " ", t)
    t = digits_kept.translate(_LEET)
    t = _SEP.sub(" ", t)
    t = re.sub(r"\b(?:\w )+\w\b", lambda m: m.group(0).replace(" ", ""), t)   # "t e e n" -> "teen"
    t = _REPEAT.sub(r"\1\1", t)
    return re.sub(r"\s+", " ", t).strip()


def blocked(query: str) -> Optional[str]:
    """The matched term when the search is not allowed, else None."""
    raw = re.sub(r"\s+", " ", (query or "").lower())
    for text in (fold(query), raw):
        m = _HARD_RX.search(text)
        if m:
            return m.group(0)
        soft = _SOFT_RX.search(text)
        if soft and _SEXUAL_RX.search(text):
            return soft.group(0)
        if re.search(r"\b(1[0-7]|[1-9])\s*(yo|y o|yrs?|years?)\b", text):
            return "age under 18"
    return None


async def flag(db, query: str, term: str, viewer_key: Optional[str]) -> None:
    """Log a blocked search for admin review. Never raises."""
    try:
        await db["search_flags"].insert_one({
            "query": (query or "")[:200], "term": term, "viewer_key": viewer_key,
            "created_at": datetime.now(timezone.utc), "reviewed": False,
        })
    except Exception:
        pass
