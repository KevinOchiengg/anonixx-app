"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import AppShell from "./AppShell";
import { Bookmark } from "./icons";

type Saved = { id: string; confession: string | null; mood_tag: string | null; saved_days_ago: number; saved_at?: string };

function ago(s: Saved) {
  if (s.saved_at) {
    const secs = Math.max(0, (Date.now() - new Date(s.saved_at).getTime()) / 1000);
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
    return `${Math.floor(secs / 604800)}w ago`;
  }
  if (s.saved_days_ago === 0) return "today";
  if (s.saved_days_ago === 1) return "yesterday";
  return `${s.saved_days_ago}d ago`;
}

function Inner() {
  const [items, setItems] = useState<Saved[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ saved_drops: Saved[] }>("/drops/saved")
      .then((r) => setItems(r.saved_drops))
      .catch((e) => { setError((e as Error).message); setItems([]); });
  }, []);

  if (items === null) return <p className="sv-loading">retrieving what you held onto…</p>;
  if (error) return <div className="err pad">{error}</div>;
  if (items.length === 0) {
    return (
      <div className="sv-empty">
        <span className="sv-icon"><Bookmark /></span>
        <b>nothing saved yet</b>
        <p>some words deserve a second read.<br />bookmark any thought to find it here.</p>
      </div>
    );
  }
  return (
    <>
      <div className="sv-count">
        <Bookmark filled />
        <span><b>{items.length}</b>&nbsp;&nbsp;{items.length === 1 ? "saved drop" : "saved drops"}</span>
      </div>
      <div className="sv-list">
        {items.map((s) => (
          <Link key={s.id} href={`/drop/${s.id}`} className="sv-card">
            <div className="sv-card-top">
              <span className="sv-badge"><Bookmark filled />saved</span>
              <span className="sv-time">{ago(s)}</span>
            </div>
            <div className="sv-divider" />
            <p className="sv-text">{s.confession || "A post with media"}</p>
            {(s.confession?.length || 0) > 200 ? <span className="sv-more">read more</span> : null}
          </Link>
        ))}
      </div>
    </>
  );
}

export default function SavedPage() {
  return (
    <AppShell title="Saved Drops" back="/settings">
      <div className="sv-sky"><Inner /></div>
    </AppShell>
  );
}
