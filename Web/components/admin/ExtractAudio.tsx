"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { attachVideo } from "@/lib/attachVideo";

type Result = { audio_url: string; drop_id?: string; scheduled_id?: string; publish_at?: string; sound?: { title: string } };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Super admin: pull the sound out of a video drop and post it as an audio drop and/or add it to
 *  the Sounds library. The video drop itself doesn't change. */
export default function ExtractAudio({ dropId, src, known, trim, caption }: {
  dropId: string; src: string; known: number | null; trim?: { start: number; end: number } | null; caption: string;
}) {
  const probe = useRef<HTMLVideoElement>(null);
  const [len, setLen] = useState(known || 0);
  const [start, setStart] = useState(trim?.start ?? 0);
  const [end, setEnd] = useState(trim?.end ?? (known || 0));
  const [post, setPost] = useState(true);
  const [library, setLibrary] = useState(false);
  const [text, setText] = useState(caption);
  const [title, setTitle] = useState("");
  const [later, setLater] = useState(false);
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Result | null>(null);

  useEffect(() => (len || !probe.current ? undefined : attachVideo(probe.current, src)), [src, len]);
  useEffect(() => { if (len && !end) setEnd(len); }, [len, end]);

  async function run() {
    setBusy(true); setErr(""); setDone(null);
    try {
      const whole = start <= 0.05 && (!len || end >= len - 0.05);
      const r = await api<Result>(`/admin/drops/${dropId}/extract-audio`, {
        body: {
          start: whole ? 0 : start,
          ...(whole ? {} : { end }),
          post, library,
          caption: text.trim(),
          ...(library && title.trim() ? { title: title.trim() } : {}),
          ...(post && later && at ? { publish_at: new Date(at).toISOString() } : {}),
        },
      });
      setDone(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ready = (post || library) && (!later || !post || at) && (!len || end - start >= 1);

  return (
    <div className="adm-extract">
      {!len ? <video ref={probe} hidden muted preload="metadata" onLoadedMetadata={(e) => setLen(e.currentTarget.duration || 0)} /> : null}
      {len ? (
        <div className="adm-extract-range">
          <label className="small">From <b>{fmt(start)}</b>
            <input type="range" min={0} max={len} step={0.1} value={start} aria-label="Start"
              onChange={(e) => setStart(Math.min(Number(e.target.value), end - 1))} />
          </label>
          <label className="small">To <b>{fmt(end)}</b>
            <input type="range" min={0} max={len} step={0.1} value={end} aria-label="End"
              onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 1))} />
          </label>
          <span className="muted small">{fmt(end - start)} of audio{start <= 0.05 && end >= len - 0.05 ? " (the whole video)" : ""}</span>
        </div>
      ) : <p className="muted small">Reading the video's length…</p>}

      <label className="small"><input type="checkbox" checked={post} onChange={(e) => setPost(e.target.checked)} /> Post it as an audio drop</label>
      {post ? (
        <>
          <textarea className="adm-edit" rows={2} maxLength={1800} value={text} onChange={(e) => setText(e.target.value)} placeholder="Caption" aria-label="Audio drop caption" />
          <div className="adm-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
            <label className="small"><input type="radio" checked={!later} onChange={() => setLater(false)} /> Post now</label>
            <label className="small"><input type="radio" checked={later} onChange={() => setLater(true)} /> Schedule</label>
            {later ? <input type="datetime-local" className="adm-select" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Publish at" /> : null}
          </div>
        </>
      ) : null}

      <label className="small"><input type="checkbox" checked={library} onChange={(e) => setLibrary(e.target.checked)} /> Add it to the Sounds library</label>
      {library ? (
        <input className="adm-select" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Sound title (defaults to the caption)" aria-label="Sound title" />
      ) : null}

      <div className="adm-actions" style={{ justifyContent: "flex-start" }}>
        <button type="button" className="adm-btn primary" disabled={!ready || busy} onClick={run}>
          {busy ? "Extracting…" : "Extract audio"}
        </button>
      </div>
      {err ? <p className="err small">{err}</p> : null}
      {done ? (
        <div className="ok small">
          {done.drop_id ? "Posted as an audio drop. " : done.scheduled_id ? `Scheduled for ${new Date(done.publish_at!).toLocaleString()}. ` : ""}
          {done.sound ? `Added "${done.sound.title}" to Sounds.` : ""}
          <audio src={done.audio_url} controls preload="none" style={{ display: "block", width: "100%", marginTop: 6 }} />
        </div>
      ) : null}
    </div>
  );
}
