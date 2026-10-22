// Android only lets a page read a picked file while the picker's permission lasts — and
// Chrome can lose it a few minutes later (writing the caption, switching apps, the screen
// locking), so a video that previewed fine fails at upload with zero bytes sent. Copying
// the file the moment it's picked makes everything after that (preview, editor, cover,
// upload) read our own copy instead.
//
// Small files are copied into memory; big ones are streamed into the origin-private file
// system (on-device storage only this site can see), so a large video can't exhaust the
// phone's memory. Old copies are cleared on the next pick.

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
  // Couldn't keep a copy (no on-device storage, or a big file that's too much to hold
  // in memory). Never refuse a file that can actually be read: check it all reads, then
  // carry on with the original — it stays readable as long as the post goes up soon.
  const stoppedAt = await readThrough(file);
  if (stoppedAt < 0) return file;
  const mb = Math.round(file.size / (1024 * 1024));
  throw new ApiError(0, stoppedAt > 0
    ? `This video isn't fully on your phone: only ${Math.round(stoppedAt * 100)}% of its ${mb}MB could be read. Open it in your gallery app, let it finish downloading, then pick it again.`
    : UNREADABLE_FILE);
}
