"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAdminRole } from "@/components/admin/AdminShell";
import { Badge, Pager, Tabs, fmtDate } from "@/components/admin/bits";

type R = {
  id: string; user_name: string | null; user_email: string | null; user_balance: number;
  coins: number | null; kes: number | null; reason: string | null; status: string; note: string | null; created_at: string | null;
};
type Page = { total: number; refunds: R[] };
const STATUSES = ["pending", "accepted", "rejected", "all"] as const;
const LIMIT = 30;

export default function AdminRefunds() {
  const { isSuper } = useAdminRole();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("pending");
  const [skip, setSkip] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Page>(`/admin/refunds?status=${status}&skip=${skip}&limit=${LIMIT}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [status, skip]);

  useEffect(() => { load(); }, [load]);

  async function decide(r: R, action: "accept" | "reject") {
    const msg = action === "accept"
      ? `Removes up to ${r.coins} coins from the user and tells them the money is coming back. You still send the money yourself (M-Pesa / Stripe). Continue?`
      : "Reject this refund request?";
    if (!window.confirm(msg)) return;
    setBusy(r.id);
    try { await api(`/admin/refunds/${r.id}/${action}`, { body: {} }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <>
      <h2>Refund requests</h2>
      {!isSuper ? <p className="muted small">View only — a super admin decides.</p> : null}
      <Tabs value={status} options={STATUSES} onChange={(v) => { setSkip(0); setStatus(v); }} />
      {error ? <p className="err">{error}</p> : null}
      {!data ? <p className="muted">Loading…</p> : data.refunds.length === 0 ? <p className="muted">No {status === "all" ? "" : status} requests.</p> : (
        <div className="adm-list">
          {data.refunds.map((r) => (
            <div key={r.id} className="adm-card">
              <b>{r.coins} coins{r.kes ? ` · KES ${r.kes}` : ""}</b>
              <div className="muted small">
                {r.user_name || "User"}{r.user_email ? ` · ${r.user_email}` : ""} · balance {r.user_balance}
              </div>
              <p className="adm-text">{r.reason}</p>
              <div className="adm-foot">
                <span className="muted small">{fmtDate(r.created_at)}</span>
                {r.status !== "pending" ? (
                  <Badge tone={r.status === "accepted" ? "ok" : "bad"}>{r.status}</Badge>
                ) : isSuper ? (
                  <div className="adm-actions">
                    <button className="adm-btn" disabled={busy === r.id} onClick={() => decide(r, "reject")}>Reject</button>
                    <button className="adm-btn primary" disabled={busy === r.id} onClick={() => decide(r, "accept")}>Accept</button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      {data ? <Pager skip={skip} limit={LIMIT} total={data.total} onSkip={setSkip} /> : null}
    </>
  );
}
