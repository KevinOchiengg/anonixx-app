"use client";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { BgUpload, fmtMB, type BgResult } from "@/lib/bgUpload";
import { captureCover } from "@/lib/coverFrame";
import { queueStreamDrop } from "@/lib/streamVideo";
import { uploadFile } from "@/lib/upload";
import { defaultEdit, isMeaningful } from "@/lib/videoEdit";
import { askConfirm, showAlert } from "@/lib/confirm";
import { videoLength } from "../compose/MediaPicker";
import "../../app/poststudio.css";
import "../../app/bulk.css";

const PARALLEL = 3;
const MAX_VID_MB = 500;
const MAX_DAYS = 365;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i;
const DONE_KEY = "anx:bulk:done";
const LAST_KEY = "anx:bulk:last";

type Status = "waiting" | "uploading" | "scheduling" | "done" | "failed";
type Item = { key: string; file: File; status: Status; pct: number; at: Date | null; error: string; tries: number; up?: BgUpload };

const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

function dateInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function nextDay(from: string | null) {
  const d = from ? new Date(from) : null;
  if (!d || Number.isNaN(d.getTime()) || d < new Date()) return dateInput(new Date(Date.now() + 86_400_000));
  d.setDate(d.getDate() + 1);
  return dateInput(d);
}

function slots(count: number, start: string, perDay: number, fromH: number, toH: number, after = 0): Date[] {
  const gap = ((toH - fromH) * 60) / perDay;
  const jitter = Math.min(10, gap / 4);
  const [y, m, d] = start.split("-").map(Number);
  const earliest = Math.max(Date.now() + 15 * 60_000, after + 60_000);
  const out: Date[] = [];
  for (let i = 0; out.length < count; i++) {
    const mins = fromH * 60 + gap * ((i % perDay) + 0.5) + (Math.random() * 2 - 1) * jitter;
    const at = new Date(y, m - 1, d + Math.floor(i / perDay), 0, Math.round(mins));
    if (at.getTime() >= earliest) out.push(at);
  }
  return out;
}

