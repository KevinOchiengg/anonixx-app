"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import useDraft from "@/lib/useDraft";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ChatBackground, FONTS_HREF, fontStyleById, type GalleryItem } from "@/lib/chatTheme";
import { uploadFile, type UploadKind } from "@/lib/upload";
import { connectSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";
import AppShell from "./AppShell";
import CallRoom, { type CallInfo } from "./CallRoom";
import { callsApi, callInfo } from "@/lib/calls";
import { chatsApi, mutedLabel, MUTE_OPTIONS, type Prefs } from "@/lib/chats";
import ChatInfo from "./rooms/ChatInfo";
import { PickChats } from "./rooms/Messenger";
import "../app/chat-media.css";
import { BellOff, EllipsisVertical, Lock, Mic, Paperclip, Phone, Star, Video, X } from "lucide-react";

type Msg = {
  id: string;
  content: string;
  media_url: string | null;
  media_type: string | null;
  deleted: boolean;
  sender_id: string;
  is_own: boolean;
  seen: boolean;
  time_ago: string;
  duration_seconds?: number | null;
  reply_to?: { id: string; preview: string; media_type: string | null; is_own: boolean } | null;
  view_once?: boolean;
  opened?: boolean;
  reactions?: { emoji: string; count: number; mine: boolean }[];
  starred?: boolean;
  forwarded?: boolean;
};

const REACTIONS = ["🔥", "😈", "💋", "🥵", "😂", "🖤"];
type Conn = {
  other_anonymous_name: string; other_user_id?: string; other_is_online: boolean; confession: string; is_sender?: boolean;
  removable_at?: string | null; other_avatar_url?: string | null; inside_since?: string | null;
  knock_pitch?: string | null; knock_intents?: string[]; pinned?: boolean; archived?: boolean; muted_until?: string | null;
};

// A voice note with a 1x / 1.5x / 2x control.
function VoiceNote({ src }: { src: string }) {
  const el = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState(1);
  const next = () => {
    const r = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(r);
    if (el.current) el.current.playbackRate = r;
  };
  return (
    <span className="vn" onClick={(e) => e.stopPropagation()}>
      <audio ref={el} src={src} controls preload="none" onPlay={() => { if (el.current) el.current.playbackRate = rate; }} />
      <button type="button" className="vn-rate" onClick={next} aria-label={`Playback speed ${rate} times`}>{rate}×</button>
    </span>
  );
}
type ActiveCall = { id: string; guest_count: number; max_guests: number; video?: boolean };
type Profile = { background_pattern: string; font_style: string; profile_picture_url: string | null; gallery: GalleryItem[] };

function GalleryOverlay({ items, title, onClose }: { items: GalleryItem[]; title?: string; onClose: () => void }) {
  const [i, setI] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  return (
    <div className="u-welcome" role="dialog" aria-modal>
      <button className="u-modal-x" onClick={onClose} aria-label="Close"><X size={20} strokeWidth={2} aria-hidden /></button>
      <div
        className="u-welcome-track"
        ref={track}
        onScroll={() => {
          const el = track.current;
          if (el) setI(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {items.map((m, k) => (
          <div key={k}>
            {m.media_type === "video" ? <video src={m.media_url} controls autoPlay={k === 0} loop playsInline /> : <Image src={m.media_url} alt="" width={460} height={600} sizes="460px" />}
          </div>
        ))}
      </div>
      {items.length > 1 ? (
        <div className="u-welcome-dots">{items.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}</div>
      ) : null}
      <p>{title || "Swipe to see more"}</p>
    </div>
  );
}

function Inner({ id }: { id: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [conn, setConn] = useState<Conn | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [welcome, setWelcome] = useState<GalleryItem[]>([]);
  const [gallery, setGallery] = useState(false);
  const [text, setText] = useDraft(`chat:${id}`, ""); // unsent message survives leaving
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [room, setRoom] = useState<CallInfo | null>(null);
  const [callBusy, setCallBusy] = useState(false);
  const roomRef = useRef<CallInfo | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [once, setOnce] = useState<GalleryItem | null>(null);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const cancelled = useRef(false);
  const [voice, setVoice] = useState<{ blob: Blob; url: string; secs: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const sock = useRef<Socket | null>(null);
  const [sockUp, setSockUp] = useState(false);
  const lastTyping = useRef(0);
  const typingTimer = useRef<number | null>(null);
  const [typing, setTyping] = useState(false);
  const [presence, setPresence] = useState<boolean | null>(null);
  const [info, setInfo] = useState(false);
  const [forward, setForward] = useState<Msg | null>(null);
  const [muteOpen, setMuteOpen] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(""), 3000); return () => window.clearTimeout(t); }, [toast]);

  const load = useCallback(async () => {
    try {
      const r = await api<{ messages: Msg[]; connection: Conn; chat_profile?: Profile; welcome_gallery?: GalleryItem[]; welcome_sound?: string | null; active_call?: ActiveCall | null }>(
        `/drops/connections/${id}/messages`,
      );
      setMsgs(r.messages);
      setConn(r.connection);
      if (r.chat_profile) setProfile(r.chat_profile);
      setActiveCall(r.active_call || null);
      if (!r.active_call && roomRef.current && roomRef.current.kind !== "direct" && !roomRef.current.isHost) { roomRef.current = null; setRoom(null); }
      if (r.welcome_gallery?.length) setWelcome(r.welcome_gallery);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    const so = connectSocket();
    if (!so) return;
    sock.current = so;
    setSockUp(true);
    const refresh = (d: { connectionId?: string }) => { if (d?.connectionId === id) load(); };
    so.on("new_message", refresh);
    so.on("messages_seen", refresh);
    so.on("message_deleted", refresh);
    so.on("message_reaction", refresh);
    so.on("message_opened", refresh);
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

  function onType(v: string) {
    setText(v);
    const now = Date.now();
    if (v && now - lastTyping.current > 2000) {
      lastTyping.current = now;
      sock.current?.emit("typing", { connectionId: id });
    }
  }

  useEffect(() => {
    if (msgs.length !== lastCount.current) {
      lastCount.current = msgs.length;
      bottom.current?.scrollIntoView({ block: "end" });
    }
  }, [msgs]);

  function openRoom(info: CallInfo | null) {
    roomRef.current = info;
    setRoom(info);
  }

  // The header buttons ring the other person. Their Room settings decide whether they
  // take voice / video calls; the server says so if not.
  async function pressCall(audioOnly: boolean) {
    if (callBusy || !conn) return;
    setCallBusy(true);
    setError("");
    try {
      const r = await callsApi.direct(id, !audioOnly);
      openRoom(callInfo(r, { other: { name: conn.other_anonymous_name, avatar_url: profile?.profile_picture_url, ...(r.other || {}) } }));
    } catch (e) {
      setError((e as Error).message || "Could not start the call.");
    } finally {
      setCallBusy(false);
    }
  }

  // A group session open in this Room: guests join it from the strip.
  async function joinSession() {
    if (callBusy || !activeCall) return;
    setCallBusy(true);
    setError("");
    try {
      const r = await callsApi.join(activeCall.id);
      openRoom(callInfo(r, { isHost: false, other: { name: conn?.other_anonymous_name || "Anonymous" } }));
    } catch (e) {
      setError((e as Error).message || "Could not join the session.");
    } finally {
      setCallBusy(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    setError("");
    try {
      await api(`/drops/connections/${id}/message`, {
        body: { content, ...(replyTo ? { reply_to_id: replyTo.id } : {}) },
      });
      setText("");
      setReplyTo(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendMedia(url: string, type: UploadKind, duration?: number) {
    await api(`/drops/connections/${id}/message`, {
      body: {
        content: "",
        media_url: url,
        media_type: type,
        ...(duration ? { duration_seconds: duration } : {}),
        ...(replyTo ? { reply_to_id: replyTo.id } : {}),
      },
    });
    setReplyTo(null);
    await load();
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const kind: UploadKind | null = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : null;
    if (!kind) { setError("Pick a photo or a video."); return; }
    setBusy(true);
    setError("");
    try {
      await sendMedia(await uploadFile(file, kind), kind);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function clearTimer() {
    if (timer.current) { window.clearInterval(timer.current); timer.current = null; }
  }

  async function startRecording() {
    setError("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice notes are not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      cancelled.current = false;
      const started = Date.now();
      rec.ondataavailable = (ev) => { if (ev.data.size) chunks.current.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearTimer();
        setRecording(false);
        if (cancelled.current || !chunks.current.length) return;
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        // Listen back first; Send or Discard decides.
        setVoice({ blob, url: URL.createObjectURL(blob), secs: Math.max(1, Math.round((Date.now() - started) / 1000)) });
      };
      recorder.current = rec;
      rec.start();
      setSecs(0);
      setRecording(true);
      timer.current = window.setInterval(() => setSecs((n) => n + 1), 1000);
    } catch {
      setError("Allow microphone access to send voice notes.");
    }
  }

  function discardVoice() {
    if (voice) URL.revokeObjectURL(voice.url);
    setVoice(null);
  }

  async function sendVoice() {
    if (!voice || busy) return;
    setBusy(true);
    setError("");
    try {
      await sendMedia(await uploadFile(voice.blob, "voice"), "voice", voice.secs);
      discardVoice();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function stopRecording(cancel: boolean) {
    cancelled.current = cancel;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }

  useEffect(() => () => {
    cancelled.current = true;
    clearTimer();
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  async function removeMsg(m: Msg, forEveryone: boolean) {
    setSel(null);
    try {
      await api(`/drops/connections/${id}/messages/${m.id}/delete`, { body: { for_everyone: forEveryone } });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function react(m: Msg, emoji: string) {
    setSel(null);
    try {
      await api(`/drops/connections/${id}/messages/${m.id}/react`, { body: { emoji } });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function star(m: Msg) {
    setSel(null);
    const next = !m.starred;
    setMsgs((x) => x.map((y) => (y.id === m.id ? { ...y, starred: next } : y)));
    try { await chatsApi.star(id, m.id, next); setToast(next ? "Starred. Find it in Starred messages." : "Unstarred."); }
    catch (err) { setError((err as Error).message); await load(); }
  }

  async function copy(m: Msg) {
    setSel(null);
    try { await navigator.clipboard.writeText(m.content || ""); setToast("Copied."); } catch { setError("Could not copy."); }
  }

  async function doForward(to: string[]) {
    if (!forward) return;
    try {
      const r = await chatsApi.forward(id, forward.id, to);
      setForward(null);
      setToast(`Forwarded to ${r.sent.length} ${r.sent.length === 1 ? "chat" : "chats"}${r.skipped.length ? ` (${r.skipped.length} couldn't receive it)` : ""}.`);
    } catch (err) { setError((err as Error).message); }
  }

  const applyPrefs = (p: Prefs) => setConn((c) => (c ? { ...c, ...p } : c));
  async function mute(v: string) {
    setMuteOpen(false);
    try { applyPrefs(await chatsApi.prefs(id, { mute: v })); setToast(v === "off" ? "Notifications on." : "Muted."); } catch (err) { setError((err as Error).message); }
  }
  async function clearChat() {
    if (!window.confirm("Clear this chat?\n\nMessages disappear for you only. They keep their copy.")) return;
    try { await chatsApi.clear(id); setInfo(false); await load(); setToast("Chat cleared."); } catch (err) { setError((err as Error).message); }
  }

  // View once: opens a single time, then it's gone for the receiver.
  async function openOnce(m: Msg) {
    try {
      const r = await api<{ media_url: string; media_type: string }>(`/drops/connections/${id}/messages/${m.id}/open`, { method: "POST" });
      setOnce(r);
    } catch (err) {
      setError((err as Error).message);
    }
    await load();
  }

  async function block() {
    if (!conn?.other_user_id) return;
    if (!window.confirm("Block this person?\n\nThe conversation and any call close now, and they can't see your Room or knock again.")) return;
    try {
      await api(`/users/${conn.other_user_id}/block`, { method: "POST" });
      router.push("/inbox");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeFromRoom() {
    const unlocks = conn?.removable_at ? new Date(conn.removable_at) : null;
    if (unlocks && unlocks > new Date()) {
      setMenu(false);
      setError(`You can remove someone 3 days after letting them in: from ${unlocks.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. If something's wrong, block them now.`);
      return;
    }
    if (!window.confirm(`Remove ${conn?.other_anonymous_name || "them"} from your Room?

This conversation closes for both of you. They're outside again and can knock if they want back in.`)) return;
    try {
      await api(`/drops/connections/${id}/remove`, { method: "POST" });
      router.push("/inbox");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function report() {
    if (!conn?.other_user_id) return;
    if (!window.confirm(`Report ${conn.other_anonymous_name || "this person"} for abuse or harassment?`)) return;
    try {
      await api(`/users/${conn.other_user_id}/report`, { body: { reason: "abuse" } });
      setToast("Report received. Thank you.");
      setMenu(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const name = conn?.other_anonymous_name || "…";
  const online = presence ?? !!conn?.other_is_online;
  // A guest sees the Room's picture; the owner sees the guest's own avatar (the chat profile is the owner's).
  const pic = conn?.is_sender ? conn?.other_avatar_url : (profile?.profile_picture_url || conn?.other_avatar_url);
  const hasGallery = !!profile?.gallery?.length;

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
        <button className="call-btn" onClick={() => pressCall(true)} disabled={callBusy || !!room} aria-label={`Voice call ${name}`}>
          <Phone strokeWidth={2} aria-hidden />
        </button>
        <button className="call-btn" onClick={() => pressCall(false)} disabled={callBusy || !!room} aria-label={`Video call ${name}`}>
          <Video strokeWidth={2} aria-hidden />
        </button>
        <button className="kebab" onClick={() => setMenu((m) => !m)} aria-label="More"><EllipsisVertical size={20} strokeWidth={2} aria-hidden /></button>
        {menu ? (
          <div className="menu" onClick={() => setMenu(false)}>
            <button onClick={() => setInfo(true)}>Contact info</button>
            <button onClick={() => setInfo(true)}>Media, links and voice</button>
            {conn?.muted_until ? <button onClick={() => mute("off")}>Unmute ({mutedLabel(conn.muted_until).toLowerCase()})</button>
              : <button onClick={(e) => { e.stopPropagation(); setMuteOpen((v) => !v); }}>Mute notifications…</button>}
            {muteOpen ? MUTE_OPTIONS.map(([v, l]) => <button key={v} className="sub" onClick={() => mute(v)}>· {l}</button>) : null}
            <button onClick={clearChat}>Clear chat</button>
            {hasGallery ? <button onClick={() => setGallery(true)}>View welcome media</button> : null}
            {conn?.is_sender ? <Link href="/chat-setup" className="u-menu-link">Your Room</Link> : null}
            {conn?.is_sender ? <button onClick={removeFromRoom}>Remove from Room</button> : null}
            {conn?.other_user_id ? <button onClick={report}>Report</button> : null}
            {conn?.other_user_id ? <button onClick={block}>Block</button> : null}
          </div>
        ) : null}
      </div>
      {activeCall ? (
        <div className="call-strip">
          <i />{conn?.is_sender ? "Your session is live" : `${name}'s session is live`} · {activeCall.guest_count}/{activeCall.max_guests} in
          {!conn?.is_sender ? <button className="call-join" onClick={joinSession} disabled={callBusy}>{callBusy ? "…" : "Join"}</button> : null}
        </div>
      ) : null}
      {room ? <CallRoom info={room} onClose={() => { openRoom(null); load(); }} /> : null}
      {welcome.length ? <GalleryOverlay items={welcome} title="Swipe to see more · tap × to start chatting" onClose={() => setWelcome([])} /> : null}
      {gallery && profile?.gallery?.length ? <GalleryOverlay items={profile.gallery} onClose={() => setGallery(false)} /> : null}
      {once ? <GalleryOverlay items={[once]} title="View once · gone when you close it" onClose={() => setOnce(null)} /> : null}
      {conn?.confession ? <div className="chat-origin">“{conn.confession}”</div> : null}
      <div className="chat-log">
        {msgs.map((m) => (
          <div key={m.id} className={`bubble${m.is_own ? " own" : ""}`} onClick={() => !m.deleted && setSel(sel === m.id ? null : m.id)}>
            {m.forwarded && !m.deleted ? <span className="mx-fwd">↪ Forwarded</span> : null}
            {m.reply_to && !m.deleted ? (
              <div className="reply-quote">{m.reply_to.is_own ? "You" : "Them"}: {m.reply_to.preview || m.reply_to.media_type}</div>
            ) : null}
            {m.deleted ? <em>Message deleted</em> : null}
            {!m.deleted && m.view_once ? (
              m.is_own ? <em><Lock className="inl-ic" size={13} strokeWidth={2} aria-hidden /> View-once {m.media_type === "video" ? "video" : "photo"} · {m.opened ? "opened" : "not opened yet"}</em>
              : m.opened ? <em>Opened</em>
              : <button type="button" className="pill" onClick={(e) => { e.stopPropagation(); openOnce(m); }}><Lock className="inl-ic" size={13} strokeWidth={2} aria-hidden /> Tap to open · view once</button>
            ) : null}
            {!m.deleted && !m.view_once && m.media_type === "image" && m.media_url ? <Image src={m.media_url} alt="" width={400} height={400} style={{ height: "auto" }} sizes="80vw" /> : null}
            {!m.deleted && !m.view_once && m.media_type === "video" && m.media_url ? <video src={m.media_url} controls preload="metadata" playsInline onClick={(e) => e.stopPropagation()} /> : null}
            {!m.deleted && !m.view_once && m.media_type === "voice" && m.media_url ? <VoiceNote src={m.media_url} /> : null}
            {!m.deleted && m.content ? <span>{m.content}</span> : null}
            <small>{m.starred ? <Star className="inl-ic star" size={11} fill="currentColor" strokeWidth={2} aria-label="Starred" /> : null}{m.time_ago}{m.is_own && !m.deleted ? <span className={`mx-tick${m.seen ? " seen" : ""}`}> {m.seen ? "✓✓" : "✓"}</span> : null}</small>
            {m.reactions?.length ? (
              <div className="msg-reactions" onClick={(e) => e.stopPropagation()}>
                {m.reactions.map((r) => (
                  <button key={r.emoji} className={r.mine ? "mine" : ""} onClick={() => react(m, r.emoji)}>{r.emoji}{r.count > 1 ? ` ${r.count}` : ""}</button>
                ))}
              </div>
            ) : null}
            {sel === m.id ? (
              <div className="msg-actions" onClick={(e) => e.stopPropagation()}>
                {REACTIONS.map((e) => <button key={e} onClick={() => react(m, e)}>{e}</button>)}
                <button onClick={() => { setReplyTo(m); setSel(null); }}>Reply</button>
                <button onClick={() => star(m)}>{m.starred ? "Unstar" : "Star"}</button>
                {!m.view_once ? <button onClick={() => { setSel(null); setForward(m); }}>Forward</button> : null}
                {m.content ? <button onClick={() => copy(m)}>Copy</button> : null}
                <button onClick={() => removeMsg(m, false)}>Delete for me</button>
                {m.is_own ? <button onClick={() => removeMsg(m, true)}>Delete for everyone</button> : null}
              </div>
            ) : null}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {error ? <div className="err pad">{error}</div> : null}
      {toast ? <div className="ic-note" role="status">{toast}</div> : null}
      {info && conn ? (
        <ChatInfo
          id={id} conn={conn} avatar={profile?.profile_picture_url} onClose={() => setInfo(false)} onPrefs={applyPrefs}
          onCall={(video) => { setInfo(false); void pressCall(!video); }}
          onClear={clearChat} onBlock={block} onReport={report}
          onRemove={conn.is_sender ? () => { setInfo(false); void removeFromRoom(); } : undefined}
        />
      ) : null}
      {forward ? <PickChats mode="forward" title="Forward to…" exclude={id} onClose={() => setForward(null)} onForward={doForward} /> : null}
      {replyTo ? (
        <div className="reply-bar">
          <span>Replying to: {replyTo.content || replyTo.media_type || "message"}</span>
          <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={20} strokeWidth={2} aria-hidden /></button>
        </div>
      ) : null}
      {recording ? (
        <div className="chat-input">
          <span className="rec-dot" />
          <span className="grow">Recording {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span>
          <button type="button" className="pill ghost" onClick={() => stopRecording(true)}>Cancel</button>
          <button type="button" className="pill" onClick={() => stopRecording(false)}>Done</button>
        </div>
      ) : voice ? (
        <div className="chat-input">
          <audio className="grow vn-preview" src={voice.url} controls aria-label="Your voice note" />
          <button type="button" className="pill ghost" onClick={discardVoice} disabled={busy}>Discard</button>
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
            <button type="button" className="icon-btn" onClick={startRecording} disabled={busy} aria-label="Record voice note"><Mic size={20} strokeWidth={2} aria-hidden /></button>
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
