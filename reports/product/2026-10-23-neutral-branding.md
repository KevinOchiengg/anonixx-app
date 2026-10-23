# Neutral branding audit: removing the Kenya signals

Date: 2026-10-23. Scope: `Web/`, `Frontend/`, `Backend/`, `reports/TEAM.md`, `.claude/agents/`. Audit only. No code was changed.

## 1. Summary

The copy itself is already mostly neutral. No Sheng or Swahili turned up anywhere (searched about 80 terms), the hero and signup copy are global, push notifications are neutral, and the backend runs on UTC. The Kenya feel comes from three places. **Money**: web shows only KES and M-Pesa, has no card option at all, and the app's Premium screen defaults everyone to M-Pesa. **Location UI**: Kenya sits at the top of every country list, the form uses county, sub-county and estate wording, and placeholders say Nairobi, Westlands, Kilimani and Kileleshwa. **Phone and safety details**: 07XX and +254 placeholders, phone numbers forced to 254, and Kenya-only crisis lines. A visitor from London who opens Coins or Settings would assume the app is Kenyan within 10 seconds.

**Top 5 most visible fixes**
1. Web coins page has KES prices and only M-Pesa (`Web/components/CoinsPage.tsx:99,111,119,124-130`). Outside Kenya, web users can't pay at all.
2. Web premium page is the same: KES only, M-Pesa only, and "Card payments are only available in the app" (`Web/components/PremiumPage.tsx:67,74,81,86-93`).
3. App Premium defaults every user to M-Pesa with no region check (`Frontend/src/screens/profile/PremiumScreen.jsx:54-57,278`).
4. Crisis support lists only Kenyan lines (`Frontend/src/screens/settings/SettingsScreen.jsx:322-324`, `Web/components/SettingsPage.tsx:145`).
5. The location forms are Kenya-shaped: Kenya pinned first, county and estate labels, Nairobi, Westlands and Kilimani placeholders (`Web/components/AccountPages.tsx:305-308`, `Web/components/compose/LocationFields.tsx:31-36`, `Frontend/src/components/drops/LocationField.jsx:139-143`, `Frontend/src/config/locations.js:14-28`, `Web/lib/locations.ts:2`).

Good news: the hard plumbing already exists. `GET /geo/config` returns `show_mpesa`, the tier and geo-priced packages. The app's CoinsScreen already gates M-Pesa on that config. Web middleware sets a country cookie, and the feed is already local-first. Most of the fix is wiring web and Premium to what the backend already knows.

## 2. Full findings

Risk key: **none** = copy only. **functional** = a feature can break. **payments** = money flow. **legal** = compliance or safety.

### Web (`Web/`)

