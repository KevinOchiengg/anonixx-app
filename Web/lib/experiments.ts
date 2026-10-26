"use client";
import { useEffect, useState } from "react";
import { API_URL } from "./api";
import { track, trackingAllowed, visitorId } from "./track";

/**
 * A/B tests set up on /admin/growth. Each visitor gets one variant per test,
 * fixed by a hash of their anonymous visitor id, so they always see the same
 * one; showing it records an "exp" event, and the dashboard compares signups
 * per variant. Visitors who aren't tracked (Do Not Track etc.) see the fallback.
 */
type Exp = { key: string; variants: { id: string; value: string }[] };

let cache: Promise<Exp[]> | null = null;
const shown = new Set<string>();

function load(): Promise<Exp[]> {
  if (!cache) {
    cache = fetch(`${API_URL}/experiments/active`)
      .then((r) => (r.ok ? r.json() : { experiments: [] }))
      .then((d) => (d.experiments || []) as Exp[])
      .catch(() => []);
  }
  return cache;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The variant text this visitor should see for `key`, or `fallback`. */
export function useExperiment(key: string, fallback: string): string {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    if (!trackingAllowed()) return;
    const vid = visitorId();
    if (!vid) return;
    let live = true;
    load().then((list) => {
      const exp = list.find((e) => e.key === key);
      if (!live || !exp || exp.variants.length < 2) return;
      const v = exp.variants[hash(`${vid}:${key}`) % exp.variants.length];
      setValue(v.value);
      if (!shown.has(key)) { shown.add(key); track("exp", { x: key, v: v.id }); }
    });
    return () => { live = false; };
  }, [key]);
  return value;
}
