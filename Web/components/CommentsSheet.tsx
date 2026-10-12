"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { uploadFile } from "@/lib/upload";
import AudioWave from "./AudioWave";
import { ChevronDown, Reply, Smile, Close, Pin, ImageIcon, Mic, Gif, Send } from "./feedicons";

type Comment = {
  id: string;
  content: string;
  anonymous_name: string;
  time_ago: string;
  likes_count: number;
  liked_by_me: boolean;
  pinned: boolean;
  image_url?: string;
  gif_url?: string;
  voice_url?: string;
  voice_duration?: number;
  replies: Comment[];
};

const QUICK = ["🔥", "❤️", "😂", "😍", "😭", "👏", "💯", "😮"];
const EMOJI = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🥺", "😭", "😢", "😡", "😮", "😴", "🤔", "🙄",
  "🙈", "🙊", "🔥", "❤️", "💔", "💯", "👏", "🙏", "👍", "👎", "💀", "✨", "😈", "🥵", "🫣", "🌑",
];
const MAX_VOICE = 30;
const TENOR = process.env.NEXT_PUBLIC_TENOR_API_KEY;
type Media = { image_url?: string; gif_url?: string; voice_url?: string; voice_duration?: number };
type GifItem = { id: string; tiny: string; full: string };
const mmss = (s: number) => `0:${String(Math.floor(s)).padStart(2, "0")}`;
const MENTION = /@([A-Za-z0-9_.]{2,30})/g;

