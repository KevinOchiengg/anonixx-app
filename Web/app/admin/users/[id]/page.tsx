"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAdminRole } from "@/components/admin/AdminShell";
import { Badge, fmtDate, theirTime } from "@/components/admin/bits";

type Full = {
  user: {
    id: string; email: string; name: string | null; username: string | null; avatar_url: string | null; created_at: string | null; last_login: string | null;
    is_active: boolean; is_admin: boolean; admin_role: string | null; is_super_admin: boolean; is_premium: boolean; is_verified: boolean;
    coin_balance: number; gender: string | null; tz: string | null; age_attested: string | null; signup_source: Record<string, string>; referred_by: string | null;
    strikes: number; notes: string;
  };
  counts: { drops: number; knocks_sent: number; knocks_received: number; reports_against: number; reports_made: number; days_active_30d: number };
  drops: { id: string; text: string; kind: string | null; media_type: string | null; likes: number; views: number; reports: number; status: string; created_at: string | null }[];
  reports: { drop_id: string; reason: string; note: string | null; created_at: string | null }[];
  deception: { id: string; status: string; reason: string | null; created_at: string | null }[];
  purchases: { id: string; status: string; provider: string | null; coins: number; usd: number | null; kes: number | null; created_at: string | null }[];
  transactions: { amount: number; reason: string | null; description: string | null; created_at: string | null }[];
  refunds: { id: string; status: string; reason: string | null; created_at: string | null }[];
  linked_accounts: { user_id: string; name: string | null; banned: boolean; same: "device" | "network"; created_at: string | null }[];
  history: { action: string; admin_id: string; details: Record<string, unknown>; created_at: string | null }[];
};

type Row = { key: string; count: number };
type Taste = {
  days: number;
  totals: { view: number; vote: number; react: number; save: number; like: number };
  kinds: Row[]; moods: Row[]; media: Row[]; reactions: Row[]; all_time_moods: Row[];
  top_drops: { id: string; score: number; kind: string; mood: string | null; teaser: string; did: string[] }[];
};

const DID: Record<string, string> = { like: "liked", save: "saved", react: "reacted", vote: "voted", view: "opened" };

