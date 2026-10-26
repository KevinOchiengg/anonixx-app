"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { fmtDate } from "@/components/admin/bits";

type Alert = { id: string; type: string; level: "good" | "warn" | "bad"; title: string; body: string; link: string | null; created_at: string | null; dismissed: boolean };

export default function AlertsPage() {
  const [all, setAll] = useState(false);
  const [list, setList] = useState<Alert[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    api<{ alerts: Alert[] }>(`/admin/alerts${all ? "?include_dismissed=true" : ""}`).then((r) => setList(r.alerts)).catch((e) => setErr((e as Error).message));
  }, [all]);
  useEffect(() => { load(); }, [load]);
  const dismiss = async (a: Alert) => { await api(`/admin/alerts/${a.id}/dismiss`, { method: "POST" }).catch((e) => setErr((e as Error).message)); load(); };

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h2>Alerts</h2>
          <p>Checked every 15 minutes: signups stopping, payments failing, auto-posting breaking, reports or traffic spiking. Super admins also get each one by push and email, plus a morning summary.</p>
        </div>
        <label className="small"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show handled</label>
      </div>
      {err ? <p className="err">{err}</p> : null}
      {!list ? <p className="muted small">Loading…</p> : list.length === 0 ? <p className="adm-empty">All quiet. Nothing needs you right now.</p> : (
        <div className="adm-list">
          {list.map((a) => (
            <div key={a.id} className="adm-alert" style={a.dismissed ? { opacity: 0.55 } : undefined}>
              <span className={`lv ${a.level}`} aria-hidden />
              <div>
                <b>{a.title}</b>
                <p className="muted small" style={{ margin: "4px 0" }}>{a.body}</p>
                <span className="muted small">{fmtDate(a.created_at)}</span>
              </div>
              <div className="adm-actions">
                {a.link ? <Link href={a.link} className="adm-btn">Look</Link> : null}
                {!a.dismissed ? <button type="button" className="adm-btn primary" onClick={() => dismiss(a)}>Handled</button> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