function Mentions({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MENTION.lastIndex = 0;
  while ((m = MENTION.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<span key={`${m.index}`} className="cmt-mention">@{m[1]}</span>);
    last = MENTION.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}

export default function CommentsSheet({
  postId,
  isOwner = false,
  onClose,
  onCount,
  onNeedAuth,
}: {
  postId: string;
  isOwner?: boolean;
  onClose: () => void;
  onCount: (n: number) => void;
  onNeedAuth: () => void;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sort, setSort] = useState<"new" | "top">("new");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gifOpen, setGifOpen] = useState(false);
  const [gifQ, setGifQ] = useState("");
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [rec, setRec] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recStream = useRef<MediaStream | null>(null);
  const recTimer = useRef(0);
  const recCancel = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ threads: Comment[]; thread_count: number }>(`/drops/${postId}/thread`);
      setItems(r.threads.map((c) => ({ ...c, replies: c.replies || [] })));
      onCount(r.thread_count);
    } catch (e) {
      setError((e as Error).message);
      setItems((l) => l ?? []);
    }
  }, [postId, onCount]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => {
    if (!items) return [];
    const base = sort === "top" ? [...items].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0)) : items;
    const pinned = base.filter((c) => c.pinned);
    return pinned.length ? [...pinned, ...base.filter((c) => !c.pinned)] : base;
  }, [items, sort]);

  const hotId = useMemo(() => {
    let max = 1;
    let id: string | null = null;
    (items || []).forEach((c) => { if ((c.likes_count || 0) > max) { max = c.likes_count; id = c.id; } });
    return id;
  }, [items]);
  const firstId = items && items.length ? items[items.length - 1].id : null;

  async function send(e?: React.FormEvent, media?: Media) {
    e?.preventDefault();
    if (!user) { onNeedAuth(); return; }
    const content = media ? "" : text.trim();
    if ((!content && !media) || (busy && !media)) return;
    const parent = replyTo;
    const temp: Comment = {
      id: `tmp-${Date.now()}`, content, anonymous_name: "You", time_ago: "just now",
      likes_count: 0, liked_by_me: false, pinned: false, replies: [], ...media,
    };
    setItems((l) => {
      const list = l || [];
      if (!parent) return [temp, ...list];
      return list.map((c) => (c.id === parent.id ? { ...c, replies: [...c.replies, temp] } : c));
    });
    if (parent) setOpen((o) => ({ ...o, [parent.id]: true }));
    const keep = text;
    if (!media) setText("");
    setReplyTo(null);
    setPicker(false);
    setGifOpen(false);
    setBusy(true);
    setError("");
    try {
      await api(`/drops/${postId}/thread`, { body: { content, parent_id: parent?.id, ...media } });
      await load();
    } catch (err) {
      setItems((l) =>
        (l || [])
          .filter((c) => c.id !== temp.id)
          .map((c) => ({ ...c, replies: c.replies.filter((r) => r.id !== temp.id) })),
      );
      if (!media) setText(keep);
      setReplyTo(parent);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!user) { onNeedAuth(); return; }
    setError("");
    setBusy(true);
    try {
      const url = await uploadFile(f, "image");
      await send(undefined, { image_url: url });
    } catch (x) {
      setError((x as Error).message);
      setBusy(false);
    }
  }

  const loadGifs = useCallback(async (q: string) => {
    if (!TENOR) return;
    setGifLoading(true);
    try {
      const kind = q ? "search" : "featured";
      const url = `https://tenor.googleapis.com/v2/${kind}?key=${TENOR}&client_key=anonixx&limit=24&media_filter=tinygif,gif${q ? `&q=${encodeURIComponent(q)}` : ""}`;
      const r = await fetch(url);
      const d = await r.json();
      const list: GifItem[] = (d.results || []).map((g: { id: string; media_formats: Record<string, { url: string }> }) => ({
        id: g.id,
        tiny: g.media_formats.tinygif?.url,
        full: g.media_formats.gif?.url || g.media_formats.tinygif?.url,
      }));
      setGifs(list.filter((g) => g.tiny));
    } catch {
      setGifs([]);
    }
    setGifLoading(false);
  }, []);

  useEffect(() => {
    if (!gifOpen) return;
    const t = setTimeout(() => loadGifs(gifQ.trim()), gifQ ? 350 : 0);
    return () => clearTimeout(t);
  }, [gifOpen, gifQ, loadGifs]);

  const stopStream = () => { recStream.current?.getTracks().forEach((t) => t.stop()); recStream.current = null; };
  useEffect(() => () => {
    window.clearInterval(recTimer.current);
    recCancel.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    stopStream();
  }, []);

  async function startRec() {
    if (!user) { onNeedAuth(); return; }
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Your browser can't record audio. Try Chrome, Edge or Safari.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStream.current = s;
      const r = new MediaRecorder(s);
      const chunks: BlobPart[] = [];
      const t0 = Date.now();
      r.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
      r.onstop = async () => {
        window.clearInterval(recTimer.current);
        stopStream();
        setRec(false);
        if (recCancel.current) { recCancel.current = false; return; }
        const secs = Math.max(1, Math.min(MAX_VOICE, Math.round((Date.now() - t0) / 1000)));
        setBusy(true);
        try {
          const url = await uploadFile(new Blob(chunks, { type: r.mimeType || "audio/webm" }), "voice");
          await send(undefined, { voice_url: url, voice_duration: secs });
        } catch (x) {
          setError((x as Error).message);
          setBusy(false);
        }
      };
      recorder.current = r;
      recCancel.current = false;
      setRecSecs(0);
      r.start();
      setRec(true);
      setPicker(false);
      setGifOpen(false);
      recTimer.current = window.setInterval(() => {
        const sec = (Date.now() - t0) / 1000;
        setRecSecs(sec);
        if (sec >= MAX_VOICE && r.state === "recording") r.stop();
      }, 200);
    } catch {
      setError("Microphone access is needed to send a voice note.");
    }
  }

  const stopRec = () => { if (recorder.current?.state === "recording") recorder.current.stop(); };
  const cancelRec = () => { recCancel.current = true; stopRec(); };

  async function like(c: Comment) {
    if (!user) { onNeedAuth(); return; }
    if (c.id.startsWith("tmp-")) return;
    const was = c.liked_by_me;
    const flip = (list: Comment[]): Comment[] =>
      list.map((x) =>
        x.id === c.id
          ? { ...x, liked_by_me: !x.liked_by_me, likes_count: Math.max(0, x.likes_count + (x.liked_by_me ? -1 : 1)) }
          : { ...x, replies: flip(x.replies) },
      );
    setItems((l) => (l ? flip(l) : l));
    try {
      await api(`/drops/${postId}/thread/${c.id}/like`, { method: was ? "DELETE" : "POST" });
    } catch {
      setItems((l) => (l ? flip(l) : l));
    }
  }

  async function pin(c: Comment) {
    try {
      await api(`/drops/${postId}/thread/${c.id}/pin`, { method: c.pinned ? "DELETE" : "POST" });
      setItems((l) => (l || []).map((x) => ({ ...x, pinned: c.pinned ? (x.id === c.id ? false : x.pinned) : x.id === c.id })));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const row = (c: Comment, depth = 0) => {
    const expanded = open[c.id];
    return (
      <div key={c.id} className={`cmt${depth ? " nested" : ""}`}>
        <div className="cmt-head">
          <b>{c.anonymous_name || "Anonymous"}</b>
          {c.pinned ? <span className="cmt-badge pinned"><Pin />pinned</span> : null}
          {depth === 0 && c.id === firstId && c.id !== hotId ? <span className="cmt-badge first">first 🎯</span> : null}
          {depth === 0 && c.id === hotId ? <span className="cmt-badge hot">🔥 hot</span> : null}
        </div>
        {c.content ? <div className="cmt-body"><Mentions text={c.content} /></div> : null}
        {c.voice_url ? <div className="cmt-voice"><AudioWave src={c.voice_url} seed={c.id} active /></div> : null}
        {c.image_url || c.gif_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="cmt-img" src={c.image_url || c.gif_url} alt="" loading="lazy" />
        ) : null}
        <div className="cmt-actions">
          <span className="cmt-time">{c.time_ago || "just now"}</span>
          {depth === 0 ? (
            <button onClick={() => { if (!user) onNeedAuth(); else setReplyTo(replyTo?.id === c.id ? null : c); }}>
              {replyTo?.id === c.id ? "Cancel" : "Reply"}
            </button>
          ) : null}
          {depth === 0 && isOwner && !c.id.startsWith("tmp-") ? (
            <button className={c.pinned ? "on" : ""} onClick={() => pin(c)}>{c.pinned ? "Unpin" : "Pin"}</button>
          ) : null}
          <button className={`cmt-like${c.liked_by_me ? " on" : ""}`} onClick={() => like(c)} aria-label="Like comment">
            {c.liked_by_me ? "♥" : "♡"} {c.likes_count || ""}
          </button>
        </div>
        {depth === 0 && c.replies.length > 0 ? (
          <button className="cmt-toggle" onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}>
            {expanded ? "Hide replies" : `View ${c.replies.length} ${c.replies.length === 1 ? "reply" : "replies"}`}
          </button>
        ) : null}
        {depth === 0 && expanded ? c.replies.map((r) => row(r, 1)) : null}
      </div>
    );
  };

  const count = items?.length ?? 0;
  const addEmoji = (e: string) => setText((t) => (t + e).slice(0, 500));

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet tall cmt-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <span className="sheet-handle" aria-hidden />
        <div className="cmt-top">
          <span />
          <h3>{count} {count === 1 ? "drop" : "drops"}</h3>
          <button onClick={onClose} aria-label="Close"><ChevronDown /></button>
        </div>
        <div className="cmt-sort">
          <button className={sort === "new" ? "on" : ""} onClick={() => setSort("new")}>Newest</button>
          <button className={sort === "top" ? "on" : ""} onClick={() => setSort("top")}>Top</button>
        </div>

        <div className="cmt-list">
          {items === null ? <p className="muted center">Loading…</p> : null}
          {items && sorted.length === 0 ? (
            <div className="cmt-empty">
              <span>🌑</span>
              <b>dead silence.</b>
              <p>no one has been brave enough yet.<br />break the silence.</p>
            </div>
          ) : null}
          {sorted.map((c) => row(c))}
        </div>

        <form className="cmt-form" onSubmit={send}>
          {replyTo ? (
            <div className="replying">
              <Reply />
              <span>Replying to <b>{replyTo.anonymous_name || "Anonymous"}</b></span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><Close /></button>
            </div>
          ) : null}
          {picker ? (
            <div className="emoji-grid">
              {EMOJI.map((e) => <button type="button" key={e} onClick={() => addEmoji(e)}>{e}</button>)}
            </div>
          ) : (
            <div className="quick-react">
              {QUICK.map((e) => <button type="button" key={e} onClick={() => addEmoji(e)}>{e}</button>)}
            </div>
          )}
          {gifOpen && TENOR ? (
            <div className="gif-pop">
              <input value={gifQ} onChange={(e) => setGifQ(e.target.value)} placeholder="Search GIFs" aria-label="Search GIFs" />
              <div className="gif-grid">
                {gifLoading && gifs.length === 0 ? <p className="muted center">Loading…</p> : null}
                {!gifLoading && gifs.length === 0 ? <p className="muted center">No GIFs found.</p> : null}
                {gifs.map((g) => (
                  <button type="button" key={g.id} onClick={() => send(undefined, { gif_url: g.full })}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.tiny} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
              <small className="gif-by">via Tenor</small>
            </div>
          ) : null}
          {rec ? (
            <div className="cmt-input cmt-rec">
              <button type="button" className="emoji-toggle" onClick={cancelRec} aria-label="Cancel recording"><Close /></button>
              <span className="rec-dot" aria-hidden />
              <span className="rec-time">{mmss(recSecs)} <small>/ {mmss(MAX_VOICE)}</small></span>
              <button type="button" className="pill" onClick={stopRec}>Send</button>
            </div>
          ) : (
            <div className="cmt-input">
              <button type="button" className={`emoji-toggle${picker ? " on" : ""}`} onClick={() => { setPicker((p) => !p); setGifOpen(false); }} aria-label="Emoji"><Smile /></button>
              <button type="button" className="emoji-toggle" onClick={() => { if (!user) onNeedAuth(); else fileRef.current?.click(); }} disabled={busy} aria-label="Add a photo"><ImageIcon /></button>
              {TENOR ? <button type="button" className={`emoji-toggle${gifOpen ? " on" : ""}`} onClick={() => { setGifOpen((g) => !g); setPicker(false); }} aria-label="Add a GIF"><Gif /></button> : null}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
              <input
                value={text}
                maxLength={500}
                onChange={(e) => setText(e.target.value)}
                placeholder={!user ? "sign in. no one will know it's you." : replyTo ? "say whats really weighs you down" : "No one knows it's you"}
                onFocus={() => { if (!user) onNeedAuth(); }}
              />
              {text.trim() ? (
                <button className="pill" disabled={busy}><Send />Post</button>
              ) : (
                <button type="button" className="pill mic" onClick={startRec} disabled={busy} aria-label="Record a voice note"><Mic /></button>
              )}
            </div>
          )}
          {error ? <div className="err">{error}</div> : null}
        </form>
      </div>
    </div>
  );
}
