"use client";
import { useEffect, useRef, useState } from "react";

export const MAX_VOICE_SECONDS = 180;
export type VoiceDraft = { blob: Blob; seconds: number; waveform: number[] } | null;

const BARS = 48;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function downsample(levels: number[]): number[] {
  if (!levels.length) return [];
  const out: number[] = [];
  for (let i = 0; i < BARS; i++) {
    const a = Math.floor((i / BARS) * levels.length);
    const b = Math.max(a + 1, Math.floor(((i + 1) / BARS) * levels.length));
    const slice = levels.slice(a, b);
    out.push(Number((slice.reduce((x, y) => x + y, 0) / slice.length).toFixed(3)));
  }
  return out;
}

export default function VoiceRecorder({ value, onChange, onError, maxSeconds = MAX_VOICE_SECONDS }: {
  value: VoiceDraft; onChange: (v: VoiceDraft) => void; onError: (m: string) => void;
  /** Recording stops itself here (a Knock's voice note is 15s; compose allows 3 min). */
  maxSeconds?: number;
}) {
  const [rec, setRec] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState<number[]>([]);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const mr = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const levels = useRef<number[]>([]);
  const started = useRef(0);

  useEffect(() => {
    if (!value) { setPlayUrl(null); return; }
    const u = URL.createObjectURL(value.blob);
    setPlayUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    ctx.current?.close().catch(() => {});
  }, []);

  async function start() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError("Your browser cannot record audio. Try Chrome, Edge or Safari.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const recorder = new MediaRecorder(s);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        cancelAnimationFrame(raf.current);
        s.getTracks().forEach((t) => t.stop());
        ctx.current?.close().catch(() => {});
        const seconds = Math.max(1, Math.round((Date.now() - started.current) / 1000));
        onChange({ blob: new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), seconds, waveform: downsample(levels.current) });
        setRec(false);
      };
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC();
      ctx.current = ac;
      const an = ac.createAnalyser();
      an.fftSize = 256;
      ac.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      levels.current = [];
      started.current = Date.now();
      setElapsed(0);
      setLive([]);
      let last = 0;
      const tick = (t: number) => {
        if (t - last > 90) {
          last = t;
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
          const lvl = Math.min(1, peak * 1.6);
          levels.current.push(lvl);
          setLive((l) => [...l.slice(-(BARS - 1)), lvl]);
          const sec = (Date.now() - started.current) / 1000;
          setElapsed(sec);
          if (sec >= maxSeconds) {
            if (recorder.state !== "inactive") recorder.stop();
            return;
          }
        }
        raf.current = requestAnimationFrame(tick);
      };
      recorder.start();
      mr.current = recorder;
      setRec(true);
      raf.current = requestAnimationFrame(tick);
    } catch {
      onError("Microphone access is needed to record.");
    }
  }

  const bars = rec ? live : value?.waveform ?? [];
  const pad = rec ? BARS - bars.length : 0;

  return (
    <div className="cx-card cx-voice">
      <div className="cx-wave" aria-hidden="true">
        {Array.from({ length: BARS }).map((_, i) => {
          const v = bars[i - pad] ?? 0;
          return <i key={i} style={{ height: `${8 + Math.max(0, v) * 92}%` }} />;
        })}
      </div>
      <div className="cx-timer">{fmt(rec ? elapsed : value?.seconds ?? 0)} <small>/ {fmt(maxSeconds)}</small></div>
      {playUrl && !rec ? <audio src={playUrl} controls /> : null}
      <div className="row">
        {rec ? (
          <button type="button" className="btn" onClick={() => mr.current?.stop()}>Stop</button>
        ) : (
          <button type="button" className="btn" onClick={start}>{value ? "Record again" : "Tap to record"}</button>
        )}
        {value && !rec ? <button type="button" className="pill ghost" onClick={() => onChange(null)}>Discard</button> : null}
      </div>
      {!rec && !value ? <p className="muted small">Say it like nobody is listening.</p> : null}
    </div>
  );
}
