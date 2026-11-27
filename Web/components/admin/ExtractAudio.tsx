"use client";
import { useState } from "react";
import { api } from "@/lib/api";

type Result = { audio_url: string; drop_id?: string; sound?: { title: string } };

/** Super admin: pull a video's sound out. Post it as its own audio drop with a caption you write and/or save it
 *  to Sounds under a name you give it. The video drop doesn't change. */
export default function ExtractAudio({ dropId }: { dropId: string }) {
  const [post, setPost] = useState(false);
  const [library, setLibrary] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Result | null>(null);

  const ready = (post || library) && (!library || title.trim().length > 0);

  async function run() {
    if (!ready || busy) return;
    setBusy(true); setErr("");
    try {
      setDone(await api<Result>(`/admin/drops/${dropId}/extract-audio`, {
        body: { post, library, title: library ? title.trim() : null, caption: post ? caption.trim() : null },
      }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="adm-extract ok small">
        {[done.drop_id ? "Posted as an audio drop." : "", done.sound ? `Saved to Sounds as "${done.sound.title}".` : ""].filter(Boolean).join(" ")}
        <audio src={done.audio_url} controls preload="none" style={{ display: "block", width: "100%", marginTop: 6 }} />
      </div>
    );
  }

  return (
    <div className="adm-extract">
      <div className="adm-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <label className="small"><input type="checkbox" checked={post} onChange={(e) => setPost(e.target.checked)} /> Post as audio drop</label>
        <label className="small"><input type="checkbox" checked={library} onChange={(e) => setLibrary(e.target.checked)} /> Save to Sounds</label>
      </div>
      {post ? (
        <textarea className="adm-input" rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={900} placeholder="Caption for the audio drop" aria-label="Audio caption" />
      ) : null}
      {library ? (
        <input className="adm-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Name this sound" aria-label="Sound name" />
      ) : null}
      <div className="adm-actions" style={{ justifyContent: "flex-start" }}>
        <button type="button" className="adm-btn primary" disabled={!ready || busy} onClick={run}>
          {busy ? "Extracting…" : "Extract audio"}
        </button>
      </div>
      {err ? <p className="err small">{err}</p> : null}
    </div>
  );
}