function Mix({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="adm-empty">—</p>;
  const total = rows.reduce((n, r) => n + r.count, 0) || 1;
  return (
    <ul className="adm-bars">
      {rows.map((r) => (
        <li key={r.key}><i style={{ width: `${(100 * r.count) / total}%` }} /><span>{r.key}</span><b>{Math.round((100 * r.count) / total)}%</b></li>
      ))}
    </ul>
  );
}

/** What this person loves to see: built from what they open, like, save, react and vote on (not what they post). */
function TastePanel({ id }: { id: string }) {
  const [days, setDays] = useState(90);
  const [t, setT] = useState<Taste | null>(null);
  useEffect(() => { api<Taste>(`/admin/users/${id}/taste?days=${days}`).then(setT).catch(() => setT(null)); }, [id, days]);
  if (!t) return null;
  const n = t.totals;
  const any = n.view + n.like + n.save + n.react + n.vote > 0;
  return (
    <div className="adm-panel">
      <div className="adm-panel-head">
        <div>
          <h3>Taste</h3>
          <p className="muted small">What they love to see, from what they open, like, save, react and vote on. Likes count most, opens least. Their own posts don&apos;t count.</p>
        </div>
        <div className="adm-seg-sm">
          {[30, 90, 365].map((r) => <button key={r} type="button" className={days === r ? "on" : ""} onClick={() => setDays(r)}>{r === 365 ? "1y" : `${r}d`}</button>)}
        </div>
      </div>
      {!any ? <p className="adm-empty">They haven&apos;t opened or liked anyone&apos;s drops in this period.</p> : (
        <div className="adm-dash">
          <div className="w3">
            <dl className="adm-kv">
              <dt>Opened</dt><dd>{n.view}</dd>
              <dt>Liked</dt><dd>{n.like}</dd>
              <dt>Saved</dt><dd>{n.save}</dd>
              <dt>Reacted</dt><dd>{n.react}</dd>
              <dt>Voted</dt><dd>{n.vote}</dd>
            </dl>
          </div>
          <div className="w3"><h3>Moods</h3><Mix rows={t.moods} /></div>
          <div className="w3"><h3>Kinds</h3><Mix rows={t.kinds} /><h3>Format</h3><Mix rows={t.media} /></div>
          <div className="w3">
            {t.reactions.length ? <><h3>Reactions they give</h3><Mix rows={t.reactions} /></> : null}
            {t.all_time_moods.length ? <><h3>All-time mood pull</h3><Mix rows={t.all_time_moods} /></> : null}
          </div>
          <div className="adm-panel">
            <h3>Drops they loved most</h3>
            <ul className="adm-bars">
              {t.top_drops.map((p) => (
                <li key={p.id}>
                  <span><Link href={`/drop/${p.id}`}>{p.teaser}</Link><small className="muted"> · {p.kind}{p.mood ? ` · ${p.mood}` : ""}</small></span>
                  <small>{p.did.map((k) => DID[k]).join(", ")}</small>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

const ROLES: [string, string][] =[["admin", "Admin: everything"], ["moderator", "Moderator: reports, bans, support"], ["finance", "Finance: money, refunds, support"], ["content", "Content: posting, scheduling, sounds, ads"]];

export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const { isSuper } = useAdminRole();
  const [d, setD] = useState<Full | null>(null);
  const [err, setErr] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Full>(`/admin/users/${id}/full`).then((r) => { setD(r); setNotes(r.user.notes); }).catch((e) => setErr((e as Error).message)), [id]);
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>, msg: string) {
    setBusy(true); setErr(""); setSaved("");
    try { await fn(); setSaved(msg); await load(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (err && !d) return <p className="err">{err}</p>;
  if (!d) return <p className="muted small">Loading…</p>;
  const u = d.user;
  const src = u.signup_source || {};

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <p className="small"><Link href="/admin/users">← Users</Link></p>
          <h2>{u.name || u.username || "—"}</h2>
          <p>{u.email}</p>
          <div className="adm-chips">
            {!u.is_active ? <Badge tone="bad">banned</Badge> : null}
            {u.is_super_admin ? <Badge tone="warn">super admin</Badge> : u.is_admin ? <Badge tone="warn">{u.admin_role || "admin"}</Badge> : null}
            {u.is_verified ? <Badge tone="ok">verified</Badge> : null}
            {u.is_premium ? <Badge>premium</Badge> : null}
            {u.strikes ? <Badge tone="bad">{u.strikes} strike{u.strikes === 1 ? "" : "s"}</Badge> : null}
            {d.linked_accounts.length ? <Badge tone="warn">{d.linked_accounts.length} linked account{d.linked_accounts.length === 1 ? "" : "s"}</Badge> : null}
          </div>
        </div>
        <div className="adm-actions">
          <button className="adm-btn" disabled={busy || u.is_super_admin} onClick={() => act(() => api(`/admin/users/${u.id}/ban`, { method: "PATCH" }), u.is_active ? "Banned." : "Unbanned.")}>{u.is_active ? "Ban" : "Unban"}</button>
          <button className="adm-btn" disabled={busy} onClick={() => act(() => api(`/admin/users/${u.id}/verify`, { method: "PATCH" }), "Updated.")}>{u.is_verified ? "Unverify" : "Verify"}</button>
        </div>
      </div>
      {err ? <p className="err">{err}</p> : null}
      {saved ? <p className="ok">{saved}</p> : null}

      <div className="adm-dash">
        <div className="adm-panel w4">
          <h3>Account</h3>
          <dl className="adm-kv">
            <dt>Joined</dt><dd>{fmtDate(u.created_at)}</dd>
            <dt>Last login</dt><dd>{fmtDate(u.last_login)}</dd>
            <dt>Active days (30d)</dt><dd>{d.counts.days_active_30d}</dd>
            <dt>Came from</dt><dd>{src.channel || (u.referred_by ? "referral" : "before tracking")}{src.utm_campaign ? ` · ${src.utm_campaign}` : ""}{src.landing ? <span className="muted small"> (landed on {src.landing})</span> : null}</dd>
            {u.referred_by ? <><dt>Referred by code</dt><dd>{u.referred_by}</dd></> : null}
            <dt>Coins</dt><dd>{u.coin_balance}</dd>
            <dt>Gender</dt><dd>{u.gender || "—"}</dd>
            <dt>Their time</dt><dd>{theirTime(u.tz) ? `${theirTime(u.tz)} (${u.tz})` : "—"}</dd>
            <dt>18+ confirmed by</dt><dd>{u.age_attested === "signup_tick" ? "signup tick" : u.age_attested === "hookup_age" ? "age on a hookup post" : u.age_attested === "dob" ? "date of birth" : u.age_attested || "—"}</dd>
          </dl>
        </div>
        <div className="adm-panel w4">
          <h3>Activity</h3>
          <dl className="adm-kv">
            <dt>Posts</dt><dd>{d.counts.drops}</dd>
            <dt>Knocks sent</dt><dd>{d.counts.knocks_sent}</dd>
            <dt>Knocks received</dt><dd>{d.counts.knocks_received}</dd>
            <dt>Reports on their posts</dt><dd>{d.counts.reports_against}</dd>
            <dt>Reports they made</dt><dd>{d.counts.reports_made}</dd>
          </dl>
        </div>
        <div className="adm-panel w4">
          <h3>Private notes</h3>
          <textarea className="adm-edit" rows={5} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only admins see this. Context for the next person handling them." />
          <button className="adm-btn primary" disabled={busy || notes === u.notes} onClick={() => act(() => api(`/admin/users/${u.id}/notes`, { method: "PATCH", body: { notes } }), "Notes saved.")}>Save notes</button>
          {isSuper && u.is_admin && !u.is_super_admin ? (
            <>
              <h3>Admin role</h3>
              <select className="adm-select" value={u.admin_role || "admin"} disabled={busy} onChange={(e) => act(() => api(`/admin/users/${u.id}/role`, { method: "PATCH", body: { role: e.target.value } }), "Role updated.")}>
                {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </>
          ) : null}
        </div>

        {d.linked_accounts.length ? (
          <div className="adm-panel">
            <h3>Possibly the same person</h3>
            <p className="muted small">Accounts created from the same device, or the same network (a shared Wi-Fi can be innocent).</p>
            <table className="adm-table">
              <thead><tr><th>Account</th><th>Match</th><th>Joined</th><th></th></tr></thead>
              <tbody>{d.linked_accounts.map((l) => (
                <tr key={l.user_id}><td><Link href={`/admin/users/${l.user_id}`}>{l.name || l.user_id}</Link></td><td><Badge tone={l.same === "device" ? "bad" : "warn"}>same {l.same}</Badge></td><td className="small">{fmtDate(l.created_at)}</td><td>{l.banned ? <Badge tone="bad">banned</Badge> : null}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}

        {isSuper ? <TastePanel id={u.id} /> : null}

        <div className="adm-panel w7">
          <h3>Posts</h3>
          {d.drops.length === 0 ? <p className="adm-empty">No posts.</p> : (
            <table className="adm-table">
              <thead><tr><th>Post</th><th>Views</th><th>Likes</th><th>Reports</th><th>Status</th></tr></thead>
              <tbody>{d.drops.map((p) => (
                <tr key={p.id}><td><Link href={`/drop/${p.id}`}>{p.text || `[${p.media_type || "media"}]`}</Link><div className="muted small">{p.kind} · {fmtDate(p.created_at)}</div></td><td>{p.views}</td><td>{p.likes}</td><td>{p.reports || ""}</td><td><Badge tone={p.status === "visible" ? undefined : "bad"}>{p.status}</Badge></td></tr>
              ))}</tbody>
            </table>
          )}
          {d.reports.length ? (
            <>
              <h3>Reports on their posts</h3>
              <ul className="adm-bars">{d.reports.map((r, i) => <li key={i}><span>{r.reason}{r.note ? `: ${r.note}` : ""}</span><small>{fmtDate(r.created_at)}</small></li>)}</ul>
            </>
          ) : null}
        </div>
        <div className="adm-panel w5">
          <h3>Money</h3>
          {d.purchases.length === 0 ? <p className="adm-empty">No purchases.</p> : (
            <ul className="adm-bars">{d.purchases.map((p) => <li key={p.id}><span>{p.coins} coins · {p.usd ? `$${p.usd.toFixed(2)}` : p.kes ? `KES ${p.kes}` : p.provider}</span><Badge tone={p.status === "completed" ? "ok" : p.status === "pending" ? "warn" : "bad"}>{p.status}</Badge></li>)}</ul>
          )}
          {d.refunds.length ? <><h3>Refunds</h3><ul className="adm-bars">{d.refunds.map((r) => <li key={r.id}><span>{r.reason || "—"}</span><Badge>{r.status}</Badge></li>)}</ul></> : null}
          {d.transactions.length ? (
            <>
              <h3>Recent coin history</h3>
              <ul className="adm-bars">{d.transactions.map((t, i) => <li key={i}><span>{t.description || t.reason || "—"}</span><b className={t.amount >= 0 ? "pos" : "neg"}>{t.amount > 0 ? "+" : ""}{t.amount}</b></li>)}</ul>
            </>
          ) : null}
          {d.deception.length ? <><h3>Deception reports</h3><ul className="adm-bars">{d.deception.map((r) => <li key={r.id}><span>{r.reason || "—"}</span><Badge>{r.status}</Badge></li>)}</ul></> : null}
        </div>

        <div className="adm-panel">
          <h3>Admin history on this account</h3>
          {d.history.length === 0 ? <p className="adm-empty">No admin actions logged.</p> : (
            <ul className="adm-bars">{d.history.map((h, i) => <li key={i}><span><b>{h.action}</b> {Object.entries(h.details).map(([k, v]) => `${k}: ${String(v)}`).join(", ")}</span><small>{fmtDate(h.created_at)}</small></li>)}</ul>
          )}
        </div>
      </div>
    </>
  );
}
