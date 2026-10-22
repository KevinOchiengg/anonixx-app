import { api, API_URL, ApiError, getToken } from "./api";
import { UNREADABLE_FILE } from "./localCopy";

export type UploadKind = "image" | "video" | "voice";

const ENDPOINT: Record<UploadKind, string> = { image: "image", video: "video", voice: "audio" };
// Videos go up whole (trim is applied at playback), so they need room for a long original.
const MAX_MB: Record<UploadKind, number> = { image: 5, video: 500, voice: 10 };
// What the backup route through our server will take; bigger files only go direct to storage.
const SERVER_MAX_MB: Record<UploadKind, number> = { image: 5, video: 50, voice: 10 };

export const CANCELLED = "Upload cancelled.";
const cancelled = () => new ApiError(0, CANCELLED);

function putXhr(url: string, file: Blob, type: string, onProgress?: (pct: number) => void, signal?: AbortSignal) {
  return new Promise<{ ok: boolean; sent: boolean; status: number; aborted?: boolean }>((resolve) => {
    const xhr = new XMLHttpRequest();
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.onabort = () => resolve({ ok: false, sent: true, status: 0, aborted: true });
    let sent = false;
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => {
      if (e.loaded > 0) sent = true;
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, sent, status: xhr.status });
    xhr.onerror = () => resolve({ ok: false, sent, status: 0 });
    xhr.ontimeout = () => resolve({ ok: false, sent, status: 0 });
    xhr.send(file);
  });
}

// Straight to storage with a presigned URL. On failure returns why, so the caller can
// use the server route and still tell the user what actually went wrong.
let directBlocked = false;
async function uploadDirect(file: Blob, kind: UploadKind, onProgress?: (pct: number) => void, signal?: AbortSignal): Promise<{ url: string } | { reason: string }> {
  if (directBlocked) return { reason: "storage isn't reachable from this browser" };
  const type = (file.type || (kind === "image" ? "image/jpeg" : kind === "video" ? "video/mp4" : "audio/webm")).split(";")[0];
  let reason = "";
  // Two tries: a connection that drops mid-file gets one more go before we push the
  // whole thing through our server instead. Re-signed each time — a slow first try
  // can outlive the 5-minute URL.
  for (let attempt = 0; attempt < 2; attempt++) {
    let s: { upload_url: string; public_url: string };
    try {
      s = await api<{ upload_url: string; public_url: string }>("/upload/sign", {
        body: { resource_type: kind === "voice" ? "audio" : kind, content_type: type },
      });
    } catch (e) {
      return { reason: e instanceof Error && e.message ? e.message : "couldn't get an upload link" };
    }
    if (signal?.aborted) throw cancelled();
    if (attempt > 0) onProgress?.(0);
    const r = await putXhr(s.upload_url, file, type, onProgress, signal);
    if (r.aborted) throw cancelled();
    if (r.ok) return { url: s.public_url };
    if (!r.sent) {
      // Nothing left the browser: blocked outright (CORS, offline). Retrying won't help.
      directBlocked = r.status === 0;
      return { reason: r.status ? `storage rejected the file (${r.status})` : "couldn't connect to storage" };
    }
    reason = r.status ? `storage rejected the file (${r.status})` : "the connection dropped mid-upload";
    if (r.status >= 400 && r.status < 500) break;
  }
  return { reason };
}

// Phones can hand the browser a file it can't actually read — most often a video that
// lives in Google Photos or another cloud app rather than on the phone itself. An upload
// of such a file fails before a single byte is sent, which looks exactly like a dead
// connection. Reading a little from both ends first tells the two apart.
const PROBE = 256 * 1024;

export async function checkReadable(file: Blob): Promise<void> {
  try {
    await file.slice(0, PROBE).arrayBuffer();
    if (file.size > PROBE) await file.slice(Math.max(0, file.size - PROBE)).arrayBuffer();
  } catch {
    throw new ApiError(0, UNREADABLE_FILE);
  }
}

// Uploads the file and returns its public URL. Tries storage directly first, then our server.
// `signal` cancels it (rejects with CANCELLED).
export async function uploadFile(file: Blob | File, kind: UploadKind, onProgress?: (pct: number) => void, signal?: AbortSignal): Promise<string> {
  if (file.size > MAX_MB[kind] * 1024 * 1024) {
    throw new ApiError(400, `That file is too big. Max ${MAX_MB[kind]}MB.`);
  }
  await checkReadable(file);
  const direct = await uploadDirect(file, kind, onProgress, signal);
  if ("url" in direct) return direct.url;
  if (signal?.aborted) throw cancelled();
  if (file.size > SERVER_MAX_MB[kind] * 1024 * 1024) {
    throw new ApiError(0, `Upload didn't go through: ${direct.reason}. Files over ${SERVER_MAX_MB[kind]}MB can only go straight to storage, so try again on a steadier connection.`);
  }
  onProgress?.(0);
  const form = new FormData();
  const name = file instanceof File ? file.name : kind === "voice" ? "voice.webm" : "upload";
  form.append("file", file, name);
  const token = getToken();
  const host = API_URL.replace(/^https?:\/\//, "").split("/")[0];

  const { status, body } = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.onabort = () => reject(cancelled());
    xhr.open("POST", `${API_URL}/upload/${ENDPOINT[kind]}`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new ApiError(0, `Upload didn't go through: ${direct.reason}, and the backup server (${host}) didn't answer either. Try again on a steadier connection.`));
    xhr.ontimeout = () => reject(new ApiError(0, "The upload took too long. Try a smaller file."));
    xhr.send(form);
  });

  let data: { url?: string; detail?: unknown } | null = null;
  try { data = JSON.parse(body); } catch { /* non-JSON body */ }
  if (status < 200 || status >= 300 || !data?.url) {
    throw new ApiError(status, typeof data?.detail === "string" ? data.detail : `Upload failed (${status}). Try again.`);
  }
  return data.url;
}
