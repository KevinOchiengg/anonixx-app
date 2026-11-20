"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAdminRole } from "@/components/admin/AdminShell";
import { Pager, fmtDate } from "@/components/admin/bits";

type Person = { id: string; name: string | null; username: string | null; email: string | null; avatar_url: string | null; gender: string | null; banned: boolean; joined: string | null };
type Row = {
  id: string; sender: Person; poster: Person; drop_id: string | null; snippet: string; pitch: string | null;
  status: string; paid: boolean; cost: number; refunded: boolean; poster_replied: boolean; sender_wrote: boolean;
  connection_id: string | null; created_at: string | null;
};
type Page = { total: number; skip: number; limit: number; summary: { coins_kept: number; unique_senders: number }; linkups: Row[] };

const STATUSES: [string, string][] = [["", "All"], ["accepted", "In the chat"], ["pending", "Waiting"], ["declined", "Declined"], ["refunded", "Refunded"]];
const RANGES = [7, 30, 90, 365];

function Who({ p }: { p: Person }) {
  const label = p.name || p.username || "Unknown";
  return (
    <div className="lu-who">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.avatar_url ? <img src={p.avatar_url} alt="" /> : <span className="lu-av">{label.slice(0, 1).toUpperCase()}</span>}
      <div>
        <Link href={`/admin/users/${p.id}`}><b>{label}</b></Link>{p.banned ? <em className="lu-ban">banned</em> : null}
        <small>{p.email || (p.username ? `@${p.username}` : p.id?.slice(-6))}</small>
        <small><Link href={`/room/${p.id}`} target="_blank">Room</Link> · <Link href={`/admin/users/${p.id}`}>Profile</Link></small>
      </div>
    </div>
  );
}

export default function LinkupsPage() {
  const { isSuper } = useAdminRole();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("");
  const [days, setDays] = useState(30);
  const [skip, setSkip] = useState(0);
  const [d, setD] = useState<Page | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => { const t = setTimeout(() => { setSkip(0); setTerm(q.trim()); }, 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    if (!isSuper) return;
    const p = new URLSearchParams({ skip: String(skip), limit: "50", days: String(days) });
    if (status) p.set("status", status);
    if (term) p.set("q", term);
    setErr("");
    api<Page>(`/admin/linkups?${p}`).then(setD).catch((e) => setErr((e as Error).message));
  }, [isSuper, skip, days, status, term]);

  if (!isSuper) return <div className="adm-card adm-gate"><h2>Super admins only</h2><p className="muted">Link ups are visible to the super admin.</p></div>;
  return (
    <>
      <div className="adm-pagehead">
        <div><h2>Link ups</h2><p>Who knocked on whom, what they paid, and whether anyone talked.</p></div>
        <div className="lu-filters">
          <input className="adm-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, @username or email" aria-label="Search people" />
          <select className="adm-select" value={status} onChange={(e) => { setSkip(0); setStatus(e.target.value); }} aria-label="Status">
            {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="adm-select" value={days} onChange={(e) => { setSkip(0); setDays(Number(e.target.value)); }} aria-label="Range">
            {RANGES.map((r) => <option key={r} value={r}>Last {r} days</option>)}
          </select>
        </div>
      </div>
      {d ? (
        <div className="lu-stats">
          <div className="adm-card"><small>Link ups</small><b>{d.total}</b></div>
          <div className="adm-card"><small>People who sent them</small><b>{d.summary.unique_senders}</b></div>
          <div className="adm-card"><small>Coins kept (after refunds)</small><b>{d.summary.coins_kept}</b></div>
        </div>
      ) : null}
      {err ? <p className="err">{err}</p> : null}
      {!d ? <p className="muted small">Loading…</p> : d.linkups.length === 0 ? <p className="adm-empty">No link ups in this range.</p> : (
        <div className="adm-scroll">
          <table className="adm-table">
            <thead><tr><th>When</th><th>Sent by</th><th>To</th><th>On post</th><th>Paid</th><th>Chat</th></tr></thead>
            <tbody>
              {d.linkups.map((r) => (
                <tr key={r.id}>
                  <td className="small">{fmtDate(r.created_at)}</td>
                  <td><Who p={r.sender} /></td>
                  <td><Who p={r.poster} /></td>
                  <td className="small lu-post">
                    {r.drop_id ? <Link href={`/drop/${r.drop_id}`} target="_blank">{r.snippet || `post ${r.drop_id.slice(-6)}`}</Link> : r.snippet || "—"}
                    {r.pitch ? <q>{r.pitch}</q> : null}
                  </td>
                  <td className="small">{r.paid ? `${r.cost} coins` : "Free"}{r.refunded ? <em className="lu-tag">refunded</em> : null}</td>
                  <td className="small">
                    <span className={`lu-tag ${r.status}`}>{r.status === "accepted" ? "in the chat" : r.status}</span>
                    {r.connection_id ? <><br />{r.sender_wrote ? "Sender wrote" : "Sender silent"} · {r.poster_replied ? "poster replied" : "no reply yet"}</> : null}
                  </td>
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
