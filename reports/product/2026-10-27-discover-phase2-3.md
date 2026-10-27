# Discover — Phase 2 and Phase 3 report (2026-10-27)

Status: **built and tested locally, not deployed, not committed.** Everything below "Completed" ran against tests or the live database (read-only). "Deferred" items are proposals, not built.

## 0. Phase 1 check before starting

- All suites passed before changes: discover 40, rooms 48, age 9, visits 28, insights 21, showcase.
- **Gap found and fixed:** hookup posts from the guided form (web + app) sent no structured place, only a free-text area, so Near's Close by / My area / My country could never match them (only "Anywhere" would). Phase 1 tests missed it because they inserted posts with a place already set. Fix in 2.7.

## 1. Phase 2 — completed

| # | Feature | What was built |
|---|---|---|
| 2.1 | Moods & topics | 11 moods (heartbreak, love, secrets, regret, betrayal, happiness, anger, relief, confusion, funny, personal growth) + 7 topics. Authors pick up to 3 when posting (web "Feeling" tool, app "Feeling" tool) or later from the dashboard. Stored as `drops.topics`. Stories filters match the author's pick **or** the post's words, so untagged posts are still found. |
| 2.2 | English / Swahili / Sheng | Normalisation (case, accents, punctuation, "heartbreakkk"), spelling variants ("luv", "stori", "tonite"), soft synonyms ("nimekumiss" finds "miss you", "alinichiti" finds "cheated"), word-start matching. Ambiguous words ("mama", "bae", "now", "lost"…) never become filters; they're offered as "Did you mean" chips. If no post has every word, search falls back to any word and says so. Original query kept. |
| 2.3 | Suggestions | `/discover/suggest`: places, moods/topics, connection words ("dem" → Women), starter phrases. Curated lists only, never people, Rooms or post text. Debounced 200 ms; recent searches stay on the device with "Clear history". |
| 2.4 | Room availability | Open / Taking a break / Hidden. A break can end by itself (12 h, 3 days, a week) or stay until switched back. One server helper (`knocks_open_of`) decides everywhere: Knock creation, Room preview, Near. Saving other settings keeps a running break's end time. People already inside and their chats are untouched. |
| 2.5 | Responsiveness ranking | Within each page of Near: open and keeping up → first; 8+ unanswered knocks waiting, or answers < 25% of 6+ recent knocks → lower; on a break → last. Reorders within a page only (nobody hidden or skipped), no penalty without history, stats never sent to clients. |
| 2.6 | Exposure fairness | One card per person (Phase 1) + ranking above + listed Rooms rotate in a daily order instead of "last edited first". Measured: daily per-owner Near impression counters (35-day expiry) and per-surface requests / empty results / fallbacks / latency (180-day expiry). Admin → Growth → Discover shows top-10% share, top-person share and gini. |
| 2.7 | Travel | Hookup posts sent without a structured place now get one from the area typed ("Westlands" → Westlands, Nairobi, Kenya), else the poster's profile area, else their country. Typing an area somewhere else makes the post findable there; the profile location never changes. "Discover in" (browse elsewhere) already existed. Backfill script for old posts (dry run found 0 to fix). |

## 2. Phase 3 — completed

| # | Item | Result |
|---|---|---|
| 3.1 | Performance baseline | Measured (section 6). Found and fixed the real bottleneck: the shared post formatter ran ~6 lookups one after another. Now parallel: **491 → 82 ms median** per page from a Nairobi machine. Speeds up feed and search too. |
| 3.5 | Quality experiments | Daily Discover counters (above) + `data-track` labels on Discover actions (view Room, read, open story, surprise, suggestion by kind, look wider) feeding the existing visitor click analytics. Existing A/B framework (`experiments`, `useExperiment`) can split any Discover change. |

## 3. Deferred, and why

| Item | Why not now | When to revisit / design |
|---|---|---|
| 2.7 scheduled travel (future start/end) | Fresh windows already set how long a post is up; a future start needs a scheduled-post path for hookups and timezone handling. | When posting for a trip is requested. Design: `hookup.starts_at`, reuse `scheduled_publisher`, validate UTC on server. |
| 2.8 saved searches + alerts | Live data: 9 users, 0 hookup posts. Nothing would match; value can't be measured. | When Near has steady daily posts. Design: `saved_searches` per user (private), opt-in alerts, neutral push text ("New in your saved search"), dedupe by drop id, same eligibility on every run. |
| 3.2 Atlas Search / Typesense | Live: MongoDB 8.0.34 on Atlas, 284 posts, every Discover query takes 0–3 ms on the server. No demonstrated need. | Trigger: >50k searchable posts, server time >100 ms p95, or empty-result rate >30%. Seam: `search_lexicon.keyword_filter` — swap behind it; MongoDB stays the authority. |
| 3.3 Semantic search (Stories) | No measured keyword failure yet; would send confessions to an embedding service (privacy review needed). | Revisit with the empty-result rate from Admin → Discover. Stories only, never hookups. |
| 3.4 Personalisation | 9 users: not enough data to personalise honestly. | When ~1k weekly active readers. Explicit topics first; reset/off switch. |

