"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, type Sound } from "@/lib/api";
import { Badge, Pager, fmtDate } from "@/components/admin/bits";
import AdminMedia, { type DropMedia } from "@/components/admin/AdminMedia";
import CountryField from "@/components/compose/LocationFields";
import { askConfirm } from "@/lib/confirm";
import { useAdminRole } from "@/components/admin/AdminShell";
import VideoEditor from "@/components/compose/VideoEditor";
import { attachVideo } from "@/lib/attachVideo";
import { defaultEdit, type VideoEdit } from "@/lib/videoEdit";

type D = DropMedia & {
  id: string; sender_id: string | null; author: string | null; is_admin_drop: boolean; confession: string; confession_full: string | null; country?: string | null;
  promo_kind: "pin" | "boost" | null; promo_until: string | null;
  media_type: string | null; report_count: number; moderation_status: string | null; created_at: string | null;
  kind: string | null;
  video_edit: VideoEdit | null; duration_seconds: number | null;
  sound: { id: string; title: string; url: string; mute_original: boolean } | null;
  stats: { views: number; likes: number; comments: number; saves: number; reactions: number; linkups: number; unlocks: number; engagement: number | null };
};
const SORTS: [string, string][] = [["recent", "Newest"], ["views", "Most viewed"], ["likes", "Most liked"], ["comments", "Most discussed"], ["engagement", "Best engagement"]];
type Page = { total: number; skip: number; limit: number; drops: D[] };
const LIMIT = 20;
type Editing = {
  id: string; text: string; country: string; vedit: VideoEdit | null; touched: boolean;
  sound: string; mute: boolean; soundTouched: boolean;
};

