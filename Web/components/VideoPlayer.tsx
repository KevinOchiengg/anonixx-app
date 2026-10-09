"use client";
import { useEffect, useRef } from "react";

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
export default function VideoPlayer({ src, poster, active, near, muted, onToggleMute }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (v) v.muted = muted;
  }, [muted, near]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active) {
      v.play().catch(() => {});
    } else {
      v.pause();
      v.currentTime = 0;
    }
  }, [active, near]);

  if (!near) {
    return <div className="video-poster" style={poster ? { backgroundImage: `url(${poster})` } : undefined} />;
  }

  return (
    <div style={{ width: "100%", height: "100%" }} onClick={onToggleMute}>
      <video
        ref={ref}
        src={src}
        poster={poster || undefined}
        muted
        loop
        playsInline
        preload={active ? "auto" : "metadata"}
      />
      {active && muted ? <span className="sound-hint">Tap for sound</span> : null}
    </div>
  );
}
