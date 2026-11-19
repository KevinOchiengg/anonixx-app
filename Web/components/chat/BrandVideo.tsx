"use client";
/** Anonixx video player: coral play button, coral progress you can scrub, time and mute.
 * Used for chat videos opened full screen. */
import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

export default function BrandVideo({ src, autoPlay = true }: { src: string; autoPlay?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const v = ref.current;
    if (v && autoPlay) v.play().catch(() => { v.muted = true; setMuted(true); v.play().catch(() => {}); });
  }, [autoPlay]);

  const toggle = () => { const v = ref.current; if (!v) return; if (v.paused) v.play().catch(() => {}); else v.pause(); };
  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const v = ref.current; if (!v || !dur) return;
    const box = e.currentTarget.getBoundingClientRect();
    v.currentTime = Math.min(dur, Math.max(0, ((e.clientX - box.left) / box.width) * dur));
  };
  const pct = dur ? (t / dur) * 100 : 0;

  return (
    <div className="bv" onClick={(e) => e.stopPropagation()}>
      <video
        ref={ref} src={src} playsInline muted={muted} onClick={toggle}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
      />
      {!playing ? (
        <button type="button" className="bv-big" aria-label="Play" onClick={toggle}><Play fill="currentColor" strokeWidth={0} aria-hidden /></button>
      ) : null}
      <div className="bv-bar">
        <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>
          {playing ? <Pause fill="currentColor" strokeWidth={0} aria-hidden /> : <Play fill="currentColor" strokeWidth={0} aria-hidden />}
        </button>
        <div className="bv-track" role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seek(e); }}
          onPointerMove={(e) => { if (e.buttons) seek(e); }}>
          <i style={{ width: `${pct}%` }} /><b style={{ left: `${pct}%` }} />
        </div>
        <span className="bv-time">{fmt(t)} / {fmt(dur)}</span>
        <button type="button" aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((m) => !m)}>
          {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
        </button>
      </div>
    </div>
  );
}
