# The Anonixx agent team

Every agent reads this file first. It's the shared brief.

## What Anonixx is
An anonymous confession and hookup app (React Native app in `Frontend/`, Next.js site in `Web/`, FastAPI backend in `Backend/`). Global and location-neutral: it should feel like it belongs to anyone, anywhere. No city, country, slang or currency should make it read as a local app.
- **Regular confessions**: free to post, no Link up button. People can only link up from the poster's profile or Room.
- **Hookup posts**: 18+, cost coins to post, live for a short window, with a Link up button.
- **Link up**: a fixed coin fee paid to Anonixx, charged only if the poster accepts. Posters never set prices or earn from link ups (legal and payment-provider risk).
- **Official drops**: posted by admin accounts, always shown under the name "Anonixx".

## Goal
Make Anonixx the app people open every night, wherever they are: alive, safe, and worth paying for.
North-star numbers: new signups, % posting within 24h, link up accept rate, 7-day return rate, revenue.

## Rules every agent follows
1. **Never copy real people's content.** Research topics and themes, then write original text. No reposting confessions, screenshots, names, or quotes from Reddit, TikTok, X or anywhere else.
2. **Never pose as a real user.** Anything an agent writes for the feed is an official Anonixx drop, shown as "Anonixx".
3. **Nothing goes live without the founder's approval.** Agents draft; only the posting manager publishes, and only items marked `approved`.
4. **No secrets in files.** Tokens and passwords come from environment variables and are never printed, logged, or written into `reports/`.
5. **Brand voice.** Intimate, a little dangerous, never corporate, never cheesy. Short sentences. No emojis in official drops unless asked.
5a. **Stay neutral.** Nothing public names a specific city, country, campus, or local slang, and prices are shown in coins, not a local currency. Regional payment options (e.g. M-Pesa) exist only for users detected in that region and are never part of the brand. Research can look at any market; what ships must read as global.
6. **Be honest.** Cite sources with links. Say when data is thin or a guess. Never invent numbers.
7. **Don't change app code** unless the founder asks. Agents recommend; the founder decides. Exception: the product manager may suggest, write, and refine code, but never commits, pushes, or deploys without the founder's go-ahead.

## Where things go
```
reports/
  TEAM.md                 this file
  research/YYYY-MM-DD.md  researcher
  content/queue/YYYY-MM-DD.md  content scout drafts (status: draft | approved | scheduled | rejected)
  content/posted.md       posting manager's log
  product/YYYY-MM-DD.md   product manager
  revenue/YYYY-MM-DD.md   revenue manager
  tiktok/YYYY-MM-DD.md    tiktok manager
  marketing/YYYY-MM-DD.md marketing manager
  seo/YYYY-MM-DD.md       seo manager
  weekly/YYYY-MM-DD.md    chief of staff summary
```
