"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, teaser } from "@/lib/api";
import AppShell from "./AppShell";

type Saved = { id: string; confession: string | null; mood_tag: string | null; saved_days_ago: number };

function Inner() {
  const [items, setItems] = useState<Saved[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ saved_drops: Saved[] }>("/drops/saved")
      .then((r) => setItems(r.saved_drops))
      .catch((e) => { setError((e as Error).message); setItems([]); });
  }, []);

  if (items === null) return <p className="muted center">Loading…</p>;
  if (error) return <div className="err pad">{error}</div>;
  if (items.length === 0) {
    return <div className="empty"><h2>Nothing saved</h2><p>Tap the bookmark on any post to keep it here.</p></div>;
  }
  return (
    <ul className="rows">
      {items.map((s) => (
        <li key={s.id}>
          <Link href={`/drop/${s.id}`} className="row-item">
            <span className="grow">
              <b>{teaser(s.confession || "A post with media", 90)}</b>
              <small>{s.mood_tag ? `${s.mood_tag} · ` : ""}{s.saved_days_ago === 0 ? "saved today" : `saved ${s.saved_days_ago}d ago`}</small>
            </span>
            ›
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function SavedPage() {
  return (
    <AppShell title="Saved" back="/settings">
      <Inner />
    </AppShell>
  );
}
