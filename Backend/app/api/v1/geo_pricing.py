"""
geo_pricing.py — IP Geolocation + PPP Pricing Config

GET /geo/config  →  {
    country_code, tier, show_mpesa, show_stripe, packages
}

Package shape per item:
  { id, coins, label, tag,
    display_price,           ← what to show the user
    kes?,                    ← only if is_mpesa_country
    stripe_amount,           ← USD cents (for Stripe PaymentIntent)
    stripe_currency,         ← "usd"
    stripe_display }         ← "$1.99"

Pricing tiers:
  Tier 1 (developed):  USD at full price   ($0.99 / $1.99 / $3.99 / $6.99)
  Tier 2 (emerging):   USD at PPP discount ($0.49 / $0.99 / $1.99 / $3.49)
  Tier 3 (M-Pesa):     KES via M-Pesa      (KES 50 / 100 / 250 / 500)
                        USD via Stripe card (Tier 2 USD as fallback)

IP lookup: local DB-IP country database (app/utils/geoip.py) — no per-request
external call or rate limit.
"""

from fastapi import APIRouter, Request, Depends
from app.dependencies import get_current_user_id
from app.utils import geoip

router = APIRouter(prefix="/geo", tags=["geo"])

# ─── Country sets & tier map ──────────────────────────────────────────────────

MPESA_COUNTRIES: frozenset[str] = frozenset({
    "KE", "TZ", "UG", "RW", "CD", "MZ", "ET", "LS", "GH", "EG",
})

TIER_MAP: dict[str, int] = {
    # Tier 1 — Developed economies
    "US": 1, "GB": 1, "CA": 1, "AU": 1, "NZ": 1,
    "DE": 1, "FR": 1, "IT": 1, "ES": 1, "NL": 1,
    "BE": 1, "CH": 1, "AT": 1, "SE": 1, "NO": 1,
    "DK": 1, "FI": 1, "IE": 1, "PT": 1, "LU": 1,
    "JP": 1, "KR": 1, "SG": 1, "HK": 1, "TW": 1,
    "AE": 1, "QA": 1, "SA": 1, "KW": 1, "BH": 1,
    "IS": 1, "LI": 1, "MC": 1, "SM": 1,
    # Tier 2 — Emerging / mid-income
    "NG": 2, "IN": 2, "BR": 2, "PK": 2, "ZA": 2,
    "MX": 2, "TR": 2, "AR": 2, "CO": 2, "CL": 2,
    "PH": 2, "ID": 2, "TH": 2, "MY": 2, "VN": 2,
    "MA": 2, "SN": 2, "CI": 2, "CM": 2, "TN": 2,
    "BD": 2, "LK": 2, "NP": 2, "MM": 2, "KH": 2,
    "UA": 2, "RS": 2, "HR": 2, "RO": 2, "BG": 2,
    "PE": 2, "EC": 2, "GT": 2, "DO": 2, "CU": 2,
    # Tier 3 — M-Pesa zone (Stripe falls back to Tier 2 USD pricing)
    "KE": 3, "TZ": 3, "UG": 3, "RW": 3, "CD": 3,
    "MZ": 3, "ET": 3, "LS": 3, "GH": 3, "EG": 3,
}

# ─── Package definitions ──────────────────────────────────────────────────────

_PACKAGES_BASE = [
    {"id": "starter", "coins": 3, "label": "Starter", "tag": None},
    {"id": "popular", "coins": 6, "label": "Popular", "tag": "Best Value"},
]

# All Stripe prices in USD cents. Tier 3 uses Tier 2 prices.
STRIPE_PRICES: dict[int, dict[str, int]] = {
    1: {"starter": 99,  "popular": 199},
    2: {"starter": 49,  "popular": 99},
}

# M-Pesa prices in KES (whole numbers, matching coins.py COIN_PACKAGES)
MPESA_PRICES: dict[str, int] = {
    "starter": 49, "popular": 99,
}

