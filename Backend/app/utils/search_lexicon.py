"""
Search lexicon: turns a typed query in English, Swahili or Sheng into
structured discovery filters, without any AI call (queries never leave the
server).

  "dem wa Kisumu"           -> surface near, gender woman, county Kisumu
  "stories za heartbreak"   -> surface stories, topic heartbreak
  "jamaa Nairobi tonight"   -> surface near, gender man, county Nairobi, fresh tonight

Every match comes back as a chip the client shows and the user can remove,
so a wrong guess is one tap away from being undone. Words that matched
nothing stay in `keyword` and are searched as plain text. Slang is curated
here, one meaning per entry; ambiguous words ("bae", "sponsor") are left out
on purpose.
"""
import re
from typing import Optional

from app.utils.countries import known_country

# ── surfaces ──
NEAR_WORDS = {"near", "nearby", "karibu", "hookup", "hookups", "link up", "linkup", "connect", "date", "dating",
              "meet", "kukutana"}
STORY_WORDS = {"story", "stories", "confession", "confessions", "siri", "secret", "secrets", "stori", "storo"}

# ── who (the person you want to find) ──
GENDER_WORDS = {
    "woman": {"dem", "demu", "manzi", "msupa", "mrembo", "chick", "chicks", "lady", "ladies", "woman", "women",
              "girl", "girls", "mwanamke", "wanawake", "binti", "supuu"},
    "man": {"jamaa", "msee", "masee", "boy", "boys", "guy", "guys", "man", "men", "mwanaume", "wanaume", "kijana",
            "chali", "buda"},
}

# ── freshness ──
FRESH_WORDS = {
    "tonight": {"tonight", "leo usiku", "usiku huu"},
    "weekend": {"weekend", "wikendi", "wiikend", "saturday", "jumamosi", "sunday", "jumapili"},
    "week": {"this week", "wiki hii", "week"},
}

# ── topics / moods (Stories). Matched against post text and the author's tags. ──
TOPICS = {
    "heartbreak": {"heartbreak", "heartbroken", "broken heart", "broke up", "breakup", "break up", "dumped",
                   "kuachwa", "aliniacha", "moyo", "nimevunjika"},
    "regret":     {"regret", "regrets", "majuto", "wish i hadn't", "should have", "nasikitika"},
    "secrets":    {"secret", "secrets", "siri", "nobody knows", "never told", "hidden", "sijawahi mwambia"},
    "love":       {"love", "in love", "crush", "mapenzi", "penzi", "nakupenda", "romance"},
    "betrayal":   {"cheat", "cheated", "cheating", "betray", "betrayed", "betrayal", "affair", "side chick",
                   "mpango wa kando", "kunichiti", "alinichiti", "unfaithful"},
    "funny":      {"funny", "lol", "haha", "hilarious", "vituko", "kuchekesha", "ucheshi"},
    "relief":     {"relief", "relieved", "finally", "free at last", "nimepona", "peace", "amani"},
    "confusion":  {"confused", "confusing", "sijui", "don't know what to do", "conflicted", "nimechanganyikiwa"},
    "family":     {"family", "familia", "mum", "mom", "mother", "dad", "father", "wazazi", "sister",
                   "brother", "dada", "kaka"},
    "money":      {"money", "pesa", "doh", "broke", "debt", "loan", "deni", "salary", "mshahara"},
    "work":       {"work", "job", "boss", "office", "kazi", "ofisi", "colleague"},
    "school":     {"school", "campus", "uni", "university", "college", "chuo", "shule", "lecturer"},
    "desire":     {"desire", "fantasy", "fantasies", "tamaa"},
    "happiness":  {"happy", "happiness", "joy", "joyful", "excited", "grateful", "blessed", "furaha", "nimefurahi"},
    "anger":      {"angry", "anger", "furious", "pissed", "rage", "hasira", "nimekasirika", "nimechoka na"},
    "growth":     {"growth", "healing", "healed", "lesson", "learned", "moving on", "better person", "self love",
                   "nimekua", "nimejifunza"},
    "relationships": {"relationship", "relationships", "boyfriend", "girlfriend", "bf", "gf", "husband", "wife",
                      "marriage", "married", "partner", "mpenzi", "bibi yangu", "bwana yangu", "ex", "situationship"},
    "friendship": {"friend", "friends", "friendship", "bestie", "best friend", "bff", "rafiki", "marafiki", "beste"},
}
# Stories filters, in display order. Authors can pick up to MAX_TOPICS of these
# when posting (drops.topics); untagged posts are still found by their words.
MOODS = ("heartbreak", "love", "secrets", "regret", "betrayal", "happiness", "anger", "relief", "confusion",
         "funny", "growth")
