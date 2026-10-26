"use client";
import { useEffect, useRef, useState } from "react";

export type DropMedia = {
  media_type: string | null;
  media_url: string | null;
  images: string[] | null;
  cover_url: string | null;
};

/** Native <video> with controls; Stream's HLS (.m3u8) goes through hls.js where the browser can't play it itself. */
function Clip({ src, poster }: { src: string; poster?: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (!src.includes(".m3u8") || v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = src;
      return;
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
  }, [src]);
  return <video ref={ref} className="adm-media-el" poster={poster || undefined} controls playsInline preload="metadata" />;
}

/**
 * What a post actually shows: its video, photos or voice note. Collapsed to a
 * small preview until opened (videos cost bandwidth), and opened straight away
 * when `open` is set (e.g. while the caption is being edited).
 */
export default function AdminMedia({ media, open: forceOpen = false }: { media: DropMedia; open?: boolean }) {
  const [open, setOpen] = useState(false);
  const { media_type: type, media_url: url, images, cover_url: cover } = media;
  const photos = images?.length ? images : type === "image" && url ? [url] : [];
  if (!url && !photos.length) return null;
  const shown = open || forceOpen;

  if (!shown) {
    const thumb = cover || photos[0];
    return (
      <button type="button" className="adm-media-peek" onClick={() => setOpen(true)} aria-label={`Preview ${type || "media"}`}>
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="ph">{type === "voice" ? "♪" : "▶"}</span>}
        <span>{type === "video" ? "▶ Watch video" : type === "voice" ? "▶ Play voice note" : photos.length > 1 ? `View ${photos.length} photos` : "View photo"}</span>
      </button>
    );
  }

  return (
    <div className="adm-media">
      {type === "video" && url ? <Clip src={url} poster={cover} /> : null}
      {type === "voice" && url ? <audio src={url} controls preload="metadata" className="adm-media-audio" /> : null}
      {photos.length && type !== "video" ? (
        <div className="adm-media-photos">
          {photos.map((p, i) => (
            <a key={p + i} href={p} target="_blank" rel="noreferrer"><img src={p} alt={`Photo ${i + 1}`} loading="lazy" /></a>
          ))}
        </div>
      ) : null}
      {!forceOpen ? <button type="button" className="adm-linkbtn small" onClick={() => setOpen(false)}>Hide</button> : null}
    </div>
  );
}
