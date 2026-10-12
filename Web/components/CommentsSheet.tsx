"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ChevronDown, Reply, Smile, Close, Pin } from "./feedicons";

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
  replies: Comment[];
};

const QUICK = ["🔥", "❤️", "😂", "😍", "😭", "👏", "💯", "😮"];
const EMOJI = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🥺", "😭", "😢", "😡", "😮", "😴", "🤔", "🙄",
  "🙈", "🙊", "🔥", "❤️", "💔", "💯", "👏", "🙏", "👍", "👎", "💀", "✨", "😈", "🥵", "🫣", "🌑",
];
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

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!user) { onNeedAuth(); return; }
    const content = text.trim();
    if (!content || busy) return;
    const parent = replyTo;
    const temp: Comment = {
      id: `tmp-${Date.now()}`, content, anonymous_name: "You", time_ago: "just now",
      likes_count: 0, liked_by_me: false, pinned: false, replies: [],
    };
    setItems((l) => {
      const list = l || [];
      if (!parent) return [temp, ...list];
      return list.map((c) => (c.id === parent.id ? { ...c, replies: [...c.replies, temp] } : c));
    });
    if (parent) setOpen((o) => ({ ...o, [parent.id]: true }));
    setText("");
    setReplyTo(null);
    setPicker(false);
    setBusy(true);
    setError("");
    try {
      await api(`/drops/${postId}/thread`, { body: { content, parent_id: parent?.id } });
      await load();
    } catch (err) {
      setItems((l) =>
        (l || [])
          .filter((c) => c.id !== temp.id)
          .map((c) => ({ ...c, replies: c.replies.filter((r) => r.id !== temp.id) })),
      );
      setText(content);
      setReplyTo(parent);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
          <div className="cmt-input">
            <button type="button" className={`emoji-toggle${picker ? " on" : ""}`} onClick={() => setPicker((p) => !p)} aria-label="Emoji"><Smile /></button>
            <input
              value={text}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
              placeholder={!user ? "sign in. no one will know it's you." : replyTo ? "say whats really weighs you down" : "No one knows it's you"}
              onFocus={() => { if (!user) onNeedAuth(); }}
            />
            <button className="pill" disabled={busy || !text.trim()}>Post</button>
          </div>
          {error ? <div className="err">{error}</div> : null}
        </form>
      </div>
    </div>
  );
}
