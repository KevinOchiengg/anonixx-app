"use client";
/** One message in a Room chat. Click it for reactions, Reply, Copy and Delete; swipe it right to reply, left to delete. */
import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import BrandVideo from "./BrandVideo";
import { Check, CheckCheck, Lock, Pause, Play, Reply, Trash2, X } from "lucide-react";

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

// A voice note: coral play button, coral bars that fill as it plays and ripple around the
// playhead, time, and a 1x / 1.5x / 2x control. Bar heights are seeded from the URL.
// Shaped like a real recording: a few loud bursts that fade out, quiet chatter in between,
// mirrored around the middle; the colour flows pink → coral → amber → gold → coral → pink.
const VN_BARS = 46;
const VN_STOPS = ["#e8456e", "#ff634a", "#ff9376", "#f0a868", "#ffc93c", "#ff634a", "#e8456e"];
function vnHeights(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rnd = () => { h = (h * 1103515245 + 12345) >>> 0; return ((h >>> 8) % 1000) / 1000; };
  const bursts = Array.from({ length: 3 + Math.floor(rnd() * 2) }, () => ({ at: Math.floor(rnd() * VN_BARS), amp: 0.55 + rnd() * 0.45 }));
  return Array.from({ length: VN_BARS }, (_, i) => {
    const peak = Math.max(...bursts.map((b) => (i >= b.at ? b.amp * Math.exp(-(i - b.at) / 3.2) : b.amp * Math.exp(-(b.at - i) / 0.9))));
    return Math.min(1, Math.max(0.1, 0.12 + rnd() * 0.16 + peak * (0.7 + rnd() * 0.3)));
  });
}
function vnColor(i: number) {
  const x = (i / (VN_BARS - 1)) * (VN_STOPS.length - 1);
  const k = Math.min(VN_STOPS.length - 2, Math.floor(x));
  const f = x - k;
  const a = VN_STOPS[k], b = VN_STOPS[k + 1];
  const mix = (o: number) => Math.round(parseInt(a.slice(o, o + 2), 16) * (1 - f) + parseInt(b.slice(o, o + 2), 16) * f);
  return `rgb(${mix(1)}, ${mix(3)}, ${mix(5)})`;
}
const vnTime = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

function VoiceNote({ src, seconds }: { src: string; seconds?: number | null }) {
  const el = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(seconds || 0);
  const heights = useMemo(() => vnHeights(src), [src]);
  const next = () => {
    const r = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(r);
    if (el.current) el.current.playbackRate = r;
  };
  const toggle = () => {
    const a = el.current;
    if (!a) return;
    if (a.paused) { document.querySelectorAll("audio").forEach((o) => { if (o !== a) o.pause(); }); a.playbackRate = rate; a.play().catch(() => {}); }
    else a.pause();
  };
  const seek = (e: React.MouseEvent<HTMLSpanElement>) => {
    const a = el.current;
    if (!a || !dur) return;
    const box = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(dur, ((e.clientX - box.left) / box.width) * dur));
  };
  const head = dur ? Math.round((t / dur) * (VN_BARS - 1)) : -1;
  return (
    <span className={`vn${playing ? " playing" : ""}`} onClick={(e) => e.stopPropagation()}>
      <audio ref={el} src={src} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setT(0); }}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration); }} />
      <button type="button" className="vn-play" onClick={toggle} aria-label={playing ? "Pause voice note" : "Play voice note"}>
        {playing ? <Pause size={14} fill="currentColor" strokeWidth={0} aria-hidden /> : <Play size={14} fill="currentColor" strokeWidth={0} aria-hidden />}
      </button>
      <span className="vn-bars" onClick={seek} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)}>
        {heights.map((h, i) => {
          const near = playing && Math.abs(i - head) <= 4;
          return <i key={i} className={`${i <= head && (playing || t > 0) ? "lit" : ""}${near ? " wave" : ""}`}
            style={{ height: `${h * 100}%`, ["--c" as string]: vnColor(i), ...(near ? { animationDelay: `${(i % 4) * -0.22}s`, ["--lift" as string]: String(1 + (1 - Math.abs(i - head) / 5) * 0.6) } : {}) }} />;
        })}
      </span>
      <small className="vn-time">{vnTime(playing || t > 0 ? t : dur)}</small>
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
  // Swipe right to reply (like WhatsApp), left to delete: past REPLY_AT it snaps back and acts.
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
        if (Math.abs(mx) > 10) { d.on = true; e.currentTarget.setPointerCapture(e.pointerId); }
        else return;
      }
      setDx(Math.max(-90, Math.min(90, mx)));
    },
    onPointerUp: () => {
      if (drag.current?.on) {
        swiped.current = true;
        window.setTimeout(() => { swiped.current = false; }, 0);   // only the click right after the swipe is skipped
        if (dx >= REPLY_AT) { onReply(m); navigator.vibrate?.(10); }
        else if (dx <= -REPLY_AT) { setAsking(true); if (!open) onToggle(); navigator.vibrate?.(10); }
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
      {dx ? (
        <span className={`b-swipe${dx < 0 ? " del" : ""}`} aria-hidden
          style={{ opacity: Math.min(1, Math.abs(dx) / REPLY_AT), transform: `scale(${Math.abs(dx) >= REPLY_AT ? 1.15 : 0.8 + (Math.abs(dx) / REPLY_AT) * 0.2})` }}>
          {dx > 0 ? <Reply size={16} strokeWidth={2} /> : <Trash2 size={16} strokeWidth={2} />}
        </span>
      ) : null}
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
      {media === "voice" ? <VoiceNote src={m.media_url!} seconds={m.duration_seconds} /> : null}
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
              {m.is_own ? <button className="danger" onClick={() => onDelete(m, true)}>Delete for everyone</button> : null}
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
