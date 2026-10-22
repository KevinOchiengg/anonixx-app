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

/** "5h left", "40m left", or null once the post has ended (or has no window). */
export function timeLeft(iso?: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = parse(iso) - now;
  if (!(ms > 0)) return null;
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  return `${h}h left`;
}

export const isEnded = (iso?: string | null, now = Date.now()) => !!iso && !(parse(iso) - now > 0);
