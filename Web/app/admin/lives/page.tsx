"use client";
import { useKept } from "@/lib/pageMemory";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useConfirm } from "@/lib/confirm";
import { money } from "@/lib/lives";
import { useAdminRole } from "@/components/admin/AdminShell";
import { Badge, Tabs, fmtDate, usePaged, useTab } from "@/components/admin/bits";

type Host = { name?: string; avatar_url?: string | null };
type LiveRow = {
  id: string; title: string; status: "scheduled" | "live" | "ended"; price: number; adult: boolean; promoted: boolean;
  members: number; viewers: number; starts_at: string | null; started_at: string | null; ended_at: string | null;
  host: Host & { id: string }; entry_coins: number; gift_coins: number; reports: number;
};
type Profile = {
  legal_name: string; id_number: string; id_number_last4: string; method: "mpesa" | "paypal" | "bank"; currency: string;
  destination: string; verified: boolean; submitted_at: string | null;
};
type Due = { host_id: string; host: Host; coins: number; amount: number; currency: string; weeks: string[]; profile: Profile | null };
type Payouts = {
  rates: Record<string, number>;
  due: Due[];
  recent: { id: string; host: Host; coins: number; amount: number; currency: string; reference: string | null; created_at: string | null }[];
};
type HostRow = Profile & { user_id: string; host: Host };

const TABS = ["Lives", "Payouts", "Hosts"] as const;
const STATUS_FILTERS: [string, string][] = [["", "All"], ["live", "Live"], ["scheduled", "Scheduled"], ["ended", "Ended"]];
const REF_HINT: Record<Profile["method"], string> = { mpesa: "M-Pesa code, e.g. SKL2X9P0QR", paypal: "PayPal transaction ID", bank: "Bank transfer reference" };

