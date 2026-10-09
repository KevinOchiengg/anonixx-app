"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, compact, teaser } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { normalizeKePhone } from "@/lib/phone";
import AppShell from "./AppShell";
import Sheet from "./Sheet";
import "@/app/money.css";

type Balance = { balance: number; estimated_kes: number; payout_rate_kes_per_coin: number };
type Mine = { id: string; content: string; views_count: number; likes_count: number; time_ago: string };
type Tx = { id: string; description?: string; reason?: string; amount: number };
type Wd = { id: string; amount_coins: number; mpesa_number: string; estimated_kes: number; status: string };
type Impact = { all_time?: { people_supported: number; responses_received: number; saves_received: number } };

const MIN_WITHDRAW = 100;

function Inner() {
  const { refresh } = useAuth();
  const [bal, setBal] = useState<Balance | null>(null);
  const [mine, setMine] = useState<{ posts: Mine[]; total_views: number } | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [wds, setWds] = useState<Wd[]>([]);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [open, setOpen] = useState(false);
  const [coins, setCoins] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const load = useCallback(() => {
    api<Balance>("/coins/balance").then(setBal).catch(() => {});
    api<{ posts: Mine[]; total_views: number }>("/drops/mine").then(setMine).catch(() => setMine({ posts: [], total_views: 0 }));
    api<Tx[]>("/coins/transactions").then((r) => setTxs(Array.isArray(r) ? r : [])).catch(() => {});
    api<Wd[]>("/coins/withdraw/history").then((r) => setWds(Array.isArray(r) ? r : [])).catch(() => {});
    api<Impact>("/impact/dashboard").then(setImpact).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function withdraw(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(coins, 10);
    if (!n || n < MIN_WITHDRAW) { setErr(`Minimum withdrawal is ${MIN_WITHDRAW} coins.`); return; }
    const num = normalizeKePhone(phone);
    if (num.length < 12) { setErr("Enter a valid M-Pesa number."); return; }
    setBusy(true); setErr("");
    try {
      const r = await api<{ estimated_kes: number }>("/coins/withdraw", { body: { amount_coins: n, mpesa_number: num } });
      setOk(`Requested. About KES ${r.estimated_kes} will be sent to your M-Pesa after review.`);
      setOpen(false); setCoins("");
      load(); refresh();
    } catch (e2) {
      const s = (e2 as { status?: number }).status;
      setErr(s === 402 ? "You do not have enough coins." : (e2 as Error).message);
    } finally { setBusy(false); }
  }

  async function del(id: string) {
    if (!window.confirm("Delete this post?")) return;
    try { await api(`/drops/${id}`, { method: "DELETE" }); load(); } catch (e) { setErr((e as Error).message); }
  }
  async function edit(p: Mine) {
    const next = window.prompt("Edit your post", p.content);
    if (next === null || !next.trim() || next === p.content) return;
    try { await api(`/drops/${p.id}`, { method: "PATCH", body: { content: next.trim() } }); load(); } catch (e) { setErr((e as Error).message); }
  }

  const at = impact?.all_time;
  return (
    <div className="pad">
      <div className="balance">
        <span>Earnings<br /><small className="muted">≈ KES {bal?.estimated_kes ?? 0}</small></span>
        <strong>{bal?.balance ?? 0}</strong>
      </div>
      {ok ? <div className="ok">{ok}</div> : null}
      {err && !open ? <div className="err">{err}</div> : null}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="pill" onClick={() => { setErr(""); setOk(""); setOpen(true); }}>Withdraw to M-Pesa</button>
        <Link href="/coins" className="pill ghost">Buy coins</Link>
      </div>

      <div className="stat-grid">
        <div className="stat"><strong>{compact(mine?.total_views ?? 0)}</strong><span>Total views</span></div>
        <div className="stat"><strong>{mine?.posts.length ?? 0}</strong><span>Live posts</span></div>
        {at ? (
          <>
            <div className="stat"><strong>{at.people_supported}</strong><span>People supported</span></div>
            <div className="stat"><strong>{at.responses_received}</strong><span>Responses received</span></div>
          </>
        ) : null}
      </div>

      <h2 className="sec">Your posts</h2>
      {mine === null ? <p className="muted">Loading…</p> : mine.posts.length === 0 ? <p className="muted small">No live posts.</p> : mine.posts.map((p) => (
        <div key={p.id} className="tx" style={{ alignItems: "center" }}>
          <Link href={`/drop/${p.id}`} className="grow"><b>{teaser(p.content, 80)}</b><small className="muted">{compact(p.views_count)} views · {p.likes_count} likes · {p.time_ago}</small></Link>
          <button className="pill ghost" onClick={() => edit(p)}>Edit</button>
          <button className="pill ghost" onClick={() => del(p.id)}>Delete</button>
        </div>
      ))}

      <h2 className="sec">Withdrawals</h2>
      {wds.length === 0 ? <p className="muted small">None yet. Payouts are reviewed manually.</p> : wds.map((w) => (
        <div key={w.id} className="tx">
          <span>{w.amount_coins} coins · KES {w.estimated_kes}<br /><small className="muted">{w.mpesa_number}</small></span>
          <span className={`badge ${w.status}`}>{w.status}</span>
        </div>
      ))}

      <h2 className="sec">Transactions</h2>
      {txs.length === 0 ? <p className="muted small">Nothing yet.</p> : txs.slice(0, 40).map((t) => (
        <div key={t.id} className="tx">
          <span>{t.description || t.reason || "Transaction"}</span>
          <b className={t.amount >= 0 ? "plus" : "minus"}>{t.amount >= 0 ? "+" : ""}{t.amount}</b>
        </div>
      ))}

      {open ? (
        <Sheet title="Withdraw to M-Pesa" onClose={() => setOpen(false)}>
          <form onSubmit={withdraw} className="form">
            <p className="muted small">Minimum {MIN_WITHDRAW} coins. Rate: KES {bal?.payout_rate_kes_per_coin ?? "—"} per coin. Paid manually after review.</p>
            <label className="field">Coins
              <input inputMode="numeric" required placeholder={String(MIN_WITHDRAW)} value={coins} onChange={(e) => setCoins(e.target.value)} />
            </label>
            <label className="field">M-Pesa number
              <input inputMode="tel" required placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            {err ? <div className="err">{err}</div> : null}
            <button className="btn" disabled={busy}>{busy ? "Sending…" : "Request withdrawal"}</button>
          </form>
        </Sheet>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  return <AppShell title="Dashboard" back="/settings"><Inner /></AppShell>;
}
