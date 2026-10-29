"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { splitHook } from "@/lib/captionHook";
import Image from "next/image";
import { api, API_URL, COST, compact, getDeviceId, getToken, type Post, type Sound } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FRESH_LABEL, hookupTags, timeLeft } from "@/lib/linkup";
import { allowMature, useMatureOk } from "@/lib/matureConsent";
import VideoPlayer, { TAP_GAP } from "./VideoPlayer";
import FitImage from "./FitImage";
import { Bookmark, Comment, Heart, Share } from "./icons";
import { Flag, Link2, SoundOff } from "./feedicons";
import AudioWave from "./AudioWave";
import AmbientSound from "./AmbientSound";
import Sheet from "./Sheet";
import { DROP_FONTS_HREF, dropFontStyle } from "@/lib/dropFonts";

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
  onProfile: (post: Post) => void;
  onReport: (post: Post) => void;
  onToast: (msg: string) => void;
};

const CAPTION_LINES = 2;

// Cuts text to `len` characters, ending on a whole word when one is close and
// dropping trailing punctuation (an "…" follows).
function wordCut(text: string, len: number) {
  let cut = len;
  const space = text.lastIndexOf(" ", len);
  if (space > len - 14 && space > 0) cut = space;
  return text.slice(0, cut).trimEnd().replace(/[\s.,;:!?-]+$/, "");
}

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


const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP = 10;

