"use client";
/** My posts: everything the user has dropped, with its engagement, and edit / boost (hookups,
 * BOOST_COST coins) / add time / delete. Backend: GET /drops/mine, PATCH /drops/{id},
 * POST /drops/{id}/boost, POST /drops/{id}/extend, DELETE /drops/{id}. */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, Eye, Heart, MessageCircle, DoorOpen, Rocket, Pencil, Trash2 } from "lucide-react";
import { api, compact } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeLeft } from "@/lib/linkup";
import AppShell from "./AppShell";
import CountryField from "./compose/LocationFields";
import "@/app/myposts.css";

type Mine = {
  id: string; content: string; kind?: string | null; country?: string | null; time_ago: string;
  views_count: number; likes_count: number; saves_count: number; comments_count: number; knocks_count: number;
  live_until: string | null; is_live: boolean; boosted_until: string | null; under_review: boolean; edited_at: string | null;
};
type Data = { posts: Mine[]; total_views: number; total_likes: number; boost_cost: number; boost_hours: number };

const MAX = 1800;

function Stat({ icon, n, label }: { icon: React.ReactNode; n: number; label: string }) {
  return <span className="mp-stat" title={label} aria-label={`${n} ${label}`}>{icon}{compact(n)}</span>;
}

function Card({ p, cost, hours, onChange, onRemove, onToast }: {
  p: Mine; cost: number; hours: number;
  onChange: (id: string, patch: Partial<Mine>) => void; onRemove: (id: string) => void; onToast: (m: string) => void;
}) {
  const { refresh } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.content);
  const [country, setCountry] = useState(p.country || "");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState<"" | "boost" | "delete">("");
  const hookup = p.kind === "hookup";
  const left = hookup && p.is_live ? timeLeft(p.live_until) : null;
  const boostLeft = p.boosted_until ? timeLeft(p.boosted_until) : null;

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (e) { onToast((e as Error).message); } finally { setBusy(""); setConfirm(""); }
  }
  const save = () => run("save", async () => {
    const text = draft.trim();
    if (!text) throw new Error("It can't be empty.");
    await api(`/drops/${p.id}`, { method: "PATCH", body: { content: text, ...(hookup ? {} : { location_country: country }) } });
    onChange(p.id, { content: text, country: country || null, edited_at: new Date().toISOString() });
    setEditing(false);
    onToast("Saved.");
  });
  const boost = () => run("boost", async () => {
    const r = await api<{ boosted_until: string }>(`/drops/${p.id}/boost`, { method: "POST" });
    onChange(p.id, { boosted_until: r.boosted_until });
    refresh();
    onToast(`Boosted for ${hours} hours.`);
  });
  const remove = () => run("delete", async () => {
    await api(`/drops/${p.id}`, { method: "DELETE" });
    onRemove(p.id);
    onToast("Deleted.");
  });

  return (
    <article className={`mp-card${hookup ? " hk" : ""}`}>
      <div className="mp-top">
        <span className="mp-kind">{hookup ? "Hookup confession" : "Confession"}</span>
        <span className="mp-when">{p.time_ago}{p.edited_at ? " · edited" : ""}</span>
      </div>

      {editing ? (
        <div className="mp-edit">
          <textarea rows={5} maxLength={MAX} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edit your post" autoFocus />
          {hookup ? null : <CountryField value={country} onChange={setCountry} />}
          <div className="mp-row">
            <small>{MAX - draft.length}</small>
            <button type="button" className="pill ghost" onClick={() => { setEditing(false); setDraft(p.content); setCountry(p.country || ""); }}>Cancel</button>
            <button type="button" className="pill" disabled={busy === "save" || !draft.trim() || (draft.trim() === p.content && country === (p.country || ""))} onClick={save}>{busy === "save" ? "Saving…" : "Save"}</button>
          </div>
        </div>
      ) : (
        <Link href={`/drop/${p.id}`} className="mp-text">{p.content || "Media post"}</Link>
      )}

      <div className="mp-chips">
        {p.under_review ? <span className="warn">Under review</span> : null}
        {hookup ? (left ? <span className="live">Deletes in {left.replace(" left", "")}</span> : <span>Ended</span>) : null}
        {boostLeft ? <span className="boost">Boosted · {boostLeft}</span> : null}
      </div>

      {hookup ? <p className="mp-note">Stays up 7 days, then deletes itself. Link Ups you never answer are refunded.</p> : null}

      <div className="mp-stats">
        <Stat icon={<Eye aria-hidden />} n={p.views_count} label="views" />
        <Stat icon={<Heart aria-hidden />} n={p.likes_count} label="likes" />
        <Stat icon={<MessageCircle aria-hidden />} n={p.comments_count} label="comments" />
        <Stat icon={<Bookmark aria-hidden />} n={p.saves_count} label="saves" />
        {hookup ? <Stat icon={<DoorOpen aria-hidden />} n={p.knocks_count} label="knocks" /> : null}
      </div>

      {confirm ? (
        <div className="mp-confirm">
          <span>{confirm === "boost" ? `Boost for ${hours} hours for ${cost} coins?` : "Delete this post for good?"}</span>
          <button type="button" className="pill ghost" onClick={() => setConfirm("")}>No</button>
          <button type="button" className={`pill${confirm === "delete" ? " danger" : ""}`} disabled={!!busy} onClick={confirm === "boost" ? boost : remove}>
            {busy ? "…" : confirm === "boost" ? `Boost · ${cost} coins` : "Delete"}
          </button>
        </div>
      ) : !editing ? (
        <div className="mp-actions">
          <button type="button" onClick={() => setEditing(true)}><Pencil aria-hidden />Edit</button>
          {hookup && p.is_live && !p.under_review ? (
            <button type="button" className="hot" onClick={() => setConfirm("boost")}><Rocket aria-hidden />{boostLeft ? "Boost more" : "Boost"} · {cost}</button>
          ) : null}
          <button type="button" className="del" onClick={() => setConfirm("delete")} aria-label="Delete"><Trash2 aria-hidden /></button>
        </div>
      ) : null}
    </article>
  );
}

