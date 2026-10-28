// Feed media fit: media close to the frame's shape fills it; anything else is shown whole
// over a blurred copy. Same tolerance as the app.
const TOLERANCE = 1.28;

export function fillsFrame(mediaW: number, mediaH: number, frame: Element | null | undefined): boolean {
  if (!mediaW || !mediaH || !frame) return false;
  const { clientWidth: fw, clientHeight: fh } = frame;
  if (!fw || !fh) return false;
  const r = mediaW / mediaH / (fw / fh);
  return r <= TOLERANCE && r >= 1 / TOLERANCE;
}
