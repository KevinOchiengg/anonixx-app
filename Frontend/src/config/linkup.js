/** Link up extras. Ids match INTENT_CHIPS in unlock_requests.py. */
export const INTENTS = [
  { id: 'free-tonight', label: 'Free tonight' },
  { id: 'can-host',     label: 'Can host' },
  { id: 'can-pick-up',  label: 'Can pick you up' },
  { id: 'drinks-first', label: 'Drinks first' },
  { id: 'just-talk',    label: 'Just talk first' },
  { id: 'nearby',       label: "I'm nearby" },
];

export const MAX_PITCH = 120;
export const MAX_INTENTS = 4;

export const intentLabel = (id) => INTENTS.find((i) => i.id === id)?.label || id;

function parse(iso) {
  const t = String(iso).replace(' ', 'T');
  return new Date(/Z$|[+-]\d{2}:\d{2}$/.test(t) ? t : `${t}Z`).getTime();
}

// "5h left", "40m left", or null once the post has ended (or has no window).
export function timeLeft(iso, now = Date.now()) {
  if (!iso) return null;
  const ms = parse(iso) - now;
  if (!(ms > 0)) return null;
  const m = Math.ceil(ms / 60000);
  return m < 60 ? `${m}m left` : `${Math.floor(m / 60)}h left`;
}
