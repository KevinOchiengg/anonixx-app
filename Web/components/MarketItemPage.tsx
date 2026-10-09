"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AppShell from "./AppShell";
import type { MarketItem } from "./MarketPage";
import "@/app/money.css";

type Full = MarketItem & { full_content?: string | null; video_url?: string | null };

function Inner({ id }: { id: string }) {
  const { refresh, user } = useAuth();
  const [item, setItem] = useState<Full | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needCoins, setNeedCoins] = useState(false);

  useEffect(() => {
    api<Full>(`/market/items/${encodeURIComponent(id)}`).then(setItem).catch((e) => setError((e as Error).message));
  }, [id]);

  async function unlock() {
    setBusy(true); setError(""); setNeedCoins(false);
    try {
      const r = await api<{ item: Full }>(`/market/items/${encodeURIComponent(id)}/unlock`, { method: "POST" });
      setItem(r.item);
      refresh();
    } catch (e) {
      if ((e as { status?: number }).status === 402) setNeedCoins(true);
      setError((e as Error).message);
    }
    setBusy(false);
  }

  if (!item) return error ? <div className="err pad">{error}</div> : <p className="muted center">Loading…</p>;
  return (
    <div className="pad mfull">
      {item.media_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.media_url} alt="" />
      ) : null}
      {item.category ? <span className="badge">{item.category}</span> : null}
      <h2>{item.title}</h2>
      {item.is_unlocked ? (
        <>
          {item.video_url ? <video src={item.video_url} controls playsInline /> : null}
          {item.full_content ? <p className="body">{item.full_content}</p> : null}
        </>
      ) : (
        <>
          {item.teaser ? <p className="body">{item.teaser}</p> : null}
          <div className="lock">
            <p>Unlock the full thing for <b>{item.price_coins} coins</b>.</p>
            <p className="muted small">You have {user?.coin_balance ?? 0} coins.</p>
            {error ? <div className="err">{error}</div> : null}
            {needCoins ? <Link href="/coins" className="pill">Buy coins</Link> : <button className="btn" disabled={busy} onClick={unlock}>{busy ? "Unlocking…" : `Unlock for ${item.price_coins} coins`}</button>}
          </div>
        </>
      )}
    </div>
  );
}

export default function MarketItemPage({ id }: { id: string }) {
  return <AppShell title="Market" back="/market"><Inner id={id} /></AppShell>;
}
