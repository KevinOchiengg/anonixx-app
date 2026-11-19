"use client";
/** One message in a Room chat. Click it for reactions, Reply, Copy and Delete; swipe it right to reply. */
import { useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import BrandVideo from "./BrandVideo";
import { Check, CheckCheck, Lock, Play, Reply, X } from "lucide-react";

export type Msg = {
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
};

export const REACTIONS = ["🔥", "😈", "💋", "🥵", "😂", "🖤"];

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

export default function ChatBubble({ m, otherName, open, end = true, fresh = false, onToggle, onReact, onReply, onCopy, onDelete, onOpenOnce }: {
  m: Msg; otherName: string; open: boolean; end?: boolean; fresh?: boolean; onToggle: () => void;
  onReact: (m: Msg, emoji: string) => void; onReply: (m: Msg) => void; onCopy: (m: Msg) => void;
  onDelete: (m: Msg, forEveryone: boolean) => void; onOpenOnce: (m: Msg) => void;
}) {
  // Your own message asks: delete for you, or for everyone?
  const [asking, setAsking] = useState(false);
  // Photos and videos show as a small frame; tap opens them full screen.
  const [viewing, setViewing] = useState(false);
  // Swipe right to reply, like WhatsApp: past REPLY_AT it snaps back and opens the reply.
  const drag = useRef<{ x: number; y: number; on: boolean } | null>(null);
  const swiped = useRef(false);
  const [dx, setDx] = useState(0);
  const REPLY_AT = 56;
  const swipe = m.deleted ? {} : {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag.current = { x: e.clientX, y: e.clientY, on: false };
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      const mx = e.clientX - d.x, my = e.clientY - d.y;
      if (!d.on) {
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { drag.current = null; return; }
        if (mx > 10) { d.on = true; e.currentTarget.setPointerCapture(e.pointerId); }
        else return;
      }
      setDx(Math.max(0, Math.min(90, mx)));
    },
    onPointerUp: () => {
      if (drag.current?.on) {
        swiped.current = true;
        window.setTimeout(() => { swiped.current = false; }, 0);   // only the click right after the swipe is skipped
        if (dx >= REPLY_AT) { onReply(m); navigator.vibrate?.(10); }
      }
      drag.current = null;
      setDx(0);
    },
    onPointerCancel: () => { drag.current = null; setDx(0); },
  };
  const media = !m.deleted && !m.view_once && m.media_url ? m.media_type : null;

  return (
    <div
      className={`bubble${m.is_own ? " own" : ""}${end ? " end" : ""}${fresh ? " fresh" : ""}${media === "image" || media === "video" ? " media" : ""}${dx ? " dragging" : ""}`}
      style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      {...swipe}
      onClick={() => { if (swiped.current) { swiped.current = false; return; } if (!m.deleted) { setAsking(false); onToggle(); } }}
    >
      {dx ? <span className="b-swipe" style={{ opacity: Math.min(1, dx / REPLY_AT), transform: `scale(${dx >= REPLY_AT ? 1.15 : 0.8 + (dx / REPLY_AT) * 0.2})` }} aria-hidden><Reply size={16} strokeWidth={2} /></span> : null}
      {m.reply_to && !m.deleted ? (
        <div className="reply-quote">{m.reply_to.is_own ? "You" : otherName}: {m.reply_to.preview || m.reply_to.media_type}</div>
      ) : null}
      {m.deleted ? <em>Message deleted</em> : null}
      {!m.deleted && m.view_once ? (
        m.is_own ? <em><Lock className="inl-ic" size={13} strokeWidth={2} aria-hidden /> View-once {m.media_type === "video" ? "video" : "photo"} · {m.opened ? "opened" : "not opened yet"}</em>
          : m.opened ? <em>Opened</em>
            : <button type="button" className="pill" onClick={(e) => { e.stopPropagation(); onOpenOnce(m); }}><Lock className="inl-ic" size={13} strokeWidth={2} aria-hidden /> Tap to open · view once</button>
      ) : null}
      {media === "image" || media === "video" ? (
        <button type="button" className="b-thumb" aria-label={media === "video" ? "Play video" : "View photo"} onClick={(e) => { e.stopPropagation(); setViewing(true); }}>
          {media === "image"
            ? <Image src={m.media_url!} alt="" width={240} height={300} sizes="240px" />
            : <><video src={`${m.media_url!}#t=0.1`} preload="metadata" muted playsInline /><span className="b-play"><Play size={22} fill="currentColor" strokeWidth={2} aria-hidden /></span></>}
        </button>
      ) : null}
      {viewing && media ? createPortal(
        <div className="b-viewer" role="dialog" aria-label={media === "video" ? "Video" : "Photo"} onClick={(e) => { e.stopPropagation(); setViewing(false); }}>
          <button type="button" className="b-viewer-x" aria-label="Close" onClick={(e) => { e.stopPropagation(); setViewing(false); }}><X size={22} strokeWidth={2} aria-hidden /></button>
          {media === "video"
            ? <BrandVideo src={m.media_url!} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={m.media_url!} alt="" onClick={(e) => e.stopPropagation()} />}
        </div>
      , document.body) : null}
      {media === "voice" ? <VoiceNote src={m.media_url!} /> : null}
      {!m.deleted && m.content ? <span>{m.content}</span> : null}
      <small className="b-meta">{m.time_ago}{m.is_own && !m.deleted ? (m.seen ? <CheckCheck className="b-tick seen" size={14} strokeWidth={2.4} aria-label="Seen" /> : <Check className="b-tick" size={14} strokeWidth={2.4} aria-label="Sent" />) : null}</small>
      {m.reactions?.length ? (
        <div className="msg-reactions" onClick={(e) => e.stopPropagation()}>
          {m.reactions.map((r) => (
            <button key={r.emoji} className={r.mine ? "mine" : ""} onClick={() => onReact(m, r.emoji)}>{r.emoji}{r.count > 1 ? ` ${r.count}` : ""}</button>
          ))}
        </div>
      ) : null}
      {open ? (
        <div className="msg-actions" onClick={(e) => e.stopPropagation()}>
          {asking ? (
            <>
              <button onClick={() => onDelete(m, false)}>Delete for me</button>
              <button className="danger" onClick={() => onDelete(m, true)}>Delete for everyone</button>
              <button onClick={() => setAsking(false)}>Cancel</button>
            </>
          ) : (
            <>
              {REACTIONS.map((e) => <button key={e} onClick={() => onReact(m, e)}>{e}</button>)}
              <button onClick={() => onReply(m)}>Reply</button>
              {m.content ? <button onClick={() => onCopy(m)}>Copy</button> : null}
              <button className="danger" onClick={() => (m.is_own ? setAsking(true) : onDelete(m, false))}>Delete</button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
