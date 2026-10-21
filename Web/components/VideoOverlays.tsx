import type { VideoOverlay } from "@/lib/videoEdit";
import "../app/videooverlay.css";

// Text laid over a video. Sized in container units so it looks the same in the editor's
// small preview and the full-screen feed.
export default function VideoOverlays({ overlays }: { overlays: VideoOverlay[] | null | undefined }) {
  if (!overlays?.length) return null;
  return (
    <div className="vo-layer" aria-hidden>
      {overlays.map((o, i) => (
        <span key={i} className={`vo vo-${o.size} vo-${o.style}`} style={{ left: `${o.x * 100}%`, top: `${o.y * 100}%` }}>
          {o.text}
        </span>
      ))}
    </div>
  );
}
