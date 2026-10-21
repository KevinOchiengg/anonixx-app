"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Pager, fmtDate } from "@/components/admin/bits";

type D = {
  id: string; sender_id: string | null; author: string | null; is_admin_drop: boolean; confession: string; confession_full: string | null;
  promo_kind: "pin" | "boost" | null; promo_until: string | null;
  media_type: string | null; report_count: number; moderation_status: string | null; created_at: string | null;
};
type Page = { total: number; skip: number; limit: number; drops: D[] };
const LIMIT = 20;

export default function AdminPosts() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [promoting, setPromoting] = useState<{ id: string; kind: "pin" | "boost"; hours: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ skip: String(skip), limit: String(LIMIT) });
      if (search) p.set("search", search);
      setData(await api<Page>(`/admin/drops?${p}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [skip, search]);

  useEffect(() => { load(); }, [load]);

  async function remove(d: D) {
    if (!window.confirm("Delete this post for everyone? This cannot be undone.")) return;
    setBusy(d.id);
    try { await api(`/admin/drops/${d.id}`, { method: "DELETE" }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function promote(id: string, body: { kind: string; hours: number } | null) {
    setBusy(id);
    try {
      await api(`/admin/drops/${id}/promote`, body ? { method: "PATCH", body } : { method: "DELETE" });
      setPromoting(null);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function save() {
    if (!editing || !editing.text.trim()) return;
    setBusy(editing.id);
    try {
      await api(`/admin/drops/${editing.id}`, { method: "PATCH", body: { confession: editing.text.trim() } });
      setEditing(null);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <>
      <h2>Posts</h2>
      <form className="adm-search" onSubmit={(e) => { e.preventDefault(); setSkip(0); setSearch(q.trim()); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search post text" />
        <button className="adm-btn primary">Search</button>
      </form>
      {error ? <p className="err">{error}</p> : null}
      {!data ? <p className="muted">Loading…</p> : data.drops.length === 0 ? <p className="muted">No posts found.</p> : (
        <div className="adm-list">
          {data.drops.map((d) => (
            <div key={d.id} className="adm-card">
              <div className="adm-chips">
                <b>{d.author || "Anonymous"}</b>
                {d.is_admin_drop ? <Badge tone="warn">admin</Badge> : null}
                {d.promo_kind && d.promo_until ? <Badge tone="ok">{d.promo_kind === "pin" ? "pinned" : "boosted"} till {fmtDate(d.promo_until)}</Badge> : null}
                {d.media_type ? <Badge>{d.media_type}</Badge> : null}
                {d.report_count ? <Badge tone="bad">{d.report_count} report{d.report_count === 1 ? "" : "s"}</Badge> : null}
                {d.moderation_status ? <Badge>{d.moderation_status}</Badge> : null}
              </div>
              {editing?.id === d.id ? (
                <textarea
                  className="adm-edit" rows={4} maxLength={500} autoFocus value={editing.text}
                  onChange={(e) => setEditing({ id: d.id, text: e.target.value })} aria-label="Post text"
                />
              ) : <p className="adm-text">{d.confession || "[no text]"}</p>}
              {promoting?.id === d.id ? (
                <div className="adm-actions">
                  <select className="adm-select" value={promoting.kind} onChange={(e) => setPromoting({ ...promoting, kind: e.target.value as "pin" | "boost" })} aria-label="Pin or boost">
                    <option value="pin">Pin to top</option>
                    <option value="boost">Boost</option>
                  </select>
                  <select className="adm-select" value={promoting.hours} onChange={(e) => setPromoting({ ...promoting, hours: Number(e.target.value) })} aria-label="For how long">
                    <option value={6}>for 6 hours</option>
                    <option value={24}>for 1 day</option>
                    <option value={72}>for 3 days</option>
                    <option value={168}>for 7 days</option>
                  </select>
                  <button className="adm-btn" onClick={() => setPromoting(null)}>Cancel</button>
                  <button className="adm-btn primary" disabled={busy === d.id} onClick={() => promote(d.id, { kind: promoting.kind, hours: promoting.hours })}>Start</button>
                </div>
              ) : null}
              <div className="adm-foot">
                <span className="muted small">{editing?.id === d.id ? `${editing.text.length}/500` : fmtDate(d.created_at)}</span>
                <div className="adm-actions">
                  {editing?.id === d.id ? (
                    <>
                      <button className="adm-btn" disabled={busy === d.id} onClick={() => setEditing(null)}>Cancel</button>
                      <button className="adm-btn primary" disabled={busy === d.id || !editing.text.trim()} onClick={save}>Save</button>
                    </>
                  ) : (
                    <>
                      {d.is_admin_drop ? <button className="adm-btn" disabled={busy === d.id} onClick={() => setEditing({ id: d.id, text: d.confession_full ?? d.confession })}>Edit</button> : null}
                      {d.is_admin_drop ? (
                        d.promo_kind
                          ? <button className="adm-btn" disabled={busy === d.id} onClick={() => promote(d.id, null)}>Stop {d.promo_kind === "pin" ? "pin" : "boost"}</button>
                          : <button className="adm-btn" disabled={busy === d.id} onClick={() => setPromoting({ id: d.id, kind: "pin", hours: 24 })}>Pin / boost</button>
                      ) : null}
                      <button className="adm-btn danger" disabled={busy === d.id} onClick={() => remove(d)}>Delete</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {data ? <Pager skip={data.skip} limit={data.limit} total={data.total} onSkip={setSkip} /> : null}
    </>
  );
}
