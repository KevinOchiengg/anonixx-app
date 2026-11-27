// Feed card categories and helpers, shared by the feed card and the composers' previews.
// Same as the app (Frontend/src/components/feed/ConfessionCard.jsx).
import type { Post } from "@/lib/api";
import { splitHook } from "@/lib/captionHook";
import { timeLeft } from "@/lib/linkup";

export type Category = "curiosity" | "linkup";

export const CATEGORIES: Record<Category, { label: string; tint: string }> = {
  curiosity: { label: "Confession", tint: "var(--rose)" },
  linkup: { label: "Link Up", tint: "var(--rose)" },
};

export const categoryOf = (post: Pick<Post, "category" | "kind">): Category => {
  const category = post.category ?? (post.kind === "hookup" ? "linkup" : "curiosity");
  return category === "linkup" ? "linkup" : "curiosity";
};

/** Headline + body: the first line is the headline (see captionHook); no line break, all body. */
export function splitConfession(text: string): { head: string; body: string } {
  const t = (text || "").trim();
  if (!t) return { head: "", body: "" };
  const parts = splitHook(t);
  if (!parts) return { head: "", body: t };
  return { head: parts.hook, body: parts.rest };
}


export type Fact = { text: string; hot?: boolean };

const HOSTING: Record<string, string> = { can_host: "can host", can_travel: "you host", either: "host or travel" };
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
    h.area ? { text: `Location: ${h.area}` } : null,
    h.age ? { text: `Age: ${h.age}` } : null,
    h.gender && h.gender !== "other" ? { text: `Gender: ${h.gender}` } : null,
    who ? { text: `${who}${range ? ` ${range}` : ""}` } : null,
    ...(h.vibes || []).slice(0, 2).map((v) => ({ text: v })),
    h.guided?.hosting && HOSTING[h.guided.hosting] ? { text: HOSTING[h.guided.hosting] } : null,
  ];
  return out.filter((f): f is Fact => Boolean(f));
}
