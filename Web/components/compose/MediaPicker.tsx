"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export const MAX_VIDEO_SECONDS = 60;
export type MediaDraft = { kind: "image" | "video"; files: File[] } | null;

function videoLength(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    v.src = url;
  });
}

export default function MediaPicker({ value, onChange, onError }: { value: MediaDraft; onChange: (v: MediaDraft) => void; onError: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const urls = useMemo(() => (value ? value.files.map((f) => URL.createObjectURL(f)) : []), [value]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  async function pick(list: FileList | null) {
    if (!list || !list.length) return;
    const files = Array.from(list);
    if (files.length === 1) {
      const f = files[0];
      if (f.type.startsWith("video/")) {
        setBusy(true);
        const len = await videoLength(f);
        setBusy(false);
        if (len > MAX_VIDEO_SECONDS) { onError(`Videos must be ${MAX_VIDEO_SECONDS}s or shorter.`); return; }
        onChange({ kind: "video", files: [f] });
      } else onChange({ kind: "image", files: [f] });
      return;
    }
    const photos = files.filter((f) => f.type.startsWith("image/")).slice(0, 10);
    if (photos.length < 2) { onError("Pick at least 2 photos for a multi-photo drop."); return; }
    onChange({ kind: "image", files: photos });
  }

  return (
    <div className="cx-card">
      <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      {value ? (
        <>
          <div className="cx-thumbs">
            {value.kind === "video"
              ? <video src={urls[0]} controls playsInline muted />
              : urls.map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt={`Photo ${i + 1}`} />
                ))}
          </div>
          <button type="button" className="linkish" onClick={() => onChange(null)}>Remove {value.kind === "video" ? "video" : value.files.length > 1 ? "photos" : "photo"}</button>
        </>
      ) : (
        <button type="button" className="cx-add" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? "Checking…" : "Add photos or a video"}
          <small>Up to 10 photos, or one video up to {MAX_VIDEO_SECONDS}s</small>
        </button>
      )}
    </div>
  );
}
