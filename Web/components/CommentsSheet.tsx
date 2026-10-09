"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Sheet from "./Sheet";

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

export default function CommentsSheet({
  postId,
  onClose,
  onCount,
  onNeedAuth,
}: {
  postId: string;
  onClose: () => void;
  onCount: (n: number) => void;
  onNeedAuth: () => void;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api<{ threads: Comment[]; thread_count: number }>(`/drops/${postId}/thread`);
      setItems(r.threads);
      onCount(r.thread_count);
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
  }, [postId, onCount]);

  useEffect(() => { load(); }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { onNeedAuth(); return; }
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    setError("");
    try {
      await api(`/drops/${postId}/thread`, { body: { content, parent_id: replyTo?.id } });
      setText("");
      setReplyTo(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function like(c: Comment) {
    if (!user) { onNeedAuth(); return; }
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

  const row = (c: Comment, nested = false) => (
    <div key={c.id} className={`cmt${nested ? " nested" : ""}`}>
      <div className="cmt-head">
        <b>{c.anonymous_name}</b>
        {c.pinned ? <span className="official">Pinned</span> : null}
        <span className="muted"> · {c.time_ago}</span>
      </div>
      {c.content ? <div className="cmt-body">{c.content}</div> : null}
      {c.image_url || c.gif_url ? <img className="cmt-img" src={c.image_url || c.gif_url} alt="" loading="lazy" /> : null}
      <div className="cmt-actions">
        <button onClick={() => like(c)} className={c.liked_by_me ? "on" : ""}>♥ {c.likes_count || ""}</button>
        {!nested ? <button onClick={() => { if (!user) onNeedAuth(); else setReplyTo(c); }}>Reply</button> : null}
      </div>
      {c.replies.map((r) => row(r, true))}
    </div>
  );

  return (
    <Sheet title="Comments" onClose={onClose} tall>
      <div className="cmt-list">
        {items === null ? <p className="muted">Loading…</p> : null}
        {items && items.length === 0 ? <p className="muted">Nobody has said anything yet. Be first.</p> : null}
        {items?.map((c) => row(c))}
      </div>
      <form className="cmt-form" onSubmit={send}>
        {replyTo ? (
          <div className="replying">
            Replying to {replyTo.anonymous_name}{" "}
            <button type="button" onClick={() => setReplyTo(null)}>✕</button>
          </div>
        ) : null}
        <div className="cmt-input">
          <input
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
            placeholder={user ? "Say something. Stay hidden." : "Sign in to comment"}
            onFocus={() => { if (!user) onNeedAuth(); }}
          />
          <button className="pill" disabled={busy || !text.trim()}>Post</button>
        </div>
        {error ? <div className="err">{error}</div> : null}
      </form>
    </Sheet>
  );
}
