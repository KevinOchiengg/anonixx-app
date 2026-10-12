"use client";
import { useEffect, useRef, useState } from "react";

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
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setT(0); }}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
      />
      <div className="wave-bars" aria-hidden>
        {bars.map((h, i) => (
          <i key={i} className={i < played ? "played" : ""} style={{ height: h }} />
        ))}
      </div>
      <div className="wave-track" aria-hidden><span style={{ width: dur ? `${(t / dur) * 100}%` : 0 }} /></div>
      <div className="wave-time"><span>{fmt(t)}</span><span>{dur ? fmt(dur) : "--:--"}</span></div>
      <button
        className="wave-play"
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => { const a = ref.current; if (a) (a.paused ? a.play() : a.pause()); }}
      >
        {playing ? "❚❚" : "▶"}
      </button>
    </div>
  );
}
