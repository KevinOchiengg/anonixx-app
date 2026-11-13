"use client";
/** Rooms → Updates. Live now: rings for sessions open in Rooms you're inside (click to join),
 * with your own "Go live" first. Then Your Room, the page visitors see first. */
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth";
import { callsApi, callInfo, type Live, type LiveCall } from "@/lib/calls";
import { avatarColor } from "@/lib/chats";
import CallRoom, { type CallInfo } from "../CallRoom";
import MyRoomPanel from "./MyRoomPanel";

function Ring({ name, url, live, label, sub, onClick, badge, busy }: {
  name?: string | null; url?: string | null; live?: boolean; label: string; sub?: string; onClick: () => void; badge?: React.ReactNode; busy?: boolean;
}) {
  return (
    <button type="button" className="mx-ring" onClick={onClick} disabled={busy} aria-label={`${label}${sub ? `, ${sub}` : ""}`}>
      <span className={`mx-ring-o${live ? " live" : ""}`}>
        <span style={url ? undefined : { background: avatarColor(name || "") }}>
          {url ? <Image src={url} alt="" width={64} height={64} /> : (name || "A")[0].toUpperCase()}
        </span>
        {badge}
      </span>
      <b>{busy ? "…" : label}</b>
      {sub ? <small>{sub}</small> : null}
    </button>
  );
}

export default function UpdatesPanel({ onGoLive, onLive }: { onGoLive: () => void; onLive?: (n: number) => void }) {
  const { user } = useAuth();
  const [live, setLive] = useState<Live | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [call, setCall] = useState<CallInfo | null>(null);

  const load = useCallback(async () => {
    try {
      const l = await callsApi.live();
      setLive(l);
      onLive?.(l.sessions.filter((c) => !c.joined).length);
    } catch { setLive((x) => x || { hosting: null, sessions: [], direct: [] }); }
  }, [onLive]);
  useEffect(() => { void load(); const t = window.setInterval(load, 15000); return () => window.clearInterval(t); }, [load]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError("");
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(""); void load(); }
  }
  const join = (c: LiveCall) => run(c.id, async () => setCall(callInfo(await callsApi.join(c.id), { isHost: false, other: c.host })));
  const hosting = live?.hosting;
  const sessions = live?.sessions || [];

  return (
    <div className="mx-updates">
      <h3 className="mx-h">Live now</h3>
      {error ? <div className="err pad">{error}</div> : null}
      <div className="mx-rings">
        <Ring
          name={user?.anonymous_name} url={user?.avatar_url} live={!!hosting}
          label={hosting ? "You’re live" : "Go live"} sub={hosting ? `${hosting.guest_count}/${hosting.max_guests} in · end` : "Your Room"}
          busy={busy === "host"}
          onClick={() => (hosting ? run("host", () => callsApi.end(hosting.id)) : onGoLive())}
          badge={<i className={`mx-ring-b${hosting ? " live" : ""}`} aria-hidden>{hosting ? "●" : "+"}</i>}
        />
        {sessions.map((c) => {
          const full = c.guest_count >= c.max_guests;
          return (
            <Ring
              key={c.id} name={c.host?.name} url={c.host?.avatar_url} live label={c.host?.name || "Anonymous"} busy={busy === c.id}
              sub={c.joined ? "You’re in · leave" : full ? "Full" : `${c.video ? "Video" : "Voice"} · ${c.guest_count}/${c.max_guests}`}
              onClick={() => (c.joined ? run(c.id, () => callsApi.leave(c.id)) : full ? setError("That session is full right now.") : join(c))}
            />
          );
        })}
      </div>
      {live && !sessions.length ? <p className="mx-note">Rooms you&apos;re inside show up here when they go live.</p> : null}
      <h3 className="mx-h">Your Room</h3>
      <p className="mx-note">What they see when they peek, and once they’re in.</p>
      <MyRoomPanel />
      {call ? <CallRoom info={call} onClose={() => { setCall(null); void load(); }} /> : null}
    </div>
  );
}
