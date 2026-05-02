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

IP lookup: ip-api.com free tier (10 k req/month).
Upgrade to MaxMind GeoLite2 for production.
"""

from fastapi import APIRouter, Request, Depends
import httpx
from app.dependencies import get_current_user_id

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
    {"id": "starter", "coins": 55,  "label": "Starter", "tag": None},
    {"id": "popular", "coins": 120, "label": "Popular", "tag": "Best Value"},
    {"id": "value",   "coins": 350, "label": "Value",   "tag": "+40% bonus"},
    {"id": "power",   "coins": 800, "label": "Power",   "tag": "+60% bonus"},
]

# All Stripe prices in USD cents. Tier 3 uses Tier 2 prices.
STRIPE_PRICES: dict[int, dict[str, int]] = {
    1: {"starter": 99,  "popular": 199, "value": 399, "power": 699},
    2: {"starter": 49,  "popular": 99,  "value": 199, "power": 349},
}

# M-Pesa prices in KES (whole numbers, matching coins.py COIN_PACKAGES)
MPESA_PRICES: dict[str, int] = {
    "starter": 50, "popular": 100, "value": 250, "power": 500,
}


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


# ─── IP → country ─────────────────────────────────────────────────────────────

async def country_from_ip(ip: str) -> str:
    """Resolve an IPv4/v6 address → ISO 3166-1 alpha-2 code.

    Uses ip-api.com free tier.  Falls back to "US" on any error.
    For production, replace with MaxMind GeoLite2 DB (zero external calls).
    """
    if ip in ("127.0.0.1", "::1", "testclient", "", "localhost"):
        return "KE"                  # sensible local-dev default
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(
                f"http://ip-api.com/json/{ip}?fields=countryCode",
                headers={"Accept": "application/json"},
            )
            if r.status_code == 200:
                return r.json().get("countryCode", "US")
    except Exception:
        pass
    return "US"


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
    forwarded   = request.headers.get("X-Forwarded-For", "")
    ip          = forwarded.split(",")[0].strip() if forwarded else (request.client.host or "")
    country     = await country_from_ip(ip)
    tier        = TIER_MAP.get(country, 2)          # unknown countries → Tier 2
    is_mpesa    = country in MPESA_COUNTRIES

    return {
        "country_code": country,
        "tier":         tier,
        "show_mpesa":   is_mpesa,
        "show_stripe":  True,                        # always available
        "packages":     build_packages(tier, is_mpesa),
    }
