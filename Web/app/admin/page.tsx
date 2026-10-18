"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, fmtDate } from "@/components/admin/bits";
import { Donut, LineChart, Spark } from "@/components/admin/charts";
import { IcCoin, IcDash, IcPost, IcPosts, IcRefund, IcShield, IcUsers, IcChat } from "@/components/admin/adminicons";

type Stats = {
  users: { total: number; active_last_30d: number; banned: number; verified: number; premium: number; admins: number };
  content: { total_drops: number; drops_today: number };
  support: { open_conversations: number; pending_refunds: number };
};
type Revenue = { total_usd: number; by_method: Record<string, { total_usd: number; count: number }> };
type Series = { labels: string[]; signups: number[]; drops: number[]; transactions: number[] };
type Txn = { id: string; user_id: string | null; amount: number | null; type: string | null; description: string | null; created_at: string | null };

const RANGES = [7, 30, 90] as const;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rev, setRev] = useState<Revenue | null>(null);
  const [ts, setTs] = useState<Series | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const [s, r, t] = await Promise.all([
          api<Stats>("/admin/stats"),
          api<Revenue>("/admin/revenue"),
          api<{ transactions: Txn[] }>("/admin/coins/transactions?limit=8"),
        ]);
        if (live) { setStats(s); setRev(r); setTxns(t.transactions); setError(""); }
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    };
    load();
    const t = window.setInterval(load, 15000);
    return () => { live = false; window.clearInterval(t); };
  }, []);

  useEffect(() => {
    let live = true;
    api<Series>(`/admin/timeseries?days=${days}`).then((r) => { if (live) setTs(r); }).catch(() => {});
    return () => { live = false; };
  }, [days]);

  const u = stats?.users;
  const parts = useMemo(() => {
    if (!u) return [];
    const inactive = Math.max(0, u.total - u.active_last_30d - u.banned);
    return [
      { name: "Active (30d)", value: u.active_last_30d, color: "#34d399" },
      { name: "Inactive", value: inactive, color: "#8B5CF6" },
      { name: "Banned", value: u.banned, color: "#ff5d6c" },
    ];
  }, [u]);

  const kpis = [
    { label: "Users", value: u?.total, sub: ts ? `+${sum(ts.signups)} in ${days}d` : "", color: "#3B82F6", icon: <IcUsers />, spark: ts?.signups },
    { label: "Drops", value: stats?.content.total_drops, sub: stats ? `${stats.content.drops_today} today` : "", color: "#FF634A", icon: <IcPosts />, spark: ts?.drops },
    { label: "Premium", value: u?.premium, sub: u ? `${u.verified} verified` : "", color: "#F59E0B", icon: <IcShield /> },
    { label: "Pending refunds", value: stats?.support.pending_refunds, sub: stats ? `${stats.support.open_conversations} unread chats` : "", color: "#10B981", icon: <IcRefund /> },
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h2>Overview</h2>
          <p>How Anonixx is doing right now.</p>
        </div>
        <Link href="/admin/post" className="adm-btn primary">+ Post a drop</Link>
      </div>
      {error ? <p className="err">{error}</p> : null}

      <div className="adm-dash">
        <div className="adm-panel adm-earn w4">
          <div className="adm-label">Total revenue</div>
          <div className="adm-big">${(rev?.total_usd ?? 0).toFixed(2)}</div>
          <div className="adm-chips">
            {rev && Object.entries(rev.by_method).length
              ? Object.entries(rev.by_method).map(([m, d]) => <span key={m} className="adm-badge">{m}: ${d.total_usd.toFixed(2)} ({d.count})</span>)
              : <span className="adm-badge">No payments yet</span>}
          </div>
          <Link href="/admin/refunds" className="adm-btn">Review refunds</Link>
        </div>

        <div className="w8">
          <div className="adm-kpis">
            {kpis.map((k) => (
              <div key={k.label} className="adm-kpi" style={{ "--k": k.color } as React.CSSProperties}>
                <span className="ico">{k.icon}</span>
                {k.spark ? <Spark values={k.spark} color={k.color} /> : null}
                <span className="v">{k.value ?? "—"}</span>
                <span className="l">{k.label}</span>
                <span className="s">{k.sub}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="adm-panel w8">
          <div className="adm-panel-head">
            <h3>Activity</h3>
            <div className="adm-seg-sm">
              {RANGES.map((r) => <button key={r} type="button" className={days === r ? "on" : ""} onClick={() => setDays(r)}>{r}d</button>)}
            </div>
          </div>
          {ts ? (
            <>
              <LineChart
                labels={ts.labels}
                series={[
                  { name: "Drops", color: "#FF634A", values: ts.drops },
                  { name: "Signups", color: "#3B82F6", values: ts.signups },
                  { name: "Coin activity", color: "#34d399", values: ts.transactions },
                ]}
              />
              <div className="adm-legend">
                <span><i style={{ background: "#FF634A" }} />Drops · {sum(ts.drops)}</span>
                <span><i style={{ background: "#3B82F6" }} />Signups · {sum(ts.signups)}</span>
                <span><i style={{ background: "#34d399" }} />Coin activity · {sum(ts.transactions)}</span>
              </div>
            </>
          ) : <p className="muted small">Loading…</p>}
        </div>

        <div className="adm-panel w4">
          <h3>Users</h3>
          {u ? <Donut parts={parts} total={u.total} label="users" /> : <p className="muted small">Loading…</p>}
        </div>

        <div className="adm-panel w7">
          <div className="adm-panel-head"><h3>Recent coin activity</h3><Link href="/admin/users" className="muted small">Users →</Link></div>
          {txns.length ? (
            <ul className="adm-feed">
              {txns.map((t) => (
                <li key={t.id}>
                  <span className="adm-badge"><IcCoin /></span>
                  <span className="wh">
                    <b>{t.description || t.type || "Transaction"}</b>
                    <small>{fmtDate(t.created_at)}</small>
                  </span>
                  <Badge tone={t.type === "credit" || (t.amount ?? 0) > 0 ? "ok" : "warn"}>{t.type || "txn"}</Badge>
                  <span className={`amt ${(t.amount ?? 0) >= 0 ? "pos" : "neg"}`}>{(t.amount ?? 0) > 0 ? "+" : ""}{t.amount ?? 0}</span>
                </li>
              ))}
            </ul>
          ) : <p className="adm-empty">No coin activity yet.</p>}
        </div>

        <div className="adm-panel w5">
          <h3>Quick actions</h3>
          <div className="adm-quick">
            <Link href="/admin/post"><span className="ic"><IcPost /></span>Post a drop</Link>
            <Link href="/admin/moderation"><span className="ic"><IcShield /></span>Moderation</Link>
            <Link href="/admin/support"><span className="ic"><IcChat /></span>Support</Link>
            <Link href="/admin/kanban"><span className="ic"><IcDash /></span>Refund board</Link>
          </div>
        </div>
      </div>
    </>
  );
}
