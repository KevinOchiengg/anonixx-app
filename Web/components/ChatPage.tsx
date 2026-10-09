"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { uploadFile, type UploadKind } from "@/lib/upload";
import AppShell from "./AppShell";
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
type Conn = { other_anonymous_name: string; other_user_id?: string; other_is_online: boolean; confession: string };

function Inner({ id }: { id: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [conn, setConn] = useState<Conn | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
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

  const load = useCallback(async () => {
    try {
      const r = await api<{ messages: Msg[]; connection: Conn }>(`/drops/connections/${id}/messages`);
      setMsgs(r.messages);
      setConn(r.connection);
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
    if (msgs.length !== lastCount.current) {
      lastCount.current = msgs.length;
      bottom.current?.scrollIntoView({ block: "end" });
    }
  }, [msgs]);

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

  return (
    <div className="chat">
      <div className="chat-head">
        <b>{conn?.other_anonymous_name || "…"}</b>
        <small>{conn?.other_is_online ? "online" : ""}</small>
        {conn?.other_user_id ? (
          <button className="kebab" onClick={() => setMenu((m) => !m)} aria-label="More">⋯</button>
        ) : null}
        {menu ? (
          <div className="menu">
            <button onClick={report}>Report</button>
            <button onClick={block}>Block</button>
          </div>
        ) : null}
      </div>
      {conn?.confession ? <div className="chat-origin">“{conn.confession}”</div> : null}
      <div className="chat-log">
        {msgs.map((m) => (
          <div key={m.id} className={`bubble${m.is_own ? " own" : ""}`} onClick={() => !m.deleted && setSel(sel === m.id ? null : m.id)}>
            {m.reply_to && !m.deleted ? (
              <div className="reply-quote">{m.reply_to.is_own ? "You" : "Them"}: {m.reply_to.preview || m.reply_to.media_type}</div>
            ) : null}
            {m.deleted ? <em>Message deleted</em> : null}
            {!m.deleted && m.media_type === "image" && m.media_url ? <img src={m.media_url} alt="" loading="lazy" /> : null}
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
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something…" maxLength={1000} />
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
