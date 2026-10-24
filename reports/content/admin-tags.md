# Admin quick-tag list (official Anonixx posts)

status: draft (founder to approve before it goes into code)
date: 2026-10-24
author: content scout

## How tags work today (checked in code)
- `Web/components/admin/PostStudio.tsx`: `MAX_TAGS = 10`. `addTag()` splits on commas, strips a leading `#`, collapses spaces, lowercases, cuts at 30 chars, and drops duplicates. The current hard-coded `SUGGEST` list is generic ("funny", "advice", "music", ...).
- `Backend/app/api/v1/drops.py` (create_drop): admin-only. Each tag gets `strip().lstrip("#").lower()`, whitespace collapsed, cut at 30 chars, deduped, then `tags = tags[:10]`. Any characters are allowed. Tags are **search keywords** (so content can be found from the search bar) and are **not** passed through `violates_policy`. That means a curated preset list is the safety net, and this one is curated.
- So every tag below is lowercase, 1 to 3 words, under 30 chars, with no `#`, no commas, and no apostrophes (keeps search matching simple).

## Method and honesty note
No public dataset ranks "suggestive confession tags" by volume, so the 1 to 5 ratings are **my relative judgement** from the signals below, not measured search counts. Treat them as a starting order. After 2 to 4 weeks, re-rank by real in-app search and tap counts.
Signals used:
- Pornhub 2025 Year in Review press coverage. I only used the theme direction: lesbian/sapphic and trans interest up, "natural beauty / no make-up" growing at double digits, cosplay and anime-style interest high. The explicit category names themselves were excluded.
- Feeld Raw 2025: heteroflexible +193% (fastest-growing sexuality on the app), plus broad growth in kink curiosity and "pleasure positivity".
- Tinder Year in Swipe 2025: "clear-coding" (saying what you want), "hot take dating", the "calm after the plot", solo soft launches.
- TikTok: #situationship (1.1B views, per Bustle), "weekend lover" and "texts with my situationship" confession formats (YPulse, Jan 2026), toxic-ex and cheating storytime trends, "make-up story time" (4.4B views).
- Reddit confession communities: r/confession about 10.6M members, r/offmychest 3.3M, r/TrueOffMyChest 2.4M, r/confessions 1.3M (GummySearch snapshots).
- Whisper's long-running categories (Confessions, LGBTQ, NSFW, Q&A). Its most popular topics were relationships and sex.
- The app's own vocab: mood tags (longing, restless, unsent, reckless, dangerous), hookup vibes (casual, discreet, adventure), guided cravings (chemistry, intimacy, attention).

## Excluded on purpose
Anything hinting at youth (teen, young, schoolgirl, barely legal, petite, student), step/family, non-consent, drugs or drunk-sex framing, violence, paid arrangements (sugar, generous, the exchange, spoil me), explicit act or porn-category names (even top-ranked ones like hentai, milf, anal, threesome), "age gap" (can drift toward youth framing), and anything naming real people, brands or places.

---

## 1. Desire
| tag | pop | why / source |
|---|---|---|
| crush | 5 | Evergreen. Relationships are the #1 anonymous-app topic (Whisper) |
| chemistry | 5 | Matches the app's guided craving. Tinder "clear-coding" means saying what you want |
| kinks | 5 | Feeld Raw 2025 kink-curiosity growth. Suggestive word, not graphic |
| fantasy | 4 | Core adult-site discovery theme, kept non-graphic |
| tension | 4 | "Unresolved tension" posts do well in TikTok confession formats |
| forbidden | 4 | Secret/taboo-but-legal hook. Fits the "a little dangerous" voice |
| temptation | 4 | Cheating and almost-cheating confessions (r/confession themes) |
| slow burn | 3 | Big romance-fiction trope crossing over to dating talk |
| bi curious | 4 | Feeld: heteroflexible +193%. Pornhub: rising sapphic interest |
| sapphic | 3 | Pornhub 2025: lesbian content led in several markets. Neutral, non-explicit word |
| obsessed | 3 | Common caption word for crush and thirst content |
| curious | 3 | Matches the app's "curious" trait. Low-risk entry tag |

## 2. Secrets
| tag | pop | why / source |
|---|---|---|
| confession | 5 | The format itself. r/confession about 10.6M members |
| dirty secret | 5 | Founder-listed. Strong click word for an anonymous app |
| never told anyone | 5 | The core hook of r/confession and r/offmychest posts |
| guilty pleasure | 4 | Light, broad, easy for anyone to answer |
| unsent | 4 | App mood tag. "Unsent texts" is a long-running TikTok format |
| secret crush | 4 | Crush + secret, two top themes in one |
| regret | 4 | r/confession requires regret. A strong emotional pull |
| deleted text | 3 | "Text you never sent" prompt family |
| off my chest | 3 | Echoes r/offmychest (3.3M) without naming it |
| no one knows | 3 | Secret-keeping hook. Works on photo and voice posts |

