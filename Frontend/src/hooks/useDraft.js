/**
 * useDraft — useState that survives leaving the screen.
 *
 *   const [text, setText, clearText] = useDraft(`comment:${postId}`, '');
 *
 * Whatever someone types is saved to AsyncStorage (debounced) under the key and
 * restored next time the same key mounts, so an unsent comment, message or post
 * is still there when they come back. A value equal to `initial` removes the
 * entry. Call the third item after a successful send to forget the draft.
 *
 * A null/undefined key turns saving off (e.g. while an id isn't known yet).
 * Drafts older than MAX_AGE are dropped. Never use this for passwords, codes or
 * payment details.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'anonixx.draft.';
const MAX_AGE = 30 * 24 * 3600 * 1000;

export default function useDraft(key, initial) {
  const [value, setValue] = useState(initial);
  const initialRef = useRef(initial);
  const loaded = useRef(false);
  const touched = useRef(false);

  useEffect(() => {
    loaded.current = false;
    touched.current = false;
    setValue(initialRef.current);
    if (!key) { loaded.current = true; return undefined; }
    let alive = true;
    AsyncStorage.getItem(PREFIX + key)
      .then((raw) => {
        if (!alive || !raw || touched.current) return;
        const saved = JSON.parse(raw);
        if (saved && Date.now() - saved.t < MAX_AGE) setValue(saved.v);
      })
      .catch(() => {})
      .finally(() => { if (alive) loaded.current = true; });
    return () => { alive = false; };
  }, [key]);

  useEffect(() => {
    if (!key || !loaded.current) return undefined;
    const t = setTimeout(() => {
      const empty = JSON.stringify(value) === JSON.stringify(initialRef.current);
      (empty
        ? AsyncStorage.removeItem(PREFIX + key)
        : AsyncStorage.setItem(PREFIX + key, JSON.stringify({ v: value, t: Date.now() }))
      ).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [key, value]);

  const set = useCallback((v) => { touched.current = true; setValue(v); }, []);
  const clear = useCallback(() => {
    setValue(initialRef.current);
    if (key) AsyncStorage.removeItem(PREFIX + key).catch(() => {});
  }, [key]);

  return [value, set, clear];
}

/** Whether a draft exists for `key` (for "pick up where you left off" choices). */
export async function hasDraft(key) {
  try { return !!(await AsyncStorage.getItem(PREFIX + key)); } catch { return false; }
}