## 4. Files

New: `Backend/app/utils/search_lexicon.py` (extended), `Backend/scripts/backfill_hookup_places.py`, `Web/components/compose/TopicPicker.tsx`, `Frontend/src/components/drops/TopicPicker.jsx`.
Changed (Phase 2/3): `Backend/app/api/v1/{discover,drops,chat_profile,unlock_requests,auth}.py`, `Backend/app/main.py`, `Web/components/{SearchPage,ComposeForm,DashboardPage,ChatSetupPage}.tsx`, `Web/components/compose/GuidedConfession.tsx`, `Web/app/{discover.css,admin/growth/page.tsx}`, `Frontend/src/screens/{feed/SearchScreen,drops/DropsComposeScreen,drops/ChatProfileSetupScreen}.jsx`, `Frontend/src/components/drops/GuidedConfession.jsx`.

## 5. Database and API changes

No migrations required; all fields are optional and old documents read fine.

- `drops.topics` (list, ≤3) · `drops.hookup.fresh_window` (Phase 1) · `chat_profiles.knocks_paused_until`
- New collections: `discover_impressions` (owner id, day, count; TTL 35 d), `discover_stats` (per day+surface counters; TTL 180 d)
- New indexes: `drops(topics, created_at)`, `drop_unlock_requests(owner_id, created_at)`, the two TTL indexes, `users(email)` **unique** (checked live: 0 duplicates, 0 missing emails; created in its own try so it can't block other indexes)
- Endpoints: `GET /discover/suggest`, `GET /discover/admin/stats` (growth admins); `near`/`stories` gained `loose` and return `loose`; `/discover/parse` returns `query` and `suggest`; `/discover/topics` returns 11 moods, 7 topics, `max`; `PATCH /drops/{id}` accepts `topics`; `PUT /chat-profile/me` accepts `break_hours`; chat profile returns `availability`, `break_until`.

## 6. Measured baseline (live, read-only, from Nairobi)

- Data: 284 posts (all confessions), 0 hookups, 9 users, 0 Room profiles, 2 knocks; drops 0.42 MB.
- MongoDB round trip (ping): ~88 ms median.
- Discover queries via `explain`: 0–3 ms server time; currently read all 284 posts (plans use `moderation_status_1_risk_score_-1` then sort in memory). Fine at this size; new indexes not yet deployed.
- Live HTTP: `/health` 0.6–1.3 s (new TLS connection each time), `/drops/search` 1.7–2.5 s, `/public/feed` 3.6–4.4 s. Backend is on Render's **free plan** (render.yaml), so cold starts and a far region add more than the database does.
- Formatter: 491 ms → 82 ms median after parallelising.

## 7. Security and privacy

- **Fixed:** editing a post skipped moderation and the contact filter (a clean post could be edited to carry a phone number). Edits now pass the same checks and re-classify sensitivity.
- **Fixed:** no unique index on `users.email` (duplicate accounts possible under a signup race). Added, plus a clean "Email already registered" on the race.
- **Fixed:** search text would be written to Render's access logs in URLs. Discover and search paths now log as `?[redacted]`.
- Kept: blocks both ways, moderation, content mode and discovery windows on every query (`utils/discovery.eligible`); place-hopping limit (30 places/hour); no counts or distances; suggestions from curated lists only; server-authoritative knock state; impressions store owner id + day + count only, no viewer ids or queries.

## 8. Tests actually run (all passing)

- `test_phase2.py`: 72 checks (groups 1–7)
- `test_discover.py` 40 · `test_rooms.py` 48 · `test_age.py` 9 · `test_visits.py` 28 · `test_insights.py` 21 · `test_showcase.py`
- Web `tsc --noEmit` clean; app files parse with Babel. No browser or device run yet.

## 9. Test locally

1. `cd Backend && venv\Scripts\activate && uvicorn app.main:app --reload`
2. `cd Web && npm run dev`, open `/search`: type "dem wa Kisumu", "stories za heartbreak", "nimekumiss", "mama yangu" (should offer "Did you mean Family").
3. Post a confession with a mood (Feeling tool), then filter Stories by it.
4. Post a hookup with area "Westlands"; Near → My area → Nairobi should show it.
5. Room setup → Taking knocks off → pick "For tonight"; knocking from another account should be refused.
6. Admin → Growth → Discover for counters.
