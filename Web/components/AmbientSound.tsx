"use client";
import { useEffect, useRef } from "react";

const LEVEL = 0.28;
const STEP_MS = 50;
const FADE_MS = 700;

// A quiet looping track for one text slide. Fades in while the slide is on screen
// and out when it leaves, so scrolling crossfades into the next slide's track.
export default function AmbientSound({ src, play }: { src: string; play: boolean }) {
  const el = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const a = new Audio();
    a.loop = true;
    a.preload = "none";
    a.volume = 0;
    a.src = src;
    el.current = a;
    return () => {
      if (timer.current) clearInterval(timer.current);
      a.pause();
      a.removeAttribute("src");
      a.load();
      el.current = null;
    };
  }, [src]);

  useEffect(() => {
    const a = el.current;
    if (!a) return;
    if (timer.current) clearInterval(timer.current);
    const delta = (LEVEL / FADE_MS) * STEP_MS;
    if (play) {
      a.play().catch(() => {});
      timer.current = setInterval(() => {
        a.volume = Math.min(LEVEL, a.volume + delta);
        if (a.volume >= LEVEL && timer.current) clearInterval(timer.current);
      }, STEP_MS);
    } else if (!a.paused) {
      timer.current = setInterval(() => {
        a.volume = Math.max(0, a.volume - delta);
        if (a.volume <= 0) {
          a.pause();
          if (timer.current) clearInterval(timer.current);
        }
      }, STEP_MS);
    }
  }, [play, src]);

  return null;
}
