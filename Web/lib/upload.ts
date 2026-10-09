import { API_URL, ApiError, getToken } from "./api";

export type UploadKind = "image" | "video" | "voice";

const ENDPOINT: Record<UploadKind, string> = { image: "image", video: "video", voice: "audio" };
const MAX_MB: Record<UploadKind, number> = { image: 5, video: 50, voice: 10 };

// Posts the file to our backend, which forwards it to storage. Returns the public URL.
export async function uploadFile(file: Blob | File, kind: UploadKind): Promise<string> {
  if (file.size > MAX_MB[kind] * 1024 * 1024) {
    throw new ApiError(400, `That file is too big. Max ${MAX_MB[kind]}MB.`);
  }
  const form = new FormData();
  const name = file instanceof File ? file.name : kind === "voice" ? "voice.webm" : "upload";
  form.append("file", file, name);
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/upload/${ENDPOINT[kind]}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
  } catch {
    throw new ApiError(0, "Upload failed. Check your connection.");
  }
  const data = (await res.json().catch(() => null)) as { url?: string; detail?: unknown } | null;
  if (!res.ok || !data?.url) {
    throw new ApiError(res.status, typeof data?.detail === "string" ? data.detail : "Upload failed. Try again.");
  }
  return data.url;
}
