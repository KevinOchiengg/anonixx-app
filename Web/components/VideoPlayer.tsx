"use client";
import { useEffect, useRef, useState } from "react";
import { fmtTime, type VideoEdit } from "@/lib/videoEdit";
import VideoOverlays from "./VideoOverlays";

type Props = {
  src: string;
  poster?: string | null;
  active: boolean;
  near: boolean;
  muted: boolean;
  edit?: VideoEdit | null;
};

// Only the active slide plays; neighbours preload metadata; everything else is just a poster,
// so memory stays flat no matter how far the viewer scrolls.
// Controls are TikTok's, so nobody has to learn them: tap = pause/play, drag the bar at the
// bottom to scrub, press and hold = 2x speed. On desktop ←/→ also jump 5s.
// Portrait videos fill the screen; landscape ones are letterboxed over a blurred copy.
const PlayIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z" /></svg>;

const HOLD_MS = 350;
const HOLD_SLOP = 10;
const KEY_JUMP = 5;

export default function VideoPlayer({ src, poster, active, near, muted, edit }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [landscape, setLandscape] = useState(false);
  const [paused, setPaused] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null); // seconds into the clip while dragging
  const [fast, setFast] = useState(false);
  const [len, setLen] = useState(0);
  const scrubbing = useRef(false);
  const resume = useRef(false);
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const skipClick = useRef(false);
  // Trimmed clips play (and loop) only their window; untrimmed ones use the whole file.
  const start = edit?.start ?? 0;
  const end = edit?.end ?? 0;

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
      v.playbackRate = 1;
      setFast(false);
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

  // ── press and hold: 2x until released ──
  function holdStart(e: React.PointerEvent) {
    const v = ref.current;
    if (!v || v.paused || e.button > 0) return;
    const timer = window.setTimeout(() => {
      v.playbackRate = 2;
      setFast(true);
    }, HOLD_MS);
    hold.current = { timer, x: e.clientX, y: e.clientY };
  }

  function holdMove(e: React.PointerEvent) {
    const h = hold.current;
    if (h && !fast && Math.hypot(e.clientX - h.x, e.clientY - h.y) > HOLD_SLOP) holdEnd();
  }

  function holdEnd() {
    const h = hold.current;
    if (h) window.clearTimeout(h.timer);
    hold.current = null;
    if (!fast) return;
    const v = ref.current;
    if (v) v.playbackRate = 1;
    setFast(false);
    skipClick.current = true; // the release of a hold isn't a tap
  }

  if (!near) {
    return <div className="video-poster" style={poster ? { backgroundImage: `url(${poster})` } : undefined} />;
  }

  return (
    <div
      className={`vp ${landscape ? "land" : "port"}`}
      onClick={(e) => {
        if (skipClick.current) { skipClick.current = false; e.stopPropagation(); return; }
        togglePlay();
      }}
      onPointerDown={holdStart}
      onPointerMove={holdMove}
      onPointerUp={holdEnd}
      onPointerCancel={holdEnd}
      onPointerLeave={holdEnd}
      onContextMenu={(e) => { if (hold.current || fast) e.preventDefault(); }}
    >
      {landscape && poster ? <div className="vp-blur" style={{ backgroundImage: `url(${poster})` }} /> : null}
      <video
        ref={ref}
        src={src}
        poster={poster || undefined}
        muted
        loop={!end}
        playsInline
        preload="auto"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setLandscape(v.videoWidth > v.videoHeight * 1.05);
          if (start && v.currentTime < start) v.currentTime = start;
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
      {fast ? <span className="vp-fast" aria-live="polite">2x <i aria-hidden>▶▶</i></span> : null}
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
