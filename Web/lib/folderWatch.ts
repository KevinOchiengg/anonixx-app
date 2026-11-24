// Folder watching for folder posting (Chrome and Edge on a computer).
// The folder handle is kept in IndexedDB so the next visit can reuse it.

type FileEntry = { kind: "file"; name: string; getFile(): Promise<File> };
export type DirHandle = {
  kind: "directory";
  name: string;
  values(): AsyncIterable<FileEntry | DirHandle>;
  queryPermission?(o: { mode: "read" }): Promise<PermissionState>;
  requestPermission?(o: { mode: "read" }): Promise<PermissionState>;
};

const DB = "anx-folder-watch";
const STORE = "dirs";
const KEY = "bulk";

export const canWatchFolder = () =>
  typeof window !== "undefined" && "showDirectoryPicker" in window;

export async function pickFolder(): Promise<DirHandle | null> {
  try {
    const w = window as unknown as { showDirectoryPicker(o: { mode: "read" }): Promise<DirHandle> };
    return await w.showDirectoryPicker({ mode: "read" });
  } catch {
    return null;
  }
}

export async function listFiles(dir: DirHandle, match: (f: File) => boolean): Promise<File[]> {
  const out: File[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind === "file") {
      const f = await entry.getFile();
      if (match(f)) out.push(f);
    } else {
      out.push(...(await listFiles(entry, match)));
    }
  }
  return out;
}

export async function allowRead(dir: DirHandle): Promise<boolean> {
  try {
    if ((await dir.queryPermission?.({ mode: "read" })) === "granted") return true;
    return (await dir.requestPermission?.({ mode: "read" })) === "granted";
  } catch {
    return false;
  }
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export const saveFolder = (dir: DirHandle) => run("readwrite", (s) => s.put(dir, KEY));
export const loadFolder = () => run<DirHandle>("readonly", (s) => s.get(KEY));
export const forgetFolder = () => run("readwrite", (s) => s.delete(KEY));
