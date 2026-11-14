"use client";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const BARS = 48;

function heights(seed: string) {
  let h = 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: BARS }, () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return 14 + (h % 50);
  });
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function AudioWave({ src, seed, active }: { src: string; seed: string; active: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const bars = useRef(heights(seed)).current;
  // Slow network: the same loading line as videos while the sound stalls.
  const [buffering, setBuffering] = useState(false);
  const bufTimer = useRef<number | null>(null);
  const stalled = () => { if (bufTimer.current === null) bufTimer.current = window.setTimeout(() => setBuffering(true), 600); };
  const flowing = () => { if (bufTimer.current !== null) { window.clearTimeout(bufTimer.current); bufTimer.current = null; } setBuffering(false); };
  useEffect(() => () => { if (bufTimer.current !== null) window.clearTimeout(bufTimer.current); }, []);

  useEffect(() => {
    if (!active && ref.current && !ref.current.paused) ref.current.pause();
  }, [active]);

  const played = dur ? Math.floor((t / dur) * BARS) : 0;

  return (
    <div className="wave">
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => { setPlaying(false); flowing(); }}
        onWaiting={stalled}
        onStalled={stalled}
        onPlaying={flowing}
        onCanPlay={flowing}
        onEnded={() => { setPlaying(false); setT(0); }}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
      />
      <div className="wave-bars" aria-hidden>
        {bars.map((h, i) => (
          <i key={i} className={i < played ? "played" : ""} style={{ height: h }} />
        ))}
      </div>
      <div className="wave-track" aria-hidden><span style={{ width: dur ? `${(t / dur) * 100}%` : 0 }} />{buffering ? <i className="vp-buffer" /> : null}</div>
      <div className="wave-time"><span>{fmt(t)}</span><span>{dur ? fmt(dur) : "--:--"}</span></div>
      <button
        className="wave-play"
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => { const a = ref.current; if (a) (a.paused ? a.play() : a.pause()); }}
      >
        {playing ? <Pause size={16} fill="currentColor" strokeWidth={0} aria-hidden /> : <Play size={16} fill="currentColor" strokeWidth={0} aria-hidden />}
      </button>
    </div>
  );
}
