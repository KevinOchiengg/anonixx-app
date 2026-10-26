# Product: approved research ideas, 2026-10-26

Source: `reports/research/2026-10-26.md` ("Ideas for Anonixx"), approved by the founder.

## Idea 2: "Nothing is fake" trust line: ON HOLD, not shipped

The brief said to check the claim against the code and stop if anything contradicted it. Something does.

- **"Posts from the team are always labelled Anonixx" is not true today.** Admins can post official drops under any custom page name:
  - `Backend/app/api/v1/drops.py:352`: `display_name` on the create-drop request.
  - `Backend/app/api/v1/drops.py:822`: `admin_name = ... data.display_name ... or ADMIN_DROP_NAME`.
  - `Backend/app/api/v1/drops.py:868`: `sender_anonymous_name` is set to `admin_name` for admin drops.
  - `Web/components/admin/PostStudio.tsx:290` sends it, and `Web/components/admin/ScheduledDrops.tsx:51` shows "as {display_name}". Added in commit `b799783` ("admin drops can post under a custom page name").
  - Readers can't tell such a post comes from the team unless a client shows the `is_admin_drop` flag. The feed returns that flag (`drops.py`, feed formatter), but whether each card shows a badge is in `Slide.tsx` and the app feed, which were off limits this run.
  - This also goes against TEAM.md ("Official drops ... always shown under the name 'Anonixx'") and rule 2.
- **"Every reply, Knock and link up comes from a real person" holds up.** I found no code that writes fake replies, messages, Knocks or link ups. Room `welcome_message` (`Backend/app/api/v1/chat_profile.py:233`) is written by the room owner. Official drops can't be unlocked or linked up (`drops.py` comment above `ADMIN_DROP_NAME`).

**Founder decision needed (pick one), then the line can ship in about 15 minutes:**
1. Remove the custom page name, so admin drops are always "Anonixx" (backend: ignore `display_name`; admin UI: drop the field). The full line can then ship.
2. Keep custom names, but always show an "Anonixx" or "official" badge wherever `is_admin_drop` is true (web `Slide.tsx`, app feed card), and reword the line to "posts from the team always carry the Anonixx mark".
3. Ship only the true half now: "Every reply, every Knock, every link up is a real person. Nothing here is fake."

Draft copy, for once the claim is true:
> Every reply, every Knock, every link up is a real person. When it's us, it says Anonixx.

Places: `Web/components/AuthForms.tsx` (SignupForm), `Frontend/src/screens/auth/SignUpScreen.jsx`, `Web/app/join/page.tsx`.

## Idea 5: optional "clarity" lines on hookup posts: SHIPPED (not committed)

What it does: the last question of the guided hookup form ("If the chemistry feels right, what's possible?") now has an optional "Say it plainly" block with two short lines, **I want ___** and **I don't want ___**, up to 80 characters each. Both can be left empty and nothing is added to validation, so they add no friction. The step 2 age sentence is unchanged.

- Saved on the drop as `hookup.guided.want` and `hookup.guided.dont_want` (null when empty).
- Checked on the server like other free text: whitespace collapsed, cut to 80 characters, then contact filter (`CONTACT_INFO_ERROR`), moderation (`MODERATION_ERROR`) and the writer's money/gifts rule (same message as `/guided/generate`).
- Sent to the AI writer (`/guided/generate`) under the labels "What they want" and "What they don't want". New prompt rule: keep a "don't want" as a clear boundary, never soften it or turn it into a want.
- Exposure: the feed already returns the whole `hookup` block (`Backend/app/api/v1/drops.py:1999`; `Backend/app/api/v1/chat_profile.py:433`), so the fields reach clients with no API change. `public.py` was off limits and not checked.

**Where to show it later** (off limits this run): one muted line under the hookup tags, e.g. `wants: slow, then not so slow · not: anything serious`, in `Web/components/Slide.tsx` and the app feed card used by `Frontend/src/screens/feed/DropsSwipeScreen.jsx`. Show it only when at least one field is set.

### Files changed
- `Backend/app/api/v1/drops.py`: `GuidedDetails.want` / `dont_want`, `CLARITY_MAX`, `_clean_clarity()`, used in `clean_guided`, imports `MONEY` from the writer.
- `Backend/app/api/v1/guided.py`: accepts `want` / `dont_want`, runs the same checks, passes them to the writer.
- `Backend/app/services/confession_writer.py`: two answer labels plus the boundary rule.
- `Web/components/compose/GuidedConfession.tsx`: state, inputs on step 5, sent to `/guided/generate` and `/drops`.
- `Web/app/compose.css`: `.gc-clarity` row styles.
- `Frontend/src/components/drops/GuidedConfession.jsx`: same changes as the web form, with `clarityRow` / `clarityText` / `clarityField` styles.

No new dependencies, no env vars, no migration (old drops just lack the fields).

### Checks
- `npx tsc --noEmit -p .` in `Web/`: clean.
- Babel parse of `Frontend/src/components/drops/GuidedConfession.jsx`: OK.
- `import app.main` with `Backend/venv`: OK.
- Direct check of `clean_guided`: trims and caps at 80; blocks a phone number, an `@handle` and "you pay for dinner".
- Not checked: the form in a browser or device (it's behind sign-in), and a live `/guided/generate` call (needs the Anthropic key).

### How to test
1. Sign in, go to /compose (web) or the hookup composer (app), and choose the guided hookup.
2. On "If the chemistry feels right, what's possible?", fill or skip the two lines, then reveal. With the writer on, the draft should reflect them, and a "don't want" should never come out as a want.
3. Drop it, then read it back from `GET /drops/...` (feed) and confirm `hookup.guided.want` / `dont_want`.
4. Try a phone number or "pay" in either line: posting should fail with the contact or money message.

## Not for product this run
- Idea 1 (face-estimation age checks): needs a vendor and budget. Founder decision.
- Ideas 3 and 4 (situationship and night-time drops): content scout.

## Open questions
- Which option for the official-drop name (see idea 2)?
- Should the clarity lines show on the card publicly, or only shape the confession? They are stored and returned either way.
