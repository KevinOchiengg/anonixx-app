"use client";
import { useEffect, useRef, useState } from "react";
import {
  MAX_CLIP_SECONDS, MIN_CLIP_SECONDS, MAX_OVERLAYS, MAX_OVERLAY_CHARS, fmtTime,
  type VideoEdit, type VideoOverlay, type OverlaySize, type OverlayStyle,
} from "@/lib/videoEdit";
import "../../app/videooverlay.css";
import "../../app/videoeditor.css";

const SIZES: [OverlaySize, string][] = [["s", "S"], ["m", "M"], ["l", "L"]];
const STYLES: [OverlayStyle, string][] = [["shadow", "Clean"], ["dark", "Box"], ["coral", "Coral"]];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

type Props = {
  src: string;
  duration: number;
  value: VideoEdit;
  onChange: (v: VideoEdit) => void;
  onNoPreview?: () => void;
  // optional cover-frame picking (admin Post Studio)
  cover?: number | null;
  onCover?: (t: number) => void;
};

// Trim + text over the clip, previewed exactly as the feed will play it. Nothing is
// re-encoded: the result is just the window and the overlays, saved with the post.
export default function VideoEditor({ src, duration, value, onChange, onNoPreview, cover, onCover }: Props) {
  const vid = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(value.start);
  const [landscape, setLandscape] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const { start, end, overlays } = value;
  const len = end - start;
  const cut = duration > MAX_CLIP_SECONDS + 0.5;

  useEffect(() => { if (sel !== null && sel >= overlays.length) setSel(null); }, [sel, overlays.length]);

  function seek(t: number) {
    const v = vid.current;
    if (v) v.currentTime = t;
    setNow(t);
  }

  function setStart(t: number) {
    const s = clamp(t, 0, duration - MIN_CLIP_SECONDS);
    const e = clamp(end, s + MIN_CLIP_SECONDS, s + MAX_CLIP_SECONDS);
    onChange({ ...value, start: s, end: Math.min(e, duration) });
    vid.current?.pause();
    seek(s);
  }

  function setEnd(t: number) {
    const e = clamp(t, MIN_CLIP_SECONDS, duration);
    const s = clamp(start, e - MAX_CLIP_SECONDS, e - MIN_CLIP_SECONDS);
    onChange({ ...value, start: Math.max(0, s), end: e });
    vid.current?.pause();
    seek(e);
  }

  function toggle() {
    const v = vid.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < start || v.currentTime >= end - 0.05) v.currentTime = start;
      v.play().catch(() => {});
    } else v.pause();
  }

  function patch(i: number, p: Partial<VideoOverlay>) {
    onChange({ ...value, overlays: overlays.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  }

  function addText() {
    if (overlays.length >= MAX_OVERLAYS) return;
    const y = clamp(0.35 + overlays.length * 0.1, 0.1, 0.85);
    onChange({ ...value, overlays: [...overlays, { text: "", x: 0.5, y, size: "m", style: "dark" }] });
    setSel(overlays.length);
  }

  function remove(i: number) {
    onChange({ ...value, overlays: overlays.filter((_, j) => j !== i) });
    setSel(null);
  }

  function move(e: React.PointerEvent) {
    const i = drag.current;
    const box = stage.current?.getBoundingClientRect();
    if (i === null || !box) return;
    patch(i, {
      x: clamp((e.clientX - box.left) / box.width, 0.08, 0.92),
      y: clamp((e.clientY - box.top) / box.height, 0.06, 0.94),
    });
  }

  const pct = (t: number) => `${duration ? (t / duration) * 100 : 0}%`;
  const cur = sel !== null ? overlays[sel] : null;

  return (
    <div className="vx">
      <div
        ref={stage}
        className={`vx-stage ${landscape ? "land" : "port"}`}
        onPointerMove={move}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <video
          ref={vid}
          src={src}
          playsInline
          muted
          preload="auto"
          onClick={toggle}
          onError={onNoPreview}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setLandscape(v.videoWidth > v.videoHeight * 1.05);
            v.currentTime = start;
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (!v.paused && v.currentTime >= end) v.currentTime = start;
            setNow(v.currentTime);
          }}
          onEnded={(e) => { e.currentTarget.currentTime = start; e.currentTarget.play().catch(() => {}); }}
        />
        {/* same classes as the feed's overlay layer, so this is the finished look — just draggable */}
        <div className="vo-layer vx-layer">
          {overlays.map((o, i) => (
            <span
              key={i}
              className={`vo vo-${o.size} vo-${o.style} vx-handle${i === sel ? " on" : ""}${o.text.trim() ? "" : " empty"}`}
              style={{ left: `${o.x * 100}%`, top: `${o.y * 100}%` }}
              onPointerDown={(e) => { e.preventDefault(); setSel(i); drag.current = i; stage.current?.setPointerCapture(e.pointerId); }}
            >
              {o.text.trim() || "your text"}
            </span>
          ))}
        </div>
        <button type="button" className="vx-play" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
          {playing
            ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.2" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" /></svg>
            : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z" /></svg>}
        </button>
        <span className="vx-clock">{fmtTime(Math.max(0, now - start))} / {fmtTime(len)}</span>
      </div>

      <div className="vx-panel">
        <div className="vx-row">
          <b>Trim</b>
          <span className="vx-len">{fmtTime(start)} – {fmtTime(end)} · <em>{fmtTime(len)}</em> of max {fmtTime(MAX_CLIP_SECONDS)}</span>
        </div>
        {cut ? <p className="vx-cut">This video is {fmtTime(duration)}, so it was cut to its first 3:00. Drag the handles to pick a different 3 minutes.</p> : null}
        <div className="vx-track" style={{ "--a": pct(start), "--b": pct(end), "--n": pct(clamp(now, 0, duration)), "--c": pct(cover ?? 0) } as React.CSSProperties}>
          <span className="vx-sel" />
          {onCover && cover != null ? <span className="vx-cover" title="Cover frame" /> : null}
          <span className="vx-head" />
          <input type="range" min={0} max={duration} step={0.1} value={start} aria-label="Clip start" onChange={(e) => setStart(Number(e.target.value))} />
          <input type="range" min={0} max={duration} step={0.1} value={end} aria-label="Clip end" onChange={(e) => setEnd(Number(e.target.value))} />
        </div>
        <div className="vx-row vx-quick">
          <button type="button" onClick={() => setStart(now)}>Start here</button>
          <button type="button" onClick={() => setEnd(now)} disabled={now <= start + MIN_CLIP_SECONDS}>End here</button>
          <button type="button" onClick={() => onChange({ ...value, start: 0, end: Math.min(duration, MAX_CLIP_SECONDS) })}>Reset</button>
          {onCover ? (
            <button type="button" className="cov" onClick={() => onCover(clamp(now, start, end))}>
              {cover != null && Math.abs(cover - now) < 0.15 ? "✓ Cover frame" : "Use this frame as cover"}
            </button>
          ) : null}
        </div>

        <div className="vx-row">
          <b>Text on video</b>
          <button type="button" className="vx-add" onClick={addText} disabled={overlays.length >= MAX_OVERLAYS}>+ Add text</button>
        </div>
        {cur && sel !== null ? (
          <div className="vx-text">
            <input
              autoFocus
              value={cur.text}
              maxLength={MAX_OVERLAY_CHARS}
              placeholder="Say it on the video…"
              onChange={(e) => patch(sel, { text: e.target.value })}
              aria-label="Overlay text"
            />
            <div className="vx-seg" role="group" aria-label="Text size">
              {SIZES.map(([k, l]) => <button key={k} type="button" className={cur.size === k ? "on" : ""} onClick={() => patch(sel, { size: k })}>{l}</button>)}
            </div>
            <div className="vx-seg" role="group" aria-label="Text style">
              {STYLES.map(([k, l]) => <button key={k} type="button" className={cur.style === k ? "on" : ""} onClick={() => patch(sel, { style: k })}>{l}</button>)}
            </div>
            <div className="vx-row vx-quick">
              <button type="button" onClick={() => setSel(null)}>Done</button>
              <button type="button" className="bad" onClick={() => remove(sel)}>Delete text</button>
            </div>
            <small>Drag the text on the video to move it.</small>
          </div>
        ) : overlays.length ? (
          <small className="vx-hint">Tap a text on the video to edit or move it.</small>
        ) : (
          <small className="vx-hint">Add a line people read before they hear a word. Up to {MAX_OVERLAYS}.</small>
        )}
      </div>
    </div>
  );
}
