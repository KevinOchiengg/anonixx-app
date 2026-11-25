"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { TAP_GAP } from "./VideoPlayer";

// Same colours as the app's voice waves: pink → coral → amber → gold → coral → pink.
const STOPS = ["#e8456e", "#ff634a", "#ff9376", "#f0a868", "#ffc93c", "#ff634a", "#e8456e"];
const BARS = 36;

function colorAt(i: number) {
  const x = (i / (BARS - 1)) * (STOPS.length - 1);
  const k = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - k;
  const mix = (o: number) => Math.round(parseInt(STOPS[k].slice(o, o + 2), 16) * (1 - f) + parseInt(STOPS[k + 1].slice(o, o + 2), 16) * f);
  return `rgb(${mix(1)}, ${mix(3)}, ${mix(5)})`;
}

function shape(seed: string) {
  let h = 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rnd = () => { h = (h * 1664525 + 1013904223) >>> 0; return (h >>> 8) % 1000 / 1000; };
  return Array.from({ length: BARS }, (_, i) => {
    const hump = 0.45 + 0.55 * Math.sin((i / (BARS - 1)) * Math.PI);
    return {
      h: Math.max(0.2, hump * (0.4 + rnd() * 0.6)),
      dur: 0.9 + rnd() * 0.8,
      delay: -rnd() * 1.6,
      color: colorAt(i),
    };
  });
}

/** An audio drop shown like a video: a coloured wave moving in the middle, the feed's mute
 *  switch for sound, tap to pause, the progress line along the bottom. */
export default function AudioStage({ src, seed, active, near, muted }: { src: string; seed: string; active: boolean; near: boolean; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const bufTimer = useRef<number | null>(null);
  const bars = useMemo(() => shape(seed), [seed]);

  const stalled = () => { if (bufTimer.current === null) bufTimer.current = window.setTimeout(() => setBuffering(true), 600); };
  const flowing = () => { if (bufTimer.current !== null) { window.clearTimeout(bufTimer.current); bufTimer.current = null; } setBuffering(false); };
  useEffect(() => () => { if (bufTimer.current !== null) window.clearTimeout(bufTimer.current); }, []);

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted, near]);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    if (active) a.play().catch(() => setPlaying(false));
    else a.pause();
  }, [active, near]);

  // A single tap pauses or plays; a quick second tap is the slide's double-tap like.
  const lastTap = useRef(0);
  const tapTimer = useRef<number | null>(null);
  useEffect(() => () => { if (tapTimer.current) window.clearTimeout(tapTimer.current); }, []);
  function tap() {
    const now = Date.now();
    if (tapTimer.current) window.clearTimeout(tapTimer.current);
    tapTimer.current = null;
    if (now - lastTap.current >= TAP_GAP) tapTimer.current = window.setTimeout(() => { tapTimer.current = null; toggle(); }, TAP_GAP);
    lastTap.current = now;
  }

  function toggle() {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }

  function seek(clientX: number) {
    const a = ref.current;
    const box = track.current?.getBoundingClientRect();
    if (!a || !box || !a.duration) return;
    a.currentTime = Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * a.duration;
  }

  const progress = dur ? t / dur : 0;
  const played = Math.floor(progress * BARS);

  return (
    <div className={`astage${playing ? " on" : ""}`} onClick={tap}>
      {near ? (
        <audio
          ref={ref}
          src={src}
          preload="metadata"
          loop
          muted={muted}
          playsInline
          onPlay={() => setPlaying(true)}
          onPause={() => { setPlaying(false); flowing(); }}
          onWaiting={stalled}
          onStalled={stalled}
          onPlaying={flowing}
          onCanPlay={flowing}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        />
      ) : null}
      <div className="astage-wave" aria-hidden>
        {bars.map((b, i) => (
          <i
            key={i}
            className={progress > 0 && i <= played ? "played" : ""}
            style={{ height: `${b.h * 100}%`, background: b.color, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s`, color: b.color }}
          />
        ))}
      </div>
      {active ? (
        <div
          ref={track}
          className="vp-scrub"
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(t)}
          onClick={(e) => { e.stopPropagation(); seek(e.clientX); }}
        >
          <span className="vp-progress"><span style={{ width: `${progress * 100}%` }} /></span>
          {buffering ? <span className="vp-buffer" aria-hidden /> : null}
        </div>
      ) : null}
    </div>
  );
}
