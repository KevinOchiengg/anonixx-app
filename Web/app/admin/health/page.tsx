"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtDate } from "@/components/admin/bits";

type Health = {
  checked_at: string; ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
  failed_posts: { id: string; platform: string | null; error: string; at: string | null }[];
  switches: Record<string, boolean>;
};

export default function HealthPage() {
  const [d, setD] = useState<Health | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    const load = () => api<Health>("/admin/health").then((r) => { if (live) { setD(r); setErr(""); } }).catch((e) => live && setErr((e as Error).message));
    load();
    const t = window.setInterval(load, 30000);
    return () => { live = false; window.clearInterval(t); };
  }, []);

  return (
    <>
      <div className="adm-pagehead">
        <div><h2>System health</h2><p>{d ? (d.ok ? "Everything looks fine." : "Something needs a look.") : "Checking…"} {d ? <span className="muted small">Checked {fmtDate(d.checked_at)}</span> : null}</p></div>
      </div>
      {err ? <p className="err">{err}</p> : null}
      {d ? (
        <div className="adm-dash">
          <div className="adm-panel w7">
            <h3>Checks</h3>
            {d.checks.map((c) => (
              <div key={c.name} className="adm-check">
                <span className={`dot${c.ok ? "" : " bad"}`} aria-label={c.ok ? "OK" : "Problem"} />
                <span><b>{c.name}</b><br /><span className="muted small">{c.detail}</span></span>
              </div>
            ))}
          </div>
          <div className="adm-panel w5">
            <h3>Switches</h3>
            <p className="muted small">Features that need a key on the server (Render → Environment). Off isn't an error; it just means that feature is off.</p>
            {Object.entries(d.switches).map(([k, on]) => (
              <div key={k} className="adm-check"><span className={`dot${on ? "" : " off"}`} /><span>{k}<br /><span className="muted small">{on ? "on" : "off"}</span></span></div>
            ))}
          </div>
          <div className="adm-panel">
            <h3>Recent failed social posts</h3>
            {d.failed_posts.length === 0 ? <p className="adm-empty">None.</p> : (
              <table className="adm-table">
                <thead><tr><th>When</th><th>Platform</th><th>Error</th></tr></thead>
                <tbody>{d.failed_posts.map((f) => <tr key={f.id}><td className="small">{fmtDate(f.at)}</td><td>{f.platform || "—"}</td><td className="small">{f.error || "—"}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
