"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { uploadFile, type UploadKind } from "@/lib/upload";
import AppShell from "./AppShell";
import "@/app/money.css";

type MyDrop = { id: string; confession: string | null };
const COST_PER_HOUR = 5;
const HOURS = [6, 12, 24, 48, 72];

function Inner() {
  const { refresh, user } = useAuth();
  const [drops, setDrops] = useState<MyDrop[] | null>(null);
  const [title, setTitle] = useState("");
  const [dropId, setDropId] = useState("");
  const [hours, setHours] = useState(24);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needCoins, setNeedCoins] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    api<{ drops: MyDrop[] }>("/ads/my-drops").then((r) => setDrops(r.drops)).catch(() => setDrops([]));
  }, []);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!/^(image|video|audio)\//.test(f.type)) { setError("Pick an image, GIF, video or audio file."); return; }
    setError(""); setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim() || !dropId) { setError("Add a title, a file, and pick a post to link to."); return; }
    setBusy(true); setError(""); setNeedCoins(false);
    try {
      const isGif = file.type === "image/gif";
      const mediaType = isGif ? "gif" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "image";
      const kind: UploadKind = mediaType === "video" ? "video" : mediaType === "audio" ? "voice" : "image";
      const url = await uploadFile(file, kind);
      const r = await api<{ message?: string }>("/ads", {
        body: { title: title.trim(), drop_id: dropId, media_url: url, media_type: mediaType, duration_hours: hours },
      });
      setDone(r.message || "Submitted. We review ads before they go live. Rejected ads are refunded.");
      refresh();
    } catch (err) {
      if ((err as { status?: number }).status === 402) setNeedCoins(true);
      setError((err as Error).message);
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="empty"><h2>Ad submitted</h2><p>{done}</p>
        <div className="row"><Link href="/" className="pill">Back to feed</Link></div></div>
    );
  }
  const cost = hours * COST_PER_HOUR;
  return (
    <form className="pad form" onSubmit={submit}>
      <p className="muted small">Promote one of your live posts in the feed. {COST_PER_HOUR} coins per hour. Every ad is reviewed first and refunded if rejected.</p>
      <label className="field">Title
        <input maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What stops the scroll?" required />
      </label>
      <label className="field">Post to link to
        <select value={dropId} onChange={(e) => setDropId(e.target.value)} required>
          <option value="">{drops === null ? "Loading…" : drops.length ? "Choose a post" : "You have no live posts"}</option>
          {(drops || []).map((d) => <option key={d.id} value={d.id}>{(d.confession || "Post with media").slice(0, 60)}</option>)}
        </select>
      </label>
      <label className="field">Image, GIF, video or audio
        <input type="file" accept="image/*,video/*,audio/*" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {preview && file?.type.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="preview" src={preview} alt="" />
      ) : null}
      {preview && file?.type.startsWith("video/") ? <video className="preview" src={preview} controls /> : null}
      {preview && file?.type.startsWith("audio/") ? <audio src={preview} controls /> : null}
      <div className="field">Duration
        <div className="chips">
          {HOURS.map((h) => <button type="button" key={h} className={h === hours ? "on" : ""} onClick={() => setHours(h)}>{h}h</button>)}
        </div>
      </div>
      <p className="small">Cost: <b>{cost} coins</b> <span className="muted">(you have {user?.coin_balance ?? 0})</span></p>
      {error ? <div className="err">{error}</div> : null}
      {needCoins ? <Link href="/coins" className="pill">Buy coins</Link> : null}
      <button className="btn" disabled={busy}>{busy ? "Submitting…" : `Submit for ${cost} coins`}</button>
    </form>
  );
}

export default function CreateAdPage() {
  return <AppShell title="Advertise" back="/settings"><Inner /></AppShell>;
}
