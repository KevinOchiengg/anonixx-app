/** Feed media fit: media close to the frame's shape fills it; anything else is shown whole over
 * a blurred copy. Same tolerance as the website. */
const TOLERANCE = 1.28;

export function fillsFrame(mediaW, mediaH, frameW, frameH) {
  if (!mediaW || !mediaH || !frameW || !frameH) return false;
  const r = (mediaW / mediaH) / (frameW / frameH);
  return r <= TOLERANCE && r >= 1 / TOLERANCE;
}
