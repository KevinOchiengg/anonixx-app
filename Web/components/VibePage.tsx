"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import AppShell from "./AppShell";
import "@/app/money.css";

type Vibe = {
  score: number;
  admirer_count?: number;
  confession_streak?: number;
  longest_streak?: number;
  events?: Record<string, number>;
};

const TIERS = [
  { name: "Fresh", emoji: "🌱", min: 0 },
  { name: "Awakening", emoji: "✨", min: 50 },
  { name: "Rising", emoji: "🌙", min: 100 },
  { name: "Electric", emoji: "⚡", min: 200 },
  { name: "Legendary", emoji: "🔥", min: 500 },
];
const EVENTS: [string, string, string][] = [
  ["card_created", "Posts created", "+2 pts each"],
  ["card_unlocked", "Posts unlocked", "+5 pts each"],
  ["reaction_received", "Reactions received", "+1 pt each"],
  ["streak_day", "Streak days", "+2 pts each"],
];

function Inner() {
  const [data, setData] = useState<Vibe | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Vibe>("/drops/vibe-score").then(setData).catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <div className="err pad">{error}</div>;
  if (!data) return <p className="muted center">Loading…</p>;

  const idx = TIERS.reduce((a, t, i) => (data.score >= t.min ? i : a), 0);
  const tier = TIERS[idx];
  const next = TIERS[idx + 1];
  const progress = next ? Math.min(1, (data.score - tier.min) / (next.min - tier.min)) : 1;
  const events = data.events || {};
  const noEvents = EVENTS.every(([k]) => !events[k]);

  if (!data.score && noEvents) {
    return (
      <div className="empty"><h2>Unrated. For now.</h2><p>Post, get unlocked and collect reactions to build your vibe.</p>
        <div className="row"><Link href="/compose" className="pill">Create a post</Link></div></div>
    );
  }
  return (
    <div className="pad">
      <div className="vibe-hero">
        <b>{data.score}</b>
        <span>{tier.emoji} {tier.name}</span>
        {next ? (
          <>
            <div className="bar"><div style={{ width: `${progress * 100}%` }} /></div>
            <small className="muted">{next.min - data.score} pts to {next.name}</small>
          </>
        ) : null}
      </div>

      <h2 className="sec">Tier journey</h2>
      <div className="tiers">
        {TIERS.map((t) => (
          <div key={t.name} className={`tier${data.score >= t.min ? " on" : ""}`}><i>{t.emoji}</i>{t.name}<br />{t.min}+</div>
        ))}
      </div>

      <div className="stat-grid">
        <div className="stat"><strong>{data.admirer_count ?? 0}</strong><span>Admirers viewed your posts</span></div>
        <div className="stat"><strong>{data.confession_streak ?? 0}</strong><span>Day streak · best {data.longest_streak ?? 0}</span></div>
      </div>

      <h2 className="sec">How you earned it</h2>
      {EVENTS.map(([k, label, pts]) => (
        <div key={k} className="tx"><span>{label}<br /><small className="muted">{pts}</small></span><b>{events[k] || 0}×</b></div>
      ))}
    </div>
  );
}

export default function VibePage() {
  return <AppShell title="Vibe score" back="/settings"><Inner /></AppShell>;
}
