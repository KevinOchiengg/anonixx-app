/**
 * videoEdit.js
 *
 * "Smart trim" + text overlays for a video drop — the same rules as the
 * website's Web/lib/videoEdit.ts and the backend's clean_video_edit
 * (Backend/app/api/v1/drops.py). The original is uploaded untouched; the
 * drop carries the window to play and the text laid over it. With Cloudflare
 * Stream switched on, the backend cuts that window out for real instead.
 */
export const MAX_CLIP_SECONDS = 180;
export const MIN_CLIP_SECONDS = 1;
export const MAX_OVERLAYS = 5;
export const MAX_OVERLAY_CHARS = 80;

// A fresh edit for a clip of `duration` seconds: anything longer than the cap
// opens cut to its first three minutes.
export const defaultEdit = (duration) => ({
  start: 0,
  end: Math.min(duration || MAX_CLIP_SECONDS, MAX_CLIP_SECONDS),
  overlays: [],
});

// Whether the edit changes anything worth sending.
export const isMeaningful = (edit, duration) =>
  !!edit && (edit.overlays.some((o) => o.text.trim()) || edit.start > 0.05 || edit.end < duration - 0.05);

export const withoutEmptyText = (edit) =>
  edit ? { ...edit, overlays: edit.overlays.filter((o) => o.text.trim()) } : null;

export const fmtTime = (s) => {
  const t = Math.max(0, Math.round(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
