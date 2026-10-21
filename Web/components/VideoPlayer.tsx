"use client";
import { useEffect, useRef, useState } from "react";
import type { VideoEdit } from "@/lib/videoEdit";
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
// Tap = pause/play, like TikTok. Portrait videos fill the screen; landscape ones are
// letterboxed over a blurred copy of themselves.
const PlayIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z" /></svg>;

export default function VideoPlayer({ src, poster, active, near, muted, edit }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const [landscape, setLandscape] = useState(false);
  const [paused, setPaused] = useState(false);
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
      v.currentTime = start;
      if (bar.current) bar.current.style.width = "0%";
    }
  }, [active, near, start]);

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

  if (!near) {
    return <div className="video-poster" style={poster ? { backgroundImage: `url(${poster})` } : undefined} />;
  }

  return (
    <div className={`vp ${landscape ? "land" : "port"}`} onClick={togglePlay}>
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
          if (end && (v.currentTime >= end || v.currentTime < start - 0.25)) {
            v.currentTime = start;
            if (v.paused && active && !paused) v.play().catch(() => {});
          }
          const from = start;
          const to = end || v.duration;
          if (bar.current && to > from) bar.current.style.width = `${Math.min(100, ((v.currentTime - from) / (to - from)) * 100)}%`;
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
      {paused ? <span className="play-badge" aria-hidden><PlayIcon /></span> : null}
      {active ? <span className="vp-progress"><span ref={bar} /></span> : null}
    </div>
  );
}
