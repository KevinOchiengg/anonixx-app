// Feed media fit, the TikTok rule: media roughly the frame's shape (a proper
// vertical shot) fills edge to edge, the small crop isn't missed; anything
// else is shown whole over a blurred copy of itself, so nothing gets cut off.
// The app's utils/mediaFit.js uses the same tolerance.
const TOLERANCE = 1.28;

export function fillsFrame(mediaW: number, mediaH: number, frame: Element | null | undefined): boolean {
  if (!mediaW || !mediaH || !frame) return false;
  const { clientWidth: fw, clientHeight: fh } = frame;
  if (!fw || !fh) return false;
  const r = mediaW / mediaH / (fw / fh);
  return r <= TOLERANCE && r >= 1 / TOLERANCE;
}
