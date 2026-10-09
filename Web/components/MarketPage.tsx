"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, compact } from "@/lib/api";
import AppShell from "./AppShell";
import "@/app/money.css";

export type MarketItem = {
  id: string; title: string; teaser?: string; category?: string; media_url?: string | null;
  views: number; unlocks: number; price_coins: number; is_unlocked: boolean;
};
const LIMIT = 20;

function Inner() {
  const [items, setItems] = useState<MarketItem[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (offset: number) => {
    setBusy(true);
    try {
      const r = await api<{ items: MarketItem[] }>(`/market/items?limit=${LIMIT}&offset=${offset}`);
      setItems((prev) => (offset === 0 ? r.items : [...(prev || []), ...r.items]));
      setMore(r.items.length === LIMIT);
    } catch (e) { setError((e as Error).message); setItems((p) => p || []); }
    setBusy(false);
  }, []);
  useEffect(() => { load(0); }, [load]);

  if (items === null) return <p className="muted center">Loading…</p>;
  if (error && !items.length) return <div className="err pad">{error}</div>;
  if (!items.length) return <div className="empty"><h2>Nothing here yet</h2><p>New listings show up here.</p></div>;
  return (
    <div>
      {items.map((it) => (
        <Link key={it.id} href={`/market/${it.id}`} className="mrow">
          {it.media_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.media_url} alt="" loading="lazy" />
          ) : null}
          {it.category ? <span className="badge">{it.category}</span> : null}
          <h3>{it.title}</h3>
          {it.teaser ? <p>{it.teaser}</p> : null}
          <div className="meta">
            <span>{compact(it.views)} views · {compact(it.unlocks)} unlocks</span>
            <b>{it.is_unlocked ? "Unlocked" : `${it.price_coins} coins`}</b>
          </div>
        </Link>
      ))}
      {more ? <div className="pad"><button className="btn ghost" style={{ width: "100%" }} disabled={busy} onClick={() => load(items.length)}>{busy ? "Loading…" : "Load more"}</button></div> : null}
    </div>
  );
}

export default function MarketPage() {
  return <AppShell title="Market" back="/settings"><Inner /></AppShell>;
}
