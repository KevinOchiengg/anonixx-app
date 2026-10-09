"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Pager, fmtDate } from "@/components/admin/bits";

type D = {
  id: string; sender_id: string | null; author: string | null; is_admin_drop: boolean; confession: string;
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
                {d.media_type ? <Badge>{d.media_type}</Badge> : null}
                {d.report_count ? <Badge tone="bad">{d.report_count} report{d.report_count === 1 ? "" : "s"}</Badge> : null}
                {d.moderation_status ? <Badge>{d.moderation_status}</Badge> : null}
              </div>
              <p className="adm-text">{d.confession || "[no text]"}</p>
              <div className="adm-foot">
                <span className="muted small">{fmtDate(d.created_at)}</span>
                <button className="adm-btn danger" disabled={busy === d.id} onClick={() => remove(d)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {data ? <Pager skip={data.skip} limit={data.limit} total={data.total} onSkip={setSkip} /> : null}
    </>
  );
}