## 3. Relationships
| tag | pop | why / source |
|---|---|---|
| situationship | 5 | #situationship 1.1B TikTok views. OED-listed. Google interest rising |
| toxic ex | 5 | Founder-listed. Toxic-ex TikTok sound trend (Bustle) |
| cheating | 5 | Cheating storytimes regularly pass millions of views |
| red flags | 5 | Evergreen dating vocabulary |
| the ick | 4 | Merriam-Webster listed, 2025 academic study, constant meme |
| ghosted | 4 | Long-running staple (Bark Gen Z slang guide) |
| exes | 4 | Exes are the most common confession subject |
| talking stage | 4 | Ambiguity-era dating term, pairs with situationship |
| mixed signals | 3 | Tinder 2025: singles are tired of uncertainty |
| breakup | 3 | Evergreen. Good for heartbreak and voice posts |
| friends to lovers | 3 | Romance trope used widely in dating confessions |
| weekend lover | 3 | YPulse Jan 2026 TikTok situationship-confession trend |
| soft launch | 3 | Tinder 2025 "solo soft launches" |
| almost relationship | 2 | Niche wording of the same theme. Useful for search |

## 4. Hookups
| tag | pop | why / source |
|---|---|---|
| hookup | 5 | Core app category. Top hookup-app search intent |
| first time | 5 | Founder-listed. Big confession theme (Whisper virginity confessions) |
| body count | 5 | Founder-listed. Constant debate topic on X and TikTok |
| one night stand | 4 | Classic hookup confession theme |
| no strings | 4 | Matches the "Just Tonight" intent. Non-graphic |
| friends with benefits | 4 | Named in the YPulse weekend-lover trend coverage |
| casual | 4 | App hookup vibe. Tinder notes clear intent-setting |
| discreet | 4 | App hookup vibe. Strong anonymous-app pull |
| just tonight | 3 | Mirrors the app's intent label |
| rebound | 3 | Post-breakup confession staple |
| walk of shame | 3 | Playful, well known worldwide |
| link up | 3 | App's own action word, so it drives people to the Link up feature |

## 5. Body and confidence
| tag | pop | why / source |
|---|---|---|
| thirst trap | 5 | Founder-listed. Big TikTok genre (PsyPost study coverage) |
| mirror selfie | 4 | Most common photo-post format |
| natural beauty | 4 | Pornhub 2025: "natural beauty / no make-up" growing at double digits. Safe wording |
| glow up | 4 | Evergreen before/after format |
| confidence | 4 | Positive framing. App-store friendly |
| rate me | 3 | Engagement bait that works with polls |
| fit check | 3 | Outfit-post staple, non-sexual |
| insecure | 3 | Vulnerable confessions drive replies |
| body positive | 3 | Inclusive. Avoids shaming any group |
| cosplay | 2 | Pornhub notes high cosplay interest. Keep to costume and outfit photos only |

## 6. Late night
| tag | pop | why / source |
|---|---|---|
| late night | 5 | App peak is 9pm to 1am. Already in the current SUGGEST list |
| 3am thoughts | 5 | Huge evergreen caption format |
| u up | 4 | Universal late-night text. Flirty, not explicit |
| after dark | 4 | Night-mode feel (backend night mode runs 22:00 to 03:00) |
| sleepless | 3 | Fits the restless and longing moods |
| midnight | 3 | Simple, searchable, good for scheduled night drops |
| lonely tonight | 3 | Matches the app's "warmth / companionship" cravings |
| restless | 3 | App mood tag |
| weekend | 3 | Weekend-plan talk peaks Thursday to Sunday |
| reckless | 2 | App mood tag. Edgy without being explicit |

## 7. Drama
| tag | pop | why / source |
|---|---|---|
| story time | 5 | Huge TikTok genre ("make-up story time" 4.4B views). Already in SUGGEST |
| plot twist | 4 | Confession-ending hook |
| caught | 4 | "Got caught" confessions, high curiosity |
| jealousy | 4 | Relationship-drama staple |
| love triangle | 4 | Classic drama format |
| revenge | 3 | Toxic-ex revenge storytimes (keep it petty, never violent) |
| betrayal | 3 | Cheating-adjacent, strong emotion |
| office romance | 3 | Universal workplace-crush theme |
| messy | 3 | Common caption word for chaotic stories |
| roommate drama | 2 | Popular niche storytime |

## 8. Trending formats
| tag | pop | why / source |
|---|---|---|
| hot take | 5 | Tinder 2025 "hot take dating". Matches the official hot-take drops |
| unpopular opinion | 5 | Evergreen debate format, drives comments |
| would you rather | 4 | Best-performing poll framing |
| red or green | 4 | Red/green-flag poll format |
| be honest | 4 | Invites confessions in replies |
| this or that | 3 | Two-option poll format |
| pov | 3 | Dominant TikTok caption format |
| beige flag | 2 | Current-term signal (lingo explainers citing TikTok Creative Center) |
| poll | 2 | Utility tag so polls are searchable |
| confess | 2 | Call-to-action tag for prompt drops |

Total: 88 tags in 8 groups.

---

