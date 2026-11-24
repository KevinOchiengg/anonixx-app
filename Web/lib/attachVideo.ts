/** Plays `src` in `v`, through hls.js for Stream's .m3u8 where the browser can't play it itself. Returns a cleanup. */
export function attachVideo(v: HTMLVideoElement, src: string): () => void {
  if (!src.includes(".m3u8") || v.canPlayType("application/vnd.apple.mpegurl")) {
    v.src = src;
    return () => {};
  }
  let hls: { destroy(): void } | null = null;
  let live = true;
  import("hls.js").then(({ default: Hls }) => {
    if (!live || !Hls.isSupported()) return;
    const h = new Hls();
    h.loadSource(src);
    h.attachMedia(v);
    hls = h;
  }).catch(() => {});
  return () => { live = false; hls?.destroy(); };
}
