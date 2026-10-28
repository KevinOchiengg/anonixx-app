"use client";
import { useEffect } from "react";

const KEY = "adm:place:";

/** Returns the admin to their scroll position on a page after they leave and come back,
 * once the page's data has loaded. Per tab, by path. */
export function useKeepPlace(path: string) {
  useEffect(() => {
    const key = KEY + path;
    let saved = 0;
    try { saved = Number(sessionStorage.getItem(key) || 0); } catch {}
    let restoring = saved > 0;

    const remember = () => {
      if (restoring) return;
      try { sessionStorage.setItem(key, String(Math.round(window.scrollY))); } catch {}
    };
    const stop = () => { restoring = false; };
    const tryRestore = () => {
      if (!restoring) return;
      if (document.documentElement.scrollHeight - window.innerHeight >= saved) {
        window.scrollTo(0, saved);
        restoring = false;
      }
    };

    const ro = new ResizeObserver(tryRestore);
    ro.observe(document.body);
    tryRestore();
    const giveUp = window.setTimeout(stop, 8000);
    // The admin scrolling or typing first wins over the restore.
    const opts = { passive: true } as const;
    window.addEventListener("wheel", stop, opts);
    window.addEventListener("touchmove", stop, opts);
    window.addEventListener("keydown", stop);
    window.addEventListener("scroll", remember, opts);
    // Save the exact spot the moment a link is clicked, before the page changes.
    window.addEventListener("click", remember, true);

    return () => {
      ro.disconnect();
      window.clearTimeout(giveUp);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("scroll", remember);
      window.removeEventListener("click", remember, true);
    };
  }, [path]);
}
