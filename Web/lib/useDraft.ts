"use client";
/**
 * useDraft: useState that survives leaving the page.
 *
 *   const [text, setText, clearText] = useDraft(`comment:${postId}`, "");
 *
 * What someone types is saved to localStorage (debounced) under the key and
 * restored next time the same key mounts, so an unsent comment, message or post
 * is still there when they come back. A value equal to `initial` removes the
 * entry; call the third item after a successful send to forget the draft.
 * A null key turns saving off. Drafts older than MAX_AGE are dropped.
 * Never use this for passwords, codes or payment details.
 * Mirrors Frontend/src/hooks/useDraft.js.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "anonixx.draft.";
const MAX_AGE = 30 * 24 * 3600 * 1000;

export default function useDraft<T>(key: string | null, initial: T): [T, (v: T | ((cur: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(initial);
  const initialRef = useRef(initial);
  const loaded = useRef(false);

  useEffect(() => {
    loaded.current = false;
    let next = initialRef.current;
    if (key) {
      try {
        const saved = JSON.parse(localStorage.getItem(PREFIX + key) || "null");
        if (saved && Date.now() - saved.t < MAX_AGE) next = saved.v as T;
      } catch { /* storage unavailable or corrupt */ }
    }
    setValue(next);
    loaded.current = true;
  }, [key]);

  useEffect(() => {
    if (!key || !loaded.current) return;
    const t = setTimeout(() => {
      try {
        if (JSON.stringify(value) === JSON.stringify(initialRef.current)) localStorage.removeItem(PREFIX + key);
        else localStorage.setItem(PREFIX + key, JSON.stringify({ v: value, t: Date.now() }));
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [key, value]);

  const clear = useCallback(() => {
    setValue(initialRef.current);
    try { if (key) localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
  }, [key]);

  return [value, setValue, clear];
}
