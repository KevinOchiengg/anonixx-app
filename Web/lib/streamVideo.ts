import { Upload } from "tus-js-client";
import { api, API_URL, ApiError, getToken } from "./api";
import { checkReadable } from "./upload";
import type { VideoEdit } from "./videoEdit";

// Video drops on Cloudflare Stream (Backend/app/utils/stream.py). The original goes
// straight to Stream over tus, so a dropped connection resumes instead of starting over;
// the backend then cuts the posted window out of it with the Anonixx watermark and
// publishes the drop once the clip is ready. Off until the backend has Stream configured,
// in which case callers keep uploading to R2.

let enabled: Promise<boolean> | null = null;
export function streamEnabled(): Promise<boolean> {
  enabled ??= api<{ enabled: boolean }>("/upload/stream/status").then((r) => r.enabled).catch(() => false);
  return enabled;
}

const CHUNK = 50 * 1024 * 1024; // Stream wants multiples of 256 KiB, at least 5 MB

export async function uploadToStream(file: Blob, onProgress?: (pct: number) => void): Promise<string> {
  await checkReadable(file);
  const endpoint = `${API_URL}/upload/stream/tus`;
  return new Promise((resolve, reject) => {
    let uid = "";
    const up = new Upload(file, {
      endpoint,
      chunkSize: CHUNK,
      retryDelays: [0, 2000, 5000, 10000, 20000],
      storeFingerprintForResuming: false,
      metadata: { filetype: file.type || "video/mp4" },
      // our token only goes to our own endpoint, never to Cloudflare's upload URL
      onBeforeRequest(req) {
        const token = getToken();
        if (token && req.getURL().startsWith(endpoint)) req.setHeader("Authorization", `Bearer ${token}`);
      },
      onAfterResponse(req, res) {
        if (req.getURL().startsWith(endpoint)) uid = res.getHeader("X-Stream-Uid") || uid;
      },
      onProgress(sent, total) { if (total) onProgress?.(Math.round((sent / total) * 100)); },
      onError(err) {
        const status = (err as { originalResponse?: { getStatus(): number } }).originalResponse?.getStatus() ?? 0;
        reject(new ApiError(status, status === 503 ? "Video uploads to Stream aren't switched on yet." : "The video upload didn't go through. Try again on a steadier connection."));
      },
      onSuccess() {
        if (uid) resolve(uid);
        else reject(new ApiError(0, "The video uploaded but Stream didn't say where. Try again."));
      },
    });
    up.start();
  });
}

export type StreamJob = { id: string; status: string; publish_at: string | null; drop_id: string | null; error: string | null };

// Queues the drop to publish once Stream has the clip ready (now, or at `publishAt`).
export function queueStreamDrop(drop: Record<string, unknown>, uid: string, edit: VideoEdit | null, publishAt: string | null) {
  return api<StreamJob>("/admin/scheduled", {
    body: {
      publish_at: publishAt,
      drop,
      stream: { uid, start: edit?.start ?? 0, end: edit?.end ?? null },
    },
  });
}

// Polls the job until it publishes or fails, up to `maxMs`. Returns the last state seen.
export async function waitForStreamDrop(id: string, onTick?: (s: StreamJob) => void, maxMs = 8 * 60 * 1000): Promise<StreamJob> {
  const until = Date.now() + maxMs;
  let last: StreamJob | null = null;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      last = await api<StreamJob>(`/admin/scheduled/${id}`);
      onTick?.(last);
      if (last.status === "published" || last.status === "failed") return last;
    } catch { /* keep polling through a blip */ }
  }
  return last ?? { id, status: "processing", publish_at: null, drop_id: null, error: null };
}