| file:line | Currently says | Why it reads Kenyan | Proposed replacement | Risk |
|---|---|---|---|---|
| `app/layout.tsx:28` | `openGraph.locale: "en_KE"` | Every share preview declares Kenyan English | `locale: "en_US"` (or leave the field out). Keep `<html lang="en">` (`:45`) as it is. | none |
| `components/CoinsPage.tsx:7-8,96,99,109,111,124` | `KES {p.kes}` on every pack and plan | Shilling prices shown to everyone | Show coins first and the price in the viewer's currency from `/geo/config` `display_price`: card reads **"6 coins"**, small line **"$1.99"** (or **"KES 99"** only when `show_mpesa`). | payments |
| `components/CoinsPage.tsx:25` | Fetches `/coins/packages` (KES-only, `Backend/app/api/v1/coins.py:87-89`) | Source of the KES-only prices | Fetch `/geo/config` instead (it needs auth, and this page is already behind auth) | payments |
| `components/CoinsPage.tsx:119` | "Pay with M-Pesa. Coins have no cash value…" | M-Pesa as the only way to pay | **"Coins have no cash value. Refunds live in Settings."** Add "Pay with card or M-Pesa" only when `show_mpesa`. | payments |
| `components/CoinsPage.tsx:127-130` | "M-Pesa number", `07XX XXX XXX`, "Send M-Pesa prompt" | Only payment form on web | Default sheet: **"Pay by card"**, which opens Stripe Checkout. Show the M-Pesa form as a second option only when `show_mpesa`. | payments |
| `components/CoinsPage.tsx:71` | "Check your phone and enter your M-Pesa PIN." | Fine, but must only show on the M-Pesa path | Keep, M-Pesa path only | none |
| `components/PremiumPage.tsx:67` | "Pay with M-Pesa, no auto-renew." | M-Pesa only | **"Post and link up without spending a coin. One payment. No auto-renew."** | payments |
| `components/PremiumPage.tsx:74,86` | `KES {p.kes} · $9.99` | Shillings shown first, worldwide | **"$9.99 / 30 days"** from geo. KES only when `show_mpesa`. | payments |
| `components/PremiumPage.tsx:81` | "Card payments are only available in the app." | Signals a mobile-money-first market | Delete it and add card checkout (see section 3) | payments |
| `components/PremiumPage.tsx:89-93` | M-Pesa number, 07XX, "Send M-Pesa prompt" | Only form | Same as Coins: card by default, M-Pesa when `show_mpesa` | payments |
| `lib/phone.ts:1-5` | `normalizeKePhone`: forces a 254 prefix on anything starting 0, 7 or 1 | Hard-coded Kenyan numbering | Keep it for the M-Pesa path only (rename `normalizeMpesaPhone`). For WhatsApp, require international format; see the next row. | functional |
| `components/WhatsAppPage.tsx:32,52` | `07XX XXX XXX`; runs `normalizeKePhone` | A US user typing `0…` or `7…` gets a +254 number, so **an anonymous message goes to a stranger in Kenya** | Placeholder **"+1 555 123 4567"**, label **"Their number, with country code"**. Prefill the dial code from the `anx_cc` cookie and drop the 254 default. | **legal / safety** |
| `components/DashboardPage.tsx:47,51,74,80,107,121-128` | "Withdraw to M-Pesa", "≈ KES …", 07XX | M-Pesa-only cash-out and a KES balance | Hide the whole withdraw card unless `show_mpesa`. Show earnings in coins only: **"Earned: 120 coins"**. Also see the note under section 3. | payments / legal |
| `components/SupportPage.tsx:97` | `KES ${b.kes} ·` on purchase history | KES on receipts | Show the currency the receipt was paid in: **"6 coins · $1.99"** or **"6 coins · KES 99"**. Needs a `currency` field on purchases. | none |
| `components/SettingsPage.tsx:145` | "In Kenya, call Befrienders Kenya on +254 722 178 177 or the Kenya Red Cross free line on 1199. In an emergency, call 999 or 112." | Kenya-only crisis lines | **"If you're thinking of hurting yourself, you're not alone. Talk to someone tonight."** Then a region-picked line (KE keeps Befrienders and 1199, US 988, UK Samaritans 116 123, and so on) plus a fallback link to findahelpline.com. Never remove without a replacement. | **legal / safety** |
| `lib/locations.ts:2` | Kenya, Tanzania, Uganda… pinned before A–Z | Says "East African app" in every picker | Detected country first (from `anx_cc`), then plain A–Z | none |
| `lib/locations.ts:3` + `components/compose/LocationFields.tsx:7,19-24` | Kenya gets a 47-county picker; everyone else gets free text | Only one country gets first-class treatment | Keep the data (it's useful), but label it neutrally: **"Region"** for everyone. Show the county list as suggestions only when the country is Kenya. | functional (stored values unchanged) |
| `components/compose/LocationFields.tsx:31-32` | "Sub-county", `e.g. Westlands` | Kenyan admin term and suburb | Label **"Area"**, placeholder **"e.g. Downtown"** | none |
| `components/compose/LocationFields.tsx:35-36` | "Estate / neighbourhood", `e.g. Kilimani` | "Estate" is Kenyan English; Kilimani is a Nairobi suburb | **"Neighbourhood"**, placeholder **"Where you'd be found"** | none |
| `components/AccountPages.tsx:305` | Country placeholder "Kenya" | Assumes Kenya | Placeholder = the detected country name, or **"Where's home"** | none |
| `components/AccountPages.tsx:306-308` | "County or region"/"Nairobi", "Sub-county or area"/"Westlands", "Estate or neighborhood"/"Kileleshwa" | Three Nairobi places in a row | **"Region"** / "e.g. your state or county", **"Area"** / "e.g. Downtown", **"Neighbourhood"** / "close enough to matter" | none |
| `components/AccountPages.tsx:216-218` | "Same county or state", "Same sub-county or district", "Same estate. Closest match" | County, sub-county and estate wording | **"Same region"**, **"Same area"**, **"Same neighbourhood. Closest it gets."** | none |
| `components/SearchPage.tsx:155-159` | `loc.country === "Kenya"` county datalist; "County or region", "Sub-county or area", "Estate or neighborhood" | Same as above | **"Region"**, **"Area"**, **"Neighbourhood"**. Keep the datalist gated on KE. | none |
| `app/privacy/page.tsx:14` | "Google Play (Android), M-Pesa and Stripe" | M-Pesa named on its own | **"Payments go through Google Play, Stripe (cards, Apple Pay, Google Pay) and, in some countries, mobile money such as M-Pesa. We never see your card or PIN."** Keep M-Pesa named; it's a legal disclosure. | legal |
| `app/admin/refunds/page.tsx:36,53`, `app/admin/kanban/page.tsx:42,86` | KES on refunds, "(M-Pesa / Stripe)" | Admin only, so users never see it | Show the purchase currency. Low priority. | none |
| `middleware.ts:10` | `CANONICAL_HOST = "anonixx.com"` while privacy and backend share links use `anonixx.app` | Not Kenyan, but a domain mismatch worth noticing while editing SEO | Pick one canonical domain | functional |
| `app/sitemap.ts`, `app/robots.ts`, `components/Hero.tsx`, JSON-LD in `app/page.tsx`, `app/drop/[id]/page.tsx` | Nothing Kenyan | Clean | No change | none |

### App (`Frontend/`)

| file:line | Currently says | Why it reads Kenyan | Proposed replacement | Risk |
|---|---|---|---|---|
| `src/screens/profile/PremiumScreen.jsx:54-57,278` | Methods `[M-Pesa, Card]`, `useState('mpesa')` | M-Pesa is the default for every user worldwide | Fetch `/geo/config`. Show the M-Pesa chip only if `show_mpesa`, and default to `'stripe'` otherwise. Order: **Card** first everywhere except KE. | payments |
| `src/screens/profile/PremiumScreen.jsx:55-56` | Chip icons are emoji | Off-brand (not Kenyan) | Use lucide icons | none |
| `src/screens/profile/PremiumScreen.jsx:146,152` | `07XX XXX XXX`, "You'll receive an STK push on this number." | Kenyan format and Daraja jargon | Keep 07XX (this form is KE-only now). Copy: **"We'll send a prompt to this phone. Enter your PIN and you're in."** | payments |
| `src/screens/profile/PremiumScreen.jsx:394` | "Cancel anytime. Subscription will auto-renew." | Not Kenyan, but false: Stripe and M-Pesa premium are one-off charges (`Backend/app/api/v1/premium.py:94,194`); web says "no auto-renew" | **"One payment. 30 days. No auto-renew."** | **legal** |
| `src/components/payments/MpesaPaymentSheet.jsx:478` | Fixed `+254` prefix | Wrong for TZ, UG, GH and the others that `show_mpesa` also covers | Fine if M-Pesa goes KE-only (section 3); otherwise use a per-country prefix | payments |
| `src/components/payments/MpesaPaymentSheet.jsx:53-54,295` | Fallback packs in KES | Only reachable when geo config is missing | Fallback should show coins with no price, plus a "Prices loading" state, not KES | payments |
| `src/components/payments/MpesaPaymentSheet.jsx:439,523` | "M-Pesa · Instant · Secure", "Secured by Safaricom M-Pesa…" | Fine inside a KE-only sheet | Keep | none |
| `src/screens/profile/CoinsScreen.jsx:84` | `toLocaleDateString('en-KE', …)` | Kenyan date format for everyone | `toLocaleDateString(undefined, …)` (device locale) | none |
| `src/screens/profile/CoinsScreen.jsx:73` | "Withdrawal to M-Pesa" | M-Pesa in history | **"Cash out"** | none |
| `src/screens/profile/CoinsScreen.jsx:183,203` | "Top Up with M-Pesa" / "Pay by Card" | Already geo-gated, which is correct | Keep. Only rename the non-M-Pesa CTA "Add Coins" to **"Top up"** for consistency. | none |
| `src/screens/profile/DashboardScreen.jsx:194,211,322,330,356-357,420,425` | "Cash out coins to M-Pesa", "≈ KES …", `2547XXXXXXXX` | M-Pesa-only payout, KES | Gate the whole withdraw block on `show_mpesa`. Show balance in coins: **"Earned: 120 coins"**. | payments / legal |
| `src/screens/settings/SettingsScreen.jsx:322,324` | "Befrienders Kenya · +254 722 178 177", "Kenya Red Cross · 1199 (free)" | Kenya-only crisis lines | Section title stays **"Need to talk to someone?"** Rows come from a small `helplines.js` keyed by `deviceCountry()`: KE keeps these two; US **"988 Suicide & Crisis Lifeline"**; GB **"Samaritans · 116 123"**; fallback **"Find a free line near you"** opens findahelpline.com. | **legal / safety** |
| `src/config/locations.js:14-28` | Kenya then the M-Pesa footprint pinned first | East-Africa-first picker | Sort A–Z and move `deviceCountry()` to the top at render time | none |
| `src/config/locations.js:4-5,173-187` | Comments call Kenya "primary market" | Internal only | Reword comments when touching the file | none |
| `src/components/drops/LocationField.jsx:108,112,158` | "County", "Select a county" when KE | Kenyan term | Label **"Region"** for everyone. In KE the picker title reads **"Region"** and still lists the 47 counties. | none |
| `src/components/drops/LocationField.jsx:128,132` | "Sub-county", `e.g. Westlands` (KE branch) | Kenyan term and suburb | **"Area"**, **"e.g. Downtown"** for all | none |
| `src/components/drops/LocationField.jsx:139,143` | "Estate / Neighborhood", `e.g. Kilimani` (for everyone) | Nairobi suburb shown to the whole world | **"Neighbourhood"**, placeholder **"close enough to matter"** | none |
| `src/components/drops/LocationField.jsx:120` | `e.g. California` | Not Kenyan; fine | Optional: **"e.g. your state or county"** | none |
| `src/screens/settings/FeedLocationScreen.jsx:31-33` | "Same county / state", "Same sub-county / district", "Same estate — closest match" | Kenyan admin terms | **"Same region"**, **"Same area"**, **"Same neighbourhood. Closest it gets."** | none |
| `src/screens/drops/WhatsAppSendScreen.jsx:102` | `+254 712 345 678` | Kenyan number as the example | **"+ country code and number"**. Prefill the dial code from `deviceCountry()`. | **safety** (see backend `whatsapp.py:44`) |
| `src/screens/support/SupportChatScreen.jsx:180` | `· KES ${p.kes}` | KES on receipts | Purchase currency (needs a backend field) | none |
| `src/screens/settings/LegalScreen.jsx:80` | "Stripe, M-Pesa, or PayPal" | PayPal **isn't implemented anywhere** in Backend | **"Google Play on Android. Elsewhere, Stripe for cards and, in some countries, M-Pesa."** | legal |
| `src/screens/admin/AdminRefundsScreen.jsx:14,77` | KES, "(M-Pesa / Stripe)" | Admin only | Low priority | none |
| `src/utils/country.js:5`, `src/context/ThemeContext.jsx:80-82`, `src/utils/theme.js:86-88` | Comment example "KE"; `mpesa` green tokens | Internal, used only inside the M-Pesa UI | No change | none |
| `app.json:3,61-63` | "Anonixx", "Anonymous emotion. Structured connection." | Neutral (off-voice, but not Kenyan) | Optional: **"Say it. Stay hidden."** | none |
| `src/config/linkup.js:9`, Room "Tonight" chips (`RoomScreen.jsx:269,288`) | "Free tonight", "Tonight · 3h" | Neutral; follows device time | No change | none |

### Backend (`Backend/`)

| file:line | Currently says | Why it reads Kenyan | Proposed replacement | Risk |
|---|---|---|---|---|
| `app/api/v1/geo_pricing.py:34-36` | `MPESA_COUNTRIES = {KE, TZ, UG, RW, CD, MZ, ET, LS, GH, EG}` | Shows M-Pesa in 10 countries, but the Daraja STK client only handles 254 numbers (`app/utils/mpesa.py:70-72`) | **Judgment call:** set it to `{"KE"}` until there's a second integration (for example Vodacom TZ). Users elsewhere get card. | payments |
| `app/api/v1/geo_pricing.py:56-57` | Tier 3 = "M-Pesa zone" | Fine as is | Keep. PPP pricing is a good idea. | none |
| `app/api/v1/geo_pricing.py:120` | `display_price = "KES 49"` | Correct only for KE | Keep (KE only after the change above) | none |
| `app/api/v1/coins.py:24-27,87-89` | `/coins/packages` returns KES only, no auth | Web reads this and shows KES to everyone | Return the geo packages here too (call `build_packages(tier_for(country), …)`), or deprecate it in favour of `/geo/config` | payments |
| `app/api/v1/premium.py:44-46,87-89` | Plan has `kes: 999` and `usd_display: "$9.99"`; `/plans` isn't geo-aware | Web shows KES first | Make `/premium/plans` return `display_price` per request country, the same way coins do. Add tier-2 USD (for example $4.99) so emerging markets get the same PPP logic. | payments |
| `app/api/v1/coins.py:191,279-283,316`, `premium.py:106-110,140`, `drops.py:2474-2511` | "Invalid M-Pesa number", "enter your M-Pesa PIN" | Correct inside the M-Pesa path | Keep. Also reject (403) M-Pesa initiation when the request country isn't in `MPESA_COUNTRIES`, so the gate isn't just UI. | payments |
| `app/api/v1/coins.py:111-112,174-260` | Payouts in KES to an `mpesa_number` | M-Pesa-only cash-out | See the note under section 3. Gate it on KE, or remove it. | **legal / payments** |
| `app/api/v1/whatsapp.py:44,66-67` | `DEFAULT_COUNTRY_CODE = "254"`; a leading 0 becomes 254 | A non-Kenyan "0…" number is silently rerouted to Kenya, so an anonymous message reaches the wrong person | Require E.164 (leading `+` or `00`). If not, use the caller's geo country dial code, and return 400 if it's unknown. Never hard-code 254. | **safety / functional** |
| `app/utils/geoip.py:132` | `local_default: str = "KE"` | Dev-only (localhost), so every dev run looks Kenyan | `local_default = os.getenv("DEV_COUNTRY")` (None by default) | none (dev only) |
| `app/utils/countries.py:15-16` | KE and the East African codes listed first | Internal ordering only | No user impact. Optional reorder. | none |
| `app/api/v1/drops.py:279-284,861`, `app/utils/location.py:19-20` | Comments with Kenya, Nairobi, Westlands, Kilimani examples; field names `location_county`, `location_sub_county`, `location_estate` | Internal | **Do not rename the fields** (stored data, feed matching, both clients). Only change the UI labels. | functional if renamed |
| `app/utils/notifications.py:21-80` | Neutral copy | Clean | No change | none |
| All `datetime.now(timezone.utc)` | UTC everywhere; no Africa/Nairobi | Clean | No change | none |
| `Backend/.env.example:79-81` | `COIN_PACK_*_KES` | Config naming | Rename only if those vars are still read; they look stale next to `coins.py:24-27` | none |
| Official and seed drop content | Not in the repo; it lives in MongoDB and comes from agent drafts | Agent briefs push Nairobi-flavoured drops ("Situationships in Nairobi…") | Write future official drops with no place names, and leave `location_*` unset so they reach every country's feed. Audit live official drops in admin for city names. | none |

### Agent docs (list only, not edited)

| file:line | Says |
|---|---|
| `reports/TEAM.md:6` | "Kenya-first: M-Pesa, Nairobi and nearby towns." |
| `reports/TEAM.md:13` | "Make Anonixx the app people in Nairobi open every night" |
| `.claude/agents/product-manager.md:14` | "win one city" (not Kenya by name, but implies Nairobi through TEAM.md) |
| `.claude/agents/researcher.md:3,12,14` | People in Kenya; "young adults in Nairobi and Kenya", TikTok Kenya, Kenyan Reddit; Kenya Data Protection Act / ODPC |
| `.claude/agents/content-scout.md:12,16,32` | "trending in Kenya today"; example hot take "Situationships in Nairobi…"; `suggested_time … (Africa/Nairobi)` |
| `.claude/agents/posting-manager.md:18` | Converts `suggested_time` to UTC and relies on content-scout's Africa/Nairobi convention. **If content-scout changes timezone, update this in the same edit**, or scheduled drops shift by 3 hours. |
| `.claude/agents/marketing-manager.md:9,15,25` | "people in Nairobi and nearby towns… Win one city"; "Kenyan youth brands"; campus ambassador |
| `.claude/agents/tiktok-manager.md:3,12,29,38` | TikTok Kenya / East Africa; "mix of Kenyan and niche" hashtags; "Nairobi confessions, part 12" |
| `.claude/agents/seo-manager.md:9,12,15,19` | "people in Kenya search…"; Ahrefs country `ke` first; "confessions Kenya", "Nairobi confessions", "hookup app Kenya"; "JKUAT confessions"; volume "(KE)" |
| `.claude/agents/revenue-manager.md:15` | "focusing on Kenya and M-Pesa price points" |
| `.claude/agents/chief-of-staff.md` | Clean |
| `CLAUDE.md:87`, `README.md:69,136,209,224` | Technical mentions of M-Pesa/Daraja. Accurate; no change needed. CLAUDE.md also lists PayPal, which doesn't exist. |

Note on legal: the researcher brief is the only place watching Kenya's Data Protection Act. If Kenya remains a real market (M-Pesa revenue says it does), keep that line and add GDPR/UK and US state privacy laws rather than replacing it.

## 3. Payments and currency plan

**Principle:** coins are the currency everyone sees. Money shows once, at checkout, in whatever local option fits the viewer.

1. **One source of truth.** `GET /geo/config` (it already exists) decides everything: `country_code`, `tier`, `show_mpesa`, `packages[].display_price`. Extend it with `premium_plans` (geo-priced like coins) and `helpline` (see the crisis rows). Web Coins and Premium and app Premium all read it. Drop the KES-only `/coins/packages` and `/premium/plans` reads.
2. **Who sees M-Pesa.** Set `MPESA_COUNTRIES = {"KE"}` (judgment call: today TZ, UG, GH and the others see an option that can't succeed, because Daraja normalizes to 254). Detection order stays as built: IP first, then the client `X-Country` hint only for *showing* M-Pesa, never for pricing (`geoip.py:132-143`). Add a server-side check: `/coins/buy/mpesa`, `/premium/mpesa` and `/drops/{id}/unlock/mpesa` return 403 unless country ∈ `MPESA_COUNTRIES` **or** the user already has a completed M-Pesa purchase. That keeps Kenyans on foreign IPs and VPNs working.
3. **What everyone else sees.** Card through Stripe. The backend already has `coins/buy/stripe/create-intent` and `premium/stripe/create-intent`. On web, add one endpoint that creates a **Stripe Checkout Session** and redirects to it. That's the smallest web build, and it gets Apple Pay and Google Pay for free. Don't promise PayPal: it doesn't exist in the backend. Remove it from `LegalScreen.jsx:80` and CLAUDE.md, or build it later.
4. **Android stays on Play Billing** (`USE_PLAY_BILLING`). Play already shows local currency and hides M-Pesa. No change.
5. **Currency display rules.**
   - Pack cards: **"6 coins"** big, price small underneath.
   - Price string: `display_price` from geo. KE shows `KES 99`; tier 1 shows `$1.99`; tier 2 shows `$0.99`. Don't FX-convert into other local currencies yet (Stripe charges USD; showing "€1.83" and charging "$1.99" invites disputes).
   - Receipts, history and support: store `currency` and `amount` on every purchase record and display those. Stop reading `kes`.
   - Spend costs inside the app are already in coins. Keep it that way.
6. **Payouts (`/coins/withdraw`, Dashboard on both clients).** This is the one thing to escalate. The founder's own rule is "posters never set prices or earn from link ups" (legal and payment-provider risk), yet a KES cash-out to M-Pesa is live in `DashboardPage.tsx` and `DashboardScreen.jsx`, backed by `coins.py:174`. At minimum, gate it on KE. Better: confirm with the founder which earnings it pays out (the circles creator cut?) and whether it should exist at all. Don't make it global.
7. **What must not break.** Leave M-Pesa callbacks (`/coins/buy/mpesa/callback`, `/premium/mpesa/callback`, `/drops/mpesa/callback`), Daraja URLs (`safaricom.co.ke`) and `mpesa_*` DB fields untouched. Don't rename `kes` fields until both clients read `currency` and `amount`.

## 4. Suggested order of work

**Step 1. Copy only, about a day (S). No risk.**
- Location labels and placeholders: `AccountPages.tsx:216-218,305-308`, `LocationFields.tsx:19,31-36`, `SearchPage.tsx:155-157`, `LocationField.jsx:108,112,128,132,139,143,158`, `FeedLocationScreen.jsx:31-33`.
- `CoinsScreen.jsx:73,84`, `PremiumScreen.jsx:55-56,152,394` (the auto-renew fix is also a legal fix), `LegalScreen.jsx:80`, `privacy/page.tsx:14`.
- `layout.tsx:28` sets `en_KE` → `en_US`.

**Step 2. Safety and config, 1-2 days (S/M).**
- Region-aware crisis lines on both clients (`SettingsScreen.jsx:322-324`, `SettingsPage.tsx:145`), keeping the Kenyan lines for KE.
- WhatsApp phone handling: `whatsapp.py:44,66-67`, `WhatsAppPage.tsx:32,52`, `WhatsAppSendScreen.jsx:102`. Require a country code and stop defaulting to 254.
- Country picker order: detected country first, then A–Z (`locations.js:14-28`, `lib/locations.ts:2`).
- `geoip.py:132` dev default to an env var.
- Update the agent docs (founder edits `TEAM.md` and `.claude/agents/*`; change content-scout and posting-manager timezone together).

**Step 3. Payments and locale logic, 3-5 days (M).**
- Backend: `MPESA_COUNTRIES = {"KE"}` plus a server-side M-Pesa gate; geo-aware `/premium/plans`; Stripe Checkout Session endpoint for web; `currency` and `amount` on purchase records.
- Web: rebuild `CoinsPage.tsx` and `PremiumPage.tsx` on `/geo/config`, card first, M-Pesa only when `show_mpesa`. Gate `DashboardPage.tsx` withdraw.
- App: geo-gate `PremiumScreen.jsx` methods (default card), gate `DashboardScreen.jsx` withdraw, neutral fallback in `MpesaPaymentSheet.jsx:53-54`.
- Founder decision first: whether withdrawals should exist (section 3, item 6).

**Not worth doing:** renaming `location_county`, `location_sub_county` and `location_estate` DB fields, Daraja internals, or theme `mpesa` color tokens. They're invisible to users and risky to touch.
