"use client";
/** Rooms → Live: your open session, sessions you can join in Rooms you're inside, and your
 * ringing / ongoing 1-to-1 calls. "Start a session" opens one in your own Room (voice or video,
 * everyone inside or the people you tick). Same as the app's LivePanel. */
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import { callsApi, callInfo, type Live, type LiveCall, type Person } from "@/lib/calls";
import CallRoom, { type CallInfo } from "../CallRoom";
import Sheet from "../Sheet";

type Conn = { other_user_id: string; other_anonymous_name: string; other_avatar_url: string | null; is_sender: boolean };

function Ava({ p }: { p?: Person | null }) {
  return <span className="lv-ava">{p?.avatar_url ? <Image src={p.avatar_url} alt="" width={44} height={44} /> : (p?.name || "A")[0].toUpperCase()}</span>;
}

export default function LivePanel() {
  const [data, setData] = useState<Live | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [call, setCall] = useState<CallInfo | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try { setData(await callsApi.live()); } catch { setData((d) => d || { hosting: null, sessions: [], direct: [] }); }
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(load, 15000);
    return () => window.clearInterval(t);
  }, [load]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(""); void load(); }
  }
  const join = (c: LiveCall) => run(c.id, async () => setCall(callInfo(await callsApi.join(c.id), { isHost: false, other: c.host })));
  const leave = (c: LiveCall) => run(c.id, () => callsApi.leave(c.id));
  // A call ringing for me is declined (the caller hears why); anything else is ended.
  const end = (c: LiveCall) => run(c.id, () => (c.kind === "direct" && c.incoming && c.status === "ringing" ? callsApi.decline(c.id) : callsApi.end(c.id)));

  if (call) return <CallRoom info={call} onClose={() => { setCall(null); void load(); }} />;
  if (!data) return <p className="muted center">Loading…</p>;
  const { hosting, sessions, direct } = data;
  const nothing = !hosting && !sessions.length && !direct.length;

  return (
    <div className="lv-panel">
      {error ? <div className="err">{error}</div> : null}
      {direct.map((c) => (
        <div className="lv-card live" key={c.id}>
          <Ava p={c.other} />
          <span className="lv-t"><b>{c.other?.name || "Anonymous"}</b><small>{c.video ? "Video" : "Voice"} call · {c.status === "ringing" ? (c.incoming ? "calling you" : "ringing") : "on now"}</small></span>
          <button className="lv-ghost" disabled={busy === c.id} onClick={() => end(c)}>{c.status === "ringing" && c.incoming ? "Decline" : "End"}</button>
        </div>
      ))}

      {hosting ? (
        <div className="lv-card live">
          <span className="lv-ava icon" aria-hidden>●</span>
          <span className="lv-t"><b>Your session is open</b><small>{hosting.video ? "Video" : "Voice"} · {hosting.guest_count}/{hosting.max_guests} in{hosting.invite_only ? " · invite only" : ""}</small></span>
          <button className="lv-ghost danger" disabled={busy === hosting.id} onClick={() => end(hosting)}>End</button>
        </div>
      ) : (
        <button className="lv-start" onClick={() => setStarting(true)}>
          <span className="lv-ava icon" aria-hidden>+</span>
          <span className="lv-t"><b>Start a session</b><small>A voice or video room for people you&apos;ve let in. Invite everyone or pick a few.</small></span>
        </button>
      )}

      {sessions.length ? <p className="lv-label">Live in Rooms you&apos;re inside</p> : null}
      {sessions.map((c) => (
        <div className="lv-card" key={c.id}>
          <Ava p={c.host} />
          <span className="lv-t"><b>{c.host?.name || "Anonymous"}&apos;s session</b><small>{c.video ? "Video" : "Voice"} · {c.guest_count}/{c.max_guests} in{c.invite_only ? " · you were invited" : ""}</small></span>
          {c.joined ? (
            <button className="lv-ghost" disabled={busy === c.id} onClick={() => leave(c)}>Leave</button>
          ) : (
            <button className="lv-join" disabled={busy === c.id || c.guest_count >= c.max_guests} onClick={() => join(c)}>{busy === c.id ? "…" : c.guest_count >= c.max_guests ? "Full" : "Join"}</button>
          )}
        </div>
      ))}

      {nothing ? (
        <div className="rx-empty">
          <span className="rx-empty-ico" aria-hidden>◉</span>
          <b>Nothing live right now</b>
          <p>When someone you&apos;re inside with opens a session, it shows here. Calls between two of you start from the chat.</p>
        </div>
      ) : null}

      {starting ? <StartSession onClose={() => setStarting(false)} onStarted={(c) => { setStarting(false); setCall(c); }} /> : null}
    </div>
  );
}

