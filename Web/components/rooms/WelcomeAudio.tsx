"use client";
/** Welcome audio for a Room: record (up to MAX_SECONDS) or upload an audio file, listen back,
 * then save; or replace / remove the saved one. Same as the app's WelcomeAudioEditor. */
import { useEffect, useRef, useState } from "react";
import { uploadFile } from "@/lib/upload";

export const MAX_SECONDS = 60;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type Saved = { url: string; seconds?: number | null } | null;

export default function WelcomeAudio({ saved, onSave, onRemove }: {
  saved: Saved;
  onSave: (url: string, seconds: number | null) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [draft, setDraft] = useState<{ blob: Blob; url: string; seconds: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current);
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  }, []);

  function setDraftBlob(blob: Blob, seconds: number | null) {
    setDraft((d) => { if (d) URL.revokeObjectURL(d.url); return { blob, url: URL.createObjectURL(blob), seconds }; });
  }

  async function start() {
    setError("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record. Upload an audio file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      const started = Date.now();
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) { window.clearInterval(timer.current); timer.current = null; }
        setRecording(false);
        const seconds = Math.round((Date.now() - started) / 1000);
        if (seconds < 2 || !chunks.length) { setError("A little longer: at least 2 seconds."); return; }
        setDraftBlob(new Blob(chunks, { type: r.mimeType || "audio/webm" }), Math.min(seconds, MAX_SECONDS));
      };
      rec.current = r;
      r.start();
      setSecs(0);
      setRecording(true);
      timer.current = window.setInterval(() => setSecs((n) => {
        if (n + 1 >= MAX_SECONDS && rec.current?.state === "recording") rec.current.stop();
        return n + 1;
      }), 1000);
    } catch {
      setError("Allow the microphone to record a welcome.");
    }
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("audio/")) { setError("Pick an audio file."); return; }
    // Read its length so the server can check the 1-minute limit.
    const probe = new Audio(URL.createObjectURL(f));
    probe.onloadedmetadata = () => {
      const d = probe.duration;
      URL.revokeObjectURL(probe.src);
      if (Number.isFinite(d) && d > MAX_SECONDS + 1) { setError("Keep it under a minute."); return; }
      setError("");
      setDraftBlob(f, Number.isFinite(d) ? Math.round(d) : null);
    };
    probe.onerror = () => { URL.revokeObjectURL(probe.src); setDraftBlob(f, null); };
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await onSave(await uploadFile(draft.blob, "voice"), draft.seconds);
      URL.revokeObjectURL(draft.url);
      setDraft(null);
    } catch (e) {
      setError((e as Error).message || "Could not save the audio.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try { await onRemove(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const current = draft ? draft.url : saved?.url || null;
  return (
    <div className="wa">
      <input ref={fileIn} type="file" accept="audio/*" hidden onChange={pick} />
      {recording ? (
        <div className="wa-row rec">
          <span className="rec-dot" />
          <b>{fmt(secs)}</b><small>of {fmt(MAX_SECONDS)}</small>
          <button type="button" className="pill" onClick={() => rec.current?.stop()}>Stop</button>
        </div>
      ) : current ? (
        <>
          <audio src={current} controls preload="metadata" className="wa-audio" />
          <small className="wa-hint">{draft ? "Listen back. Save it, or record again." : "Your welcome audio. Visitors can replay it any time."}</small>
          <div className="wa-row">
            <button type="button" className="pill ghost" onClick={start} disabled={busy}>{draft ? "Record again" : "Replace"}</button>
            {draft ? (
              <>
                <button type="button" className="pill ghost" onClick={() => { URL.revokeObjectURL(draft.url); setDraft(null); }} disabled={busy}>Discard</button>
                <button type="button" className="pill" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
              </>
            ) : (
              <>
                <button type="button" className="pill ghost" onClick={() => fileIn.current?.click()} disabled={busy}>Upload a file</button>
                <button type="button" className="pill ghost danger" onClick={remove} disabled={busy}>Remove</button>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <small className="wa-hint">Say hello in your own voice, up to a minute. It&apos;s the first thing they hear.</small>
          <div className="wa-row">
            <button type="button" className="pill" onClick={start}>Record</button>
            <button type="button" className="pill ghost" onClick={() => fileIn.current?.click()}>Upload a file</button>
          </div>
        </>
      )}
      {error ? <div className="err">{error}</div> : null}
    </div>
  );
}
