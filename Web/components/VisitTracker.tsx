"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { flush, startsSession, track, trackingAllowed } from "@/lib/track";

// Links worth knowing about when clicked: the doors into Anonixx.
const KEY_PATHS = ["/signup", "/join", "/login", "/premium", "/coins", "/compose", "/whatsapp", "/search", "/market", "/vibe"];

// Drop ids and other long ids collapse, so clicks group by kind of link.
const shape = (path: string) => path.replace(/\/[0-9a-f]{24}\b/g, "/:id");

function clickTarget(el: Element): string | null {
  const tagged = el.closest("[data-track]");
  if (tagged) return tagged.getAttribute("data-track");
  const a = el.closest("a[href]") as HTMLAnchorElement | null;
  if (a) {
    let url: URL;
    try { url = new URL(a.href, location.href); } catch { return null; }
    if (url.origin !== location.origin) return `out:${url.hostname.replace(/^www\./, "")}`;
    const p = url.pathname;
    return KEY_PATHS.some((k) => p === k || p.startsWith(`${k}/`)) ? `link:${shape(p)}` : null;
  }
  const b = el.closest("button") as HTMLButtonElement | null;
  if (!b) return null;
  const label = (b.getAttribute("aria-label") || b.textContent || "").replace(/\s+/g, " ").trim();
  return label && label.length <= 32 ? `button:${label}` : null;
}

/** Mounted once in the root layout: page views, time on page, key clicks. */
export default function VisitTracker() {
  const path = usePathname();
  const shown = useRef<{ path: string; at: number; active: number } | null>(null);

  // A page view on every route change; the previous page gets its time on page.
  useEffect(() => {
    if (!path || !trackingAllowed()) return;
    const prev = shown.current;
    if (prev) track("leave", { p: prev.path, ms: prev.active + (Date.now() - prev.at) });
    const fresh = startsSession();
    const q = new URLSearchParams(location.search);
    const utm = { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign") };
    track("view", fresh ? { l: 1, r: document.referrer || undefined, u: utm } : {});
    shown.current = { path, at: Date.now(), active: 0 };
  }, [path]);

  useEffect(() => {
    if (!trackingAllowed()) return;
    const onClick = (e: MouseEvent) => {
      const k = e.target instanceof Element ? clickTarget(e.target) : null;
      if (k) track("click", { k });
    };
    // Time on page counts only while the tab is visible.
    const onVis = () => {
      const s = shown.current;
      if (!s) return;
      if (document.visibilityState === "hidden") {
        track("leave", { p: s.path, ms: s.active + (Date.now() - s.at) });
        s.active = 0;
        s.at = Number.POSITIVE_INFINITY;
        flush(true);
      } else {
        s.at = Date.now();
      }
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return null;
}