function StartSession({ onClose, onStarted }: { onClose: () => void; onStarted: (c: CallInfo) => void }) {
  const [video, setVideo] = useState(true);
  const [everyone, setEveryone] = useState(true);
  const [people, setPeople] = useState<Conn[] | null>(null);
  const [room, setRoom] = useState<{ call_mode?: string; max_guests?: number } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<{ connections: Conn[] }>("/drops/connections"), api<{ call_mode?: string; max_guests?: number }>("/chat-profile/me")])
      .then(([c, me]) => {
        const seen = new Set<string>();
        setPeople(c.connections.filter((x) => x.is_sender && !seen.has(x.other_user_id) && seen.add(x.other_user_id)));
        setRoom(me);
      })
      .catch(() => setPeople([]));
  }, []);

  const solo = room?.call_mode !== "multi";
  async function start() {
    if (!everyone && !picked.length) { setError("Pick at least one person, or invite everyone."); return; }
    setBusy(true);
    setError("");
    try {
      onStarted(callInfo(await callsApi.startSession(everyone ? null : picked, video), { isHost: true }));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Sheet title="Start a session" onClose={onClose}>
      {people === null ? <p className="muted center">Loading…</p> : people.length === 0 ? (
        <p className="u-sub">Nobody&apos;s inside your Room yet. Let someone in first, then you can call them here.</p>
      ) : (
        <div className="lv-sheet">
          <div className="u-segs">
            {([[true, "Video"], [false, "Voice"]] as const).map(([v, l]) => (
              <button key={l} type="button" className={`u-seg${video === v ? " on" : ""}`} onClick={() => setVideo(v)}>{l}</button>
            ))}
          </div>
          <div className="rs-toggle">
            <span><b>Invite everyone inside</b><small>Off: only the people you tick can join.</small></span>
            <button type="button" role="switch" aria-checked={everyone} aria-label="Invite everyone inside" className={`rs-switch${everyone ? " on" : ""}`} onClick={() => setEveryone(!everyone)} />
          </div>
          {!everyone ? people.map((x) => {
            const on = picked.includes(x.other_user_id);
            return (
              <label className="lv-pick" key={x.other_user_id}>
                <input type="checkbox" checked={on} onChange={() => setPicked((p) => (on ? p.filter((y) => y !== x.other_user_id) : [...p, x.other_user_id]))} />
                <Ava p={{ name: x.other_anonymous_name, avatar_url: x.other_avatar_url }} />
                <b>{x.other_anonymous_name}</b>
              </label>
            );
          }) : null}
          <p className="rs-info">
            {solo
              ? "Your Room takes one guest at a time. Switch to a group room in Calls: 4 guests are free."
              : `Your Room holds ${room?.max_guests || 4} guests at once (4 are free). Extra seats are 25 coins each, bought in Calls. Starting a session costs nothing.`}
            {" "}<Link href="/chat-setup?tab=calls">Room size and call settings</Link>
          </p>
          {error ? <div className="err">{error}</div> : null}
          <button className="u-cta" onClick={start} disabled={busy}>{busy ? "Opening…" : "Open the session"}</button>
        </div>
      )}
    </Sheet>
  );
}
