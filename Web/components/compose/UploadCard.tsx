"use client";
import { useBgUpload, fmtEta, fmtMB, type BgUpload } from "@/lib/bgUpload";
import "../../app/uploadcard.css";

type Props = {
  up: BgUpload;
  onReplace: () => void;
  onCancel: () => void;
  onRetry: () => void;
};

// The TikTok-style progress card: shown the moment a video is picked, while the
// upload runs in the background and the post is being written.
export default function UploadCard({ up, onReplace, onCancel, onRetry }: Props) {
  const s = useBgUpload(up);
  if (!s) return null;
  const done = s.status === "done";
  const failed = s.status === "error";
  return (
    <div className={`uc${done ? " done" : ""}${failed ? " bad" : ""}`}>
      <div className="uc-ic" aria-hidden>
        {done
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="13" height="14" rx="2.5" /><path d="m16 10 5-3v10l-5-3" /></svg>}
      </div>
      <div className="uc-body">
        <div className="uc-top">
          <b title={up.file.name}>{up.file.name || "video"}</b>
          <span>{fmtMB(up.file.size)}</span>
        </div>
        <div className="uc-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.pct}>
          <i style={{ width: `${failed ? 100 : s.pct}%` }} />
        </div>
        <div className="uc-meta">
          {failed ? <span className="uc-err">{s.error}</span>
            : done ? <span>Uploaded. Finish your post and publish.</span>
            : s.status === "cancelled" ? <span>Upload cancelled.</span>
            : <span>Uploading {s.pct}%{s.etaSec != null && s.pct > 2 ? ` · ${fmtEta(s.etaSec)}` : ""}. Keep writing your post meanwhile.</span>}
        </div>
      </div>
      <div className="uc-acts">
        {failed ? <button type="button" className="uc-btn primary" onClick={onRetry}>Retry</button> : null}
        <button type="button" className="uc-btn" onClick={onReplace}>Replace</button>
        {s.status === "uploading" || failed ? <button type="button" className="uc-btn" onClick={onCancel}>{failed ? "Remove" : "Cancel"}</button> : null}
      </div>
    </div>
  );
}
