"use client";
import { useState } from "react";
import { api } from "@/lib/api";

type Result = { audio_url: string; drop_id?: string; sound?: { title: string } };

/** Super admin: one tap pulls the whole video's sound out and posts it as an audio drop with the
 *  same caption (and, if ticked, adds it to the Sounds library). The video drop doesn't change. */
export default function ExtractAudio({ dropId, caption }: { dropId: string; caption: string }) {
  const [library, setLibrary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Result | null>(null);

  async function run() {
    setBusy(true); setErr(""); setDone(null);
    try {
      setDone(await api<Result>(`/admin/drops/${dropId}/extract-audio`, {
        body: { post: true, library, caption: caption.trim() },
      }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-extract">
      <div className="adm-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <button type="button" className="adm-btn primary" disabled={busy} onClick={run}>
          {busy ? "Extracting…" : "Extract audio"}
        </button>
        <label className="small"><input type="checkbox" checked={library} onChange={(e) => setLibrary(e.target.checked)} /> Also add to Sounds</label>
      </div>
      {err ? <p className="err small">{err}</p> : null}
      {done ? (
        <div className="ok small">
          Posted as an audio drop.{done.sound ? ` Added to Sounds as "${done.sound.title}".` : ""}
          <audio src={done.audio_url} controls preload="none" style={{ display: "block", width: "100%", marginTop: 6 }} />
        </div>
      ) : null}
    </div>
  );
}