// Super admin: the track that plays behind the drop, from the Sounds library.
function SoundPick({ sounds, video, value, mute, onChange }: {
  sounds: Sound[]; video: boolean; value: string; mute: boolean; onChange: (id: string, mute: boolean) => void;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [hearing, setHearing] = useState(false);
  const picked = sounds.find((x) => x.id === value);
  useEffect(() => () => audio.current?.pause(), []);
  function hear() {
    if (hearing) { audio.current?.pause(); setHearing(false); return; }
    if (!picked) return;
    audio.current?.pause();
    const a = new Audio(picked.url);
    a.onended = () => setHearing(false);
    audio.current = a;
    a.play().then(() => setHearing(true)).catch(() => setHearing(false));
  }
  if (!sounds.length) return <p className="muted small">No sounds yet. Add some on the <Link href="/admin/sounds">Sounds</Link> page.</p>;
  return (
    <div className="adm-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
      <select className="adm-select" value={value} aria-label="Sound"
        onChange={(e) => { audio.current?.pause(); setHearing(false); onChange(e.target.value, mute); }}>
        <option value="">No sound</option>
        {sounds.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
      </select>
      {picked ? <button type="button" className="adm-btn" onClick={hear}>{hearing ? "Stop" : "Listen"}</button> : null}
      {picked && video ? (
        <label className="small"><input type="checkbox" checked={mute} onChange={(e) => onChange(value, e.target.checked)} /> Mute the video&apos;s own sound</label>
      ) : null}
    </div>
  );
}

// Text over an existing video: finds its length, then opens the same editor as Post a drop.
function VideoText({ src, known, value, onChange }: { src: string; known: number | null; value: VideoEdit | null; onChange: (v: VideoEdit) => void }) {
  const probe = useRef<HTMLVideoElement>(null);
  const [len, setLen] = useState(known || 0);
  const [failed, setFailed] = useState(false);
  useEffect(() => (len || !probe.current ? undefined : attachVideo(probe.current, src)), [src, len]);
  useEffect(() => { if (len && !value) onChange(defaultEdit(len)); }, [len, value, onChange]);
  if (failed) return <p className="muted small">This video can&apos;t be previewed here, so text can&apos;t be added to it.</p>;
  if (!len || !value) {
    return (
      <>
        <video ref={probe} hidden muted preload="metadata" onLoadedMetadata={(e) => setLen(e.currentTarget.duration || 0)} onError={() => setFailed(true)} />
        <p className="muted small">Loading the video…</p>
      </>
    );
  }
  return <VideoEditor src={src} duration={len} value={value} onChange={onChange} onNoPreview={() => setFailed(true)} />;
}

const startEdit = (d: D): Editing => ({
  id: d.id, text: d.confession_full ?? d.confession, country: d.country || "", vedit: d.video_edit, touched: false,
  sound: d.sound?.id || "", mute: !!d.sound?.mute_original, soundTouched: false,
});

export default function AdminPosts() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    const q0 = u.get("q");
    if (q0) { setQ(q0); setSearch(q0); }
    if (u.get("edit")) setOnly(u.get("edit"));
    setReady(true);
  }, []);
  // ?edit=<id> (the pencil on a drop in the feed): that one drop, open in the editor.
  const { isSuper } = useAdminRole();
  const [only, setOnly] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sort, setSort] = useState("recent");
  const [skip, setSkip] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [promoting, setPromoting] = useState<{ id: string; kind: "pin" | "boost"; hours: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ skip: String(skip), limit: String(LIMIT) });
      if (search) p.set("search", search);
      if (only) p.set("id", only);
      p.set("sort", sort);
      const page = await api<Page>(`/admin/drops?${p}`);
      setData(page);
      const hit = only ? page.drops.find((x) => x.id === only) : null;
      if (hit?.is_admin_drop) setEditing((e) => e ?? startEdit(hit));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [skip, search, sort, only]);

  useEffect(() => { if (ready) load(); }, [load, ready]);

  async function remove(d: D) {
    if (!(await askConfirm({ title: "Delete this post?", message: "It's removed for everyone. This can't be undone.", confirmLabel: "Delete", tone: "danger", icon: "delete" }))) return;
    setBusy(d.id);
    try {
      await api(`/admin/drops/${d.id}`, { method: "DELETE" });
      setEditing(null);
      // From the feed's pencil: the drop is gone, so back to the feed.
      if (only) { window.location.href = "/"; return; }
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function promote(id: string, body: { kind: string; hours: number } | null) {
    setBusy(id);
    try {
      await api(`/admin/drops/${id}/promote`, body ? { method: "PATCH", body } : { method: "DELETE" });
      setPromoting(null);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function save() {
    if (!editing || !canSave(editing)) return;
    setBusy(editing.id);
    try {
      await api(`/admin/drops/${editing.id}`, {
        method: "PATCH",
        body: {
          confession: editing.text.trim(),
          location_country: editing.country,
          ...(editing.vedit && editing.touched ? { video_edit: editing.vedit } : {}),
          ...(isSuper && editing.soundTouched ? { sound_id: editing.sound, sound_mute_original: editing.mute } : {}),
        },
      });
      setEditing(null);
      // From the feed's pencil: back to the drop once it's saved.
      if (only && window.history.length > 1) { window.history.back(); return; }
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  const [sounds, setSounds] = useState<Sound[]>([]);
  useEffect(() => {
    if (isSuper && editing && !sounds.length) api<{ sounds?: Sound[] }>("/sounds").then((r) => setSounds(r.sounds || [])).catch(() => {});
  }, [isSuper, editing, sounds.length]);

  const dropOf = (id: string) => data?.drops.find((x) => x.id === id);
  const canSave = (e: Editing) => Boolean(e.text.trim() || dropOf(e.id)?.media_url);
  const setVedit = useCallback((v: VideoEdit) => setEditing((e) => (e ? { ...e, vedit: v, touched: e.vedit !== null } : e)), []);
  const promoButton = (d: D) => !isSuper ? null : d.promo_kind
    ? <button className="adm-btn" disabled={busy === d.id} onClick={() => promote(d.id, null)}>Stop {d.promo_kind === "pin" ? "pin" : "boost"}</button>
    : <button className="adm-btn" disabled={busy === d.id} onClick={() => setPromoting({ id: d.id, kind: "pin", hours: 24 })}>Pin / boost</button>;

  return (
    <>
      {only ? (
        <div className="adm-pagehead">
          <div><h2>Edit drop</h2><p className="muted small">Save takes you back to the drop.</p></div>
          <div className="adm-actions">
            <button type="button" className="adm-btn" onClick={() => window.history.back()}>Back</button>
            <button type="button" className="adm-btn" onClick={() => { setOnly(null); setEditing(null); window.history.replaceState(null, "", "/admin/posts"); }}>All posts</button>
          </div>
        </div>
      ) : <h2>Posts</h2>}
      {only && data?.drops[0] && !data.drops[0].is_admin_drop ? <p className="muted small">Only Anonixx drops can be edited. People&apos;s own drops stay as they wrote them.</p> : null}
      {only ? null : <form className="adm-search" onSubmit={(e) => { e.preventDefault(); setSkip(0); setSearch(q.trim()); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search post text" />
        <button className="adm-btn primary">Search</button>
        <select className="adm-select" value={sort} onChange={(e) => { setSkip(0); setSort(e.target.value); }} aria-label="Sort posts">
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </form>}
      {error ? <p className="err">{error}</p> : null}
      {!data ? <p className="muted">Loading…</p> : data.drops.length === 0 ? <p className="muted">No posts found.</p> : (
        <div className="adm-list">
          {data.drops.map((d) => (
            <div key={d.id} className="adm-card">
              <div className="adm-chips">
                <b>{d.author || "Anonymous"}</b>
                {d.is_admin_drop ? <Badge tone="warn">admin</Badge> : null}
                {d.promo_kind && d.promo_until ? <Badge tone="ok">{d.promo_kind === "pin" ? "pinned" : "boosted"} till {fmtDate(d.promo_until)}</Badge> : null}
                {d.media_type ? <Badge>{d.media_type}</Badge> : null}
                {d.report_count ? <Badge tone="bad">{d.report_count} report{d.report_count === 1 ? "" : "s"}</Badge> : null}
                {d.moderation_status ? <Badge>{d.moderation_status}</Badge> : null}
              </div>
              <AdminMedia media={d} open={editing?.id === d.id} />
              {editing?.id === d.id ? (
                <textarea
                  className="adm-edit" rows={4} maxLength={1800} autoFocus value={editing.text}
                  onChange={(e) => setEditing({ ...editing, text: e.target.value })} aria-label="Post text"
                />
              ) : null}
              {editing?.id === d.id && d.media_type === "video" && d.media_url ? (
                <div className="adm-vtext">
                  <b className="small">Text over the video</b>
                  <VideoText src={d.media_url} known={d.duration_seconds} value={editing.vedit} onChange={setVedit} />
                </div>
              ) : null}
              {editing?.id === d.id && isSuper && d.media_type !== "voice" ? (
                <div className="adm-vtext">
                  <b className="small">Sound</b>
                  <SoundPick
                    sounds={sounds} video={d.media_type === "video"} value={editing.sound} mute={editing.mute}
                    onChange={(sound, mute) => setEditing({ ...editing, sound, mute, soundTouched: true })}
                  />
                </div>
              ) : null}
              {editing?.id === d.id ? (
                <div className="adm-country"><CountryField value={editing.country} onChange={(country) => setEditing({ ...editing, country })} /></div>
              ) : <p className="adm-text">{d.confession || "[no text]"}</p>}
              <div className="adm-stats">
                <span><b>{d.stats.views}</b> views</span>
                <span><b>{d.stats.likes}</b> likes</span>
                <span><b>{d.stats.comments}</b> comments</span>
                <span><b>{d.stats.saves}</b> saves</span>
                {d.stats.reactions ? <span><b>{d.stats.reactions}</b> reactions</span> : null}
                {d.kind !== "confession" && !d.is_admin_drop ? <span><b>{d.stats.linkups}</b> link ups</span> : null}
                <span className="adm-eng" title="Likes, comments, saves and link ups per view">
                  <b>{d.stats.engagement == null ? "—" : `${d.stats.engagement}%`}</b> engagement
                </span>
              </div>
              {promoting?.id === d.id ? (
                <div className="adm-actions">
                  <select className="adm-select" value={promoting.kind} onChange={(e) => setPromoting({ ...promoting, kind: e.target.value as "pin" | "boost" })} aria-label="Pin or boost">
                    <option value="pin">Pin to top</option>
                    <option value="boost">Boost</option>
                  </select>
                  <select className="adm-select" value={promoting.hours} onChange={(e) => setPromoting({ ...promoting, hours: Number(e.target.value) })} aria-label="For how long">
                    <option value={6}>for 6 hours</option>
                    <option value={24}>for 1 day</option>
                    <option value={72}>for 3 days</option>
                    <option value={168}>for 7 days</option>
                  </select>
                  <button className="adm-btn" onClick={() => setPromoting(null)}>Cancel</button>
                  <button className="adm-btn primary" disabled={busy === d.id} onClick={() => promote(d.id, { kind: promoting.kind, hours: promoting.hours })}>Start</button>
                </div>
              ) : null}
              <div className="adm-foot">
                <span className="muted small">{editing?.id === d.id ? `${editing.text.length}/1800` : fmtDate(d.created_at)}</span>
                <div className="adm-actions">
                  {editing?.id === d.id ? (
                    <>
                      <button className="adm-btn danger" disabled={busy === d.id} onClick={() => remove(d)}>Delete</button>
                      {promoButton(d)}
                      <button className="adm-btn" disabled={busy === d.id} onClick={() => setEditing(null)}>Cancel</button>
                      <button className="adm-btn primary" disabled={busy === d.id || !canSave(editing)} onClick={save}>Save</button>
                    </>
                  ) : (
                    <>
                      {d.is_admin_drop ? <button className="adm-btn" disabled={busy === d.id} onClick={() => setEditing(startEdit(d))}>Edit</button> : null}
                      {d.is_admin_drop ? promoButton(d) : null}
                      <Link className="adm-btn" href={`/drop/${d.id}`} title="Open the post as people see it">View post</Link>
                      <button className="adm-btn danger" disabled={busy === d.id} onClick={() => remove(d)}>Delete</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {data && !only ? <Pager skip={data.skip} limit={data.limit} total={data.total} onSkip={setSkip} /> : null}
    </>
  );
}
