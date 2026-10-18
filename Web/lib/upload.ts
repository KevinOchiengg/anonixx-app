import { api, API_URL, ApiError, getToken } from "./api";

export type UploadKind = "image" | "video" | "voice";

const ENDPOINT: Record<UploadKind, string> = { image: "image", video: "video", voice: "audio" };
const MAX_MB: Record<UploadKind, number> = { image: 5, video: 50, voice: 10 };

function putXhr(url: string, file: Blob, type: string, onProgress?: (pct: number) => void) {
  return new Promise<{ ok: boolean; sent: boolean }>((resolve) => {
    const xhr = new XMLHttpRequest();
    let sent = false;
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => {
      if (e.loaded > 0) sent = true;
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, sent });
    xhr.onerror = () => resolve({ ok: false, sent });
    xhr.ontimeout = () => resolve({ ok: false, sent });
    xhr.send(file);
  });
}

// Straight to storage with a presigned URL. Returns null if that isn't possible
// (bucket CORS not set, signing failed...) so the caller can use the server route.
let directBlocked = false;
async function uploadDirect(file: Blob, kind: UploadKind, onProgress?: (pct: number) => void): Promise<string | null> {
  if (directBlocked) return null;
  const type = (file.type || (kind === "image" ? "image/jpeg" : kind === "video" ? "video/mp4" : "audio/webm")).split(";")[0];
  try {
    const s = await api<{ upload_url: string; public_url: string }>("/upload/sign", {
      body: { resource_type: kind === "voice" ? "audio" : kind, content_type: type },
    });
    const r = await putXhr(s.upload_url, file, type, onProgress);
    if (r.ok) return s.public_url;
    if (!r.sent) directBlocked = true;
  } catch { /* fall back */ }
  return null;
}

// Uploads the file and returns its public URL. Tries storage directly first, then our server.
export async function uploadFile(file: Blob | File, kind: UploadKind, onProgress?: (pct: number) => void): Promise<string> {
  if (file.size > MAX_MB[kind] * 1024 * 1024) {
    throw new ApiError(400, `That file is too big. Max ${MAX_MB[kind]}MB.`);
  }
  const direct = await uploadDirect(file, kind, onProgress);
  if (direct) return direct;
  onProgress?.(0);
  const form = new FormData();
  const name = file instanceof File ? file.name : kind === "voice" ? "voice.webm" : "upload";
  form.append("file", file, name);
  const token = getToken();
  const host = API_URL.replace(/^https?:\/\//, "").split("/")[0];

  const { status, body } = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/upload/${ENDPOINT[kind]}`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new ApiError(0, `Couldn't reach the upload server (${host}). Make sure the API is running, then try again.`));
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