STORY_TOPICS = ("relationships", "friendship", "family", "work", "money", "school", "desire")
STORY_TAGS = set(MOODS) | set(STORY_TOPICS)
MAX_TOPICS = 3
TOPIC_LABELS = {k: k.capitalize() for k in TOPICS} | {"growth": "Personal growth"}


def clean_topics(values) -> list:
    """An author's picks, known ids only, at most MAX_TOPICS, order kept."""
    return [t for t in dict.fromkeys(values or []) if t in STORY_TAGS][:MAX_TOPICS]

# ── places ──
KENYA_COUNTIES = [
    "Mombasa", "Kwale", "Kilifi", "Tana River", "Lamu", "Taita-Taveta", "Garissa", "Wajir", "Mandera", "Marsabit",
    "Isiolo", "Meru", "Tharaka-Nithi", "Embu", "Kitui", "Machakos", "Makueni", "Nyandarua", "Nyeri", "Kirinyaga",
    "Murang'a", "Kiambu", "Turkana", "West Pokot", "Samburu", "Trans Nzoia", "Uasin Gishu", "Elgeyo-Marakwet",
    "Nandi", "Baringo", "Laikipia", "Nakuru", "Narok", "Kajiado", "Kericho", "Bomet", "Kakamega", "Vihiga",
    "Bungoma", "Busia", "Siaya", "Kisumu", "Homa Bay", "Migori", "Kisii", "Nyamira", "Nairobi",
]
# Towns and neighbourhoods people actually type -> (country, county/region).
TOWNS = {
    "nai": ("Kenya", "Nairobi"), "nairobbery": ("Kenya", "Nairobi"), "westlands": ("Kenya", "Nairobi"),
    "kilimani": ("Kenya", "Nairobi"), "kasarani": ("Kenya", "Nairobi"), "rongai": ("Kenya", "Kajiado"),
    "kitengela": ("Kenya", "Kajiado"), "ngong": ("Kenya", "Kajiado"), "thika": ("Kenya", "Kiambu"),
    "ruiru": ("Kenya", "Kiambu"), "juja": ("Kenya", "Kiambu"), "kikuyu": ("Kenya", "Kiambu"),
    "eldoret": ("Kenya", "Uasin Gishu"), "naivasha": ("Kenya", "Nakuru"), "malindi": ("Kenya", "Kilifi"),
    "diani": ("Kenya", "Kwale"), "watamu": ("Kenya", "Kilifi"), "nanyuki": ("Kenya", "Laikipia"),
    "kisii town": ("Kenya", "Kisii"), "msa": ("Kenya", "Mombasa"), "ksm": ("Kenya", "Kisumu"),
    "kampala": ("Uganda", "Kampala"), "entebbe": ("Uganda", "Wakiso"), "dar": ("Tanzania", "Dar es Salaam"),
    "dar es salaam": ("Tanzania", "Dar es Salaam"), "arusha": ("Tanzania", "Arusha"),
    "kigali": ("Rwanda", "Kigali"), "lagos": ("Nigeria", "Lagos"), "abuja": ("Nigeria", "FCT"),
    "accra": ("Ghana", "Greater Accra"), "johannesburg": ("South Africa", "Gauteng"),
    "joburg": ("South Africa", "Gauteng"), "cape town": ("South Africa", "Western Cape"),
    "london": ("United Kingdom", "London"), "dubai": ("United Arab Emirates", "Dubai"),
}
_COUNTY_KEYS = {c.lower(): c for c in KENYA_COUNTIES} | {c.lower().replace("-", " "): c for c in KENYA_COUNTIES}

# Glue words dropped from the leftover keyword.
STOP = {"wa", "za", "ya", "la", "kwa", "na", "in", "from", "the", "a", "an", "at", "of", "for", "about", "kuhusu",
        "looking", "natafuta", "want", "who", "any", "some", "nipe", "show", "me", "find", "around", "area"}


