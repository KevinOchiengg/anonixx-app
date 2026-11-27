// Set when the browser goes Back/Forward; pages then reuse what they showed before.
const BACK_WINDOW_MS = 2500;
let backAt = 0;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => { backAt = Date.now(); });
}

export const isBackNav = () => Date.now() - backAt < BACK_WINDOW_MS;

// ── GET responses, reused only when you come back with Back.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: unknown }>();

// Live data is always fetched fresh: chats, calls, counts, balances, the signed-in user.
const LIVE = /\/(messages|connections|chat|calls?|notifications|unread|coins|balance|wallet|auth|me)(\/|\?|$)/;

export function cachedGet(path: string): unknown | undefined {
  if (!isBackNav() || LIVE.test(path)) return undefined;
  const hit = cache.get(path);
  if (!hit || Date.now() - hit.at > CACHE_TTL_MS) return undefined;
  return hit.data;
}

export function rememberGet(path: string, data: unknown) {
  if (LIVE.test(path)) return;
  cache.set(path, { at: Date.now(), data });
  if (cache.size > 300) cache.delete(cache.keys().next().value as string);
}

export function forgetGets() {
  cache.clear();
}
