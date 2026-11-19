"use client";
/** Live camera for chat: tap the shutter for a photo, switch to video and tap to start/stop
 * recording, flip front/back. Hands back a File, sent like any picked photo or video. */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "lucide-react";

const MAX_SECONDS = 60;

export default function CameraSheet({ onClose, onShot }: { onClose: () => void; onShot: (file: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState("");

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };

  const start = useCallback(async () => {
    stop();
    setError("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: mode === "video" });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
    } catch {
      setError("Allow camera access in your browser to take one.");
    }
  }, [facing, mode]);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) { setError("This browser can't open the camera."); return; }
    start();
    return stop;
  }, [start]);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setSecs((n) => {
      if (n + 1 >= MAX_SECONDS) rec.current?.stop();
      return n + 1;
    }), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  function photo() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    if (facing === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) { stop(); onShot(new File([b], `photo-${Date.now()}.jpg`, { type: "image/jpeg" })); } }, "image/jpeg", 0.9);
  }

  function toggleRecord() {
    if (recording) { rec.current?.stop(); return; }
    if (!stream.current || typeof MediaRecorder === "undefined") { setError("This browser can't record video."); return; }
    const type = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
    const r = new MediaRecorder(stream.current, type ? { mimeType: type } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = () => {
      setRecording(false);
      const mime = r.mimeType || "video/webm";
      const blob = new Blob(chunks.current, { type: mime });
      stop();
      if (blob.size) onShot(new File([blob], `video-${Date.now()}.${mime.includes("mp4") ? "mp4" : "webm"}`, { type: mime.split(";")[0] }));
    };
    rec.current = r;
    r.start(250);
    setSecs(0);
    setRecording(true);
  }

  return createPortal(
    <div className="cam" role="dialog" aria-label="Camera">
      <video ref={video} className={facing === "user" ? "mirror" : ""} playsInline muted autoPlay />
      <button type="button" className="cam-x" aria-label="Close camera" onClick={() => { rec.current?.state === "recording" && rec.current.stop(); stop(); onClose(); }}><X size={22} strokeWidth={2} aria-hidden /></button>
      {recording ? <span className="cam-rec">● {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span> : null}
      {error ? <p className="cam-err">{error}</p> : null}
      <div className="cam-bar">
        <div className="cam-modes" role="tablist">
          {(["photo", "video"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} disabled={recording} onClick={() => setMode(m)}>{m === "photo" ? "Photo" : "Video"}</button>
          ))}
        </div>
        <div className="cam-row">
          <span className="cam-side" />
          <button type="button" className={`cam-shutter${mode === "video" ? " vid" : ""}${recording ? " on" : ""}`}
            aria-label={mode === "photo" ? "Take photo" : recording ? "Stop recording" : "Start recording"}
            onClick={mode === "photo" ? photo : toggleRecord} disabled={!!error}><i /></button>
          <button type="button" className="cam-side cam-flip" aria-label="Switch camera" disabled={recording} onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}>
            <RefreshCw size={22} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
