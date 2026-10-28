// Android can lose access to a picked file minutes later, so copy it right away: small files
// into memory, big ones into on-device private storage. Old copies clear on the next pick.

import { ApiError } from "./api";

const IN_MEMORY_MAX = 120 * 1024 * 1024;
const DIR = "anonixx-picks";

export const UNREADABLE_FILE =
  "Your phone wouldn't let the browser read that file. Pick it again from your gallery or Files app; if it's only in Google Photos or another cloud app, download it to your phone first.";

async function opfsDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage?.getDirectory?.();
    return root ? await root.getDirectoryHandle(DIR, { create: true }) : null;
  } catch {
    return null;
  }
}

// Removes copies left from earlier picks (best-effort).
export async function clearLocalCopies(): Promise<void> {
  try {
    const root = await navigator.storage?.getDirectory?.();
    await root?.removeEntry(DIR, { recursive: true });
  } catch { /* nothing to clear */ }
}

async function copyToDisk(file: File): Promise<File | null> {
  const dir = await opfsDir();
  if (!dir) return null;
  try {
    const name = `${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_").slice(-60) || "video"}`;
    const handle = await dir.getFileHandle(name, { create: true });
    const out = await (handle as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
    await file.stream().pipeTo(out);   // streamed: never the whole file in memory at once
    const copy = await handle.getFile();
    return new File([copy], file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    return null;
  }
}

// Reads the whole file in pieces, keeping none of it. Returns -1 when it all reads,
// else how far it got (0–1) — a file that stops partway isn't fully on the phone.
const CHUNK = 8 * 1024 * 1024;
async function readThrough(file: Blob): Promise<number> {
  for (let pos = 0; pos < file.size; pos += CHUNK) {
    try {
      await file.slice(pos, pos + CHUNK).arrayBuffer();
    } catch {
      return pos / file.size;
    }
  }
  return -1;
}

/** A copy of a just-picked file that stays readable for the rest of the session. */
export async function keepReadable(file: File): Promise<File> {
  if (file.size <= IN_MEMORY_MAX) {
    try {
      return new File([await file.arrayBuffer()], file.name, { type: file.type, lastModified: file.lastModified });
    } catch { /* checked below */ }
  } else {
    const onDisk = await copyToDisk(file);
    if (onDisk) return onDisk;
  }
  // Couldn't copy: if the whole file reads fine, use the original.
  const stoppedAt = await readThrough(file);
  if (stoppedAt < 0) return file;
  const mb = Math.round(file.size / (1024 * 1024));
  throw new ApiError(0, stoppedAt > 0
    ? `This video isn't fully on your phone: only ${Math.round(stoppedAt * 100)}% of its ${mb}MB could be read. Open it in your gallery app, let it finish downloading, then pick it again.`
    : UNREADABLE_FILE);
}
