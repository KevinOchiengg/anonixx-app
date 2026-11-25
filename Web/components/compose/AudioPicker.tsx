"use client";
import { useEffect, useRef, useState } from "react";
import type { VoiceDraft } from "./VoiceRecorder";

const BARS = 48;
const MAX_MB = 10;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

async function waveformOf(file: File): Promise<{ seconds: number; waveform: number[] } | null> {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    void ctx.close();
    const data = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / BARS));
    const raw: number[] = [];
    for (let i = 0; i < BARS; i++) {
      let sum = 0;
      const end = Math.min(data.length, (i + 1) * step);
      for (let j = i * step; j < end; j++) sum += data[j] * data[j];
      raw.push(Math.sqrt(sum / Math.max(1, end - i * step)));
    }
    const peak = Math.max(...raw) || 1;
    return { seconds: buf.duration, waveform: raw.map((v) => Number((v / peak).toFixed(3))) };
  } catch {
    return null;
  }
}

function lengthOf(url: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => resolve(0);
    a.src = url;
  });
}

export default function AudioPicker({ value, onChange, onError }: {
  value: VoiceDraft; onChange: (v: VoiceDraft) => void; onError: (m: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [reading, setReading] = useState(false);
  const [playUrl, setPlayUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) { setPlayUrl(null); return; }
    const u = URL.createObjectURL(value.blob);
    setPlayUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) { onError("Pick an audio file (mp3, m4a, wav)."); return; }
    if (file.size > MAX_MB * 1024 * 1024) { onError(`That file is over ${MAX_MB} MB.`); return; }
    setReading(true);
    const url = URL.createObjectURL(file);
    const wave = await waveformOf(file);
    const seconds = wave?.seconds || await lengthOf(url);
    URL.revokeObjectURL(url);
    setReading(false);
    if (!seconds) { onError("This audio file can't be played. Try another."); return; }
    setName(file.name);
    onChange({ blob: file, seconds, waveform: wave?.waveform ?? [] });
  }

  const bars = value?.waveform ?? [];

  return (
    <div className="cx-card cx-voice">
      <input
        ref={input} type="file" accept="audio/*" hidden
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }}
      />
      <div className="cx-wave" aria-hidden="true">
        {Array.from({ length: BARS }).map((_, i) => (
          <i key={i} style={{ height: `${8 + Math.max(0, bars[i] ?? 0) * 92}%` }} />
        ))}
      </div>
      <div className="cx-timer">{value ? fmt(value.seconds) : "0:00"}{name && value ? <small> · {name}</small> : null}</div>
      {playUrl ? <audio src={playUrl} controls /> : null}
      <div className="row">
        <button type="button" className="btn" disabled={reading} onClick={() => input.current?.click()}>
          {reading ? "Reading…" : value ? "Choose another" : "Upload audio"}
        </button>
        {value ? <button type="button" className="pill ghost" onClick={() => { onChange(null); setName(""); }}>Remove</button> : null}
      </div>
      {!value ? <p className="muted small">mp3, m4a or wav, up to {MAX_MB} MB.</p> : null}
    </div>
  );
}
