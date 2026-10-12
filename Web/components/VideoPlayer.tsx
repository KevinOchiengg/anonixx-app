"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  poster?: string | null;
  active: boolean;
  near: boolean;
  muted: boolean;
  onToggleMute: () => void;
};

// Only the active slide plays; neighbours preload metadata; everything else is just a poster,
// so memory stays flat no matter how far the viewer scrolls.
// Tap = pause/play, like TikTok. Portrait videos fill the screen; landscape ones are
// letterboxed over a blurred copy of themselves.
const ico = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const PlayIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z" /></svg>;
const SoundOn = () => <svg {...ico}><path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></svg>;
const SoundOff = () => <svg {...ico}><path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" /><path d="m16 9.5 5 5" /><path d="m21 9.5-5 5" /></svg>;

export default function VideoPlayer({ src, poster, active, near, muted, onToggleMute }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const [landscape, setLandscape] = useState(false);
  const [paused, setPaused] = useState(false);

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
      v.currentTime = 0;
      if (bar.current) bar.current.style.width = "0%";
    }
  }, [active, near]);

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
        loop
        playsInline
        preload="auto"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setLandscape(v.videoWidth > v.videoHeight * 1.05);
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (bar.current && v.duration) bar.current.style.width = `${(v.currentTime / v.duration) * 100}%`;
        }}
      />
      {paused ? <span className="play-badge" aria-hidden><PlayIcon /></span> : null}
      <button
        className="sound-btn"
        aria-label={muted ? "Turn sound on" : "Mute"}
        onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
      >
        {muted ? <SoundOff /> : <SoundOn />}
      </button>
      {active ? <span className="vp-progress"><span ref={bar} /></span> : null}
    </div>
  );
}
