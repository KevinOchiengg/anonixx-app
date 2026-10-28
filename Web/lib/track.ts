import { API_URL, deviceTz, getToken, viewerCountry } from "./api";

/** Anonymous visit tracking for the Visitors page. Random visitor id; sessions end after 30
 * idle minutes. Nothing is sent for Do Not Track, bots or admin pages. Batched as text/plain,
 * with sendBeacon when the tab hides. */

type Ev = Record<string, unknown> & { t: string; p: string };

const VID_KEY = "anx_vid";
const FIRST_KEY = "anx_first";   // first touch: where this browser first came from (sent with signup)
const SID_KEY = "anx_sid";
const SEEN_KEY = "anx_sid_at";
const IDLE_MS = 30 * 60 * 1000;
const FLUSH_MS = 5000;

let queue: Ev[] = [];
let timer: number | null = null;
let searchTimer: number | null = null;

const rid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
  ).toLowerCase().slice(0, 32);

export function trackingAllowed(): boolean {
  if (typeof window === "undefined") return false;
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (n.webdriver || n.globalPrivacyControl || n.doNotTrack === "1") return false;
  return !location.pathname.startsWith("/admin");
}

function ids(): { vid: string; sid: string; fresh: boolean } | null {
  try {
    let vid = localStorage.getItem(VID_KEY);
    if (!vid) { vid = rid(); localStorage.setItem(VID_KEY, vid); }
    let sid = sessionStorage.getItem(SID_KEY);
    const seen = Number(sessionStorage.getItem(SEEN_KEY) || 0);
    let fresh = false;
    if (!sid || Date.now() - seen > IDLE_MS) { sid = rid(); sessionStorage.setItem(SID_KEY, sid); fresh = true; }
    sessionStorage.setItem(SEEN_KEY, String(Date.now()));
    return { vid, sid, fresh };
  } catch {
    return null;   // storage blocked: don't track
  }
}

/** This browser's anonymous visitor id (null if storage is blocked). */
export function visitorId(): string | null {
  return ids()?.vid ?? null;
}

/** Remember the very first referrer / campaign / landing page, once per browser. */
export function rememberFirstTouch(ref: string | undefined, utm: Record<string, string | null>) {
  try {
    if (localStorage.getItem(FIRST_KEY)) return;
    let host = "";
    try { host = ref ? new URL(ref).hostname.replace(/^www\./, "") : ""; } catch { /* bad referrer */ }
    if (host.endsWith("anonixx.com")) host = "";
    localStorage.setItem(FIRST_KEY, JSON.stringify({
      ref: host || undefined,
      utm_source: utm.source || undefined, utm_medium: utm.medium || undefined, utm_campaign: utm.campaign || undefined,
      landing: location.pathname, at: Date.now(),
    }));
  } catch { /* storage blocked */ }
}

/** Where this person came from, for the signup request (POST /auth/register). */
export function signupSource(): Record<string, string> {
  const out: Record<string, string> = { platform: "web" };
  try {
    const first = JSON.parse(localStorage.getItem(FIRST_KEY) || "{}");
    for (const k of ["ref", "utm_source", "utm_medium", "utm_campaign", "landing"]) {
      if (typeof first[k] === "string" && first[k]) out[k] = first[k];
    }
    const vid = localStorage.getItem(VID_KEY);
    if (vid) out.vid = vid;
  } catch { /* storage blocked */ }
  return out;
}

/** True when this page view starts a new session (it then carries referrer and UTM). */
export function startsSession(): boolean {
  const i = ids();
  return Boolean(i?.fresh);
}

export function flush(beacon = false) {
  if (!queue.length) return;
  const i = ids();
  if (!i) { queue = []; return; }
  const body = JSON.stringify({ vid: i.vid, sid: i.sid, cc: viewerCountry(), tz: deviceTz(), in: Boolean(getToken()), events: queue.splice(0, 25) });
  const url = `${API_URL}/track`;
  try {
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
    } else {
      fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
    }
  } catch { /* never let analytics break the page */ }
  if (queue.length) flush(beacon);
}

export function track(t: string, data: Record<string, unknown> = {}) {
  if (!trackingAllowed()) return;
  queue.push({ t, p: location.pathname, ...data });
  if (timer === null) {
    timer = window.setTimeout(() => { timer = null; flush(); }, FLUSH_MS);
  }
}

/** Record a search once typing pauses. `n` = result count (-1 on error). */
export function trackSearch(q: string, extra: { theme?: string; place?: string; n?: number } = {}) {
  if (!trackingAllowed()) return;
  if (searchTimer !== null) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    searchTimer = null;
    track("search", { q: q.trim() || undefined, th: extra.theme || undefined, loc: extra.place || undefined, n: extra.n });
  }, 1500);
}
