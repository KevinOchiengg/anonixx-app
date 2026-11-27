"use client";
// Your ads: what each one spent, its views and taps; pause, resume or stop (unused coins come back).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { askConfirm } from "@/lib/confirm";
import AppShell from "./AppShell";
import "@/app/money.css";

type MyAd = {
  id: string; title: string; status: string; active: boolean; cta: string;
  budget_coins: number; spent_coins: number; views: number; taps: number; tap_rate: number;
};

const STATUS: Record<string, string> = {
  pending_review: "In review", approved: "Running", finished: "Budget used", ended: "Stopped", rejected: "Rejected, refunded",
};

function Inner() {
  const { refresh } = useAuth();
  const [ads, setAds] = useState<MyAd[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    api<{ ads: MyAd[] }>("/ads/mine").then((r) => setAds(r.ads)).catch((e) => { setAds([]); setError((e as Error).message); });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(ad: MyAd, fn: () => Promise<unknown>) {
    setBusy(ad.id); setError("");
    try { await fn(); load(); refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }

  async function stop(ad: MyAd) {
    const left = Math.max(0, ad.budget_coins - ad.spent_coins);
    if (!(await askConfirm({ title: "Stop this ad?", message: `It leaves the feed for good. ${left} unused coins come back to you.`, confirmLabel: "Stop ad", tone: "danger", icon: "coins" }))) return;
    act(ad, () => api(`/ads/mine/${ad.id}/stop`, { method: "POST" }));
  }

  return (
    <div className="pad">
      <div className="row"><Link href="/ads/new" className="btn">New ad</Link></div>
      {error ? <div className="err">{error}</div> : null}
      {ads === null ? <p className="muted">Loading…</p> : ads.length === 0 ? (
        <div className="empty"><h2>No ads yet</h2><p>Promote a drop or your Room. You pay per view, and every coin you don&apos;t use comes back.</p></div>
      ) : (
        <ul className="ad-list">
          {ads.map((ad) => {
            const live = ad.status === "approved" || ad.status === "pending_review";
            const pct = ad.budget_coins ? Math.min(100, Math.round((ad.spent_coins / ad.budget_coins) * 100)) : 0;
            return (
              <li key={ad.id} className="ad-item">
                <div className="ad-item-top">
                  <b>{ad.title.split("\n")[0].slice(0, 70)}</b>
                  <span className={`ad-status s-${ad.status}${live && !ad.active ? " paused" : ""}`}>{live && !ad.active ? "Paused" : STATUS[ad.status] || ad.status}</span>
                </div>
                <div className="ad-meter" aria-label={`${pct}% of budget spent`}><i style={{ width: `${pct}%` }} /></div>
                <p className="small muted">{ad.spent_coins} of {ad.budget_coins} coins · {ad.views.toLocaleString()} views · {ad.taps} taps · {ad.tap_rate}% tap rate</p>
                {live ? (
                  <div className="row">
                    <button type="button" className="pill" disabled={busy === ad.id} onClick={() => act(ad, () => api(`/ads/mine/${ad.id}`, { method: "PATCH", body: { active: !ad.active } }))}>{ad.active ? "Pause" : "Resume"}</button>
                    <button type="button" className="pill" disabled={busy === ad.id} onClick={() => stop(ad)}>Stop and refund</button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function MyAdsPage() {
  return <AppShell title="My ads" back="/settings"><Inner /></AppShell>;
}
