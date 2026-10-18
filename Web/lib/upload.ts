import { API_URL, ApiError, getToken } from "./api";

export type UploadKind = "image" | "video" | "voice";

const ENDPOINT: Record<UploadKind, string> = { image: "image", video: "video", voice: "audio" };
const MAX_MB: Record<UploadKind, number> = { image: 5, video: 50, voice: 10 };

// Posts the file to our backend, which forwards it to storage. Returns the public URL.
export async function uploadFile(file: Blob | File, kind: UploadKind, onProgress?: (pct: number) => void): Promise<string> {
  if (file.size > MAX_MB[kind] * 1024 * 1024) {
    throw new ApiError(400, `That file is too big. Max ${MAX_MB[kind]}MB.`);
  }
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
