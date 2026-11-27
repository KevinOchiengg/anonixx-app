"use client";
import { useKept } from "@/lib/pageMemory";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, usePaged } from "@/components/admin/bits";
import { askConfirm } from "@/lib/confirm";

type Caption = { id: string; text: string; mature: boolean; uses: number };
type Bank = { on: boolean; captions: Caption[]; waiting: { general: number; mature: number } };

export default function AdminCaptions() {
  const [bank, setBank] = useState<Bank | null>(null);
  const [draft, setDraft] = useState("");
  const [mature, setMature] = useState(false);
  const [filter, setFilter] = useKept<"all" | "general" | "mature">("filter", "all");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setBank(await api<Bank>("/admin/captions"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (bank?.captions || []).filter((c) => filter === "all" || (filter === "mature") === c.mature);
  const pg = usePaged(shown, { size: 20, text: (c) => c.text });

  async function add() {
    setBusy(true);
    try {
      const r = await api<{ added: number; duplicates: number }>("/admin/captions", { body: { text: draft, mature } });
      setNote(`Added ${r.added}${r.duplicates ? `, ${r.duplicates} already in the bank` : ""}.`);
      setDraft("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    if (!bank) return;
    const on = !bank.on;
    const waiting = bank.waiting.general + bank.waiting.mature;
    if (on) {
      const ok = await askConfirm({
        title: "Turn on auto captions?",
        message: `${waiting} official posts have no caption. They get one from the bank, and new ones do too.`,
        confirmLabel: "Turn on",
        icon: "info",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const r = await api<{ filled: number }>("/admin/captions/settings", { method: "PUT", body: { on } });
      setNote(on ? `On. Captioned ${r.filled} posts so far.` : "Off.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(c: Caption, patch: Partial<Caption>) {
    try {
      await api(`/admin/captions/${c.id}`, { method: "PATCH", body: patch });
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(c: Caption) {
    const ok = await askConfirm({ title: "Delete this caption?", message: c.text, confirmLabel: "Delete", icon: "warning" });
    if (!ok) return;
    try {
      await api(`/admin/captions/${c.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const unused = (m: boolean) => (bank?.captions || []).filter((c) => c.mature === m && c.uses === 0).length;
  const count = (m: boolean) => (bank?.captions || []).filter((c) => c.mature === m).length;
  const lines = draft.split("\n").filter((l) => l.trim()).length;

  return (
    <>
      <h2>Captions</h2>
      <p className="muted small">Official media posts with no caption get a random one from here. User posts are never touched.</p>
      {error ? <p className="err">{error}</p> : null}
      {note ? <p className="muted small">{note}</p> : null}

      {!bank ? <p className="muted">Loading…</p> : (
        <>
          <div className="adm-card">
            <div className="adm-foot" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <b>Auto captions</b> {bank.on ? <Badge tone="ok">on</Badge> : <Badge tone="warn">off</Badge>}
                <p className="muted small" style={{ margin: "4px 0 0" }}>
                  {bank.waiting.general + bank.waiting.mature
                    ? `${bank.waiting.general} normal and ${bank.waiting.mature} mature posts waiting for a caption.`
                    : "Every official media post has a caption."}
                </p>
              </div>
              <button className={`adm-btn${bank.on ? "" : " primary"}`} disabled={busy} onClick={toggle}>{bank.on ? "Turn off" : "Turn on"}</button>
            </div>
            {[false, true].map((m) => {
              const n = count(m);
              const waiting = m ? bank.waiting.mature : bank.waiting.general;
              if (n === 0 && waiting) return <p key={String(m)} className="err small" style={{ margin: 0 }}>No {m ? "mature" : "normal"} captions yet, so {waiting} {m ? "mature" : "normal"} posts stay blank.</p>;
              if (n && unused(m) <= Math.floor(n * 0.1)) return <p key={String(m)} className="muted small" style={{ margin: 0 }}>Almost every {m ? "mature" : "normal"} caption has been used. Add more before they start repeating.</p>;
              return null;
            })}
          </div>

          <div className="adm-card" style={{ marginTop: 12 }}>
            <b>Add captions</b>
            <textarea
              className="adm-input"
              rows={6}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={"One caption per line\nsay it here, nobody knows it's you"}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label className="small"><input type="checkbox" checked={mature} onChange={(e) => setMature(e.target.checked)} /> Mature captions (only go on mature posts)</label>
              <button className="adm-btn primary" disabled={busy || !lines} onClick={add}>Add {lines || ""}</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, margin: "16px 0 8px", flexWrap: "wrap" }}>
            {(["all", "general", "mature"] as const).map((f) => (
              <button key={f} className={`adm-btn${filter === f ? " primary" : ""}`} onClick={() => setFilter(f)}>
                {f === "all" ? `All ${bank.captions.length}` : f === "general" ? `Normal ${count(false)}` : `Mature ${count(true)}`}
              </button>
            ))}
          </div>

          {shown.length === 0 ? <p className="muted">No captions yet.</p> : (
            <>
              <div className="adm-list">
                {pg.rows.map((c) => (
                  <div key={c.id} className="adm-card">
                    {editing === c.id ? (
                      <textarea className="adm-input" rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} />
                    ) : (
                      <div>{c.text}</div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span className="muted small">
                        Used {c.uses} {c.uses === 1 ? "time" : "times"} {c.mature ? <Badge tone="warn">mature</Badge> : null}
                      </span>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {editing === c.id ? (
                          <>
                            <button className="adm-btn primary" disabled={!editText.trim()} onClick={() => save(c, { text: editText })}>Save</button>
                            <button className="adm-btn" onClick={() => setEditing(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="adm-btn" onClick={() => { setEditing(c.id); setEditText(c.text); }}>Edit</button>
                            <button className="adm-btn" onClick={() => save(c, { mature: !c.mature })}>{c.mature ? "Make normal" : "Make mature"}</button>
                            <button className="adm-btn danger" onClick={() => remove(c)}>Delete</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {pg.tools}
            </>
          )}
        </>
      )}
    </>
  );
}