# ── normalisation ──
# Common spellings people type, mapped to the dictionary's spelling (word level).
VARIANTS = {
    "luv": "love", "lov": "love", "luvv": "love", "hartbreak": "heartbreak", "hertbreak": "heartbreak",
    "heartbrake": "heartbreak", "stori": "stories", "storo": "stories", "storis": "stories",
    "confesion": "confession", "confessionz": "confessions", "secrit": "secret", "secretz": "secrets",
    "freind": "friend", "frend": "friend", "famili": "family", "relationshp": "relationship",
    "2nite": "tonight", "tonite": "tonight", "2night": "tonight", "wknd": "weekend", "wikend": "weekend",
    "nrb": "nairobi", "nai": "nairobi", "kisumo": "kisumu",
}

# Words with more than one everyday meaning. They never become a filter on their
# own; the client offers them as a one-tap suggestion instead.
#   word -> (chip kind, value, label)
AMBIGUOUS = {
    "mama": ("topic", "family", "Family"), "baba": ("topic", "family", "Family"),
    "bae": ("topic", "love", "Love"), "lost": ("topic", "confusion", "Confusion"),
    "mad": ("topic", "anger", "Anger"), "sorry": ("topic", "regret", "Regret"),
    "nataka": ("topic", "desire", "Desire"), "now": ("fresh", "tonight", "Tonight"),
    "sasa": ("fresh", "tonight", "Tonight"), "today": ("fresh", "tonight", "Tonight"), "leo": ("fresh", "tonight", "Tonight"),
}

# Soft synonyms: a typed word also matches the others in its group when searching
# post text. Never a filter. Add a set to teach search a new word.
SYNONYMS = [
    {"miss you", "missing you", "i miss", "nimekumiss", "nakumiss", "nimekumis", "nakumis", "kumiss", "nimekukosa", "miss"},
    {"cheat", "cheated", "cheating", "chiti", "kunichiti", "alinichiti", "amenichiti", "cheats"},
    {"love", "mapenzi", "penzi", "nakupenda", "in love"},
    {"money", "pesa", "doh", "ganji", "mullah", "cash", "broke"},
    {"sad", "huzuni", "nimeumia", "hurt", "hurting", "pain"},
    {"crush", "nimekupenda", "i like you"},
    {"drunk", "tipsy", "nimelewa", "high"},
    {"party", "sherehe", "bash", "club", "clubbing"},
    {"friend", "rafiki", "bestie", "best friend", "msee wangu"},
    {"work", "kazi", "job", "boss", "ofisi", "office"},
    {"school", "campus", "chuo", "shule", "uni"},
    {"family", "familia", "wazazi", "parents"},
    {"secret", "siri", "nobody knows"},
    {"tired", "nimechoka", "exhausted", "fed up"},
]
_SYN_INDEX: dict = {}
for _group in SYNONYMS:
    for _w in _group:
        _SYN_INDEX.setdefault(_w, set()).update(_group)

# Too common to search on by themselves.
KEYWORD_STOP = STOP | {"i", "my", "is", "it", "to", "and", "was", "you", "me", "am", "im", "i'm", "so", "but", "or",
                       "ni", "si", "nime", "yangu", "wangu", "yake", "this", "that", "with", "on", "be", "are"}


def normalize(text: str) -> str:
    """Lowercase, drop accents and stray punctuation, squeeze letters typed 3+ times."""
    import unicodedata
    t = unicodedata.normalize("NFKD", (text or "").replace("\u2019", "'"))
    t = "".join(ch for ch in t if not unicodedata.combining(ch)).lower()
    t = re.sub(r"[^\w\s'-]", " ", t)
    t = re.sub(r"(\w)\1{2,}", r"\1", t)             # heartbreakkk -> heartbreak, sooo -> so
    t = re.sub(r"\s+", " ", t).strip()
    return " ".join(VARIANTS.get(w, w) for w in t.split())


def _phrases(text: str, n_max: int = 4) -> list:
    words = text.split()
    out = []
    for n in range(n_max, 0, -1):
        for i in range(len(words) - n + 1):
            out.append((i, i + n, " ".join(words[i:i + n])))
    return out


