// "Smart trim": the original video is uploaded untouched, and the post carries the window
// to play plus the text laid over it. Every player (web + app) honours it, so nothing is
// re-encoded and the text stays sharp and editable.

export const MAX_CLIP_SECONDS = 180;
export const MIN_CLIP_SECONDS = 1;
export const MAX_OVERLAYS = 5;
export const MAX_OVERLAY_CHARS = 80;

export type OverlaySize = "s" | "m" | "l";
export type OverlayStyle = "shadow" | "dark" | "coral";

export type VideoOverlay = {
  text: string;
  x: number; // centre, 0–1 across the frame
  y: number; // centre, 0–1 down the frame
  size: OverlaySize;
  style: OverlayStyle;
};

export type VideoEdit = { start: number; end: number; overlays: VideoOverlay[] };

// A fresh edit for a clip of `duration` seconds: anything longer than the cap is cut to
// its first three minutes.
export function defaultEdit(duration: number): VideoEdit {
  return { start: 0, end: Math.min(duration || MAX_CLIP_SECONDS, MAX_CLIP_SECONDS), overlays: [] };
}

// Whether the edit changes anything worth sending — an untouched full-length clip needs no edit.
export function isMeaningful(edit: VideoEdit | null | undefined, duration: number): edit is VideoEdit {
  if (!edit) return false;
  return edit.overlays.length > 0 || edit.start > 0.05 || edit.end < duration - 0.05;
}

export function fmtTime(s: number) {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
