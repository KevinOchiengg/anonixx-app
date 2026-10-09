"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Stats = {
  users: { total: number; active_last_30d: number; banned: number; verified: number; premium: number; admins: number };
  content: { total_drops: number; drops_today: number };
  support: { open_conversations: number; pending_refunds: number };
};
type Revenue = { total_usd: number; by_method: Record<string, { total_usd: number; count: number }> };

const LINKS = [
  { href: "/admin/users", title: "Users", desc: "Search, ban, verify, grant admin, adjust coins" },
  { href: "/admin/posts", title: "Posts", desc: "Browse, search and delete any post" },
  { href: "/admin/moderation", title: "Moderation queue", desc: "Flagged and hidden drops awaiting review" },
  { href: "/admin/refunds", title: "Refund requests", desc: "Accept or reject coin refunds" },
  { href: "/admin/support", title: "Customer support", desc: "Chat with users who wrote in" },
  { href: "/admin/ads", title: "Feed ads", desc: "Sponsored submissions awaiting review" },
  { href: "/admin/deception-reports", title: "Deception reports", desc: "Fake confession claims — refund + strike on confirm" },
];

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rev, setRev] = useState<Revenue | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const [s, r] = await Promise.all([api<Stats>("/admin/stats"), api<Revenue>("/admin/revenue")]);
        if (live) { setStats(s); setRev(r); setError(""); }
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    };
    load();
    const t = window.setInterval(load, 10000);
    return () => { live = false; window.clearInterval(t); };
  }, []);

  const cards: [string, number | undefined, string?][] = [
    ["Total users", stats?.users.total, stats ? `${stats.users.active_last_30d} active (30d)` : undefined],
    ["Premium", stats?.users.premium],
    ["Admins", stats?.users.admins],
    ["Banned", stats?.users.banned],
    ["Verified", stats?.users.verified],
    ["Total drops", stats?.content.total_drops, stats ? `${stats.content.drops_today} today` : undefined],
    ["Open chats", stats?.support.open_conversations],
    ["Pending refunds", stats?.support.pending_refunds],
  ];

  return (
    <>
      <h2>Overview</h2>
      {error ? <p className="err">{error}</p> : null}
      <div className="adm-card">
        <div className="adm-label">Total revenue</div>
        <div className="adm-big">${(rev?.total_usd ?? 0).toFixed(2)}</div>
        <div className="adm-chips">
          {rev && Object.entries(rev.by_method).map(([m, d]) => (
            <span key={m} className="adm-badge">{m}: ${d.total_usd.toFixed(2)} ({d.count})</span>
          ))}
        </div>
      </div>
      <div className="adm-stats">
        {cards.map(([label, value, sub]) => (
          <div key={label} className="adm-card">
            <div className="adm-label">{label}</div>
            <div className="adm-stat">{value ?? "—"}</div>
            {sub ? <div className="muted small">{sub}</div> : null}
          </div>
        ))}
      </div>
      <div className="adm-links">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="adm-card adm-link">
            <b>{l.title}</b>
            <span className="muted small">{l.desc}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
