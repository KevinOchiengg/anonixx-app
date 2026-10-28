/**
 * useState that's saved (debounced) and restored by key, so unsent text survives leaving.
 *   const [text, setText, clearText] = useDraft(`comment:${postId}`, '');
 * A null key turns saving off; old drafts expire. Never use for passwords or payment details.
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

