"use client";
/** One message in a Room chat. Click it for reactions, Reply, Copy and Delete. */
import { useRef, useState } from "react";
import Image from "next/image";
import { Lock } from "lucide-react";

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

export default function ChatBubble({ m, otherName, open, onToggle, onReact, onReply, onCopy, onDelete, onOpenOnce }: {
  m: Msg; otherName: string; open: boolean; onToggle: () => void;
  onReact: (m: Msg, emoji: string) => void; onReply: (m: Msg) => void; onCopy: (m: Msg) => void;
  onDelete: (m: Msg, forEveryone: boolean) => void; onOpenOnce: (m: Msg) => void;
}) {
  // Your own message asks: delete for you, or for everyone?
  const [asking, setAsking] = useState(false);
  const media = !m.deleted && !m.view_once && m.media_url ? m.media_type : null;

  return (
    <div className={`bubble${m.is_own ? " own" : ""}`} onClick={() => { if (!m.deleted) { setAsking(false); onToggle(); } }}>
      {m.reply_to && !m.deleted ? (
        <div className="reply-quote">{m.reply_to.is_own ? "You" : otherName}: {m.reply_to.preview || m.reply_to.media_type}</div>
      ) : null}
      {m.deleted ? <em>Message deleted</em> : null}
      {!m.deleted && m.view_once ? (
        m.is_own ? <em><Lock className="inl-ic" size={13} strokeWidth={2} aria-hidden /> View-once {m.media_type === "video" ? "video" : "photo"} · {m.opened ? "opened" : "not opened yet"}</em>
          : m.opened ? <em>Opened</em>
            : <button type="button" className="pill" onClick={(e) => { e.stopPropagation(); onOpenOnce(m); }}><Lock className="inl-ic" size={13} strokeWidth={2} aria-hidden /> Tap to open · view once</button>
      ) : null}
      {media === "image" ? <Image src={m.media_url!} alt="" width={400} height={400} style={{ height: "auto" }} sizes="80vw" /> : null}
      {media === "video" ? <video src={m.media_url!} controls preload="metadata" playsInline onClick={(e) => e.stopPropagation()} /> : null}
      {media === "voice" ? <VoiceNote src={m.media_url!} /> : null}
      {!m.deleted && m.content ? <span>{m.content}</span> : null}
      <small>{m.time_ago}{m.is_own && !m.deleted ? <span className={`mx-tick${m.seen ? " seen" : ""}`}> {m.seen ? "✓✓" : "✓"}</span> : null}</small>
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
