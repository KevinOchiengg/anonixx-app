"""Country codes (X-Country header) to the country names drops and profiles store.
Unknown codes are ignored."""
import re
from typing import Optional

NAME_BY_CODE = {
    "KE": "Kenya", "TZ": "Tanzania", "UG": "Uganda", "RW": "Rwanda", "GH": "Ghana", "NG": "Nigeria",
    "ZA": "South Africa", "ET": "Ethiopia", "EG": "Egypt", "CD": "DR Congo", "MZ": "Mozambique", "LS": "Lesotho",
    "AF": "Afghanistan", "AL": "Albania", "DZ": "Algeria", "AR": "Argentina", "AM": "Armenia", "AU": "Australia",
    "AT": "Austria", "AZ": "Azerbaijan", "BH": "Bahrain", "BD": "Bangladesh", "BY": "Belarus", "BE": "Belgium",
    "BJ": "Benin", "BO": "Bolivia", "BA": "Bosnia and Herzegovina", "BW": "Botswana", "BR": "Brazil",
    "BG": "Bulgaria", "BF": "Burkina Faso", "BI": "Burundi", "KH": "Cambodia", "CM": "Cameroon", "CA": "Canada",
    "CL": "Chile", "CN": "China", "CO": "Colombia", "CR": "Costa Rica", "HR": "Croatia", "CU": "Cuba",
    "CY": "Cyprus", "CZ": "Czechia", "DK": "Denmark", "DJ": "Djibouti", "DO": "Dominican Republic",
    "EC": "Ecuador", "SV": "El Salvador", "EE": "Estonia", "SZ": "Eswatini", "FI": "Finland", "FR": "France",
    "GA": "Gabon", "GM": "Gambia", "GE": "Georgia", "DE": "Germany", "GR": "Greece", "GT": "Guatemala",
    "GN": "Guinea", "HT": "Haiti", "HN": "Honduras", "HK": "Hong Kong", "HU": "Hungary", "IS": "Iceland",
    "IN": "India", "ID": "Indonesia", "IR": "Iran", "IQ": "Iraq", "IE": "Ireland", "IL": "Israel", "IT": "Italy",
    "CI": "Ivory Coast", "JM": "Jamaica", "JP": "Japan", "JO": "Jordan", "KZ": "Kazakhstan", "KW": "Kuwait",
    "KG": "Kyrgyzstan", "LA": "Laos", "LV": "Latvia", "LB": "Lebanon", "LR": "Liberia", "LY": "Libya",
    "LT": "Lithuania", "LU": "Luxembourg", "MG": "Madagascar", "MW": "Malawi", "MY": "Malaysia", "ML": "Mali",
    "MT": "Malta", "MR": "Mauritania", "MU": "Mauritius", "MX": "Mexico", "MD": "Moldova", "MN": "Mongolia",
    "ME": "Montenegro", "MA": "Morocco", "MM": "Myanmar", "NA": "Namibia", "NP": "Nepal", "NL": "Netherlands",
    "NZ": "New Zealand", "NI": "Nicaragua", "NE": "Niger", "MK": "North Macedonia", "NO": "Norway", "OM": "Oman",
    "PK": "Pakistan", "PA": "Panama", "PG": "Papua New Guinea", "PY": "Paraguay", "PE": "Peru",
    "PH": "Philippines", "PL": "Poland", "PT": "Portugal", "QA": "Qatar", "RO": "Romania", "RU": "Russia",
    "SA": "Saudi Arabia", "SN": "Senegal", "RS": "Serbia", "SC": "Seychelles", "SL": "Sierra Leone",
    "SG": "Singapore", "SK": "Slovakia", "SI": "Slovenia", "SO": "Somalia", "KR": "South Korea",
    "SS": "South Sudan", "ES": "Spain", "LK": "Sri Lanka", "SD": "Sudan", "SE": "Sweden", "CH": "Switzerland",
    "SY": "Syria", "TW": "Taiwan", "TJ": "Tajikistan", "TH": "Thailand", "TG": "Togo",
    "TT": "Trinidad and Tobago", "TN": "Tunisia", "TR": "Turkey", "TM": "Turkmenistan", "UA": "Ukraine",
    "AE": "United Arab Emirates", "GB": "United Kingdom", "US": "United States", "UY": "Uruguay",
    "UZ": "Uzbekistan", "VE": "Venezuela", "VN": "Vietnam", "YE": "Yemen", "ZM": "Zambia", "ZW": "Zimbabwe",
}
_CANONICAL = {n.lower(): n for n in NAME_BY_CODE.values()}


def country_from_header(value) -> Optional[str]:
    """X-Country header (ISO alpha-2) -> country name, or None if absent/unknown.
    Tolerates the FastAPI Header default object when a route is called directly."""
    if not isinstance(value, str):
        return None
    code = value.strip().upper()
    return NAME_BY_CODE.get(code) if re.fullmatch(r"[A-Z]{2}", code) else None


def known_country(name) -> Optional[str]:
    """A stored country name in its canonical spelling, if it's one the feed can
    match on (the website's profile field is free text, so "kenya" counts too)."""
    return _CANONICAL.get(name.strip().lower()) if isinstance(name, str) else None
