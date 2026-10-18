"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAdminRole } from "@/components/admin/AdminShell";
import { fmtDate } from "@/components/admin/bits";

type R = {
  id: string; user_name: string | null; user_email: string | null; user_balance: number;
  coins: number | null; kes: number | null; reason: string | null; status: string; created_at: string | null;
};
type Page = { total: number; refunds: R[] };
const COLS = [
  { id: "pending", title: "Pending", color: "#F59E0B" },
  { id: "accepted", title: "Accepted", color: "#34d399" },
  { id: "rejected", title: "Rejected", color: "#ff5d6c" },
] as const;
type ColId = (typeof COLS)[number]["id"];

export default function RefundBoard() {
  const { isSuper } = useAdminRole();
  const [cols, setCols] = useState<Record<ColId, Page | null>>({ pending: null, accepted: null, rejected: null });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<ColId | null>(null);

  const load = useCallback(async () => {
    try {
      const [pending, accepted, rejected] = await Promise.all(
        COLS.map((c) => api<Page>(`/admin/refunds?status=${c.id}&skip=0&limit=50`)),
      );
      setCols({ pending, accepted, rejected });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(r: R, action: "accept" | "reject") {
    const msg = action === "accept"
      ? `Removes up to ${r.coins} coins from the user and tells them the money is coming back. You still send the money yourself (M-Pesa / Stripe). Continue?`
      : "Reject this refund request?";
    if (!window.confirm(msg)) return;
    setBusy(r.id);
    try { await api(`/admin/refunds/${r.id}/${action}`, { body: {} }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  function drop(col: ColId) {
    setOver(null);
    const r = cols.pending?.refunds.find((x) => x.id === dragId);
    setDragId(null);
    if (!r || !isSuper || col === "pending") return;
    decide(r, col === "accepted" ? "accept" : "reject");
  }

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h2>Refund board</h2>
          <p>{isSuper ? "Drag a pending request into Accepted or Rejected, or use the buttons." : "View only. A super admin decides."}</p>
        </div>
      </div>
      {error ? <p className="err">{error}</p> : null}
      <div className="adm-board">
        {COLS.map((c) => {
          const items = cols[c.id]?.refunds ?? [];
          return (
            <div
              key={c.id}
              className={`adm-col${over === c.id ? " over" : ""}`}
              onDragOver={(e) => { if (dragId && c.id !== "pending") { e.preventDefault(); setOver(c.id); } }}
              onDragLeave={() => setOver((o) => (o === c.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); drop(c.id); }}
            >
              <div className="adm-col-head"><span><i style={{ background: c.color }} />{c.title}</span><em>{cols[c.id]?.total ?? 0}</em></div>
              {!cols[c.id] ? <p className="adm-empty">Loading…</p> : items.length === 0 ? <p className="adm-empty">Nothing here.</p> : items.map((r) => (
                <div
                  key={r.id}
                  className={`adm-kcard${dragId === r.id ? " drag" : ""}`}
                  draggable={isSuper && c.id === "pending"}
                  onDragStart={() => setDragId(r.id)}
                  onDragEnd={() => { setDragId(null); setOver(null); }}
                >
                  <b>{r.coins} coins{r.kes ? ` · KES ${r.kes}` : ""}</b>
                  <p>{r.reason}</p>
                  <div className="row"><span>{r.user_name || r.user_email || "User"}</span><span>{fmtDate(r.created_at)}</span></div>
                  {c.id === "pending" && isSuper ? (
                    <div className="adm-actions">
                      <button type="button" className="adm-btn" disabled={busy === r.id} onClick={() => decide(r, "reject")}>Reject</button>
                      <button type="button" className="adm-btn primary" disabled={busy === r.id} onClick={() => decide(r, "accept")}>Accept</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