# ─── Drop-unlock pricing ───────────────────────────────────────────────────
# Cash price to unlock a drop's identity — same PPP tiers as the coin
# packages above. Tier 3 (M-Pesa) gets its own hand-picked KES price, not a
# raw FX conversion of the USD figure (that's what DROP_PRICE_USD /
# GROUP_DROP_PRICE_USD in drops.py used to do, charging the same number
# worldwide).
DROP_UNLOCK_USD_CENTS: dict[str, dict[int, int]] = {
    "single": {1: 200, 2: 99},    # $2.00 tier 1 / $0.99 tier 2
    "group":  {1: 300, 2: 149},   # $3.00 tier 1 / $1.49 tier 2
}
DROP_UNLOCK_KES: dict[str, int] = {
    "single": 150,
    "group":  250,
}


def get_drop_unlock_price(tier: int, is_mpesa_country: bool, is_group: bool = False) -> dict:
    """Geo-aware drop-unlock price, mirroring build_packages()'s PPP tiers.

    Returns { usd, usd_cents, kes? } — `kes` only present for M-Pesa countries.
    """
    kind        = "group" if is_group else "single"
    stripe_tier = min(tier, 2)      # Tier 3 (M-Pesa) falls back to tier-2 USD, same as coins
    usd_cents   = DROP_UNLOCK_USD_CENTS[kind][stripe_tier]
    result = {"usd": usd_cents / 100, "usd_cents": usd_cents}
    if is_mpesa_country:
        result["kes"] = DROP_UNLOCK_KES[kind]
    return result


def build_packages(tier: int, is_mpesa_country: bool) -> list[dict]:
    """Return full package list with geo-correct pricing for this user."""
    stripe_tier = min(tier, 2)      # Tier 3 → Tier 2 Stripe pricing
    stripe_p    = STRIPE_PRICES[stripe_tier]
    packages    = []
    for pkg in _PACKAGES_BASE:
        p                 = dict(pkg)
        p["stripe_amount"]   = stripe_p[pkg["id"]]
        p["stripe_currency"] = "usd"
        p["stripe_display"]  = f"${stripe_p[pkg['id']] / 100:.2f}"
        if is_mpesa_country:
            p["kes"]           = MPESA_PRICES[pkg["id"]]
            p["display_price"] = f"KES {MPESA_PRICES[pkg['id']]}"
        else:
            p["display_price"] = p["stripe_display"]
        packages.append(p)
    return packages


# ─── Request → country → tier ─────────────────────────────────────────────────
# One place for every price decision (packages shown here, the card charge in
# coins.py, drop unlocks in drops.py), so what's shown is what's charged.
# Country comes from the local IP database in app/utils/geoip.py.

# Countries not in TIER_MAP, or a visitor who can't be placed at all, get the
# emerging-market tier — the same for the price shown and the price charged.
DEFAULT_TIER = 2


def tier_for(country) -> int:
    return TIER_MAP.get(country or "", DEFAULT_TIER)


async def pricing_country(request, use_hint: bool = False):
    """ISO code for the requester, or None. See geoip.request_country for use_hint."""
    return await geoip.request_country(request, use_hint=use_hint)


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("/config")
async def get_geo_config(
    request: Request,
    current_user_id: str = Depends(get_current_user_id),
):
    """
    Returns geo-aware payment config for the requesting user.

    Reads X-Forwarded-For so it works correctly behind Render / Cloudflare.
    Safe to call on every CoinsScreen mount — response is cheap and fast.
    """
    country     = await pricing_country(request)
    tier        = tier_for(country)
    # M-Pesa may also show on the client's own country hint when the IP can't be
    # placed — harmless, as M-Pesa itself only works with a valid local number.
    is_mpesa    = (country or await pricing_country(request, use_hint=True)) in MPESA_COUNTRIES

    return {
        "country_code": country,
        "tier":         tier,
        "show_mpesa":   is_mpesa,
        "show_stripe":  True,                        # always available
        "packages":     build_packages(tier, is_mpesa),
    }