function Inner() {
  const { user } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(() => {
    api<Data>("/drops/mine").then(setData).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => { if (user) load(); }, [user, load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2400); return () => clearTimeout(t); }, [toast]);

  if (!user) return <div className="empty"><p>Sign in to see your posts.</p><Link className="pill" href="/login?next=/my-posts">Sign in</Link></div>;
  if (error) return <div className="empty"><p>{error}</p><button className="pill" onClick={() => { setError(""); load(); }}>Try again</button></div>;
  if (!data) return <div className="mp"><div className="mp-skel" /><div className="mp-skel" /></div>;

  const posts = data.posts;
  const knocks = posts.reduce((n, p) => n + (p.knocks_count || 0), 0);
  const change = (id: string, patch: Partial<Mine>) => setData((d) => d && { ...d, posts: d.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const remove = (id: string) => setData((d) => d && { ...d, posts: d.posts.filter((p) => p.id !== id) });

  return (
    <div className="mp">
      <div className="mp-sum">
        <div><b>{posts.length}</b><span>Posts</span></div>
        <div><b>{compact(data.total_views)}</b><span>Views</span></div>
        <div><b>{compact(data.total_likes)}</b><span>Likes</span></div>
        <div><b>{compact(knocks)}</b><span>Knocks</span></div>
      </div>

      {posts.length === 0 ? (
        <div className="empty"><p>Nothing posted yet.</p><Link className="pill" href="/compose">Drop your first</Link></div>
      ) : posts.map((p) => (
        <Card key={p.id} p={p} cost={data.boost_cost} hours={data.boost_hours} onChange={change} onRemove={remove} onToast={setToast} />
      ))}

      {toast ? <div className="mp-toast" role="status">{toast}</div> : null}
    </div>
  );
}

export default function MyPostsPage() {
  return (
    <AppShell title="My posts" back="/profile">
      <Inner />
    </AppShell>
  );
}