def parse(query: str) -> dict:
    """Structured reading of a query. Longest phrases win; each word is used once.
    `chips` are applied filters (removable); `suggest` are ambiguous readings the
    user can tap to apply; `keyword` is what's left to search as text."""
    text = normalize(query)
    words = text.split()
    used = [False] * len(words)
    out: dict = {"query": (query or "").strip()[:120], "surface": None, "gender": None, "country": None,
                 "county": None, "topic": None, "fresh": None, "keyword": "", "chips": [], "suggest": []}

    def take(i: int, j: int) -> bool:
        if any(used[i:j]):
            return False
        for k in range(i, j):
            used[k] = True
        return True

    for i, j, ph in _phrases(text):
        if any(used[i:j]):
            continue
        if not out["county"] and (ph in _COUNTY_KEYS or ph in TOWNS):
            country, county = ("Kenya", _COUNTY_KEYS[ph]) if ph in _COUNTY_KEYS else TOWNS[ph]
            if take(i, j):
                out["country"], out["county"] = country, county
                out["chips"].append({"kind": "place", "value": county, "label": county})
            continue
        if not out["country"] and known_country(ph):
            if take(i, j):
                out["country"] = known_country(ph)
                out["chips"].append({"kind": "country", "value": out["country"], "label": out["country"]})
            continue
        if not out["gender"]:
            g = next((g for g, ws in GENDER_WORDS.items() if ph in ws), None)
            if g and take(i, j):
                out["gender"] = g
                out["chips"].append({"kind": "gender", "value": g, "label": "Women" if g == "woman" else "Men"})
                continue
        if not out["fresh"]:
            f = next((f for f, ws in FRESH_WORDS.items() if ph in ws), None)
            if f and take(i, j):
                out["fresh"] = f
                out["chips"].append({"kind": "fresh", "value": f, "label": {"tonight": "Tonight", "weekend": "This weekend", "week": "This week"}[f]})
                continue
        if not out["topic"]:
            t = next((t for t, ws in TOPICS.items() if ph in ws), None)
            if t and take(i, j):
                out["topic"] = t
                out["chips"].append({"kind": "topic", "value": t, "label": TOPIC_LABELS[t]})
                continue
        if not out["surface"]:
            if ph in STORY_WORDS and take(i, j):
                out["surface"] = "stories"
            elif ph in NEAR_WORDS and take(i, j):
                out["surface"] = "near"

    for k, w in enumerate(words):
        if used[k] or w not in AMBIGUOUS:
            continue
        kind, value, label = AMBIGUOUS[w]
        if (kind == "topic" and out["topic"]) or (kind == "fresh" and out["fresh"]):
            continue
        if not any(x["kind"] == kind and x["value"] == value for x in out["suggest"]):
            out["suggest"].append({"kind": kind, "value": value, "label": label, "from": w})

    # A person or a place points at Near; a topic at Stories. An explicit word wins.
    if not out["surface"]:
        if out["gender"] or out["fresh"]:
            out["surface"] = "near"
        elif out["topic"]:
            out["surface"] = "stories"
    out["keyword"] = " ".join(w for k, w in enumerate(words) if not used[k] and w not in STOP)[:80]
    return out


def keyword_terms(keyword: str) -> list:
    """The keyword as search terms: each a list of alternatives (the word plus its
    synonyms). Known phrases ("miss you") count as one term; filler words are dropped."""
    words = normalize(keyword).split()
    used = [False] * len(words)
    terms: list = []
    for i, j, ph in _phrases(" ".join(words), 3):
        if any(used[i:j]) or ph not in _SYN_INDEX:
            continue
        for k in range(i, j):
            used[k] = True
        terms.append(sorted(_SYN_INDEX[ph], key=len, reverse=True))
    for k, w in enumerate(words):
        if not used[k] and w not in KEYWORD_STOP and len(w) > 1:
            terms.append([w])
    return terms[:6]


def keyword_filter(keyword: str, fields: list) -> tuple:
    """(strict, loose) Mongo filters: strict needs every term, loose any one.
    Matching is on word starts, so "cheat" finds "cheated" but "is" doesn't match "this"."""
    terms = keyword_terms(keyword)
    if not terms:
        return None, None
    conds = []
    for alts in terms:
        rx = {"$regex": r"\b(?:" + "|".join(re.escape(a) for a in alts) + ")", "$options": "i"}
        conds.append({"$or": [{f: rx} for f in fields]})
    strict = conds[0] if len(conds) == 1 else {"$and": conds}
    loose = None if len(conds) == 1 else {"$or": conds}
    return strict, loose


def topic_regex(topic: Optional[str]) -> Optional[str]:
    """Case-insensitive pattern matching any of a topic's words, on word boundaries."""
    words = TOPICS.get(topic or "")
    if not words:
        return None
    return r"\b(?:" + "|".join(re.escape(w) for w in sorted(words, key=len, reverse=True)) + r")\b"


