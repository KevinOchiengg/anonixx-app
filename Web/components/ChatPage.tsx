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
import "../app/chat-media.css";

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
};
type Conn = { other_anonymous_name: string; other_user_id?: string; other_is_online: boolean; confession: string; is_sender?: boolean };
type ActiveCall = { id: string; guest_count: number; max_guests: number };
type Profile = { background_pattern: string; font_style: string; profile_picture_url: string | null; gallery: GalleryItem[] };

function GalleryOverlay({ items, title, onClose }: { items: GalleryItem[]; title?: string; onClose: () => void }) {
  const [i, setI] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  return (
    <div className="u-welcome" role="dialog" aria-modal>
      <button className="u-modal-x" onClick={onClose} aria-label="Close">×</button>
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
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const cancelled = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const sock = useRef<Socket | null>(null);
  const [sockUp, setSockUp] = useState(false);
  const lastTyping = useRef(0);
  const typingTimer = useRef<number | null>(null);
  const [typing, setTyping] = useState(false);
  const [presence, setPresence] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ messages: Msg[]; connection: Conn; chat_profile?: Profile; welcome_gallery?: GalleryItem[]; welcome_sound?: string | null; active_call?: ActiveCall | null }>(
        `/drops/connections/${id}/messages`,
      );
      setMsgs(r.messages);
      setConn(r.connection);
      if (r.chat_profile) setProfile(r.chat_profile);
      setActiveCall(r.active_call || null);
      if (!r.active_call && roomRef.current && !roomRef.current.isHost) { roomRef.current = null; setRoom(null); }
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

  async function pressCall(audioOnly: boolean) {
    if (callBusy || !conn) return;
    if (!conn.is_sender && !activeCall) { setError("No live call right now."); return; }
    setCallBusy(true);
    setError("");
    try {
      type Res = { call_id: string; channel: string; token: string; uid: number; app_id: string };
      const r = conn.is_sender
        ? await api<Res>("/drop-calls/start", { method: "POST" })
        : await api<Res>(`/drop-calls/${activeCall!.id}/join`, { method: "POST" });
      openRoom({
        callId: r.call_id, channel: r.channel, token: r.token, uid: r.uid, appId: r.app_id,
        isHost: !!conn.is_sender, audioOnly, hostName: conn.other_anonymous_name || "Anonymous",
      });
    } catch (e) {
      setError((e as Error).message || "Could not start the call.");
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
        setBusy(true);
        try {
          await sendMedia(await uploadFile(blob, "voice"), "voice", Math.max(1, Math.round((Date.now() - started) / 1000)));
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
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

  async function block() {
    if (!conn?.other_user_id) return;
    if (!window.confirm("Block this person? You won't see each other's posts.")) return;
    try {
      await api(`/users/${conn.other_user_id}/block`, { method: "POST" });
      setError("Blocked.");
      setMenu(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeFromRoom() {
    if (!window.confirm(`Remove ${conn?.other_anonymous_name || "them"} from your Room?

This conversation closes for both of you. They'd have to knock again.`)) return;
    try {
      await api(`/drops/connections/${id}/remove`, { method: "POST" });
      router.push("/inbox");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function report() {
    if (!conn?.other_user_id) return;
    try {
      await api(`/users/${conn.other_user_id}/report`, { body: { reason: "abuse" } });
      setError("Reported. Thank you.");
      setMenu(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const name = conn?.other_anonymous_name || "…";
  const online = presence ?? !!conn?.other_is_online;
  const pic = profile?.profile_picture_url;
  const hasGallery = !!profile?.gallery?.length;

  return (
    <div className="chat u-themed" style={fontStyleById(profile?.font_style)}>
      <link rel="stylesheet" href={FONTS_HREF} precedence="default" />
      <ChatBackground id={profile?.background_pattern} />
      <div className="chat-head u-chat-head">
        <span className="u-ava">
          <span style={pic ? undefined : { background: "var(--rose-dim)", color: "var(--rose)" }}>
            {pic ? <Image src={pic} alt="" width={38} height={38} /> : name[0]?.toUpperCase() || "A"}
          </span>
          {online ? <em /> : null}
        </span>
        <span className="u-head-t">
          <b>{name}</b>
          <small>{typing ? "typing…" : online ? "online" : ""}</small>
        </span>
        <button className={`call-btn${activeCall ? " live" : ""}`} onClick={() => pressCall(true)} disabled={callBusy} aria-label="Voice call">
          <svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>
          {activeCall ? <i /> : null}
        </button>
        <button className={`call-btn${activeCall ? " live" : ""}`} onClick={() => pressCall(false)} disabled={callBusy} aria-label="Video call">
          <svg viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M16 10l6-3v10l-6-3" /></svg>
          {activeCall ? <i /> : null}
        </button>
        <button className="kebab" onClick={() => setMenu((m) => !m)} aria-label="More">⋯</button>
        {menu ? (
          <div className="menu" onClick={() => setMenu(false)}>
            {hasGallery ? <button onClick={() => setGallery(true)}>View gallery</button> : null}
            {conn?.is_sender ? <Link href="/chat-setup" className="u-menu-link">Your Room</Link> : null}
            {conn?.is_sender ? <button onClick={removeFromRoom}>Remove from Room</button> : null}
            {conn?.other_user_id ? <button onClick={report}>Report</button> : null}
            {conn?.other_user_id ? <button onClick={block}>Block</button> : null}
          </div>
        ) : null}
      </div>
      {activeCall ? (
        <div className="call-strip"><i />{conn?.is_sender ? "Your call is live" : "Call live"} · {activeCall.guest_count}/{activeCall.max_guests} in room</div>
      ) : null}
      {room ? <CallRoom info={room} onClose={() => { openRoom(null); load(); }} /> : null}
      {welcome.length ? <GalleryOverlay items={welcome} title="Swipe to see more · tap × to start chatting" onClose={() => setWelcome([])} /> : null}
      {gallery && profile?.gallery?.length ? <GalleryOverlay items={profile.gallery} onClose={() => setGallery(false)} /> : null}
      {conn?.confession ? <div className="chat-origin">“{conn.confession}”</div> : null}
      <div className="chat-log">
        {msgs.map((m) => (
          <div key={m.id} className={`bubble${m.is_own ? " own" : ""}`} onClick={() => !m.deleted && setSel(sel === m.id ? null : m.id)}>
            {m.reply_to && !m.deleted ? (
              <div className="reply-quote">{m.reply_to.is_own ? "You" : "Them"}: {m.reply_to.preview || m.reply_to.media_type}</div>
            ) : null}
            {m.deleted ? <em>Message deleted</em> : null}
            {!m.deleted && m.media_type === "image" && m.media_url ? <Image src={m.media_url} alt="" width={400} height={400} style={{ height: "auto" }} sizes="80vw" /> : null}
            {!m.deleted && m.media_type === "video" && m.media_url ? <video src={m.media_url} controls preload="metadata" playsInline onClick={(e) => e.stopPropagation()} /> : null}
            {!m.deleted && m.media_type === "voice" && m.media_url ? <audio src={m.media_url} controls preload="none" onClick={(e) => e.stopPropagation()} /> : null}
            {!m.deleted && m.content ? <span>{m.content}</span> : null}
            <small>{m.time_ago}{m.is_own && m.seen ? " · seen" : ""}</small>
            {sel === m.id ? (
              <div className="msg-actions" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setReplyTo(m); setSel(null); }}>Reply</button>
                <button onClick={() => removeMsg(m, false)}>Delete for me</button>
                {m.is_own ? <button onClick={() => removeMsg(m, true)}>Delete for everyone</button> : null}
              </div>
            ) : null}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {error ? <div className="err pad">{error}</div> : null}
      {replyTo ? (
        <div className="reply-bar">
          <span>Replying to: {replyTo.content || replyTo.media_type || "message"}</span>
          <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">×</button>
        </div>
      ) : null}
      {recording ? (
        <div className="chat-input">
          <span className="rec-dot" />
          <span className="grow">Recording {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span>
          <button type="button" className="pill ghost" onClick={() => stopRecording(true)}>Cancel</button>
          <button type="button" className="pill" onClick={() => stopRecording(false)}>Send</button>
        </div>
      ) : (
        <form className="chat-input" onSubmit={send}>
          <input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={pickFile} />
          <button type="button" className="icon-btn" onClick={() => fileInput.current?.click()} disabled={busy} aria-label="Attach photo or video">📎</button>
          <input value={text} onChange={(e) => onType(e.target.value)} placeholder="Say something…" maxLength={1000} />
          {text.trim() ? (
            <button className="pill" disabled={busy}>Send</button>
          ) : (
            <button type="button" className="icon-btn" onClick={startRecording} disabled={busy} aria-label="Record voice note">🎤</button>
          )}
        </form>
      )}
    </div>
  );
}

export default function ChatPage({ id }: { id: string }) {
  return (
    <AppShell title="Chat" back="/inbox">
      <Inner id={id} />
    </AppShell>
  );
}
