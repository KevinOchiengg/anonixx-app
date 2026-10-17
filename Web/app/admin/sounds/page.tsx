"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/admin/bits";

type Sound = { id: string; title: string; mood: string; url: string; active: boolean };
type Draft = { file: File; title: string; mood: string; state: "ready" | "sending" | "done" | "error"; error?: string };

const MOODS = ["any", "longing", "untold", "horny", "discreet"];
const MAX_MB = 5;
const titleOf = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

export default function AdminSounds() {
  const [sounds, setSounds] = useState<Sound[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ title: "", mood: "any" });
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const playing = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    try {
      setSounds((await api<{ sounds: Sound[] }>("/sounds/admin")).sounds);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => playing.current?.pause(), []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: Draft[] = [];
    for (const f of Array.from(list)) {
      const ok = /\.(mp3|m4a)$/i.test(f.name) || /^audio\/(mpeg|mp3|mp4|m4a|x-m4a)$/.test(f.type);
      if (!ok) { setError(`${f.name}: only mp3 or m4a.`); continue; }
      if (f.size > MAX_MB * 1024 * 1024) { setError(`${f.name} is over ${MAX_MB}MB.`); continue; }
      next.push({ file: f, title: titleOf(f.name), mood: "any", state: "ready" });
    }
    setDrafts((d) => [...d, ...next]);
  }

  const patch = (i: number, p: Partial<Draft>) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function sendAll() {
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      if (d.state === "done" || !d.title.trim()) continue;
      patch(i, { state: "sending", error: undefined });
      const form = new FormData();
      form.append("file", d.file, d.file.name);
      form.append("title", d.title.trim());
      form.append("mood", d.mood);
      try {
        await api("/sounds/admin", { method: "POST", body: form });
        patch(i, { state: "done" });
      } catch (e) {
        patch(i, { state: "error", error: (e as Error).message });
      }
    }
    await load();
    setDrafts((d) => d.filter((x) => x.state !== "done"));
  }

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try { await fn(); await load(); setError(""); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  function preview(url: string) {
    playing.current?.pause();
    const a = new Audio(url);
    a.volume = 0.6;
    playing.current = a;
    a.play().catch(() => setError("Could not play that file."));
  }

  const pending = drafts.filter((d) => d.state !== "done");

  return (
    <>
      <h2>Ambient sounds</h2>
      <p className="muted small">
        Quiet background tracks for text confessions. Each confession picks a sound that matches its mood; &quot;any&quot; fits all.
        mp3 or m4a, up to {MAX_MB}MB each. Only upload tracks you have the rights to use.
      </p>
      {error ? <p className="err">{error}</p> : null}

      <div
        className="adm-card"
        style={{ borderStyle: "dashed", alignItems: "center", textAlign: "center", padding: 24, cursor: "pointer", borderColor: over ? "var(--rose)" : undefined }}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
      >
        <b>Drop sound files here</b>
        <span className="muted small">or tap to choose several at once</span>
        <input ref={input} type="file" accept=".mp3,.m4a,audio/mpeg,audio/mp4" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {pending.length ? (
        <div className="adm-list">
          {drafts.map((d, i) => d.state === "done" ? null : (
            <div key={i} className="adm-card">
              <div className="adm-search" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input value={d.title} maxLength={80} onChange={(e) => patch(i, { title: e.target.value })} placeholder="Title" disabled={d.state === "sending"} />
                <select value={d.mood} onChange={(e) => patch(i, { mood: e.target.value })} disabled={d.state === "sending"} className="adm-btn">
                  {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="adm-foot">
                <span className="muted small">{d.file.name} · {(d.file.size / 1048576).toFixed(1)}MB{d.state === "sending" ? " · uploading…" : ""}{d.state === "error" ? ` · ${d.error}` : ""}</span>
                <button className="adm-btn" disabled={d.state === "sending"} onClick={() => setDrafts((x) => x.filter((_, j) => j !== i))}>Remove</button>
              </div>
            </div>
          ))}
          <div>
            <button className="adm-btn primary" disabled={drafts.some((d) => d.state === "sending") || pending.some((d) => !d.title.trim())} onClick={sendAll}>
              Upload {pending.length} {pending.length === 1 ? "sound" : "sounds"}
            </button>
          </div>
        </div>
      ) : null}

      <h3 style={{ marginTop: 22 }}>Library</h3>
      {!sounds ? <p className="muted">Loading…</p> : sounds.length === 0 ? <p className="muted">No sounds yet. Confessions stay silent until you add some.</p> : (
        <div className="adm-list">
          {sounds.map((s) => (
            <div key={s.id} className="adm-card" style={s.active ? undefined : { opacity: 0.6 }}>
              {editing === s.id ? (
                <div className="adm-search" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input value={edit.title} maxLength={80} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
                  <select value={edit.mood} onChange={(e) => setEdit({ ...edit, mood: e.target.value })} className="adm-btn">
                    {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              ) : (
                <div className="adm-chips"><b>{s.title}</b><Badge>{s.mood}</Badge>{s.active ? null : <Badge tone="warn">off</Badge>}</div>
              )}
              <div className="adm-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="adm-btn" onClick={() => preview(s.url)}>▶ Play</button>
                {editing === s.id ? (
                  <>
                    <button className="adm-btn primary" disabled={busy === s.id || !edit.title.trim()} onClick={() => act(s.id, async () => { await api(`/sounds/admin/${s.id}`, { method: "PATCH", body: edit }); setEditing(null); })}>Save</button>
                    <button className="adm-btn" onClick={() => setEditing(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="adm-btn" onClick={() => { setEditing(s.id); setEdit({ title: s.title, mood: s.mood }); }}>Edit</button>
                    <button className="adm-btn" disabled={busy === s.id} onClick={() => act(s.id, () => api(`/sounds/admin/${s.id}`, { method: "PATCH", body: { active: !s.active } }))}>{s.active ? "Turn off" : "Turn on"}</button>
                    <button className="adm-btn danger" disabled={busy === s.id} onClick={() => { if (window.confirm(`Delete "${s.title}"? This removes the file.`)) act(s.id, () => api(`/sounds/admin/${s.id}`, { method: "DELETE" })); }}>Delete</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
