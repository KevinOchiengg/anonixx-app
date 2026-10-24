"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import VideoEditor from "./VideoEditor";
import { keepReadable, clearLocalCopies } from "@/lib/localCopy";
import { BgUpload } from "@/lib/bgUpload";
import UploadCard from "./UploadCard";
import { sniffVideo, formatProblem } from "@/lib/videoFormat";
import { MAX_CLIP_SECONDS, defaultEdit, type VideoEdit } from "@/lib/videoEdit";

// A video starts uploading the moment it's picked (upload); the form waits for it on submit.
export type MediaDraft = { kind: "image" | "video"; files: File[]; duration?: number; edit?: VideoEdit | null; upload?: BgUpload | null } | null;

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
  const [formatNote, setFormatNote] = useState("");
  const files = value?.files;
  const urls = useMemo(() => (files ? files.map((f) => URL.createObjectURL(f)) : []), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  async function pick(list: FileList | null) {
    if (!list || !list.length) return;
    value?.upload?.cancel();
    // Copy picks now, while Android still lets the page read them (see lib/localCopy.ts).
    setBusy(true);
    await clearLocalCopies();
    let files: File[];
    try { files = await Promise.all(Array.from(list).map(keepReadable)); } catch (e) { setBusy(false); onError((e as Error).message); return; }
    setBusy(false);
    if (files.length === 1) {
      const f = files[0];
      if (f.type.startsWith("video/")) {
        setBusy(true);
        const len = await videoLength(f);
        // The browser couldn't open it: find out why from the file itself.
        setFormatNote(len ? "" : formatProblem(await sniffVideo(f)));
        setBusy(false);
        // Longer than three minutes isn't refused: the editor opens on its first 3:00.
        onChange({ kind: "video", files: [f], duration: len, edit: len ? defaultEdit(len) : null, upload: new BgUpload(f) });
      } else onChange({ kind: "image", files: [f] });
      return;
    }
    const photos = files.filter((f) => f.type.startsWith("image/")).slice(0, 9);
    if (photos.length < 2) { onError("Pick at least 2 photos for a multi-photo drop."); return; }
    onChange({ kind: "image", files: photos });
  }

  return (
    <div className="cx-card">
      <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      {value ? (
        <>
          {value.kind === "video" && value.upload ? (
            <UploadCard
              up={value.upload}
              onReplace={() => input.current?.click()}
              onCancel={() => { value.upload?.cancel(); onChange(null); }}
              onRetry={() => onChange({ ...value, upload: new BgUpload(value.files[0]) })}
            />
          ) : null}
          {value.kind === "video" && value.edit && value.duration ? (
            <VideoEditor
              src={urls[0]}
              duration={value.duration}
              value={value.edit}
              onChange={(edit) => onChange({ ...value, edit })}
              onNoPreview={() => {
                onChange({ ...value, edit: null });
                sniffVideo(value.files[0]).then((r) => setFormatNote(formatProblem(r))).catch(() => {});
              }}
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
          {value.kind === "video" && formatNote && !(value.edit && value.duration) ? <p className="cx-note">{formatNote}</p> : null}
          <button type="button" className="linkish" onClick={() => { value.upload?.cancel(); onChange(null); }}>Remove {value.kind === "video" ? "video" : value.files.length > 1 ? "photos" : "photo"}</button>
        </>
      ) : (
        <button type="button" className="cx-add" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? "Checking…" : "Add photos or a video"}
          <small>Up to 9 photos, or one video (up to {MAX_CLIP_SECONDS / 60} min, trim it and add text)</small>
        </button>
      )}
    </div>
  );
}
