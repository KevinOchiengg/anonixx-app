"use client";
import { useEffect, useRef, useState } from "react";
import { api, compact, type Post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import VideoPlayer from "./VideoPlayer";
import { Bookmark, Comment, Heart, More, Share } from "./icons";

type Props = {
  post: Post;
  index: number;
  active: boolean;
  near: boolean;
  muted: boolean;
  headline?: boolean;
  onToggleMute: () => void;
  onGate: (message: string) => void;
  onShare: (post: Post) => void;
  onPatch: (id: string, patch: Partial<Post>) => void;
  onComments: (post: Post) => void;
  onLinkUp: (post: Post) => void;
  onReport: (post: Post) => void;
  onToast: (msg: string) => void;
};

function hash(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export default function Slide({
  post, index, active, near, muted, headline,
  onToggleMute, onGate, onShare, onPatch, onComments, onLinkUp, onReport, onToast,
}: Props) {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const viewed = useRef(false);

  const mature = post.sensitivity === "mature" && !revealed;

  useEffect(() => {
    if (!active || !user || viewed.current || mature) return;
    viewed.current = true;
    api(`/drops/${post.id}/view`, { method: "POST" }).catch(() => {});
  }, [active, user, mature, post.id]);

  const slides = post.images && post.images.length > 1 ? post.images : null;
  const videoSrc = post.video_url;
  const audioSrc = post.audio_url;
  const singleImage = !slides && !videoSrc && post.media_type === "image" ? post.media_url : post.image_url;
  const hasMedia = Boolean(slides || videoSrc || singleImage);

  const Text = headline ? "h1" : "p";

  async function like() {
    if (!user) return onGate("Sign in to like it. They'll never know it was you.");
    const was = Boolean(post.is_liked);
    onPatch(post.id, { is_liked: !was, likes_count: Math.max(0, post.likes_count + (was ? -1 : 1)) });
    try {
      await api(`/drops/${post.id}/like`, { method: was ? "DELETE" : "POST" });
    } catch (e) {
      onPatch(post.id, { is_liked: was, likes_count: post.likes_count });
      onToast((e as Error).message);
    }
  }

  async function save() {
    if (!user) return onGate("Sign in to save it for later.");
    const was = Boolean(post.is_saved);
    onPatch(post.id, { is_saved: !was });
    try {
      await api(`/drops/${post.id}/save`, { method: "POST" });
      onToast(was ? "Removed from saved" : "Saved");
    } catch (e) {
      onPatch(post.id, { is_saved: was });
      onToast((e as Error).message);
    }
  }

  async function vote(i: number) {
    if (!user) return onGate("Sign in to vote. Your pick stays anonymous.");
    if (!post.poll || post.poll.voted_option !== null) return;
    try {
      const r = await api<{
        voted_option: number;
        total_votes: number;
        options: { text: string; votes: number; percent: number }[];
      }>(`/drops/${post.id}/vote`, { body: { option_index: i } });
      onPatch(post.id, { poll: { ...post.poll, options: r.options, total_votes: r.total_votes, voted_option: r.voted_option } });
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  const voted = post.poll ? post.poll.voted_option !== null : false;

  return (
    <article
      className={`slide ${hasMedia ? "has-media" : `g${hash(post.id) % 6}`}`}
      data-idx={index}
      data-post={post.id}
    >
      {hasMedia ? (
        <div className="media">
          {slides ? (
            <>
              <div
                className="carousel"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  setPage(Math.round(el.scrollLeft / el.clientWidth));
                }}
              >
                {slides.map((src, i) => (
                  <div key={src}>
                    <img src={src} alt={i === 0 ? post.content.slice(0, 100) : ""} loading={near ? "eager" : "lazy"} />
                  </div>
                ))}
              </div>
              <div className="dots">
                {slides.map((s, i) => <i key={s} className={i === page ? "on" : ""} />)}
              </div>
            </>
          ) : videoSrc ? (
            <VideoPlayer
              src={videoSrc}
              poster={post.card_image_url}
              active={active && !mature}
              near={near}
              muted={muted}
              onToggleMute={onToggleMute}
            />
          ) : singleImage ? (
            <img src={singleImage} alt={post.content.slice(0, 100)} loading={near ? "eager" : "lazy"} />
          ) : null}
        </div>
      ) : null}

      <div className={hasMedia ? "caption" : undefined} style={{ position: "relative", zIndex: 2 }}>
        {post.mood_tag ? <span className="mood">{post.mood_tag}</span> : null}
        {post.content ? <Text className="confession">{post.content}</Text> : null}

        {post.poll ? (
          <div className="poll">
            {post.poll.question ? <div className="poll-q">{post.poll.question}</div> : null}
            {post.poll.options.map((o, i) => (
              <button
                key={i}
                className={post.poll!.voted_option === i ? "picked" : ""}
                disabled={voted}
                onClick={() => vote(i)}
                style={voted ? ({ "--pct": `${o.percent ?? 0}%` } as React.CSSProperties) : undefined}
              >
                <span>{o.text}</span>
                {voted ? <em>{o.percent ?? 0}%</em> : null}
              </button>
            ))}
          </div>
        ) : null}

        {audioSrc && near && !mature ? <audio className="voice" controls preload="none" src={audioSrc} /> : null}

        <div className="byline">
          <b>{post.anonymous_name || "Anonymous"}</b>
          {post.is_admin_drop ? <span className="official">Anonixx</span> : null}
          {" · "}{post.time_ago}
        </div>
      </div>

      <div className="rail">
        <button onClick={like} aria-label="Like" className={post.is_liked ? "liked" : ""}>
          <Heart filled={Boolean(post.is_liked)} />{compact(post.likes_count)}
        </button>
        <button onClick={() => onComments(post)} aria-label="Comments">
          <Comment />{compact(post.thread_count)}
        </button>
        <button onClick={save} aria-label="Save" className={post.is_saved ? "liked" : ""}>
          <Bookmark filled={Boolean(post.is_saved)} />Save
        </button>
        <button onClick={() => onShare(post)} aria-label="Share">
          <Share />Share
        </button>
        {!post.is_admin_drop && !post.is_own_post ? (
          <button
            onClick={() => (user ? onReport(post) : onGate("Sign in to report a post."))}
            aria-label="Report"
          >
            <More />
          </button>
        ) : null}
      </div>

      {!post.is_admin_drop && !post.is_own_post ? (
        <button
          className="linkup"
          onClick={() => (user ? onLinkUp(post) : onGate("Sign in to link up. Your name stays hidden until they say yes."))}
        >
          Link up
        </button>
      ) : null}

      {mature ? (
        <button className="mature-veil" onClick={() => setRevealed(true)}>
          <strong>Mature content</strong>
          <span>Adults only. Tap to view.</span>
        </button>
      ) : null}
    </article>
  );
}
