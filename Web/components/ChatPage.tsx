"use client";
/** Link Up chat between two connected people: the thread and the composer. A message's
 * actions live in chat/ChatBubble, voice recording in lib/useVoiceRecorder, and everything
 * else (media, mute, pin, archive, safety) in Chat info: click the name. */
import { useCallback, useEffect, useRef, useState } from "react";
import useDraft from "@/lib/useDraft";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ChatBackground, FONTS_HREF, fontStyleById } from "@/lib/chatTheme";
import { uploadFile, type UploadKind } from "@/lib/upload";
import { connectSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";
import AppShell from "./AppShell";
import CallRoom, { type CallInfo } from "./CallRoom";
import { callsApi, callInfo } from "@/lib/calls";
import { chatsApi, mutedLabel, MUTE_OPTIONS, type Prefs } from "@/lib/chats";
import useVoiceRecorder from "@/lib/useVoiceRecorder";
import ChatInfo from "./rooms/ChatInfo";
import ChatBubble, { type Msg } from "./chat/ChatBubble";
import "../app/chat-media.css";
import { BellOff, EllipsisVertical, Mic, Paperclip, Phone, X } from "lucide-react";

type Conn = {
  other_anonymous_name: string; other_user_id?: string; other_is_online: boolean; confession: string; is_sender?: boolean;
  removable_at?: string | null; other_avatar_url?: string | null; inside_since?: string | null;
  knock_pitch?: string | null; knock_intents?: string[]; pinned?: boolean; archived?: boolean; muted_until?: string | null;
};
type Profile = { background_pattern: string; font_style: string; profile_picture_url: string | null };
type MenuView = "menu" | "mute" | "report" | "call" | null;

const REPORT_REASONS: [string, string][] = [
  ["abuse", "Abuse or harassment"], ["spam", "Spam"], ["explicit", "Unwanted explicit content"],
  ["self-harm-concern", "I'm worried about them"], ["other", "Other"],
];

// Top of the thread: the confession you're both talking about. Scrolls away with the chat.
function ConfessionCard({ conn }: { conn: Conn }) {
  if (!conn.confession) return null;
  return (
    <div className="chat-inside">
      <small className="ci-k">THE CONFESSION</small>
      <p className="ci-q">&ldquo;{conn.confession}&rdquo;</p>
    </div>
  );
}

function Inner({ id }: { id: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [conn, setConn] = useState<Conn | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [text, setText] = useDraft(`chat:${id}`, ""); // unsent message survives leaving
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState<MenuView>(null);
  const [busy, setBusy] = useState(false);
  const [room, setRoom] = useState<CallInfo | null>(null);
  const [callBusy, setCallBusy] = useState(false);
  const roomRef = useRef<CallInfo | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [once, setOnce] = useState<{ media_url: string; media_type: string } | null>(null);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [info, setInfo] = useState(false);
  const [typing, setTyping] = useState(false);
  const [presence, setPresence] = useState<boolean | null>(null);
  const [sockUp, setSockUp] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const sock = useRef<Socket | null>(null);
  const lastTyping = useRef(0);
  const typingTimer = useRef<number | null>(null);
  const router = useRouter();
  const voice = useVoiceRecorder(setError);

  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(""), 3000); return () => window.clearTimeout(t); }, [toast]);

  const load = useCallback(async () => {
    try {
      const r = await api<{ messages: Msg[]; connection: Conn; chat_profile?: Profile }>(
        `/drops/connections/${id}/messages`,
      );
      setMsgs(r.messages);
      setConn(r.connection);
      if (r.chat_profile) setProfile(r.chat_profile);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, [load]);

  // Live updates: any change in this chat reloads it; typing shows in the header.
  useEffect(() => {
    const so = connectSocket();
    if (!so) return;
    sock.current = so;
    setSockUp(true);
    const refresh = (d: { connectionId?: string }) => { if (d?.connectionId === id) load(); };
    ["new_message", "messages_seen", "message_deleted", "message_reaction", "message_opened"].forEach((ev) => so.on(ev, refresh));
    so.on("user_typing", (d: { connectionId?: string }) => {
      if (d?.connectionId !== id) return;
      setTyping(true);
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => setTyping(false), 3000);
    });
    return () => {
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      so.disconnect();
      sock.current = null;
      setSockUp(false);
    };
  }, [id, load]);

  const otherId = conn?.other_user_id;
  useEffect(() => {
    const so = sock.current;
    if (!so || !sockUp || !otherId) return;
    const on = (d: { userId?: string }) => { if (d?.userId === otherId) setPresence(true); };
    const off = (d: { userId?: string }) => { if (d?.userId === otherId) setPresence(false); };
    so.on("user_online", on);
    so.on("user_offline", off);
    return () => { so.off("user_online", on); so.off("user_offline", off); };
  }, [otherId, sockUp]);
  useEffect(() => { setPresence(null); }, [conn?.other_is_online]);

  useEffect(() => {
    if (msgs.length !== lastCount.current) {
      lastCount.current = msgs.length;
      bottom.current?.scrollIntoView({ block: "end" });
    }
  }, [msgs]);

  function onType(v: string) {
    setText(v);
    const now = Date.now();
    if (v && now - lastTyping.current > 2000) {
      lastTyping.current = now;
      sock.current?.emit("typing", { connectionId: id });
    }
  }

  // ── Sending: text, photo, video and voice; a pending reply rides along.
  async function post(body: Record<string, unknown>) {
    await api(`/drops/connections/${id}/message`, { body: { content: "", ...body, ...(replyTo ? { reply_to_id: replyTo.id } : {}) } });
    setReplyTo(null);
    await load();
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await fn(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    void run(async () => { await post({ content }); setText(""); });
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const kind: UploadKind | null = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : null;
    if (!kind) { setError("Pick a photo or a video."); return; }
    void run(async () => post({ media_url: await uploadFile(file, kind), media_type: kind }));
  }

  function sendVoice() {
    const clip = voice.clip;
    if (!clip || busy) return;
    void run(async () => {
      await post({ media_url: await uploadFile(clip.blob, "voice"), media_type: "voice", duration_seconds: clip.secs });
      voice.discard();
    });
  }

  // ── Message actions
  const act = (fn: () => Promise<unknown>) => { setSel(null); fn().then(() => load()).catch((err) => setError((err as Error).message)); };
  const react = (m: Msg, emoji: string) => act(() => api(`/drops/connections/${id}/messages/${m.id}/react`, { body: { emoji } }));
  const removeMsg = (m: Msg, forEveryone: boolean) => act(() => api(`/drops/connections/${id}/messages/${m.id}/delete`, { body: { for_everyone: forEveryone } }));
  async function copy(m: Msg) {
    setSel(null);
    try { await navigator.clipboard.writeText(m.content || ""); setToast("Copied."); } catch { setError("Could not copy."); }
  }
  // View once: opens a single time, then it's gone for the receiver.
  async function openOnce(m: Msg) {
    try { setOnce(await api<{ media_url: string; media_type: string }>(`/drops/connections/${id}/messages/${m.id}/open`, { method: "POST" })); }
    catch (err) { setError((err as Error).message); }
    await load();
  }

  // ── Calls: one button, then voice or video. Their Room settings decide; the server says if not.
  function openRoom(next: CallInfo | null) { roomRef.current = next; setRoom(next); }
  async function call(video: boolean) {
    setMenu(null);
    if (callBusy || !conn) return;
    setCallBusy(true);
    setError("");
    try {
      const r = await callsApi.direct(id, video);
      openRoom(callInfo(r, { other: { name: conn.other_anonymous_name, avatar_url: profile?.profile_picture_url, ...(r.other || {}) } }));
    } catch (e) {
      setError((e as Error).message || "Could not start the call.");
    } finally {
      setCallBusy(false);
    }
  }

  // ── ⋮ menu: Mute, Clear chat, Report, Block
  const applyPrefs = (p: Prefs) => setConn((c) => (c ? { ...c, ...p } : c));
  async function mute(v: string) {
    setMenu(null);
    try { applyPrefs(await chatsApi.prefs(id, { mute: v })); setToast(v === "off" ? "Notifications on." : "Muted."); } catch (err) { setError((err as Error).message); }
  }
  async function clearChat() {
    setMenu(null);
    if (!window.confirm("Clear this chat?\n\nOnly for you. They keep their copy.")) return;
    try { await chatsApi.clear(id); setInfo(false); await load(); setToast("Chat cleared."); } catch (err) { setError((err as Error).message); }
  }
  async function report(reason: string) {
    setMenu(null);
    if (!conn?.other_user_id) return;
    try { await api(`/users/${conn.other_user_id}/report`, { body: { reason } }); setToast("Report received. Thank you."); }
    catch (e) { setError((e as Error).message); }
  }
  async function reportFake() {
    setMenu(null);
    if (!window.confirm("Their confession was fake?\n\nWe'll review it. If it was, you get your coins back.")) return;
    try { await api("/deception-reports", { body: { connection_id: id } }); setToast("Report sent for review."); }
    catch (e) { setError((e as Error).message); }
  }
  async function block() {
    setMenu(null);
    if (!conn?.other_user_id) return;
    if (!window.confirm("Block this person?\n\nThe chat closes and they can't knock again.")) return;
    try { await api(`/users/${conn.other_user_id}/block`, { method: "POST" }); router.push("/inbox"); }
    catch (e) { setError((e as Error).message); }
  }
  async function removeFromRoom() {
    const unlocks = conn?.removable_at ? new Date(conn.removable_at) : null;
    if (unlocks && unlocks > new Date()) {
      setError(`You can end this chat from ${unlocks.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. Something wrong? Block them now.`);
      return;
    }
    if (!window.confirm(`End this chat?\n\nIt closes for you and ${conn?.other_anonymous_name || "them"}. They'd have to knock again.`)) return;
    try { await api(`/drops/connections/${id}/remove`, { method: "POST" }); router.push("/inbox"); }
    catch (e) { setError((e as Error).message); }
  }

  const name = conn?.other_anonymous_name || "…";
  const online = presence ?? !!conn?.other_is_online;
  // A guest sees the Room's picture; the owner sees the guest's own avatar (the chat profile is the owner's).
  const pic = conn?.is_sender ? conn?.other_avatar_url : (profile?.profile_picture_url || conn?.other_avatar_url);
  const toggleMenu = (v: MenuView) => setMenu((cur) => (cur === v || (v === "menu" && cur && cur !== "call") ? null : v));

  return (
    <div className="chat u-themed" style={fontStyleById(profile?.font_style)}>
      <link rel="stylesheet" href={FONTS_HREF} precedence="default" />
      <ChatBackground id={profile?.background_pattern} />
      <div className="chat-head u-chat-head">
        <button type="button" className="mx-headbtn" onClick={() => setInfo(true)} aria-label={`${name}, contact info`}>
          <span className="u-ava">
            <span style={pic ? undefined : { background: "var(--rose-dim)", color: "var(--rose)" }}>
              {pic ? <Image src={pic} alt="" width={38} height={38} /> : name[0]?.toUpperCase() || "A"}
            </span>
            {online ? <em /> : null}
          </span>
          <span className="u-head-t">
            <b>{name}{conn?.muted_until ? <BellOff className="mx-muted" size={13} strokeWidth={2} aria-label="Muted" /> : null}</b>
            <small className={typing || online ? "" : "dim"}>{typing ? "typing…" : online ? "online" : "click for contact info"}</small>
          </span>
        </button>
        <button className="call-btn" onClick={() => toggleMenu("call")} disabled={callBusy || !!room} aria-label={`Call ${name}`} aria-expanded={menu === "call"}>
          <Phone strokeWidth={2} aria-hidden />
        </button>
        <button className="kebab" onClick={() => toggleMenu("menu")} aria-label="More" aria-expanded={!!menu && menu !== "call"}><EllipsisVertical size={20} strokeWidth={2} aria-hidden /></button>
        {menu ? (
          <div className="menu" role="menu">
            {menu === "call" ? (
              <>
                <button onClick={() => call(false)}>Voice call</button>
                <button onClick={() => call(true)}>Video call</button>
              </>
            ) : menu === "mute" ? (
              <>
                <button className="sub" onClick={() => setMenu("menu")}>‹ Mute for</button>
                {MUTE_OPTIONS.map(([v, l]) => <button key={v} onClick={() => mute(v)}>{l}</button>)}
              </>
            ) : menu === "report" ? (
              <>
                <button className="sub" onClick={() => setMenu("menu")}>‹ What&apos;s wrong with {name}?</button>
                {!conn?.is_sender ? <button className="danger" onClick={reportFake}>Their confession was fake</button> : null}
                {REPORT_REASONS.map(([v, l]) => <button key={v} onClick={() => report(v)}>{l}</button>)}
              </>
            ) : (
              <>
                {conn?.muted_until ? <button onClick={() => mute("off")}>Unmute ({mutedLabel(conn.muted_until).toLowerCase()})</button>
                  : <button onClick={() => setMenu("mute")}>Mute</button>}
                <button onClick={clearChat}>Clear chat</button>
                {conn?.other_user_id ? <button className="danger" onClick={() => setMenu("report")}>Report</button> : null}
                {conn?.other_user_id ? <button className="danger" onClick={block}>Block {name}</button> : null}
              </>
            )}
          </div>
        ) : null}
      </div>
      {room ? <CallRoom info={room} onClose={() => { openRoom(null); load(); }} /> : null}
      {once ? (
        <div className="u-modal" onClick={() => setOnce(null)}>
          {once.media_type === "video" ? <video src={once.media_url} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />
            : <Image src={once.media_url} alt="" width={800} height={1000} />}
          <button className="u-modal-x" aria-label="Close" onClick={() => setOnce(null)}><X size={20} strokeWidth={2} aria-hidden /></button>
        </div>
      ) : null}
      <div className="chat-log" onClick={() => menu && setMenu(null)}>
        {conn ? <ConfessionCard conn={conn} /> : null}
        {msgs.map((m) => (
          <ChatBubble
            key={m.id}
            m={m}
            otherName={conn?.other_anonymous_name || "Them"}
            open={sel === m.id}
            onToggle={() => setSel(sel === m.id ? null : m.id)}
            onReact={react}
            onReply={(x) => { setReplyTo(x); setSel(null); }}
            onCopy={copy}
            onDelete={removeMsg}
            onOpenOnce={openOnce}
          />
        ))}
        <div ref={bottom} />
      </div>
      {error ? <div className="err pad">{error}</div> : null}
      {toast ? <div className="ic-note" role="status">{toast}</div> : null}
      {info && conn ? (
        <ChatInfo
          id={id} conn={conn} avatar={profile?.profile_picture_url}
          onClose={() => setInfo(false)} onPrefs={applyPrefs}
          onCall={(video) => { setInfo(false); void call(video); }}
          onClear={clearChat} onBlock={block}
          onReport={() => { setInfo(false); setMenu("report"); }}
          onRemove={conn.is_sender ? () => { setInfo(false); void removeFromRoom(); } : undefined}
        />
      ) : null}
      {replyTo ? (
        <div className="reply-bar">
          <span>Replying to: {replyTo.content || replyTo.media_type || "message"}</span>
          <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={20} strokeWidth={2} aria-hidden /></button>
        </div>
      ) : null}
      {voice.recording ? (
        <div className="chat-input">
          <span className="rec-dot" />
          <span className="grow">Recording {Math.floor(voice.secs / 60)}:{String(voice.secs % 60).padStart(2, "0")}</span>
          <button type="button" className="pill ghost" onClick={() => voice.stop(true)}>Cancel</button>
          <button type="button" className="pill" onClick={() => voice.stop(false)}>Done</button>
        </div>
      ) : voice.clip ? (
        <div className="chat-input">
          <audio className="grow vn-preview" src={voice.clip.url} controls aria-label="Your voice note" />
          <button type="button" className="pill ghost" onClick={voice.discard} disabled={busy}>Discard</button>
          <button type="button" className="pill" onClick={sendVoice} disabled={busy}>{busy ? "Sending…" : "Send"}</button>
        </div>
      ) : (
        <form className="chat-input" onSubmit={send}>
          <input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={pickFile} />
          <button type="button" className="icon-btn" onClick={() => fileInput.current?.click()} disabled={busy} aria-label="Attach photo or video"><Paperclip size={20} strokeWidth={2} aria-hidden /></button>
          <input value={text} onChange={(e) => onType(e.target.value)} placeholder="Say something…" maxLength={1000} />
          {text.trim() ? (
            <button className="pill" disabled={busy}>Send</button>
          ) : (
            <button type="button" className="icon-btn" onClick={() => { setError(""); void voice.start(); }} disabled={busy} aria-label="Record voice note"><Mic size={20} strokeWidth={2} aria-hidden /></button>
          )}
        </form>
      )}
    </div>
  );
}

export default function ChatPage({ id }: { id: string }) {
  return (
    <AppShell brand={false} title="Chat" back="/inbox">
      <Inner id={id} />
    </AppShell>
  );
}
