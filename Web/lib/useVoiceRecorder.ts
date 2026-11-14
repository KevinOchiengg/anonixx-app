"use client";
// Voice notes in the browser: record, listen back, then send or discard.
import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceClip = { blob: Blob; url: string; secs: number };

export default function useVoiceRecorder(onError: (m: string) => void) {
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [clip, setClip] = useState<VoiceClip | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const cancelled = useRef(false);

  const clearTimer = () => { if (timer.current) { window.clearInterval(timer.current); timer.current = null; } };

  const start = useCallback(async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError("Voice notes don't work in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      cancelled.current = false;
      const started = Date.now();
      rec.ondataavailable = (ev) => { if (ev.data.size) chunks.current.push(ev.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearTimer();
        setRecording(false);
        if (cancelled.current || !chunks.current.length) return;
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        setClip({ blob, url: URL.createObjectURL(blob), secs: Math.max(1, Math.round((Date.now() - started) / 1000)) });
      };
      recorder.current = rec;
      rec.start();
      setSecs(0);
      setRecording(true);
      timer.current = window.setInterval(() => setSecs((n) => n + 1), 1000);
    } catch {
      onError("Allow microphone access to send voice notes.");
    }
  }, [onError]);

  const stop = useCallback((cancel: boolean) => {
    cancelled.current = cancel;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  const discard = useCallback(() => {
    setClip((c) => { if (c) URL.revokeObjectURL(c.url); return null; });
  }, []);

  useEffect(() => () => {
    cancelled.current = true;
    clearTimer();
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  return { recording, secs, clip, start, stop, discard };
}