function LivesTab() {
  const confirm = useConfirm();
  const [status, setStatus] = useKept("status", "");
  const [rows, setRows] = useState<LiveRow[] | null>(null);
  const [error, setError] = useState("");
  const pg = usePaged(rows || [], { size: 20, text: (r) => `${r.title} ${r.host.name || ""}` });

  const load = useCallback(() => {
    api<{ lives: LiveRow[] }>(`/admin/lives${status ? `?status=${status}` : ""}`).then((r) => { setRows(r.lives); setError(""); }).catch((e) => setError((e as Error).message));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  async function end(r: LiveRow) {
    if (!(await confirm({ title: `End "${r.title}"?`, message: "Everyone watching is sent out. The host can't restart it.", confirmLabel: "End live", tone: "danger", icon: "live" }))) return;
    try { await api(`/admin/lives/${r.id}/end`, { method: "POST" }); load(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <div className="adm-actions" style={{ marginBottom: 12 }}>
        {STATUS_FILTERS.map(([k, label]) => (
          <button key={k} className={`adm-btn${status === k ? " primary" : ""}`} onClick={() => setStatus(k)}>{label}</button>
        ))}
      </div>
      {error ? <p className="err">{error}</p> : null}
      {!rows ? <p className="muted">Loading…</p> : !rows.length ? <p className="muted">No lives yet.</p> : (
        <>
          <div className="adm-scroll">
            <table className="adm-table">
              <thead><tr><th>Live</th><th>Host</th><th>Status</th><th>Price</th><th>Members</th><th>Coins in</th><th>Reports</th><th /></tr></thead>
              <tbody>{pg.rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.title}</b><div className="muted small">{fmtDate(r.started_at || r.starts_at)}</div></td>
                  <td><Link href={`/admin/users/${r.host.id}`}>{r.host.name || "Anonymous"}</Link></td>
                  <td>
                    <Badge tone={r.status === "live" ? "ok" : r.status === "scheduled" ? "warn" : undefined}>{r.status}</Badge>
                    {r.adult ? <> <Badge tone="bad">adult</Badge></> : null}
                    {r.promoted ? <> <Badge>promoted</Badge></> : null}
                  </td>
                  <td>{r.price}</td>
                  <td>{r.members}{r.status === "live" ? <div className="muted small">{r.viewers} watching</div> : null}</td>
                  <td>{r.entry_coins + r.gift_coins}<div className="muted small">{r.entry_coins} entry · {r.gift_coins} gifts</div></td>
                  <td>{r.reports ? <Badge tone="bad">{r.reports}</Badge> : "—"}</td>
                  <td>{r.status !== "ended" ? <button className="adm-btn danger" onClick={() => end(r)}>End</button> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {pg.tools}
        </>
      )}
    </>
  );
}

function PayoutsTab() {
  const confirm = useConfirm();
  const [data, setData] = useState<Payouts | null>(null);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<Payouts>("/admin/lives/payouts").then((r) => { setData(r); setError(""); }).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function markPaid(d: Due) {
    const reference = (refs[d.host_id] || "").trim();
    const ok = await confirm({
      title: `Mark ${money(d.amount, d.currency)} as paid?`,
      icon: "coins",
      message: `Only do this after sending the money to ${d.profile?.legal_name} (${d.profile?.destination}).`,
      detail: <div className="cf-row"><span>Reference</span><b>{reference}</b></div>,
      confirmLabel: "Mark as paid",
    });
    if (!ok) return;
    setBusy(d.host_id);
    try { await api(`/admin/lives/payouts/${d.host_id}/paid`, { body: { reference } }); load(); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }

  if (error) return <p className="err">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <>
      <p className="muted small">
        Earnings from finished weeks (Monday to Sunday). One coin pays KES {data.rates.KES} on M-Pesa or USD {data.rates.USD} on PayPal and bank.
        Send the money, then enter the transaction reference and mark it paid.
      </p>
      {!data.due.length ? <p className="muted">Nothing is owed right now.</p> : (
        <div className="adm-list">
          {data.due.map((d) => (
            <div key={d.host_id} className="adm-card">
              <div className="adm-chips">
                <b>{d.host.name || "Anonymous"}</b>
                <Badge tone="warn">{money(d.amount, d.currency)}</Badge>
                <span className="muted small">{d.coins} coins · weeks of {d.weeks.join(", ")}</span>
              </div>
              {d.profile ? (
                <p className="small">
                  {d.profile.legal_name} · ID {d.profile.id_number} · <b>{d.profile.destination}</b>{" "}
                  {d.profile.verified ? <Badge tone="ok">verified</Badge> : <Badge tone="bad">not verified</Badge>}
                </p>
              ) : <p className="err small">No payout details.</p>}
              <div className="adm-actions">
                <input className="adm-input" placeholder={d.profile ? REF_HINT[d.profile.method] : "Reference"} value={refs[d.host_id] || ""} maxLength={40}
                  onChange={(e) => setRefs({ ...refs, [d.host_id]: e.target.value })} />
                <button className="adm-btn primary" disabled={busy === d.host_id || !d.profile?.verified || (refs[d.host_id] || "").trim().length < 4} onClick={() => markPaid(d)}>
                  Mark paid
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {data.recent.length ? (
        <>
          <h3 style={{ marginTop: 22 }}>Recent payouts</h3>
          <ul className="adm-bars">
            {data.recent.map((p) => <li key={p.id}><span>{p.host.name || "Anonymous"} · {p.reference}</span><b>{money(p.amount, p.currency)}</b><small>{fmtDate(p.created_at)}</small></li>)}
          </ul>
        </>
      ) : null}
    </>
  );
}

function HostsTab() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<HostRow[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api<{ hosts: HostRow[] }>("/admin/lives/hosts").then((r) => { setRows(r.hosts); setError(""); }).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function verify(h: HostRow) {
    const ok = await confirm({
      title: `Verify ${h.legal_name}?`,
      message: "Confirm their ID matches this name and the payout account belongs to them. Payouts go only to verified hosts.",
      confirmLabel: "Verify host",
    });
    if (!ok) return;
    try { await api(`/admin/lives/hosts/${h.user_id}/verify`, { method: "POST" }); load(); } catch (e) { setError((e as Error).message); }
  }

  if (error) return <p className="err">{error}</p>;
  if (!rows) return <p className="muted">Loading…</p>;
  if (!rows.length) return <p className="muted">No hosts have added payout details yet.</p>;
  return (
    <div className="adm-scroll">
      <table className="adm-table">
        <thead><tr><th>Host</th><th>Legal name</th><th>ID</th><th>Paid to</th><th>Submitted</th><th /></tr></thead>
        <tbody>{rows.map((h) => (
          <tr key={h.user_id}>
            <td><Link href={`/admin/users/${h.user_id}`}>{h.host.name || "Anonymous"}</Link></td>
            <td>{h.legal_name}</td>
            <td>{h.id_number}</td>
            <td>{h.destination}</td>
            <td>{fmtDate(h.submitted_at)}</td>
            <td>{h.verified ? <Badge tone="ok">verified</Badge> : <button className="adm-btn primary" onClick={() => verify(h)}>Verify</button>}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function AdminLives() {
  const { isSuper: superAdmin } = useAdminRole();
  const [tab, setTab] = useTab(TABS);

  return (
    <>
      <h2>Lives</h2>
      <p className="muted small">Paid lives: hosts keep 80% of entry fees and all gifts, paid weekly by M-Pesa, PayPal or bank transfer.</p>
      {superAdmin ? <Tabs value={tab} options={TABS} onChange={setTab} /> : null}
      {tab === "Payouts" && superAdmin ? <PayoutsTab /> : tab === "Hosts" && superAdmin ? <HostsTab /> : <LivesTab />}
    </>
  );
}