# ── suggestions ──
# Starter phrases shown while typing. Curated, never built from posts or people,
# so a suggestion can't reveal that someone or something exists.
STARTERS = {
    "near": ["dem wa Nairobi", "jamaa Mombasa tonight", "msupa Kisumu", "women this weekend", "men tonight",
             "can host Nairobi", "manzi Nakuru"],
    "stories": ["stories za heartbreak", "nimekumiss", "alinichiti", "family secrets", "work stress",
                "personal growth", "funny confessions", "siri yangu"],
}
CONNECTION_SUGGESTIONS = [
    ("women", {"kind": "gender", "value": "woman", "label": "Women"}),
    ("men", {"kind": "gender", "value": "man", "label": "Men"}),
    ("tonight", {"kind": "fresh", "value": "tonight", "label": "Tonight"}),
    ("this weekend", {"kind": "fresh", "value": "weekend", "label": "This weekend"}),
    ("this week", {"kind": "fresh", "value": "week", "label": "This week"}),
]


def suggest(prefix: str, surface: str = "near", limit: int = 8) -> list:
    """Suggestions for what's typed so far. Each is {label, kind, apply?, text?}:
    `apply` is a chip the client applies directly; `text` fills the search box."""
    q = normalize(prefix)
    out: list = []
    seen: set = set()

    def add(item: dict) -> None:
        key = (item.get("kind"), item["label"].lower())
        if key not in seen and len(out) < limit:
            seen.add(key)
            out.append(item)

    def starts(name: str) -> bool:
        n = name.lower()
        return bool(q) and (n.startswith(q) or any(w.startswith(q) for w in n.split()))

    if not q:
        for t in STARTERS.get(surface, [])[:5]:
            add({"kind": "phrase", "label": t, "text": t})
        return out
    # connection words typed in slang count too ("dem" -> Women)
    for g, ws in GENDER_WORDS.items():
        if any(w.startswith(q) for w in ws) and len(q) >= 2:
            label = "Women" if g == "woman" else "Men"
            add({"kind": "gender", "label": label, "apply": {"kind": "gender", "value": g, "label": label}})
    for name, chip in CONNECTION_SUGGESTIONS:
        if starts(name):
            add({"kind": chip["kind"], "label": chip["label"], "apply": chip})
    places = [(c, ("Kenya", c)) for c in KENYA_COUNTIES] + [(t.title(), v) for t, v in TOWNS.items() if len(t) > 3]
    for name, (country, county) in places:
        if starts(name):
            add({"kind": "place", "label": f"{county}, {country}" if name.lower() == county.lower() else f"{name} ({county})",
                 "apply": {"kind": "place", "value": county, "country": country, "label": county}})
    for c in sorted(_COUNTRY_NAMES):
        if starts(c):
            add({"kind": "country", "label": c, "apply": {"kind": "country", "value": c, "label": c}})
    for t in MOODS + STORY_TOPICS:
        if starts(TOPIC_LABELS[t]) or any(w.startswith(q) for w in TOPICS[t] if len(q) >= 3):
            add({"kind": "topic", "label": TOPIC_LABELS[t], "apply": {"kind": "topic", "value": t, "label": TOPIC_LABELS[t]}})
    for t in STARTERS["near"] + STARTERS["stories"]:
        if t.lower().startswith(q):
            add({"kind": "phrase", "label": t, "text": t})
    return out


def _countries() -> set:
    from app.utils import countries as c
    names = getattr(c, "_CANONICAL", {})
    return set(names.values()) if isinstance(names, dict) else set()


_COUNTRY_NAMES = _countries()


def place_from_area(area: str) -> Optional[dict]:
    """A structured place from the free-text area on a hookup post ("Westlands",
    "Kisumu CBD", "Kampala"), or None. A town or neighbourhood we know becomes the
    sub-county; nothing finer (no estates, no coordinates)."""
    text = normalize(area)
    if not text:
        return None
    for _, _, ph in _phrases(text):
        if ph in TOWNS and ph not in _COUNTY_KEYS:
            country, county = TOWNS[ph]
            sub = None if ph in ("nai", "nairobbery", "msa", "ksm", "dar") else ph.title()
            return {"country": country, "county": county, "sub_county": sub, "estate": None}
        if ph in _COUNTY_KEYS:
            return {"country": "Kenya", "county": _COUNTY_KEYS[ph], "sub_county": None, "estate": None}
    for _, _, ph in _phrases(text):
        c = known_country(ph)
        if c:
            return {"country": c, "county": None, "sub_county": None, "estate": None}
    return None