export default function Slide({
  post, index, active, near, muted, sounds, headline,
  onToggleMute, onGate, onShare, onPatch, onComments, onLinkUp, onProfile, onReport, onToast,
}: Props) {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  // One tap opens every mature post on this device; verified adults never see the veil.
  const matureOk = useMatureOk();
  const [expanded, setExpanded] = useState(false);
  const [fullText, setFullText] = useState(false);
  const [burst, setBurst] = useState<{ id: number; x: number; y: number; rot: number } | null>(null);
  const viewed = useRef(false);
  const lastTap = useRef(0);
  // Long-press anywhere on the post opens its menu (report / block, and 2x on videos).
  // There's no ⋯ button: fewer icons on the rail.
  const [menu, setMenu] = useState(false);
  const [speed, setSpeed] = useState(1);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const pressed = useRef(false);

  const mature = post.sensitivity === "mature" && !matureOk && !user?.age_verified;

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
  // A track picked in the Post Studio wins; text slides otherwise get one by mood.
  const chosen = post.sound && !audioSrc && !mature ? post.sound : null;
  const ambient = chosen || (textSlide && !mature ? pickSound(sounds, post) : null);
  const muteClip = Boolean(chosen?.mute_original);
  // Caption: a serif hook (up to two lines), then two lines ending in an inline "… more".
  // What fits is measured from a hidden copy before paint.
  const textRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLParagraphElement>(null);
  const parts = useMemo(() => (hasMedia ? splitHook(post.content) : null), [hasMedia, post.content]);
  type Cut = { hook: string; rest: string };
  const hookClass = parts?.inline ? "cap-hook inline" : "cap-hook";
  const [short, setShort] = useState<Cut | null | undefined>(undefined);  // undefined = not measured yet, null = fits
  const fitCaption = useCallback(() => {
    const el = textRef.current;
    const m = measureRef.current;
    if (!hasMedia || !el || !m) return;
    const width = el.getBoundingClientRect().width;
    if (!width) return;
    m.style.width = `${width}px`;
    const hook = parts?.hook ?? "";
    const rest = parts ? parts.rest : post.content;
    // mirrors the visible markup: hook span, then body text, then the "… more" suffix
    const draw = (h: string, r: string, cut: boolean) => {
      m.replaceChildren();
      if (h) {
        const span = document.createElement("span");
        span.className = hookClass;
        span.textContent = cut && !r ? `${h}…` : parts?.inline && r ? `${h} ` : h;
        m.append(span);
      }
      m.append(document.createTextNode(cut ? (r ? `${r}… ` : " ") : r));
      if (cut) {
        // the visible "more" is bold, so measure a bold one too
        const more = document.createElement("span");
        more.className = "more-inline";
        more.textContent = "more";
        m.append(more);
      }
      return m.offsetHeight;
    };
    const bodyLH = parseFloat(getComputedStyle(m).lineHeight);
    let hookH = 0;
    if (hook) {
      draw(hook, "", false);
      const hl = parseFloat(getComputedStyle(m.firstChild as Element).lineHeight);
      hookH = Math.min(m.offsetHeight, hl * 2 + 4);   // a hook gets at most two of its lines
    }
    const max = hookH + bodyLH * CAPTION_LINES + 1;
    if (draw(hook, rest, false) <= max) return setShort(null);
    const fitLen = (text: string, test: (t: string) => boolean) => {
      let lo = 0;
      let hi = text.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (test(text.slice(0, mid).trimEnd())) lo = mid;
        else hi = mid - 1;
      }
      return wordCut(text, lo);
    };
    if (draw(hook, rest.slice(0, 1), true) <= max) {
      setShort({ hook, rest: fitLen(rest, (r) => draw(hook, r, true) <= max) });
    } else {
      // the hook alone is too long: cut the hook itself
      setShort({ hook: fitLen(hook, (h) => draw(h, "", true) <= max), rest: "" });
    }
  }, [hasMedia, post.content, parts, hookClass]);
  useLayoutEffect(() => {
    fitCaption();
    const el = textRef.current;
    if (!el || !hasMedia) return;
    let lastWidth = el.getBoundingClientRect().width;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      if (Math.abs(w - lastWidth) > 1) { lastWidth = w; fitCaption(); }
    });
    ro.observe(el);
    // The serif can finish loading after the first measure (fonts.ready may already have
    // resolved when this runs), so refit whenever any font finishes loading.
    const fonts = document.fonts;
    const refit = () => fitCaption();
    fonts?.addEventListener?.("loadingdone", refit);
    fonts?.ready.then(refit).catch(() => {});
    return () => { ro.disconnect(); fonts?.removeEventListener?.("loadingdone", refit); };
  }, [fitCaption, hasMedia]);
  const mediaLong = hasMedia && !!short;
  const toggleCaption = (e?: React.MouseEvent) => { e?.stopPropagation(); setExpanded((v) => !v); };

  // Text-only posts: "Read full confession" shows when the clamped text is actually cut.
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const el = textRef.current;
    if (!el || hasMedia) return;
    const check = () => setCut(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [post.content, hasMedia]);
  const longText = !hasMedia && cut;

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

  // Double tap likes (never unlikes); each further quick tap adds a heart where it lands.
  function mediaTap(e: React.MouseEvent<HTMLDivElement>) {
    const now = Date.now();
    if (now - lastTap.current < TAP_GAP) {
      const box = e.currentTarget.getBoundingClientRect();
      setBurst((b) => ({ id: (b?.id ?? 0) + 1, x: e.clientX - box.left, y: e.clientY - box.top, rot: Math.round(Math.random() * 40 - 20) }));
      if (!post.is_liked) like();
    }
    lastTap.current = now;
  }

  async function save() {
    if (!user) return onGate("Sign in to save it for later.");
    const was = Boolean(post.is_saved);
    const n = post.saves_count ?? 0;
    onPatch(post.id, { is_saved: !was, saves_count: Math.max(0, n + (was ? -1 : 1)) });
    try {
      await api(`/drops/${post.id}/save`, { method: "POST" });
      onToast(was ? "Removed from saved" : "Saved");
    } catch (e) {
      onPatch(post.id, { is_saved: was, saves_count: n });
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
  const linkBtn = (
    <button
      className="linkup"
      onClick={() => (user ? onLinkUp(post) : onGate("Sign in to knock. Your name stays hidden until they let you in."))}
    >
      {post.kind === "hookup" ? <span className="lu-heart" aria-hidden>🖤</span> : <Link2 />}
      <span className="lu-label">Knock{post.anonymous_name ? <> on <b>{post.anonymous_name}</b>&apos;s door</> : null}</span>
      <span className="coin-cost">
        <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="9" fill="currentColor" /><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" fill="none" stroke="#7a4a00" strokeWidth="1.6" strokeLinecap="round" /></svg>
        {COST.linkUp}
      </span>
    </button>
  );
  const voted = post.poll ? post.poll.voted_option !== null : false;

  async function extend() {
    try {
      const r = await api<{ live_until: string }>(`/drops/${post.id}/extend`, { method: "POST" });
      onPatch(post.id, { live_until: r.live_until });
      onToast("More time added. Your post stays up.");
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  const left = post.kind === "hookup" ? timeLeft(post.live_until) : null;
  const tags = hookupTags(post.hookup);
  const liveChips = post.kind === "hookup" && (left || post.linkup_count || post.is_own_post || tags.length) ? (
    <div className="live-chips">
      {left ? <span className="hot">{FRESH_LABEL[post.hookup?.fresh_window || "tonight"] || "Tonight"} · {left}</span> : post.live_until ? <span>Ended</span> : null}
      {tags.map((t) => <span key={t}>{t}</span>)}
      {post.linkup_count ? <span>{post.linkup_count} linked up</span> : null}
      {post.is_own_post && post.live_until ? <button onClick={extend}>{(post.hookup?.fresh_window || "tonight") === "tonight" ? "+12h" : "+3 days"}</button> : null}
    </div>
  ) : null;

  useEffect(() => { if (!active) setSpeed(1); }, [active]);
  const canReport = !post.is_admin_drop && !post.is_own_post;
  function openMenu() {
    if (videoSrc && !mature) { setMenu(true); return; }
    if (canReport) (user ? onReport(post) : onGate("Sign in to report a post."));
  }
  function pressStart(e: React.PointerEvent) {
    if (e.button > 0 || (e.target as Element).closest("button, a, input, textarea, select, .rail, .vp-bar, .vp-scrub")) return;
    pressed.current = false;
    const timer = window.setTimeout(() => {
      press.current = null;
      pressed.current = true;   // the release that follows isn't a tap
      if (navigator.vibrate) navigator.vibrate(12);
      openMenu();
    }, LONG_PRESS_MS);
    press.current = { timer, x: e.clientX, y: e.clientY };
  }
  function pressMove(e: React.PointerEvent) {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP) pressEnd();
  }
  function pressEnd() {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }

  return (
    <article
      onPointerDown={pressStart}
      onPointerMove={pressMove}
      onPointerUp={pressEnd}
      onPointerCancel={pressEnd}
      onPointerLeave={pressEnd}
      onClickCapture={(e) => { if (pressed.current) { pressed.current = false; e.stopPropagation(); e.preventDefault(); } }}
      onContextMenu={(e) => { if (press.current || pressed.current) e.preventDefault(); }}
      className={`slide ${hasMedia ? "has-media" : `g${hash(post.id) % 6}`}${textSlide ? " text-slide" : ""}${textSlide && post.kind !== "hookup" ? " env" : ""}${audioSrc && !hasMedia ? " audio-slide" : ""}${canLinkUp && hasMedia ? " has-linkup" : ""}`}
      data-idx={index}
      data-post={post.id}
    >
      {hasMedia ? (
        <div className="media" onClick={mediaTap}>
          {burst ? (
            <span
              key={burst.id}
              className="heart-burst"
              style={{ left: burst.x, top: burst.y, ["--rot" as string]: `${burst.rot}deg` }}
              aria-hidden
            >
              <Heart filled />
            </span>
          ) : null}
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
                    <FitImage src={src} alt={i === 0 ? post.content.slice(0, 100) : ""} priority={near && i === 0} />
                  </div>
                ))}
              </div>
              <div className="dots">
                {slides.map((s, i) => <i key={s} className={i === page ? "on" : ""} />)}
                <span className="dots-count">{page + 1}/{slides.length}</span>
              </div>
            </>
          ) : videoSrc ? (
            <VideoPlayer
              src={videoSrc}
              poster={post.cover_url || post.card_image_url}
              edit={post.video_edit}
              active={active && !mature}
              near={near}
              muted={muted || muteClip}
              rate={speed}
            />
          ) : singleImage ? (
            <FitImage src={singleImage} alt={post.content.slice(0, 100)} priority={near} />
          ) : null}
        </div>
      ) : null}

      <div className={hasMedia ? "caption" : "text-body"} style={{ position: "relative", zIndex: 2 }}>
        {post.promo_kind === "pin" ? <span className="pin-tag">pinned</span> : null}
        {textSlide && post.font_style ? <link rel="stylesheet" href={DROP_FONTS_HREF} precedence="default" /> : null}
        {post.content ? (
          <Text
            ref={textRef as React.RefObject<HTMLParagraphElement>}
            // until measured, CSS clamps it so the first paint never overflows
            className={`confession${hasMedia && short === undefined ? " clamp" : ""}${textSlide ? " clamp-text" : ""}`}
            style={textSlide ? dropFontStyle(post.font_style) : undefined}
            onClick={mediaLong ? () => toggleCaption() : undefined}
          >
            {mediaLong && short && !expanded ? (
              <>
                {short.hook ? <span className={hookClass}>{short.rest ? (parts?.inline ? `${short.hook} ` : short.hook) : `${short.hook}…`}</span> : null}
                {short.rest ? `${short.rest}…` : null}{" "}<button type="button" className="more-inline" onClick={toggleCaption}>more</button>
              </>
            ) : parts ? (
              <><span className={hookClass}>{parts.inline && parts.rest ? `${parts.hook} ` : parts.hook}</span>{parts.rest}</>
            ) : post.content}
            {mediaLong && expanded ? <>{" "}<button type="button" className="more-inline" onClick={toggleCaption}>less</button></> : null}
          </Text>
        ) : null}
        {hasMedia && post.content ? <p ref={measureRef} className="confession caption-measure" aria-hidden /> : null}
        {longText ? (
          <button className="read-full" onClick={() => setFullText(true)}>Read full confession</button>
        ) : null}
        {liveChips}
        {canLinkUp && !hasMedia ? linkBtn : null}

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
      </div>

      {ambient && near ? <AmbientSound src={ambient.url} play={active && !muted} /> : null}

      <div className="rail">
        {!post.is_admin_drop && post.user_id ? (
          <button
            onClick={() => (user ? onProfile(post) : onGate("Sign in to step into their Room."))}
            aria-label={`Open ${post.anonymous_name || "their"} Room`}
            className="r-ava"
          >
            {post.avatar_url ? <Image src={post.avatar_url} alt="" width={44} height={44} /> : (post.anonymous_name || "A")[0].toUpperCase()}
          </button>
        ) : null}
        <button onClick={like} aria-label="Like" className={`r-act r-like${post.is_liked ? " liked on" : ""}`}>
          <Heart filled={Boolean(post.is_liked)} />{compact(post.likes_count)}
        </button>
        <button onClick={() => onComments(post)} aria-label="Comments" className="r-act r-cmt">
          <Comment />{compact(post.thread_count)}
        </button>
        <button onClick={save} aria-label="Save" className={`r-act r-save${post.is_saved ? " on" : ""}`}>
          <Bookmark filled={Boolean(post.is_saved)} />{compact(post.saves_count ?? 0)}
        </button>
        <button onClick={() => onShare(post)} aria-label="Share" className="r-act r-share">
          <Share />
        </button>
        {muted && ((videoSrc && !slides && !mature) || ambient) ? (
          <button onClick={onToggleMute} aria-label="Turn sound on" className="sound-rail r-act r-sound">
            <SoundOff />
          </button>
        ) : null}
      </div>

      {canLinkUp && hasMedia ? linkBtn : null}

      {menu ? (
        <Sheet onClose={() => setMenu(false)}>
          <div className="post-menu">
            <button className="opt-row" onClick={() => { setSpeed((s) => (s === 1 ? 2 : 1)); setMenu(false); }}>
              {speed === 1 ? "▶▶  Play at 2x" : "▶  Normal speed"}
            </button>
            {canReport ? (
              <button className="opt-row" onClick={() => { setMenu(false); user ? onReport(post) : onGate("Sign in to report a post."); }}>
                <Flag />  Report or block
              </button>
            ) : null}
          </div>
        </Sheet>
      ) : null}

      {fullText ? (
        <Sheet onClose={() => setFullText(false)}>
          <p className="full-text">{post.content}</p>
        </Sheet>
      ) : null}

      {mature ? (
        <button className="mature-veil" onClick={allowMature}>
          <strong>Mature content</strong>
          <span>Adults only. Tap once and you won't be asked again.</span>
        </button>
      ) : null}
    </article>
  );
}
