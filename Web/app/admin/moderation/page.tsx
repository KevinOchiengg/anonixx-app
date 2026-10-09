"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Pager, fmtDate } from "@/components/admin/bits";

type D = {
  id: string; sender_id: string | null; confession: string; media_type: string | null;
  report_count: number; moderation_status: string | null; flagged_at: string | null; created_at: string | null;
};
type Page = { total: number; skip: number; limit: number; drops: D[] };
const LIMIT = 20;

export default function AdminModeration() {
  const [skip, setSkip] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Page>(`/admin/moderation-queue?skip=${skip}&limit=${LIMIT}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [skip]);

  useEffect(() => { load(); }, [load]);

  async function act(d: D, kind: "dismiss" | "delete") {
    if (kind === "delete" && !window.confirm("Delete this post for everyone? This cannot be undone.")) return;
    setBusy(d.id);
    try {
      if (kind === "dismiss") await api(`/admin/drops/${d.id}/dismiss`, { method: "PATCH" });
      else await api(`/admin/drops/${d.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h2>Moderation queue</h2>
      <p className="muted small">Posts flagged by reports or hidden for self-harm concern. Dismiss keeps the post up; delete removes it.</p>
      {error ? <p className="err">{error}</p> : null}
      {!data ? <p className="muted">Loading…</p> : data.drops.length === 0 ? <p className="muted">Nothing waiting. All clear.</p> : (
        <div className="adm-list">
          {data.drops.map((d) => (
            <div key={d.id} className="adm-card">
              <div className="adm-chips">
                <Badge tone={d.moderation_status === "hidden" ? "bad" : "warn"}>{d.moderation_status}</Badge>
                <Badge tone="bad">{d.report_count} report{d.report_count === 1 ? "" : "s"}</Badge>
                {d.media_type ? <Badge>{d.media_type}</Badge> : null}
              </div>
              <p className="adm-text">{d.confession || "[no text]"}</p>
              <div className="adm-foot">
                <span className="muted small">Flagged {fmtDate(d.flagged_at)}</span>
                <div className="adm-actions">
                  <button className="adm-btn" disabled={busy === d.id} onClick={() => act(d, "dismiss")}>Dismiss</button>
                  <button className="adm-btn danger" disabled={busy === d.id} onClick={() => act(d, "delete")}>Delete</button>
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
