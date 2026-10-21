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

/** A copy of a just-picked file that stays readable for the rest of the session. */
export async function keepReadable(file: File): Promise<File> {
  try {
    if (file.size <= IN_MEMORY_MAX) {
      return new File([await file.arrayBuffer()], file.name, { type: file.type, lastModified: file.lastModified });
    }
    const onDisk = await copyToDisk(file);
    if (onDisk) return onDisk;
    // No on-device storage available: a memory copy is the only way to keep it.
    return new File([await file.arrayBuffer()], file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    throw new ApiError(0, UNREADABLE_FILE);
  }
}
