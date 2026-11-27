import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isBackNav } from "./backNav";

// Back/forward returns you to the page as you left it: same data, tab, filters and scroll.
// Going forward to a page always starts fresh.

const STATE_KEY = "anx_kept";

function readAll(): Record<string, unknown> {
  try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || "{}"); } catch { return {}; }
}

function writeOne(key: string, value: unknown) {
  try {
    const all = readAll();
    all[key] = value;
    const keys = Object.keys(all);
    if (keys.length > 200) keys.slice(0, keys.length - 200).forEach((k) => delete all[k]);
    sessionStorage.setItem(STATE_KEY, JSON.stringify(all));
  } catch { /* storage full or blocked */ }
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** useState that comes back as you left it when you return with Back. */
export function useKept<T>(name: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(initial);
  const key = useRef("");
  const ready = useRef(false);
  useIsoLayoutEffect(() => {
    key.current = `${window.location.pathname}|${name}`;
    if (isBackNav()) {
      const all = readAll();
      if (key.current in all) setValue(all[key.current] as T);
    }
    ready.current = true;
  }, [name]);
  useEffect(() => {
    if (ready.current) writeOne(key.current, value);
  }, [value]);
  return [value, setValue] as const;
}

/** True when Back is about to restore this kept value, so the page can skip its first fetch. */
export function hasKept(name: string) {
  return typeof window !== "undefined" && isBackNav() && `${window.location.pathname}|${name}` in readAll();
}
