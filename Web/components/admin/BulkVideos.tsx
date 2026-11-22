"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { api } from "@/lib/api";
import { BgUpload, fmtMB, type BgResult } from "@/lib/bgUpload";
import { captureCover } from "@/lib/coverFrame";
import { queueStreamDrop } from "@/lib/streamVideo";
import { uploadFile } from "@/lib/upload";
import { defaultEdit, isMeaningful } from "@/lib/videoEdit";
import { askConfirm } from "@/lib/confirm";
import { videoLength } from "../compose/MediaPicker";
import "../../app/poststudio.css";
import "../../app/bulk.css";

const PARALLEL = 3;
const MAX_VID_MB = 500;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i;
const DONE_KEY = "anx:bulk:done";

type Status = "waiting" | "uploading" | "posting" | "done" | "failed";
type Item = { key: string; file: File; status: Status; pct: number; error: string; tries: number; up?: BgUpload };

const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

export const isVideoFile = (f: File) => f.type.startsWith("video/") || VIDEO_EXT.test(f.name);

function readDone(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function markDone(key: string) {
  try {
    const done = readDone();
    done[key] = new Date().toISOString();
    localStorage.setItem(DONE_KEY, JSON.stringify(done));
  } catch { /* storage full or blocked */ }
}

function fmtDuration(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}

export default function BulkVideos({ initial, onClose }: { initial: File[]; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [share, setShare] = useState(true);
  const [mature, setMature] = useState(false);
  const [running, setRunning] = useState(false);
  const [skipped, setSkipped] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const queue = useRef<Item[]>([]);
  const runningRef = useRef(false);
  const active = useRef(0);
  const doneSince = useRef(0);
  const settings = useRef({ share, mature });
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const done = readDone();
    let posted = 0;
    let big = 0;
    const list: Item[] = [];
    for (const f of initial) {
      if (!isVideoFile(f)) continue;
      const key = fileKey(f);
      if (done[key]) { posted++; continue; }
      if (f.size > MAX_VID_MB * 1024 * 1024) { big++; continue; }
      list.push({ key, file: f, status: "waiting", pct: 0, error: "", tries: 0 });
    }
    list.sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));
    const parts = [];
    if (posted) parts.push(`${posted} already posted`);
    if (big) parts.push(`${big} over ${MAX_VID_MB}MB`);
    setSkipped(parts.length ? `Skipped ${parts.join(" and ")}.` : "");
    queue.current = list;
    setItems(list);
  }, [initial]);

  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { window.removeEventListener("beforeunload", warn); lock?.release().catch(() => {}); };
  }, [running]);

  function pump() {
    while (runningRef.current && active.current < PARALLEL) {
      const it = queue.current.find((x) => x.status === "waiting");
      if (!it) break;
      active.current++;
      void runOne(it).finally(() => {
        active.current--;
        if (runningRef.current && active.current === 0 && !queue.current.some((x) => x.status === "waiting")) {
          runningRef.current = false;
          setRunning(false);
        }
        pump();
      });
    }
  }

  async function runOne(it: Item) {
    it.status = "uploading";
    it.pct = 0;
    it.error = "";
    bump();
    try {
      const up = new BgUpload(it.file);
      it.up = up;
      const unsub = up.subscribe((s) => { it.pct = s.pct; bump(); });
      let res: BgResult;
      try { res = await up.wait(); } finally { unsub(); }
      it.status = "posting";
      bump();
      const base = {
        kind: "confession",
        font_style: "classic",
        sensitivity: settings.current.mature ? "mature" : "general",
        publisher_opt_in: settings.current.share,
      };
      if ("streamUid" in res) {
        await queueStreamDrop({ ...base, media_type: "video" }, res.streamUid, null, null);
      } else {
        const len = await videoLength(it.file);
        const edit = len ? defaultEdit(len) : null;
        let cover_url: string | undefined;
        const src = URL.createObjectURL(it.file);
        try { cover_url = await uploadFile(await captureCover(src, 0, []), "image"); } catch { /* feed falls back to the video */ } finally { URL.revokeObjectURL(src); }
        await api("/drops", {
          body: {
            ...base,
            media_type: "video",
            media_url: res.url,
            ...(isMeaningful(edit, len) ? { video_edit: edit } : {}),
            ...(cover_url ? { cover_url } : {}),
          },
        });
      }
      it.status = "done";
      it.pct = 100;
      doneSince.current++;
      markDone(it.key);
    } catch (e) {
      if (!runningRef.current) {
        it.status = "waiting";
      } else if (it.tries < 1) {
        it.tries++;
        await new Promise((r) => setTimeout(r, 5000));
        it.status = "waiting";
      } else {
        it.status = "failed";
        it.error = (e as Error).message || "Upload failed";
      }
    } finally {
      it.up = undefined;
      bump();
    }
  }

  function go() {
    settings.current = { share, mature };
    setStartedAt(Date.now());
    doneSince.current = 0;
    runningRef.current = true;
    setRunning(true);
    pump();
  }

  async function start() {
    const n = queue.current.filter((x) => x.status === "waiting").length;
    const ok = await askConfirm({
      title: `Post ${n} videos?`,
      message: "Each one goes live as soon as it uploads. Keep this tab open until they finish.",
      confirmLabel: "Post them",
      icon: "info",
    });
    if (ok) go();
  }

  async function pause() {
    const ok = await askConfirm({
      title: "Pause posting?",
      message: "Videos uploading now start over when you resume. Posted ones stay posted.",
      confirmLabel: "Pause",
      icon: "warning",
    });
    if (!ok) return;
    runningRef.current = false;
    setRunning(false);
    queue.current.forEach((x) => x.up?.cancel());
  }

  async function retryFailed() {
    const n = queue.current.filter((x) => x.status === "failed").length;
    const ok = await askConfirm({ title: `Retry ${n} failed?`, confirmLabel: "Retry", icon: "info" });
    if (!ok) return;
    queue.current.forEach((x) => { if (x.status === "failed") { x.status = "waiting"; x.tries = 0; } });
    go();
  }

  async function back() {
    const left = queue.current.filter((i) => i.status === "waiting" || i.status === "failed").length;
    const posted = queue.current.some((i) => i.status === "done");
    if (left && posted) {
      const ok = await askConfirm({ title: "Leave folder posting?", message: `${left} videos aren't posted yet. Posted ones stay up.`, confirmLabel: "Leave", icon: "leave" });
      if (!ok) return;
    }
    onClose();
  }

  const total = items.length;
  const waiting = items.filter((i) => i.status === "waiting");
  const doneCount = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "failed");
  const busy = items.filter((i) => i.status === "uploading" || i.status === "posting");
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const eta = running && doneSince.current ? (elapsed / doneSince.current) * (waiting.length + busy.length) : 0;
  const pct = total ? Math.round(((doneCount + busy.reduce((s, i) => s + i.pct / 100, 0)) / total) * 100) : 0;
  const size = waiting.reduce((s, i) => s + i.file.size, 0);
  const started = running || doneCount > 0 || failed.length > 0;

  return (
    <div className="ps bk">
      <div className="ps-head bk-head">
        <div>
          <h2>Post a drop</h2>
          <p>Every video in the folder posts as its own drop, one after another.</p>
        </div>
        {!running ? <button type="button" className="ps-btn" onClick={back}>Back</button> : null}
      </div>

      <section className="ps-sec bk-card">
        {total ? (
          <>
            <div className="bk-progress-head">
              <b>{started ? `${doneCount} of ${total} posted` : `${total} videos ready`}</b>
              <span>
                {running ? (eta ? `about ${fmtDuration(eta)} left` : "working…")
                  : failed.length && !waiting.length ? `${failed.length} failed`
                  : doneCount === total ? "All posted"
                  : started ? "Paused" : fmtMB(size)}
              </span>
            </div>
            {started ? <div className="bk-bar"><i style={{ width: `${pct}%` }} /></div> : null}
          </>
        ) : (
          <b>No new videos in that folder.</b>
        )}
        {skipped ? <p className="bk-note">{skipped}</p> : null}

        {!started && total ? (
          <>
            <label className="ps-switch">
              <span><b>Share to Anonixx socials</b><small>Eligible for our official accounts.</small></span>
              <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
            </label>
            <label className="ps-switch">
              <span><b>Mature content</b><small>Blurred until the viewer taps to reveal.</small></span>
              <input type="checkbox" checked={mature} onChange={(e) => setMature(e.target.checked)} />
            </label>
          </>
        ) : null}

        {busy.length ? (
          <ul className="bk-list">
            {busy.map((i) => (
              <li key={i.key}>
                <span className="bk-name">{i.file.name}</span>
                <span className="bk-meta">{i.status === "posting" ? "Posting…" : `${i.pct}%`}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {failed.length ? (
          <details className="bk-failed">
            <summary>{failed.length} failed</summary>
            <ul className="bk-list">
              {failed.map((i) => (
                <li key={i.key} className="bad">
                  <span className="bk-name">{i.file.name}</span>
                  <span className="bk-meta">{i.error}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {started ? <p className="bk-note">If this tab closes, choose the same folder again and it carries on where it stopped.</p> : null}
      </section>

      <div className="ps-bar">
        <div className="ps-bar-msg">
          {running ? <span>Posting {busy.length} at a time. Keep this tab open.</span> : <span className="mute">{waiting.length ? "Ready when you are." : ""}</span>}
        </div>
        {running ? (
          <button type="button" className="ps-btn big" onClick={pause}>Pause</button>
        ) : failed.length && !waiting.length ? (
          <button type="button" className="ps-btn primary big" onClick={retryFailed}>Retry {failed.length} failed</button>
        ) : waiting.length ? (
          <button type="button" className="ps-btn primary big" onClick={start}>{started ? "Resume" : `Post ${waiting.length} videos`}</button>
        ) : (
          <button type="button" className="ps-btn primary big" onClick={onClose}>Done</button>
        )}
      </div>
    </div>
  );
}
