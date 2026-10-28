"use client";
/** One tap on a mature-content veil opens all mature posts, remembered on this device.
 * Age-verified accounts never see the veil. */
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
