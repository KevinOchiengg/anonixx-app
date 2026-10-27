import type { Post } from "@/lib/api";

// Link up extras shared by the sheet, the Room and the inbox. Ids match the
// backend's INTENT_CHIPS; anything unknown is dropped server side.
export const INTENTS: { id: string; label: string }[] = [
  { id: "free-tonight", label: "Free tonight" },
  { id: "can-host", label: "Can host" },
  { id: "can-pick-up", label: "Can pick you up" },
  { id: "drinks-first", label: "Drinks first" },
  { id: "just-talk", label: "Just talk first" },
  { id: "nearby", label: "I'm nearby" },
];

export const MAX_PITCH = 120;
export const MAX_INTENTS = 4;

export const intentLabel = (id: string) => INTENTS.find((i) => i.id === id)?.label || id;

function parse(iso: string) {
  const t = iso.replace(" ", "T");
  return new Date(/Z$|[+-]\d{2}:\d{2}$/.test(t) ? t : t + "Z").getTime();
}

// Compact facts from a hookup post (age, area, who, hosting), so the confession never has to list them.
const HOSTING_TAG: Record<string, string> = { can_host: "can host", can_travel: "can travel", either: "host or travel" };
export function hookupTags(h: Post["hookup"]): string[] {
  if (!h) return [];
  const wanted = !h.age_min && !h.age_max ? "" : h.age_min && h.age_min === h.age_max ? `${h.age_min}` : `${h.age_min || 18}–${h.age_max || 99}`;
  const who = h.looking_for === "woman" ? "into women" : h.looking_for === "man" ? "into men" : wanted ? "looking for" : null;
  const range = wanted ? ` ${wanted}` : "";
  return [
    h.age ? `${h.age}${h.gender && h.gender !== "other" ? ` · ${h.gender}` : ""}` : null,
    h.area || null,
    who ? who + range : null,
    (h.guided?.hosting && HOSTING_TAG[h.guided.hosting]) || null,
    h.guided?.public_first ? "public first" : null,
  ].filter((x): x is string => Boolean(x));
}

// Fresh windows (Backend FRESH_WINDOWS): the label a live hookup post wears.
export const FRESH_LABEL: Record<string, string> = { tonight: "Tonight", weekend: "This weekend", week: "This week", flexible: "Open" };

/** "5h left", "40m left", "3d left", or null once the post has ended (or has no window). */
export function timeLeft(iso?: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = parse(iso) - now;
  if (!(ms > 0)) return null;
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  return h >= 48 ? `${Math.floor(h / 24)}d left` : `${h}h left`;
}

export const isEnded = (iso?: string | null, now = Date.now()) => !!iso && !(parse(iso) - now > 0);
