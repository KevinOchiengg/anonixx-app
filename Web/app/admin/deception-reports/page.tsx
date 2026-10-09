"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Pager, fmtDate } from "@/components/admin/bits";

type R = {
  id: string; confession: string; note: string | null; sender_name: string; sender_strikes: number;
  reporter_name: string; status: string; created_at: string;
};
type Page = { total: number; skip: number; limit: number; reports: R[] };
const LIMIT = 20;

export default function AdminDeception() {
  const [skip, setSkip] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Page>(`/deception-reports?status=pending&skip=${skip}&limit=${LIMIT}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [skip]);

  useEffect(() => { load(); }, [load]);

  async function decide(r: R, action: "confirm" | "dismiss") {
    if (action === "confirm" && !window.confirm(`Confirm as deceptive? The reporter is refunded and ${r.sender_name} gets a strike.`)) return;
    setBusy(r.id);
    try { await api(`/deception-reports/${r.id}/${action}`, { method: "POST" }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <>
      <h2>Deception reports</h2>
      <p className="muted small">Fake confession claims. Confirm refunds the person who linked up and strikes the poster.</p>
      {error ? <p className="err">{error}</p> : null}
      {!data ? <p className="muted">Loading…</p> : data.reports.length === 0 ? <p className="muted">No pending reports.</p> : (
        <div className="adm-list">
          {data.reports.map((r) => (
            <div key={r.id} className="adm-card">
              <div className="adm-chips">
                <b>{r.sender_name}</b>
                <Badge tone={r.sender_strikes ? "bad" : undefined}>{r.sender_strikes} strike{r.sender_strikes === 1 ? "" : "s"}</Badge>
              </div>
              <span className="muted small">reported by {r.reporter_name}</span>
              <p className="adm-text">{r.confession || "[no text]"}</p>
              {r.note ? <p className="adm-note"><b>Note:</b> {r.note}</p> : null}
              <div className="adm-foot">
                <span className="muted small">{fmtDate(r.created_at)}</span>
                <div className="adm-actions">
                  <button className="adm-btn" disabled={busy === r.id} onClick={() => decide(r, "dismiss")}>Dismiss</button>
                  <button className="adm-btn danger" disabled={busy === r.id} onClick={() => decide(r, "confirm")}>Confirm</button>
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
