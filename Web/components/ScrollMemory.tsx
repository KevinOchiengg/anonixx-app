"use client";

import { useEffect } from "react";

const KEY = "anx_scroll";
const RESTORE_FOR_MS = 3000;

// Window scroll, per page. Back puts you where you were once the page has loaded enough.
export default function ScrollMemory() {
  useEffect(() => {
    let spots: Record<string, number> = {};
    try { spots = JSON.parse(sessionStorage.getItem(KEY) || "{}"); } catch { /* ignore */ }
    const here = () => window.location.pathname + window.location.search;
    let restoring = false;
    let frame = 0;
    let stop: (() => void) | null = null;

    const persist = () => { try { sessionStorage.setItem(KEY, JSON.stringify(spots)); } catch { /* ignore */ } };
    const onScroll = () => {
      if (restoring || frame) return;
      frame = requestAnimationFrame(() => { frame = 0; spots[here()] = window.scrollY; });
    };

    const onPop = () => {
      stop?.();
      const target = spots[here()];
      if (!target) return;
      restoring = true;
      const started = Date.now();
      const cancel = () => finish();
      const timer = window.setInterval(() => {
        const room = document.documentElement.scrollHeight - window.innerHeight;
        if (room >= target - 2) {
          window.scrollTo(0, target);
          if (Math.abs(window.scrollY - target) < 3) finish();
        } else if (Date.now() - started > RESTORE_FOR_MS) {
          window.scrollTo(0, room);
          finish();
        }
      }, 50);
      function finish() {
        window.clearInterval(timer);
        window.removeEventListener("wheel", cancel);
        window.removeEventListener("touchstart", cancel);
        window.removeEventListener("keydown", cancel);
        restoring = false;
        stop = null;
      }
      window.addEventListener("wheel", cancel, { passive: true });
      window.addEventListener("touchstart", cancel, { passive: true });
      window.addEventListener("keydown", cancel);
      stop = finish;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPop);
    window.addEventListener("pagehide", persist);
    const save = window.setInterval(persist, 2000);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("pagehide", persist);
      window.clearInterval(save);
      stop?.();
    };
  }, []);
  return null;
}
