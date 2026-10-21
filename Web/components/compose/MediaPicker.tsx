"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import VideoEditor from "./VideoEditor";
import { checkReadable } from "@/lib/upload";
import { MAX_CLIP_SECONDS, defaultEdit, type VideoEdit } from "@/lib/videoEdit";

export type MediaDraft = { kind: "image" | "video"; files: File[]; duration?: number; edit?: VideoEdit | null } | null;

export function videoLength(file: File): Promise<number> {
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
  const files = value?.files;
  const urls = useMemo(() => (files ? files.map((f) => URL.createObjectURL(f)) : []), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  async function pick(list: FileList | null) {
    if (!list || !list.length) return;
    const files = Array.from(list);
    if (files.length === 1) {
      const f = files[0];
      if (f.type.startsWith("video/")) {
        setBusy(true);
        try { await checkReadable(f); } catch (e) { setBusy(false); onError((e as Error).message); return; }
        const len = await videoLength(f);
        setBusy(false);
        // Longer than three minutes isn't refused: the editor opens on its first 3:00.
        onChange({ kind: "video", files: [f], duration: len, edit: len ? defaultEdit(len) : null });
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
          {value.kind === "video" && value.edit && value.duration ? (
            <VideoEditor
              src={urls[0]}
              duration={value.duration}
              value={value.edit}
              onChange={(edit) => onChange({ ...value, edit })}
              onNoPreview={() => onChange({ ...value, edit: null })}
            />
          ) : (
            <div className="cx-thumbs">
              {value.kind === "video"
                ? <video src={urls[0]} controls playsInline muted />
                : urls.map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={u} src={u} alt={`Photo ${i + 1}`} />
                  ))}
            </div>
          )}
          <button type="button" className="linkish" onClick={() => onChange(null)}>Remove {value.kind === "video" ? "video" : value.files.length > 1 ? "photos" : "photo"}</button>
        </>
      ) : (
        <button type="button" className="cx-add" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? "Checking…" : "Add photos or a video"}
          <small>Up to 10 photos, or one video (up to {MAX_CLIP_SECONDS / 60} min, trim it and add text)</small>
        </button>
      )}
    </div>
  );
}