## Top 15 quick picks (show first)
1. late night
2. situationship
3. confession
4. thirst trap
5. hookup
6. dirty secret
7. toxic ex
8. body count
9. cheating
10. first time
11. 3am thoughts
12. red flags
13. kinks
14. story time
15. hot take

---

## Sources
- [Pornhub 2025 trends (nss magazine)](https://www.nssmag.com/en/lifestyle/43649/porn-2025-pornhub-trends)
- [Pornhub annual report insights (To Vima)](https://www.tovima.com/world/what-the-world-watched-key-insights-from-pornhubs-annual-report)
- [Pornhub 2025 stats (Advocate)](https://www.advocate.com/gay-love-and-sex/pornhub-stats-2025)
- [Pornhub Canada 2025 (Daily Hive)](https://dailyhive.com/canada/pornhub-canada-search-2025)
- [Feeld Raw 2025](https://feeld.co/news/feeld-raw-2025)
- [Heteroflexibility spikes 193% (DatingNews)](https://www.datingnews.com/industry-trends/heteroflexibility-spikes-193-a-key-signal-for-dating-platforms-heading-into-2026/)
- [Tinder Year in Swipe 2025, US press release](https://filecache.mediaroom.com/mr5mr_tinder/181435/US_Year%20In%20Swipe%202025_Press%20Release.pdf)
- [Tinder Year in Swipe 2025 (Global Dating Insights)](https://www.globaldatinginsights.com/featured/tinder-releases-latest-year-in-swipe-report-and-predictions/)
- [YPulse: Purple Rain situationship confessions, Jan 2026](https://www.ypulse.com/newsfeed/2026/01/21/purple-rain-is-soundtracking-tiktoks-latest-situationship-confessions/)
- [Bustle: texts with my situationship](https://www.bustle.com/wellness/texts-with-my-situationship-tiktok-trend)
- [Bustle: toxic ex trend](https://www.bustle.com/wellness/toxic-ex-grand-theft-auto-trend-explained)
- [PsyPost: TikTok thirst traps study](https://www.psypost.org/new-study-links-watching-tiktok-thirst-traps-to-lower-relationship-trust-and-satisfaction/embed/)
- [The Griff: why storytime TikToks are popular](https://thegriff.ca/storytime-why-are-these-tiktoks-popular/)
- [GummySearch r/confession](https://gummysearch.com/r/confession) · [r/offmychest](https://gummysearch.com/r/offmychest) · [r/TrueOffMyChest](https://gummysearch.com/r/TrueOffMyChest/) · [r/confessions](https://gummysearch.com/r/confessions/)
- [TechCrunch: Whisper categories](https://techcrunch.com/?p=1004136) · [The Lantern on Whisper topics](https://www.thelantern.com/?p=487)
- [Merriam-Webster: ick](https://www.merriam-webster.com/slang/ick) · [Wikipedia: The ick](https://en.wikipedia.org/wiki/The_ick)
- [Bark: Gen Z dating slang](https://www.bark.us/blog/genz-slang-dating/)
- [NationalWorld: Gen Z dating lingo](https://www.nationalworld.com/your-world/language-expert-decodes-popular-gen-z-dating-lingo-as-tradwife-enters-the-dictionary-5279083)

Gaps: I found no usable OnlyFans/Fansly tag rankings (only low-quality SEO pages, plus a May 2026 Tubefilter note on OnlyFans' sports/comedy/podcast hubs), no ranked 2026 TikTok confession-hashtag data, and no Google Trends numbers for "body count". Those ratings rest on qualitative signals.

---

## JSON (drop into code)
```json
{"groups":[{"name":"Desire","tags":["crush","chemistry","kinks","fantasy","tension","forbidden","temptation","bi curious","slow burn","sapphic","obsessed","curious"]},{"name":"Secrets","tags":["confession","dirty secret","never told anyone","guilty pleasure","unsent","secret crush","regret","deleted text","off my chest","no one knows"]},{"name":"Relationships","tags":["situationship","toxic ex","cheating","red flags","the ick","ghosted","exes","talking stage","mixed signals","breakup","friends to lovers","weekend lover","soft launch","almost relationship"]},{"name":"Hookups","tags":["hookup","first time","body count","one night stand","no strings","friends with benefits","casual","discreet","just tonight","rebound","walk of shame","link up"]},{"name":"Body & confidence","tags":["thirst trap","mirror selfie","natural beauty","glow up","confidence","rate me","fit check","insecure","body positive","cosplay"]},{"name":"Late night","tags":["late night","3am thoughts","u up","after dark","sleepless","midnight","lonely tonight","restless","weekend","reckless"]},{"name":"Drama","tags":["story time","plot twist","caught","jealousy","love triangle","revenge","betrayal","office romance","messy","roommate drama"]},{"name":"Trending formats","tags":["hot take","unpopular opinion","would you rather","red or green","be honest","this or that","pov","beige flag","poll","confess"]}],"top":["late night","situationship","confession","thirst trap","hookup","dirty secret","toxic ex","body count","cheating","first time","3am thoughts","red flags","kinks","story time","hot take"]}
```
