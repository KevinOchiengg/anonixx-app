"use client";
/** Shared messenger pieces for Rooms on the web: avatar, a chat row with its ⌄ menu, the chat
 * picker (New chat / New call / Forward), and the Calls log. Same behaviour as the app. */
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { callsApi, callInfo } from "@/lib/calls";
import { chatsApi, chatTime, callTime, duration, avatarColor, MUTE_OPTIONS, MAX_FORWARD, type Chat, type CallLog } from "@/lib/chats";
import CallRoom, { type CallInfo } from "../CallRoom";
import Sheet from "../Sheet";

const Svg = ({ d, size = 20 }: { d: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);
export const Icon = {
  phone: (s?: number) => <Svg size={s} d={<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />} />,
  video: (s?: number) => <Svg size={s} d={<><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M16 10l6-3v10l-6-3" /></>} />,
  pin: (s?: number) => <Svg size={s} d={<><path d="M12 17v5" /><path d="M9 10.8V5h6v5.8l2 2.2v2H7v-2z" /></>} />,
  mute: (s?: number) => <Svg size={s} d={<><path d="M13.7 21a2 2 0 0 1-3.4 0" /><path d="M18.6 13A17.9 17.9 0 0 1 18 8" /><path d="M6.3 6.3A5.9 5.9 0 0 0 6 8c0 7-3 9-3 9h14" /><path d="M18 8a6 6 0 0 0-9.3-5" /><path d="m2 2 20 20" /></>} />,
  archive: (s?: number) => <Svg size={s} d={<><rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" /></>} />,
  star: (s?: number) => <Svg size={s} d={<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />} />,
  chat: (s?: number) => <Svg size={s} d={<><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" /><path d="M12 9v6M9 12h6" /></>} />,
  door: (s?: number) => <Svg size={s} d={<><path d="M13 4h3a2 2 0 0 1 2 2v14M2 20h20M13 20V4.6a1 1 0 0 0-1.2-1L5 5v15" /><path d="M10 12v.01" /></>} />,
  link: (s?: number) => <Svg size={s} d={<><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>} />,
  chevron: (s?: number) => <Svg size={s} d={<path d="m6 9 6 6 6-6" />} />,
  back: (s?: number) => <Svg size={s} d={<path d="M19 12H5M11 6l-6 6 6 6" />} />,
  search: (s?: number) => <Svg size={s} d={<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>} />,
  close: (s?: number) => <Svg size={s} d={<path d="M18 6 6 18M6 6l12 12" />} />,
  dots: (s?: number) => <Svg size={s} d={<><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></>} />,
  send: (s?: number) => <Svg size={s} d={<><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>} />,
  radio: (s?: number) => <Svg size={s} d={<><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2" /></>} />,
  compass: (s?: number) => <Svg size={s} d={<><circle cx="12" cy="12" r="10" /><path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3z" /></>} />,
};

export function Ava({ name, url, seed, size = 50, online }: { name?: string; url?: string | null; seed?: string; size?: number; online?: boolean }) {
  return (
    <span className="mx-ava" style={{ width: size, height: size }}>
      <span style={url ? undefined : { background: avatarColor(seed || name), fontSize: size * 0.4 }}>
        {url ? <Image src={url} alt="" width={size} height={size} /> : (name || "A")[0].toUpperCase()}
      </span>
      {online ? <em /> : null}
    </span>
  );
}

export function ChatRow({ c, href, onPrefs, onOpen }: { c: Chat; href?: string; onPrefs: (c: Chat, body: { pinned?: boolean; archived?: boolean; mute?: string }) => void; onOpen?: () => void }) {
  const [menu, setMenu] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const unread = c.unread_count > 0;
  const muted = !!c.muted_until;
  const text = c.last_message || (c.confession ? `“${c.confession}”` : "Say hello");
  const inner = (
    <>
      <Ava name={c.other_anonymous_name} url={c.other_avatar_url} seed={c.other_user_id} online={c.other_is_online} />
      <span className="mx-body">
        <span className="mx-top">
          <b>{c.other_anonymous_name}</b>
          <em className={c.is_sender ? "g" : ""}>{c.is_sender ? "guest" : "their Room"}</em>
          <time className={unread && !muted ? "hot" : ""}>{chatTime(c.last_message_at)}</time>
        </span>
        <span className="mx-bot">
          <span className={`mx-prev${unread ? " un" : ""}${c.last_message_deleted ? " del" : ""}`}>
            {c.last_message_is_own && !c.last_message_deleted ? <span className={`mx-tick${c.last_message_seen ? " seen" : ""}`}>{c.last_message_seen ? "✓✓" : "✓"}</span> : null}
            {c.last_message_deleted ? "⊘ " : null}
            {text}
          </span>
          {muted ? <span className="mx-ic" title="Muted">{Icon.mute(15)}</span> : null}
          {c.pinned ? <span className="mx-ic pin" title="Pinned">{Icon.pin(15)}</span> : null}
          {unread ? <span className={`mx-badge${muted ? " m" : ""}`}>{c.unread_count > 99 ? "99+" : c.unread_count}</span> : null}
        </span>
      </span>
    </>
  );
  return (
    <li className="mx-li" onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}>
      {href ? <Link href={href} className={`mx-row${unread ? " unread" : ""}`}>{inner}</Link>
        : <button type="button" className={`mx-row${unread ? " unread" : ""}`} onClick={onOpen}>{inner}</button>}
      <button type="button" className="mx-more" aria-label={`Options for ${c.other_anonymous_name}`} aria-expanded={menu} onClick={() => setMenu((v) => !v)}>{Icon.chevron(18)}</button>
      {menu ? (
        <>
          <div className="mx-scrim" onClick={() => { setMenu(false); setMuteOpen(false); }} />
          <div className="mx-menu" role="menu">
            {!muteOpen ? (
              <>
                {!c.archived ? <button role="menuitem" onClick={() => { setMenu(false); onPrefs(c, { pinned: !c.pinned }); }}>{c.pinned ? "Unpin chat" : "Pin chat"}</button> : null}
                {muted ? <button role="menuitem" onClick={() => { setMenu(false); onPrefs(c, { mute: "off" }); }}>Unmute notifications</button>
                  : <button role="menuitem" onClick={() => setMuteOpen(true)}>Mute notifications…</button>}
                <button role="menuitem" onClick={() => { setMenu(false); onPrefs(c, { archived: !c.archived }); }}>{c.archived ? "Unarchive chat" : "Archive chat"}</button>
              </>
            ) : (
              <>
                <small>Mute for</small>
                {MUTE_OPTIONS.map(([v, l]) => <button key={v} role="menuitem" onClick={() => { setMenu(false); setMuteOpen(false); onPrefs(c, { mute: v }); }}>{l}</button>)}
              </>
            )}
          </div>
        </>
      ) : null}
    </li>
  );
}

/** New chat (open), New call (voice/video buttons) or Forward (tick up to 5). */
export function PickChats({ mode, title, exclude, onClose, onOpen, onCall, onForward, extras }: {
  mode: "open" | "call" | "forward"; title: string; exclude?: string; onClose: () => void;
  onOpen?: (c: Chat) => void; onCall?: (c: Chat, video: boolean) => void; onForward?: (ids: string[]) => Promise<void>;
  extras?: { label: string; hint: string; icon: React.ReactNode; href?: string; onClick?: () => void }[];
}) {
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { chatsApi.list().then((r) => setChats(r.connections)).catch(() => setChats([])); }, []);
  const list = useMemo(() => (chats || [])
    .filter((c) => c.id !== exclude && (!q.trim() || c.other_anonymous_name.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => a.other_anonymous_name.localeCompare(b.other_anonymous_name)), [chats, q, exclude]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_FORWARD ? p : [...p, id]));

  return (
    <Sheet title={title} onClose={onClose} tall>
      <label className="mx-search">{Icon.search(16)}<input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name" /></label>
      {mode === "forward" ? <p className="mx-note">{picked.length ? `${picked.length} of ${MAX_FORWARD} selected` : `Pick up to ${MAX_FORWARD} chats`}</p> : null}
      <ul className="mx-pick">
        {!q && extras?.map((x) => (
          <li key={x.label}>
            {x.href ? (
              <Link href={x.href} className="mx-row"><span className="mx-ava mx-ava-ic"><span>{x.icon}</span></span><span className="mx-body"><b>{x.label}</b><small>{x.hint}</small></span></Link>
            ) : (
              <button type="button" className="mx-row" onClick={x.onClick}><span className="mx-ava mx-ava-ic"><span>{x.icon}</span></span><span className="mx-body"><b>{x.label}</b><small>{x.hint}</small></span></button>
            )}
          </li>
        ))}
        {chats === null ? <li className="muted center">Loading…</li> : list.length === 0 ? <li className="mx-note">{q ? `No chats match “${q}”.` : "No chats yet. Let someone in, or knock on a Room you like."}</li> : list.map((c) => {
          const on = picked.includes(c.id);
          return (
            <li key={c.id}>
              <div className={`mx-row${on ? " sel" : ""}`} role={mode === "call" ? undefined : "button"} tabIndex={mode === "call" ? undefined : 0}
                onClick={() => (mode === "forward" ? toggle(c.id) : mode === "open" ? onOpen?.(c) : undefined)}
                onKeyDown={(e) => { if (e.key === "Enter") { if (mode === "forward") toggle(c.id); else if (mode === "open") onOpen?.(c); } }}>
                <Ava name={c.other_anonymous_name} url={c.other_avatar_url} seed={c.other_user_id} size={44} />
                <span className="mx-body"><b>{c.other_anonymous_name}</b><small>{c.is_sender ? "Your guest" : "You’re inside their Room"}</small></span>
                {mode === "forward" ? <span className={`mx-check${on ? " on" : ""}`} aria-hidden>{on ? "✓" : ""}</span> : null}
                {mode === "call" ? (
                  <span className="mx-callbtns">
                    <button type="button" onClick={() => onCall?.(c, false)} aria-label={`Voice call ${c.other_anonymous_name}`}>{Icon.phone(20)}</button>
                    <button type="button" onClick={() => onCall?.(c, true)} aria-label={`Video call ${c.other_anonymous_name}`}>{Icon.video(22)}</button>
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {mode === "forward" ? (
        <button className="u-cta" disabled={!picked.length || busy} onClick={async () => { setBusy(true); try { await onForward?.(picked); } finally { setBusy(false); } }}>
          {busy ? "Forwarding…" : `Forward${picked.length ? ` to ${picked.length}` : ""}`}
        </button>
      ) : null}
    </Sheet>
  );
}

function statusLine(c: CallLog) {
  if (c.kind === "group") return c.direction === "hosted" ? `Your session${c.guest_count ? ` · ${c.guest_count} joined` : ""}` : "Session in their Room";
  if (c.missed) return "Missed";
  if (c.status === "declined") return c.direction === "outgoing" ? "Declined" : "You declined";
  if (c.status === "cancelled" || c.status === "missed") return c.direction === "outgoing" ? "No answer" : "Missed";
  if (c.status === "ringing") return "Ringing…";
  if (c.status === "active") return "On now";
  return c.direction === "outgoing" ? "Outgoing" : "Incoming";
}

/** Rooms → Calls: start a session, calls on now, then the log with call-back. */
export function CallsPanel({ onStartSession, refreshKey }: { onStartSession: () => void; refreshKey: number }) {
  const [calls, setCalls] = useState<CallLog[] | null>(null);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [live, setLive] = useState<Awaited<ReturnType<typeof callsApi.live>> | null>(null);
  const [call, setCall] = useState<CallInfo | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [h, l, c] = await Promise.all([chatsApi.callHistory(), callsApi.live().catch(() => null), chatsApi.list().catch(() => null)]);
      setCalls(h.calls);
      if (l) setLive(l);
      if (c) setMine(new Set(c.connections.map((x) => x.id)));
      try { localStorage.setItem("rooms_calls_seen_at", new Date().toISOString()); } catch { /* private mode */ }
    } catch { setCalls((x) => x || []); }
  }, []);
  useEffect(() => { void load(); const t = window.setInterval(load, 20000); return () => window.clearInterval(t); }, [load, refreshKey]);

  async function back(c: CallLog) {
    if (!c.connection_id || busy) return;
    setBusy(c.id); setError("");
    try { setCall(callInfo(await callsApi.direct(c.connection_id, c.video), { other: c.other || undefined })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }
  async function end(id: string, decline: boolean) {
    setBusy(id);
    try { await (decline ? callsApi.decline(id) : callsApi.end(id)); } catch (e) { setError((e as Error).message); } finally { setBusy(""); void load(); }
  }

  return (
    <div>
      {error ? <div className="err pad">{error}</div> : null}
      {live?.hosting ? (
        <div className="mx-row static">
          <span className="mx-ava mx-ava-ic live"><span>{Icon.radio(20)}</span></span>
          <span className="mx-body"><b>Your session is open</b><small>{live.hosting.video ? "Video" : "Voice"} · {live.hosting.guest_count}/{live.hosting.max_guests} in</small></span>
          <button className="mx-end" onClick={() => end(live.hosting!.id, false)} disabled={busy === live.hosting.id}>End</button>
        </div>
      ) : (
        <button type="button" className="mx-row" onClick={onStartSession}>
          <span className="mx-ava mx-ava-ic"><span>{Icon.link(20)}</span></span>
          <span className="mx-body"><b>Start a session</b><small>A voice or video room for people you&apos;ve let in</small></span>
        </button>
      )}
      {(live?.direct || []).map((c) => (
        <div key={c.id} className="mx-row static">
          <Ava name={c.other?.name} url={c.other?.avatar_url} seed={c.other?.user_id} />
          <span className="mx-body"><b>{c.other?.name || "Anonymous"}</b><small className="hot">{c.video ? "Video" : "Voice"} · {c.status === "ringing" ? (c.incoming ? "calling you" : "ringing") : "on now"}</small></span>
          <button className="mx-end" onClick={() => end(c.id, !!(c.incoming && c.status === "ringing"))} disabled={busy === c.id}>{c.incoming && c.status === "ringing" ? "Decline" : "End"}</button>
        </div>
      ))}
      {calls === null ? <p className="muted center">Loading…</p> : calls.length === 0 ? (
        <div className="rx-empty"><b>No calls yet</b><p>Call anyone you&apos;re connected with. 1-to-1 calls are free, and ending one never ends the chat.</p></div>
      ) : (
        <>
          <h3 className="mx-h">Recent</h3>
          <ul className="mx-list">
            {calls.map((c) => {
              const name = c.kind === "group" && c.direction === "hosted" ? "Your Room" : c.other?.name || "Anonymous";
              const canBack = c.kind === "direct" && c.connection_id && mine.has(c.connection_id);
              const arrow = c.kind === "group" ? "👥" : c.missed ? "↙" : c.direction === "outgoing" ? "↗" : "↙";
              return (
                <li key={c.id} className="mx-li">
                  {c.connection_id && mine.has(c.connection_id) ? (
                    <Link href={`/chat/${c.connection_id}`} className="mx-row">
                      <Ava name={name} url={c.direction === "hosted" ? null : c.other?.avatar_url} seed={c.other?.user_id || "me"} />
                      <span className="mx-body"><b className={c.missed ? "miss" : ""}>{name}</b><small><i className={`mx-dir${c.missed ? " miss" : c.status === "ended" ? " ok" : ""}`}>{arrow}</i> {statusLine(c)} · {callTime(c.started_at)}{duration(c.duration_seconds) ? ` · ${duration(c.duration_seconds)}` : ""}</small></span>
                    </Link>
                  ) : (
                    <div className="mx-row static">
                      <Ava name={name} url={c.direction === "hosted" ? null : c.other?.avatar_url} seed={c.other?.user_id || "me"} />
                      <span className="mx-body"><b className={c.missed ? "miss" : ""}>{name}</b><small><i className={`mx-dir${c.missed ? " miss" : ""}`}>{arrow}</i> {statusLine(c)} · {callTime(c.started_at)}{duration(c.duration_seconds) ? ` · ${duration(c.duration_seconds)}` : ""}</small></span>
                    </div>
                  )}
                  {canBack ? (
                    <button type="button" className="mx-callback" onClick={() => back(c)} disabled={!!busy} aria-label={`Call ${name} back`}>{busy === c.id ? "…" : c.video ? Icon.video(22) : Icon.phone(20)}</button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {call ? <CallRoom info={call} onClose={() => { setCall(null); void load(); }} /> : null}
    </div>
  );
}
