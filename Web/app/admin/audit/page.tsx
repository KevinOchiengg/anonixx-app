"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAdminRole } from "@/components/admin/AdminShell";
import { Pager, fmtDate } from "@/components/admin/bits";

type Entry = { id: string; admin_id: string; admin: string; action: string; target_type: string; target_id: string | null; details: Record<string, unknown>; created_at: string | null };
type Page = { total: number; skip: number; limit: number; entries: Entry[] };

const KINDS: [string, string][] = [["", "Everything"], ["user", "Users"], ["drop", "Posts"], ["scheduled", "Scheduled"], ["refund", "Refunds"], ["ad", "Ads"], ["deception", "Deception"], ["sound", "Sounds"], ["draft", "Agent drafts"], ["experiment", "A/B tests"], ["support", "Support"]];

const describe = (e: Entry) => {
  const d = e.details || {};
  if (e.action === "user.coins") return `${Number(d.amount) > 0 ? "+" : ""}${d.amount} coins: ${d.reason}`;
  if (e.action === "user.role") return `role → ${d.role}`;
  if (e.action.startsWith("draft.")) return d.scheduled_id ? `scheduled ${d.scheduled_id}` : "";
  return Object.entries(d).map(([k, v]) => `${k}: ${String(v)}`).join(", ");
};

export default function AuditPage() {
  const { isSuper } = useAdminRole();
  const [kind, setKind] = useState("");
  const [skip, setSkip] = useState(0);
  const [d, setD] = useState<Page | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!isSuper) return;
    const p = new URLSearchParams({ skip: String(skip), limit: "50" });
    if (kind) p.set("action", kind);
    api<Page>(`/admin/audit?${p}`).then(setD).catch((e) => setErr((e as Error).message));
  }, [kind, skip, isSuper]);

  if (!isSuper) return <div className="adm-card adm-gate"><h2>Super admins only</h2><p className="muted">The activity log is visible to the super admin.</p></div>;
  return (
    <>
      <div className="adm-pagehead">
        <div><h2>Activity log</h2><p>Every ban, delete, refund, coin change, edit and approval, with who did it.</p></div>
        <select className="adm-select" value={kind} onChange={(e) => { setSkip(0); setKind(e.target.value); }} aria-label="Filter">
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {err ? <p className="err">{err}</p> : null}
      {!d ? <p className="muted small">Loading…</p> : d.entries.length === 0 ? <p className="adm-empty">Nothing logged yet. Admin actions show up here from now on.</p> : (
        <div className="adm-scroll">
          <table className="adm-table">
            <thead><tr><th>When</th><th>Who</th><th>Did</th><th>To</th><th>Details</th></tr></thead>
            <tbody>
              {d.entries.map((e) => (
                <tr key={e.id}>
                  <td className="small">{fmtDate(e.created_at)}</td>
                  <td><Link href={`/admin/users/${e.admin_id}`}>{e.admin}</Link></td>
                  <td><b>{e.action}</b></td>
                  <td className="small">
                    {e.target_type === "user" && e.target_id ? <Link href={`/admin/users/${e.target_id}`}>user {e.target_id.slice(-6)}</Link>
                      : e.target_type === "drop" && e.target_id ? <Link href={`/drop/${e.target_id}`}>post {e.target_id.slice(-6)}</Link>
                      : `${e.target_type}${e.target_id ? ` ${e.target_id.length > 30 ? e.target_id.slice(0, 30) + "…" : e.target_id}` : ""}`}
                  </td>
                  <td className="small">{describe(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d ? <Pager skip={d.skip} limit={d.limit} total={d.total} onSkip={setSkip} /> : null}
    </>
  );
}
