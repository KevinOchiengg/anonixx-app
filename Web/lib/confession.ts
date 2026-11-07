// Feed card categories and helpers, shared by the feed card and the composers' previews.
// Same as the app (Frontend/src/components/feed/ConfessionCard.jsx).
import type { Post } from "@/lib/api";
import { splitHook } from "@/lib/captionHook";
import { timeLeft } from "@/lib/linkup";

export type Category = "curiosity" | "linkup" | "vulnerable";

// Tints are existing theme variables only (globals.css): violet, rose, fg.
export const CATEGORIES: Record<Category, { label: string; tint: string; action: string | null }> = {
  curiosity: { label: "Curiosity", tint: "var(--violet)", action: "Ask what happened next" },
  linkup: { label: "Link Up", tint: "var(--rose)", action: null },
  vulnerable: { label: "Vulnerable", tint: "var(--fg)", action: "I've felt this too" },
};

export const categoryOf = (post: Pick<Post, "category" | "kind">): Category =>
  post.category && post.category in CATEGORIES ? post.category : post.kind === "hookup" ? "linkup" : "curiosity";

// Mirrors drop_category() in Backend/app/api/v1/drops.py, for the composer preview.
const VULNERABLE_TOPICS = ["heartbreak", "regret", "betrayal", "anger", "relief", "confusion", "growth", "family"];
const VULNERABLE_WORDS = /\b(cry|cried|crying|tears|hurt|hurts|hurting|alone|lonely|loneliness|scared|afraid|depress\w*|anxious|anxiety|heartbr\w*|broke my heart|ashamed|shame|guilt\w*|grief|griev\w*|numb|empty inside|miss (?:him|her|them|you)|lost my|healing|forgive)\b/i;
export function autoCategory(picked: Category | null, topics: string[], text: string): Category {
  if (picked) return picked;
  return topics.some((t) => VULNERABLE_TOPICS.includes(t)) || VULNERABLE_WORDS.test(text) ? "vulnerable" : "curiosity";
}

/** Headline + body. A real first sentence or line is the headline; a short confession is all
 * headline; a long run-on with no sentence break is all body. */
export function splitConfession(text: string): { head: string; body: string } {
  const t = (text || "").trim();
  if (!t) return { head: "", body: "" };
  const parts = splitHook(t);
  if (!parts) return { head: "", body: t };
  if (!parts.rest) return t.length <= 160 ? { head: t, body: "" } : { head: "", body: t };
  if (parts.inline) return { head: "", body: t };
  return { head: parts.hook, body: parts.rest };
}

export const topicLabel = (t: string) => (t === "growth" ? "Personal growth" : t.charAt(0).toUpperCase() + t.slice(1));

export type Fact = { text: string; hot?: boolean };

const HOSTING: Record<string, string> = { can_host: "can host", can_travel: "can travel", either: "host or travel" };
const WHEN: Record<string, string> = { asap: "ASAP", today: "Today", tonight: "Tonight", week: "This week", flexible: "Flexible" };
const FRESH: Record<string, string> = { tonight: "Tonight", weekend: "This weekend", week: "This week", flexible: "Flexible" };

/** Compact facts for a Link Up card. Area is the poster's own words, never coordinates.
 * liveUntil null = a draft: shows when they'd like to meet instead of a countdown. */
export function linkUpFacts(h: Post["hookup"] | null | undefined, liveUntil: string | null | undefined): Fact[] {
  if (!h) return [];
  const range = !h.age_min && !h.age_max ? ""
    : h.age_min && h.age_min === h.age_max ? `${h.age_min}` : `${h.age_min || 18}–${h.age_max || 99}`;
  const who = h.looking_for === "woman" ? "Into women" : h.looking_for === "man" ? "Into men"
    : h.looking_for === "anyone" ? "Open to anyone" : range ? "Looking for" : null;
  const left = timeLeft(liveUntil);
  const when = WHEN[h.guided?.meet_when || ""] || FRESH[h.fresh_window || ""] || null;
  const out: (Fact | null)[] = [
    left ? { text: `${when || "Live"} · ${left}`, hot: true } : liveUntil ? { text: "Ended" } : when ? { text: when, hot: true } : null,
    h.age ? { text: `${h.age}${h.gender && h.gender !== "other" ? ` · ${h.gender}` : ""}` } : null,
    h.area ? { text: h.area } : null,
    who ? { text: `${who}${range ? ` ${range}` : ""}` } : null,
    ...(h.vibes || []).slice(0, 2).map((v) => ({ text: v })),
    h.guided?.hosting && HOSTING[h.guided.hosting] ? { text: HOSTING[h.guided.hosting] } : null,
    h.guided?.public_first ? { text: "public first" } : null,
  ];
  return out.filter((f): f is Fact => Boolean(f));
}