const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const fmtWhen = (d: Date) => `${fmtDay(d)}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;

function fmtDuration(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}

function shuffle<T>(list: T[]) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function BulkVideos() {
  const [items, setItems] = useState<Item[]>([]);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [perDay, setPerDay] = useState(10);
  const [fromH, setFromH] = useState(9);
  const [toH, setToH] = useState(23);
  const [start, setStart] = useState(() => dateInput(new Date(Date.now() + 86_400_000)));
  const [order, setOrder] = useState<"name" | "shuffle">("name");
  const [captions, setCaptions] = useState("");
  const [share, setShare] = useState(true);
  const [mature, setMature] = useState(false);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [over, setOver] = useState(false);
  const queue = useRef<Item[]>([]);
  const runningRef = useRef(false);
  const active = useRef(0);
  const doneSince = useRef(0);
  const settings = useRef({ captions: [] as string[], share, mature });
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const anyRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setStart(nextDay(readStore<string | null>(LAST_KEY, null))); }, []);

  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { window.removeEventListener("beforeunload", warn); lock?.release().catch(() => {}); };
  }, [running]);

  function addFiles(list: FileList | null) {
    if (!list?.length || runningRef.current) return;
    const done = readStore<Record<string, string>>(DONE_KEY, {});
    const known = new Set(items.map((i) => i.key));
    let skippedDone = 0;
    let skippedBig = 0;
    const fresh: Item[] = [];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith("video/") && !VIDEO_EXT.test(f.name)) continue;
      const key = fileKey(f);
      if (known.has(key)) continue;
      if (done[key]) { skippedDone++; continue; }
      if (f.size > MAX_VID_MB * 1024 * 1024) { skippedBig++; continue; }
      known.add(key);
      fresh.push({ key, file: f, status: "waiting", pct: 0, at: null, error: "", tries: 0 });
    }
    fresh.sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));
    const parts = [];
    if (skippedDone) parts.push(`${skippedDone} already scheduled`);
    if (skippedBig) parts.push(`${skippedBig} over ${MAX_VID_MB}MB`);
    setNote(parts.length ? `Skipped ${parts.join(" and ")}.` : "");
    setItems((cur) => [...cur, ...fresh]);
  }

  const waiting = items.filter((i) => i.status === "waiting");
  const unplanned = waiting.filter((i) => !i.at).length;
  const plan = useMemo(() => {
    if (!waiting.length || toH <= fromH || perDay < 1) return null;
    const planned = waiting.filter((i) => i.at).map((i) => i.at as Date);
    const all = [...planned, ...(unplanned ? slots(unplanned, start, perDay, fromH, toH) : [])].sort((a, b) => a.getTime() - b.getTime());
    const first = all[0];
    const last = all[all.length - 1];
    const days = Math.round((new Date(last.toDateString()).getTime() - new Date(first.toDateString()).getTime()) / 86_400_000) + 1;
    const ahead = Math.ceil((last.getTime() - Date.now()) / 86_400_000);
    return { days, first, last, ahead };
  }, [waiting, unplanned, perDay, start, fromH, toH]);

  function finish() {
    runningRef.current = false;
    setRunning(false);
    setStart(nextDay(readStore<string | null>(LAST_KEY, null)));
  }

  function pump() {
    while (runningRef.current && active.current < PARALLEL) {
      const it = queue.current.find((x) => x.status === "waiting");
      if (!it) break;
      active.current++;
      void runOne(it).finally(() => {
        active.current--;
        if (runningRef.current && active.current === 0 && !queue.current.some((x) => x.status === "waiting")) finish();
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
      it.status = "scheduling";
      bump();
      const at = new Date(Math.max((it.at ?? new Date()).getTime(), Date.now() + 3 * 60_000)).toISOString();
      const { captions: caps, share: sh, mature: mt } = settings.current;
      const caption = caps.length ? caps[queue.current.indexOf(it) % caps.length] : "";
      const base = {
        kind: "confession",
        confession: caption || undefined,
        font_style: "classic",
        sensitivity: mt ? "mature" : "general",
        publisher_opt_in: sh,
      };
      if ("streamUid" in res) {
        await queueStreamDrop({ ...base, media_type: "video" }, res.streamUid, null, at);
      } else {
        const len = await videoLength(it.file);
        const edit = len ? defaultEdit(len) : null;
        let cover_url: string | undefined;
        const src = URL.createObjectURL(it.file);
        try { cover_url = await uploadFile(await captureCover(src, 0, []), "image"); } catch { /* feed falls back to the video */ } finally { URL.revokeObjectURL(src); }
        const drop = {
          ...base,
          media_type: "video",
          media_url: res.url,
          ...(isMeaningful(edit, len) ? { video_edit: edit } : {}),
          ...(cover_url ? { cover_url } : {}),
        };
        await api("/admin/scheduled", { body: { publish_at: at, drop } });
      }
      it.status = "done";
      it.pct = 100;
      doneSince.current++;
      const done = readStore<Record<string, string>>(DONE_KEY, {});
      done[it.key] = at;
      writeStore(DONE_KEY, done);
      const last = readStore<string | null>(LAST_KEY, null);
      if (!last || at > last) writeStore(LAST_KEY, at);
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
    setStartedAt(Date.now());
    doneSince.current = 0;
    runningRef.current = true;
    setRunning(true);
    pump();
  }

  async function begin() {
    if (!plan) return;
    if (plan.ahead > MAX_DAYS) {
      showAlert({ title: "Too far ahead", message: `That runs ${plan.ahead} days out. Post more a day so it fits in ${MAX_DAYS}.`, icon: "warning" });
      return;
    }
    const ok = await askConfirm({
      title: `Schedule ${waiting.length} videos?`,
      message: `${perDay} a day, ${fmtDay(plan.first)} to ${fmtDay(plan.last)}. Keep this tab open while they upload.`,
      confirmLabel: "Start",
      icon: "info",
    });
    if (!ok) return;
    const kept = waiting.filter((i) => i.at).sort((a, b) => (a.at as Date).getTime() - (b.at as Date).getTime());
    const fresh = waiting.filter((i) => !i.at);
    const list = order === "shuffle" ? shuffle(fresh) : fresh;
    const after = kept.length ? (kept[kept.length - 1].at as Date).getTime() : 0;
    const times = slots(list.length, start, perDay, fromH, toH, after);
    list.forEach((it, i) => { it.at = times[i]; });
    waiting.forEach((it) => { it.tries = 0; });
    queue.current = [...items.filter((i) => i.status !== "waiting"), ...kept, ...list];
    settings.current = { captions: captions.split("\n").map((c) => c.trim()).filter(Boolean), share, mature };
    setItems(queue.current);
    go();
  }

  async function pause() {
    const ok = await askConfirm({
      title: "Pause uploads?",
      message: "Videos uploading now start over when you resume. Scheduled ones stay scheduled.",
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
    const ok = await askConfirm({ title: `Retry ${n} failed?`, message: "They keep the times they were given.", confirmLabel: "Retry", icon: "info" });
    if (!ok) return;
    queue.current.forEach((x) => { if (x.status === "failed") { x.status = "waiting"; x.tries = 0; } });
    bump();
    go();
  }

  async function clearList() {
    const ok = await askConfirm({ title: "Clear the list?", message: "Scheduled videos stay scheduled.", confirmLabel: "Clear", icon: "delete" });
    if (!ok) return;
    queue.current = [];
    setItems([]);
    setNote("");
  }

  const total = items.length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "failed");
  const busy = items.filter((i) => i.status === "uploading" || i.status === "scheduling");
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const eta = running && doneSince.current ? (elapsed / doneSince.current) * (waiting.length + busy.length) : 0;
  const pct = total ? Math.round(((doneCount + busy.reduce((s, i) => s + i.pct / 100, 0)) / total) * 100) : 0;
  const sizeLeft = waiting.reduce((s, i) => s + i.file.size, 0);
  const nextUp = waiting.slice(0, 5);
  const badHours = toH <= fromH;

  return (
    <div className="ps bk">
      <div className="ps-head">
        <div>
          <h2>Bulk videos</h2>
          <p>Pick hundreds at once. Each one posts as its own drop, spread over the days you choose.</p>
        </div>
      </div>

      <div className="bk-grid">
        <section className="ps-sec">
          <h3><i>1</i> Videos</h3>
          <div
            className={`ps-drop${over ? " over" : ""}${running ? " off" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => { if (!running) filesRef.current?.click(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !running) filesRef.current?.click(); }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
          >
            <b>{total ? "Add more videos" : "Select videos"}</b>
            <span>or drop them here · up to {MAX_VID_MB}MB each · every pick adds to the list</span>
          </div>
          <div className="bk-row">
            <button type="button" className="ps-btn" disabled={running} onClick={() => anyRef.current?.click()}>Browse files</button>
            <button type="button" className="ps-btn" disabled={running} onClick={() => folderRef.current?.click()}>Pick a folder</button>
            {total && !running ? <button type="button" className="ps-btn danger" onClick={clearList}>Clear list</button> : null}
          </div>
          <input ref={filesRef} type="file" accept="video/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={anyRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={folderRef} type="file" multiple hidden {...{ webkitdirectory: "" }} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          {total ? (
            <p className="bk-count"><b>{total}</b> videos · <b>{waiting.length}</b> waiting{waiting.length ? ` (${fmtMB(sizeLeft)})` : ""}</p>
          ) : null}
          {note ? <p className="bk-note">{note}</p> : null}
        </section>

        <section className="ps-sec">
          <h3><i>2</i> Schedule</h3>
          <div className="bk-fields">
            <label>Per day<input type="number" min={1} max={48} value={perDay} disabled={running} onChange={(e) => setPerDay(Math.max(1, Math.min(48, Number(e.target.value) || 1)))} /></label>
            <label>Starting<input type="date" min={dateInput(new Date())} value={start} disabled={running} onChange={(e) => setStart(e.target.value)} /></label>
            <label>From<select value={fromH} disabled={running} onChange={(e) => setFromH(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${h}:00`}</option>)}</select></label>
            <label>Until<select value={toH} disabled={running} onChange={(e) => setToH(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h + 1} value={h + 1}>{`${h + 1}:00`}</option>)}</select></label>
          </div>
          <div className="bk-seg" role="radiogroup" aria-label="Order">
            <button type="button" role="radio" aria-checked={order === "name"} className={order === "name" ? "on" : ""} disabled={running} onClick={() => setOrder("name")}>By file name</button>
            <button type="button" role="radio" aria-checked={order === "shuffle"} className={order === "shuffle" ? "on" : ""} disabled={running} onClick={() => setOrder("shuffle")}>Shuffle</button>
          </div>
          {badHours ? <p className="bk-note bad">&ldquo;Until&rdquo; has to be after &ldquo;From&rdquo;.</p> : plan ? (
            <p className="bk-plan">{waiting.length} videos · {perDay} a day · <b>{fmtDay(plan.first)}</b> to <b>{fmtDay(plan.last)}</b> ({plan.days} {plan.days === 1 ? "day" : "days"})</p>
          ) : null}
        </section>

        <section className="ps-sec">
          <h3><i>3</i> Captions <em>optional</em></h3>
          <label className="ps-text">
            One per line. They rotate across the videos; leave it empty for none.
            <textarea rows={4} value={captions} disabled={running} onChange={(e) => setCaptions(e.target.value)} placeholder={"nobody was supposed to see this\nwatch till the end"} />
          </label>
          <label className="ps-switch">
            <span><b>Share to Anonixx socials</b><small>Eligible for our official accounts.</small></span>
            <input type="checkbox" checked={share} disabled={running} onChange={(e) => setShare(e.target.checked)} />
          </label>
          <label className="ps-switch">
            <span><b>Mature content</b><small>Blurred until the viewer taps to reveal.</small></span>
            <input type="checkbox" checked={mature} disabled={running} onChange={(e) => setMature(e.target.checked)} />
          </label>
        </section>
      </div>

      {total ? (
        <section className="ps-sec bk-progress">
          <div className="bk-progress-head">
            <b>{doneCount} of {total} scheduled</b>
            <span>{running ? (eta ? `about ${fmtDuration(eta)} left` : "working…") : failed.length ? `${failed.length} failed` : doneCount === total ? "All scheduled" : doneCount ? "Paused" : ""}</span>
          </div>
          <div className="bk-bar"><i style={{ width: `${pct}%` }} /></div>
          {busy.length || nextUp.length ? (
            <ul className="bk-list">
              {busy.map((i) => (
                <li key={i.key}>
                  <span className="bk-name">{i.file.name}</span>
                  <span className="bk-meta">{i.status === "scheduling" ? "Scheduling…" : `${i.pct}%`}{i.at ? ` · ${fmtWhen(i.at)}` : ""}</span>
                </li>
              ))}
              {nextUp.map((i) => (
                <li key={i.key} className="wait">
                  <span className="bk-name">{i.file.name}</span>
                  <span className="bk-meta">{i.at ? fmtWhen(i.at) : fmtMB(i.file.size)}</span>
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
          <p className="bk-note">Scheduled videos show under <Link href="/admin/post">Post a drop</Link>. If this tab closes, pick the same videos again and the finished ones are skipped.</p>
        </section>
      ) : null}

      <div className="ps-bar">
        <div className="ps-bar-msg">
          {running ? <span>Uploading {busy.length} at a time. Keep this tab open.</span> : <span className="mute">{waiting.length ? "Ready when you are." : "Add videos to start."}</span>}
        </div>
        {running ? (
          <button type="button" className="ps-btn big" onClick={pause}>Pause</button>
        ) : failed.length && !waiting.length ? (
          <button type="button" className="ps-btn primary big" onClick={retryFailed}>Retry {failed.length} failed</button>
        ) : (
          <button type="button" className="ps-btn primary big" disabled={!plan || badHours} onClick={begin}>
            {waiting.length ? `Schedule ${waiting.length} videos` : "Schedule"}
          </button>
        )}
      </div>
    </div>
  );
}
