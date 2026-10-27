"use client";
import { useEffect, useRef, useState } from "react";
import { fillsFrame } from "@/lib/mediaFit";
import { fmtTime, type VideoEdit } from "@/lib/videoEdit";
import VideoOverlays from "./VideoOverlays";

type Props = {
  src: string;
  poster?: string | null;
  active: boolean;
  near: boolean;
  muted: boolean;
  edit?: VideoEdit | null;
  rate?: number;
};

// Only the active slide plays; neighbours preload metadata; everything else is just a poster,
// so memory stays flat no matter how far the viewer scrolls.
// Controls are TikTok's, so nobody has to learn them: tap = pause/play, drag the bar at the
// bottom to scrub. Speed (2x) is picked from the post's long-press menu (Slide) and comes
// in as `rate`. On desktop ←/→ also jump 5s.
// Phone-shaped videos fill the screen; anything else (square, 4:5, landscape) is shown
// whole over a blurred copy, see lib/mediaFit.
const PlayIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z" /></svg>;

const KEY_JUMP = 5;
export const TAP_GAP = 250;

export default function VideoPlayer({ src, poster, active, near, muted, edit, rate = 1 }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [landscape, setLandscape] = useState(false);
  const [paused, setPaused] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null); // seconds into the clip while dragging
  const [len, setLen] = useState(0);
  const scrubbing = useRef(false);
  const resume = useRef(false);
  // TikTok's tap: a single tap waits TAP_GAP before pausing, so a double tap
  // (a like, handled by Slide) never pauses the video.
  const lastTap = useRef(0);
  const tapTimer = useRef<number | null>(null);
  // Trimmed clips play (and loop) only their window; untrimmed ones use the whole file.
  const start = edit?.start ?? 0;
  const end = edit?.end ?? 0;

  // Cloudflare Stream videos are HLS manifests. Safari plays them natively; elsewhere
  // hls.js is loaded on demand. Only the active slide fetches segments (Stream bills
  // preloading as watch time); neighbours just sit on their poster.
  const hls = src.includes(".m3u8");
  const hlsRef = useRef<{ startLoad(): void; stopLoad(): void; destroy(): void } | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const v = ref.current;
    if (!hls || !near || !v) return;
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.preload = activeRef.current ? "auto" : "none";
      v.src = src;
      return;
    }
    let dead = false;
    import("hls.js").then(({ default: Hls }) => {
      if (dead || !Hls.isSupported()) return;
      const h = new Hls({ autoStartLoad: false, capLevelToPlayerSize: true, maxBufferLength: 12 });
      // A neighbour fetches just its first segment (one 4s piece of watch time), so a
      // swipe lands on a frame instead of black; the rest waits until it's on screen.
      h.on(Hls.Events.MANIFEST_PARSED, () => {
        h.startLoad(start);
        if (activeRef.current) v.play().catch(() => {});
      });
      h.on(Hls.Events.FRAG_BUFFERED, () => {
        if (!activeRef.current) h.stopLoad();
      });
      h.loadSource(src);
      h.attachMedia(v);
      hlsRef.current = h;
    }).catch(() => {});
    return () => { dead = true; hlsRef.current?.destroy(); hlsRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hls, near, src]);
  useEffect(() => {
    const v = ref.current;
    if (!hls || !v) return;
    if (hlsRef.current) {
      if (active) hlsRef.current.startLoad();
      else hlsRef.current.stopLoad();
    } else if (active) {
      v.preload = "auto";
    }
  }, [hls, active]);

  useEffect(() => {
    const v = ref.current;
    if (v) v.muted = muted;
  }, [muted, near]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active) {
      setPaused(false);
      v.play().catch(() => {});
    } else {
      v.pause();
      v.currentTime = start;
      if (bar.current) bar.current.style.width = "0%";
    }
  }, [active, near, start]);

  const windowEnd = (v: HTMLVideoElement) => end || v.duration || 0;

  function paint(v: HTMLVideoElement) {
    const to = windowEnd(v);
    if (bar.current && to > start) bar.current.style.width = `${Math.min(100, Math.max(0, ((v.currentTime - start) / (to - start)) * 100))}%`;
  }

  function seekTo(v: HTMLVideoElement, t: number) {
    // stay just inside the window so the loop check doesn't bounce it back to the start
    const clamped = Math.min(Math.max(start, t), windowEnd(v) - 0.05);
    v.currentTime = clamped;
    paint(v);
    return clamped;
  }

  // ←/→ jump 5s on the video that's on screen.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const v = ref.current;
      if (!v || !v.duration) return;
      e.preventDefault();
      seekTo(v, v.currentTime + (e.key === "ArrowRight" ? KEY_JUMP : -KEY_JUMP));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, start, end]);

  function tap() {
    const now = Date.now();
    if (tapTimer.current) window.clearTimeout(tapTimer.current);
    tapTimer.current = null;
    if (now - lastTap.current >= TAP_GAP) {
      tapTimer.current = window.setTimeout(() => { tapTimer.current = null; togglePlay(); }, TAP_GAP);
    }
    lastTap.current = now;
  }
  useEffect(() => () => { if (tapTimer.current) window.clearTimeout(tapTimer.current); }, []);

  function togglePlay() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  }

  // ── scrub: drag anywhere along the bottom bar ──
  function scrubAt(clientX: number) {
    const v = ref.current;
    const box = track.current?.getBoundingClientRect();
    if (!v || !box || !v.duration) return;
    const frac = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    const t = seekTo(v, start + frac * (windowEnd(v) - start));
    setScrub(t - start);
  }

  function scrubStart(e: React.PointerEvent) {
    e.stopPropagation();
    const v = ref.current;
    if (!v || !v.duration) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubbing.current = true;
    resume.current = !v.paused;
    v.pause();
    setLen(windowEnd(v) - start);
    scrubAt(e.clientX);
  }

  function scrubEnd(e: React.PointerEvent) {
    if (!scrubbing.current) return;
    e.stopPropagation();
    scrubbing.current = false;
    setScrub(null);
    const v = ref.current;
    if (v && resume.current) v.play().catch(() => {});
  }

  // Speed comes from the post's long-press menu.
  useEffect(() => {
    const v = ref.current;
    if (v) v.playbackRate = rate;
  }, [rate, near]);

  if (!near) {
    return <div className="video-poster" style={poster ? { backgroundImage: `url(${poster})` } : undefined} />;
  }

  return (
    <div
      className={`vp ${landscape ? "land" : "port"}`}
      onClick={tap}
    >
      {landscape && poster ? <div className="vp-blur" style={{ backgroundImage: `url(${poster})` }} /> : null}
      <video
        ref={ref}
        // "#t=" makes mobile browsers paint the opening frame of an MP4 with no poster
        src={hls ? undefined : poster || src.includes("#") ? src : `${src}#t=${Math.max(0.001, start)}`}
        poster={poster || undefined}
        muted
        loop={!end}
        playsInline
        preload="auto"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setLandscape(!fillsFrame(v.videoWidth, v.videoHeight, v.parentElement));
          if (start && v.currentTime < start) v.currentTime = start;
          // A paused neighbour: seeking makes the browser decode and paint its first
          // frame now (some phones otherwise leave it black until play).
          else if (!activeRef.current && v.paused) v.currentTime = Math.max(0.001, start);
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (scrubbing.current) return;
          if (end && (v.currentTime >= end || v.currentTime < start - 0.25)) {
            v.currentTime = start;
            if (v.paused && active && !paused) v.play().catch(() => {});
          }
          paint(v);
        }}
        onEnded={(e) => {
          // a window ending exactly at the file's end: loop back to its start ourselves
          if (!end) return;
          const v = e.currentTarget;
          v.currentTime = start;
          if (active) v.play().catch(() => {});
        }}
      />
      <VideoOverlays overlays={edit?.overlays} />
      {paused && scrub === null ? <span className="play-badge" aria-hidden><PlayIcon /></span> : null}
      {rate !== 1 ? <span className="vp-fast" aria-live="polite">{rate}x <i aria-hidden>▶▶</i></span> : null}
      {scrub !== null ? <span className="vp-time" aria-hidden><b>{fmtTime(scrub)}</b> / {fmtTime(len)}</span> : null}
      {active ? (
        <div
          ref={track}
          className={`vp-scrub${scrub !== null ? " on" : ""}`}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(len)}
          aria-valuenow={Math.round(scrub ?? 0)}
          onPointerDown={scrubStart}
          onPointerMove={(e) => { if (scrubbing.current) { e.stopPropagation(); scrubAt(e.clientX); } }}
          onPointerUp={scrubEnd}
          onPointerCancel={scrubEnd}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="vp-progress"><span ref={bar} /></span>
        </div>
      ) : null}
    </div>
  );
}
