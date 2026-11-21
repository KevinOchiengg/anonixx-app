"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Coins, Eye, Plus, Radio, Users, Wallet } from "lucide-react";
import AppShell from "@/components/AppShell";
import AuthorAvatar from "@/components/AuthorAvatar";
import { useAuth } from "@/lib/auth";
import { livesApi, startsLabel, type LiveCard } from "@/lib/lives";
import "@/app/lives.css";

type Tab = "live" | "upcoming" | "mine";
const TABS: [Tab, string][] = [["live", "Live now"], ["upcoming", "Upcoming"], ["mine", "My lives"]];

export function LiveTile({ live }: { live: LiveCard }) {
  const on = live.status === "live";
  return (
    <Link href={`/lives/${live.id}`} className="lv-tile">
      <div className="lv-cover">
        {live.cover_url ? <Image src={live.cover_url} alt="" fill sizes="(max-width: 640px) 50vw, 240px" /> : (
          <div className="lv-cover-ph"><AuthorAvatar src={live.host.avatar_url} seed={live.host.id} name={live.host.name} gender={live.host.gender} size={72} /></div>
        )}
        <span className={`lv-badge${on ? " on" : ""}`}>
          {on ? <><Radio aria-hidden />Live</> : live.status === "ended" ? "Ended" : startsLabel(live.starts_at)}
        </span>
        {on ? <span className="lv-count"><Eye aria-hidden />{live.viewers}</span> : null}
        {live.promoted ? <span className="lv-promo">Promoted</span> : null}
      </div>
      <div className="lv-meta">
        <span className="lv-ava"><AuthorAvatar src={live.host.avatar_url} seed={live.host.id} name={live.host.name} gender={live.host.gender} size={28} /></span>
        <div className="lv-text">
          <b>{live.title}</b>
          <small>{live.host.name || "Anonymous"}</small>
        </div>
      </div>
      <div className="lv-foot">
        <span><Coins aria-hidden />{live.price}</span>
        <span><Users aria-hidden />{live.members}</span>
      </div>
    </Link>
  );
}

export default function LivesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("live");
  const [lives, setLives] = useState<LiveCard[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (tab === "mine" && !user) { setLives([]); return; }
    let alive = true;
    setLives(null);
    livesApi.browse(tab)
      .then((r) => { if (alive) { setLives(r.lives); setError(""); } })
      .catch((e) => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [tab, user]);

  const empty = tab === "live" ? "Nobody is live right now. Be the first." : tab === "upcoming" ? "No lives scheduled yet." : "You haven't hosted a live yet.";

  return (
    <AppShell
      title="Lives"
      right={user ? <Link href="/lives/earnings" className="lv-icon-btn" aria-label="Your earnings"><Wallet aria-hidden /></Link> : null}
    >
      <div className="lv-page">
        <div className="lv-tabs" role="tablist">
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        {error ? <p className="err">{error}</p> : null}
        {!lives && !error ? <div className="lv-grid">{Array.from({ length: 4 }, (_, i) => <div key={i} className="lv-tile lv-skeleton" />)}</div> : null}
        {lives && !lives.length ? <p className="lv-empty">{tab === "mine" && !user ? "Sign in to host a live." : empty}</p> : null}
        {lives?.length ? <div className="lv-grid">{lives.map((l) => <LiveTile key={l.id} live={l} />)}</div> : null}

        <Link href={user ? "/lives/new" : "/login?next=/lives/new"} className="lv-go"><Plus aria-hidden />Go live</Link>
      </div>
    </AppShell>
  );
}
