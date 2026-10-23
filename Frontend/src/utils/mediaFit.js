/**
 * mediaFit.js
 *
 * Feed media fit, the TikTok rule: media roughly the frame's shape (a proper
 * vertical shot) fills edge to edge, the small crop isn't missed; anything
 * else is shown whole over a blurred copy of itself, so nothing gets cut
 * off. The website's lib/mediaFit.ts uses the same tolerance.
 */
const TOLERANCE = 1.28;

export function fillsFrame(mediaW, mediaH, frameW, frameH) {
  if (!mediaW || !mediaH || !frameW || !frameH) return false;
  const r = (mediaW / mediaH) / (frameW / frameH);
  return r <= TOLERANCE && r >= 1 / TOLERANCE;
}
