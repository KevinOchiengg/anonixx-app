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
import {
  Archive, ArrowLeft, BellOff, ChevronDown, Compass, DoorOpen, EllipsisVertical, Link2, MessageSquarePlus, Phone, Pin,
  Radio, Search, Send, Star, Video, X, Users, PhoneMissed, ArrowUpRight, ArrowDownLeft, type LucideIcon,
} from "lucide-react";

const ic = (C: LucideIcon) => (s = 20) => <C size={s} strokeWidth={2} aria-hidden />;
/** Rooms icons: Lucide at stroke 2, the same family as the app. */
export const Icon = {
  phone: ic(Phone), video: ic(Video), pin: ic(Pin), mute: ic(BellOff), archive: ic(Archive), star: ic(Star),
  chat: ic(MessageSquarePlus), door: ic(DoorOpen), link: ic(Link2), chevron: ic(ChevronDown), back: ic(ArrowLeft),
  search: ic(Search), close: ic(X), dots: ic(EllipsisVertical), send: ic(Send), radio: ic(Radio), compass: ic(Compass),
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
              const arrow = c.kind === "group" ? <Users size={14} strokeWidth={2.2} /> : c.missed ? <PhoneMissed size={14} strokeWidth={2.2} /> : c.direction === "outgoing" ? <ArrowUpRight size={15} strokeWidth={2.4} /> : <ArrowDownLeft size={15} strokeWidth={2.4} />;
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
