"use client";
import { useEffect, useRef, useState } from "react";
import { api, API_URL, COST, compact, getDeviceId, getToken, type Post, type Sound } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import VideoPlayer from "./VideoPlayer";
import { Bookmark, Comment, Heart, Share } from "./icons";
import { Link2, More, SoundOff, SoundOn } from "./feedicons";
import AudioWave from "./AudioWave";
import AmbientSound from "./AmbientSound";
import Sheet from "./Sheet";

type Props = {
  post: Post;
  index: number;
  active: boolean;
  near: boolean;
  muted: boolean;
  sounds?: Sound[];
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

function pickSound(sounds: Sound[] | undefined, post: Post): Sound | null {
  if (!sounds?.length) return null;
  const exact = sounds.filter((s) => s.mood === post.mood_tag);
  const pool = exact.length ? exact : sounds.filter((s) => s.mood === "any");
  return pool.length ? pool[hash(post.id) % pool.length] : null;
}

export default function Slide({
  post, index, active, near, muted, sounds, headline,
  onToggleMute, onGate, onShare, onPatch, onComments, onLinkUp, onReport, onToast,
}: Props) {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fullText, setFullText] = useState(false);
  const [burst, setBurst] = useState(0);
  const viewed = useRef(false);
  const lastTap = useRef(0);

  const mature = post.sensitivity === "mature" && !revealed;

  useEffect(() => {
    if (!active || viewed.current || mature) return;
    viewed.current = true;
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const device = getDeviceId();
    if (device) headers["X-Device-Id"] = device;
    fetch(`${API_URL}/drops/${post.id}/view`, { method: "POST", headers }).catch(() => {});
  }, [active, mature, post.id]);

  const slides = post.images && post.images.length > 1 ? post.images : null;
  const videoSrc = post.video_url;
  const audioSrc = post.audio_url;
  const singleImage = !slides && !videoSrc && post.media_type === "image" ? post.media_url : post.image_url;
  const hasMedia = Boolean(slides || videoSrc || singleImage);

  const Text = headline ? "h1" : "p";
  const textSlide = !hasMedia && !audioSrc;
  const ambient = textSlide && !mature ? pickSound(sounds, post) : null;
  const longText = post.content.length > 200;
  const mediaLong = post.content.length > 100;

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

  function mediaTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      setBurst((b) => b + 1);
      if (!post.is_liked) like();
    } else {
      lastTap.current = now;
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

  const canLinkUp = !post.is_admin_drop && !post.is_own_post && post.kind !== "confession";
  const voted = post.poll ? post.poll.voted_option !== null : false;

  return (
    <article
      className={`slide ${hasMedia ? "has-media" : `g${hash(post.id) % 6}`}${textSlide ? " text-slide" : ""}${audioSrc && !hasMedia ? " audio-slide" : ""}${canLinkUp ? " has-linkup" : ""}`}
      data-idx={index}
      data-post={post.id}
    >
      {hasMedia ? (
        <div className="media" onClick={mediaTap}>
          {burst ? <span key={burst} className="heart-burst" aria-hidden><Heart filled /></span> : null}
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
            />
          ) : singleImage ? (
            <img src={singleImage} alt={post.content.slice(0, 100)} loading={near ? "eager" : "lazy"} />
          ) : null}
        </div>
      ) : null}

      <div className={hasMedia ? "caption" : "text-body"} style={{ position: "relative", zIndex: 2 }}>
        {post.content ? (
          <Text
            className={`confession${hasMedia && !expanded ? " clamp" : ""}${textSlide && longText ? " clamp-text" : ""}`}
            onClick={hasMedia && mediaLong ? () => setExpanded((v) => !v) : undefined}
          >
            {post.content}
          </Text>
        ) : null}
        {hasMedia && mediaLong ? (
          <button type="button" className="more-btn" onClick={() => setExpanded((v) => !v)}>{expanded ? "less" : "more"}</button>
        ) : null}
        {!hasMedia && longText ? (
          <button className="read-full" onClick={() => setFullText(true)}>Read full confession</button>
        ) : null}

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

        {audioSrc && near && !mature ? (
          hasMedia ? <audio className="voice" controls preload="none" src={audioSrc} /> : <AudioWave src={audioSrc} seed={post.id} active={active} />
        ) : null}

        <div className="author">
          <span className="avatar" aria-hidden>{(post.anonymous_name || "A").charAt(0).toUpperCase()}</span>
          <div className="byline">
            <b>{post.anonymous_name || "Anonymous"}</b>
            {post.is_admin_drop ? <span className="official">Anonixx</span> : null}
            <time>{post.time_ago}{post.kind === "hookup" ? " · Hookup" : post.kind === "confession" ? " · Confession" : ""}</time>
          </div>
        </div>
      </div>

      {ambient && near ? <AmbientSound src={ambient.url} play={active && !muted} /> : null}

      <div className="rail">
        <span className="avatar big ring" aria-hidden>
          {post.avatar_url ? <img src={post.avatar_url} alt="" /> : (post.anonymous_name || "A").charAt(0).toUpperCase()}
        </span>
        <button onClick={like} aria-label="Like" className={post.is_liked ? "liked" : ""}>
          <Heart filled={Boolean(post.is_liked)} />{compact(post.likes_count)}
        </button>
        <button onClick={() => onComments(post)} aria-label="Comments">
          <Comment />{compact(post.thread_count)}
        </button>
        <button onClick={save} aria-label="Save" className={post.is_saved ? "liked" : ""}>
          <Bookmark filled={Boolean(post.is_saved)} />
        </button>
        <button onClick={() => onShare(post)} aria-label="Share">
          <Share />
        </button>
        {(videoSrc && !slides && !mature) || ambient ? (
          <button onClick={onToggleMute} aria-label={muted ? "Turn sound on" : "Mute"} className="sound-rail">
            {muted ? <SoundOff /> : <SoundOn />}
          </button>
        ) : null}
        {!post.is_admin_drop && !post.is_own_post ? (
          <button
            onClick={() => (user ? onReport(post) : onGate("Sign in to report a post."))}
            aria-label="More options"
          >
            <More />
          </button>
        ) : null}
      </div>

      {canLinkUp ? (
        <button
          className="linkup"
          onClick={() => (user ? onLinkUp(post) : onGate("Sign in to link up. Your name stays hidden until they say yes."))}
        >
          <Link2 />Link up<span className="coin-cost">{COST.linkUp}</span>
        </button>
      ) : null}

      {fullText ? (
        <Sheet onClose={() => setFullText(false)}>
          <p className="full-text">{post.content}</p>
        </Sheet>
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
