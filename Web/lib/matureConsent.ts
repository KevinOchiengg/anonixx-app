"use client";
/**
 * One tap on a "Mature content" veil opens every mature post, not just that one.
 * The choice is remembered on this device (localStorage) and shared live across
 * all slides on the page, so the veil never comes back. Age-verified accounts
 * skip the veil entirely (see Slide.tsx).
 */
import { useSyncExternalStore } from "react";

const KEY = "anonixx.mature.ok";
const listeners = new Set<() => void>();
let memory = false; // fallback when storage is blocked

function read(): boolean {
  try { return memory || localStorage.getItem(KEY) === "1"; } catch { return memory; }
}

export function allowMature() {
  memory = true;
  try { localStorage.setItem(KEY, "1"); } catch { /* storage blocked: memory still holds it this visit */ }
  listeners.forEach((l) => l());
}

export function useMatureOk(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    read,
    () => false,
  );
}
