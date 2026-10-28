"use client";
import { useEffect, useState } from "react";
import { uploadFile, CANCELLED } from "./upload";
import { streamEnabled, uploadToStream } from "./streamVideo";

// A video starts uploading as soon as it's picked, while the caption, trim and cover are done.
// Publish waits for wait(), so pressing it early is fine.

export type BgResult = { url: string } | { streamUid: string };
export type BgState = {
  status: "uploading" | "done" | "error" | "cancelled";
  pct: number;
  etaSec: number | null;
  error: string;
};

export class BgUpload {
  readonly file: File;
  state: BgState = { status: "uploading", pct: 0, etaSec: null, error: "" };
  private ctl = new AbortController();
  private listeners = new Set<(s: BgState) => void>();
  private samples: [number, number][] = [];   // [time ms, fraction] for the speed estimate
  private promise: Promise<BgResult>;

  constructor(file: File) {
    this.file = file;
    this.promise = this.run();
    this.promise.catch(() => {});   // handled through state; wait() rethrows for callers
  }

  private set(p: Partial<BgState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((fn) => fn(this.state));
  }

  private progress = (pct: number) => {
    const now = performance.now();
    this.samples.push([now, pct / 100]);
    while (this.samples.length > 2 && now - this.samples[0][0] > 8000) this.samples.shift();
    const [t0, f0] = this.samples[0];
    const rate = now > t0 ? (pct / 100 - f0) / (now - t0) : 0;   // fraction per ms
    const etaSec = rate > 0 && pct < 100 ? Math.round((1 - pct / 100) / rate / 1000) : null;
    this.set({ pct, etaSec });
  };

  private async run(): Promise<BgResult> {
    try {
      const signal = this.ctl.signal;
      const result: BgResult = (await streamEnabled())
        ? { streamUid: await uploadToStream(this.file, this.progress, signal) }
        : { url: await uploadFile(this.file, "video", this.progress, signal) };
      this.set({ status: "done", pct: 100, etaSec: 0 });
      return result;
    } catch (e) {
      const msg = (e as Error).message;
      this.set(msg === CANCELLED ? { status: "cancelled" } : { status: "error", error: msg });
      throw e;
    }
  }

  wait(): Promise<BgResult> { return this.promise; }

  cancel() {
    if (this.state.status === "uploading") this.ctl.abort();
  }

  subscribe(fn: (s: BgState) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}

export function useBgUpload(up: BgUpload | null): BgState | null {
  const [state, setState] = useState<BgState | null>(up?.state ?? null);
  useEffect(() => {
    setState(up?.state ?? null);
    return up?.subscribe(setState);
  }, [up]);
  return state;
}

export const fmtMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)}MB`;
export const fmtEta = (s: number | null) =>
  s == null ? "" : s < 60 ? `${Math.max(1, s)}s left` : `${Math.floor(s / 60)}m ${s % 60}s left`;
