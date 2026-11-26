"use client";
// Search across every drop (backend search.py): videos, audio, photos, confessions, hookups.
// Tapping a result opens the swipe feed at that drop and carries on through the results.
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AudioLines, Bell, BellRing, Flame, Image as ImageIcon, Play, Type } from "lucide-react";
import { api, compact, type Post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { hookupTags } from "@/lib/linkup";

type Res = { results: Post[]; has_more: boolean; cursor: string | null; query_id: string | null };
type Chip = { key: "kind" | "media" | "since"; value: string; label: string };

const CHIPS: Chip[] = [
  { key: "kind", value: "hookup", label: "Hookups" },
  { key: "kind", value: "confession", label: "Confessions" },
  { key: "media", value: "video", label: "Videos" },
  { key: "media", value: "audio", label: "Audio" },
  { key: "media", value: "photo", label: "Photos" },
  { key: "since", value: "today", label: "Today" },
  { key: "since", value: "week", label: "This week" },
];
export const SEARCH_QUEUE_KEY = "anonixx.search.queue";

export default function AllSearch({ query, likeId, onPick, onTrack }: { query: string; likeId: string | null; onPick: (q: string) => void; onTrack: (n: number) => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState(query.trim());
  const [sel, setSel] = useState<Record<string, string>>({});
  const [items, setItems] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [popular, setPopular] = useState<string[]>([]);
  const [saved, setSaved] = useState<"" | "busy" | "done" | "error">("");
  const seq = useRef(0);
  const track = useRef(onTrack);
  track.current = onTrack;

  useEffect(() => {
    const t = window.setTimeout(() => setQ(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    api<{ popular: string[] }>("/search/suggest")
      .then((r) => setPopular(r.popular))
      .catch(() => {});
  }, []);

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  Object.entries(sel).forEach(([k, v]) => params.set(k, v));
  const url = likeId ? `/search/similar/${likeId}` : params.toString() ? `/search?${params}` : null;

  useEffect(() => {
    setSaved("");
    if (!url) { setItems([]); setCursor(null); setQueryId(null); return; }
    const mine = ++seq.current;
    setLoading(true);
    setFailed(false);
    api<Res>(url)
      .then((r) => {
        if (mine !== seq.current) return;
        setItems(r.results);
        setCursor(r.cursor ?? null);
        setQueryId(r.query_id ?? null);
        track.current(r.results.length);
      })
      .catch(() => { if (mine === seq.current) { setItems([]); setFailed(true); } })
      .finally(() => { if (mine === seq.current) setLoading(false); });
  }, [url]);

  async function more() {
    if (!url || !cursor || loading) return;
    const mine = seq.current;
    setLoading(true);
    try {
      const r = await api<Res>(`${url}&cursor=${encodeURIComponent(cursor)}`);
      if (mine !== seq.current) return;
      setItems((cur) => [...cur, ...r.results]);
      setCursor(r.cursor ?? null);
    } catch { /* keep what's shown */ } finally {
      if (mine === seq.current) setLoading(false);
    }
  }

  function toggle(c: Chip) {
    setSel((cur) => {
      const next = { ...cur };
      if (next[c.key] === c.value) delete next[c.key];
      else next[c.key] = c.value;
      return next;
    });
  }

  function open(post: Post, position: number) {
    if (queryId) api("/search/tap", { body: { query_id: queryId, drop_id: post.id, position, action: "open" } }).catch(() => {});
    try { sessionStorage.setItem(SEARCH_QUEUE_KEY, JSON.stringify({ posts: items, startId: post.id })); } catch { /* storage blocked */ }
    router.push("/search/watch");
  }

  async function save() {
    setSaved("busy");
    try {
      await api("/search/saved", { body: { q, kind: sel.kind || null, media: sel.media || null, topic: null } });
      setSaved("done");
    } catch { setSaved("error"); }
  }

  const searching = Boolean(q || Object.keys(sel).length);

  return (
    <>
      {likeId ? (
        <div className="sp-section"><span>More like this</span><Link href="/search">Back to search</Link></div>
      ) : searching ? (
        <>
          <div className="sp-facets dc-chips" aria-label="Filters">
            {CHIPS.map((c) => (
              <button key={c.key + c.value} type="button" className={`facet${sel[c.key] === c.value ? " on" : ""}`} aria-pressed={sel[c.key] === c.value} onClick={() => toggle(c)}>{c.label}</button>
            ))}
          </div>
          <div className="as-save">
            {user ? (
              <button type="button" className="pill" disabled={saved === "busy" || saved === "done"} onClick={save}>
                {saved === "done" ? <><BellRing size={15} strokeWidth={2} aria-hidden /> Saved. We&apos;ll tell you when new ones drop.</> : <><Bell size={15} strokeWidth={2} aria-hidden /> Save this search</>}
              </button>
            ) : null}
            {saved === "error" ? <small className="err">Couldn&apos;t save it. Try again.</small> : null}
          </div>
        </>
      ) : (
        <>
          {popular.length ? (
            <>
              <div className="sp-section"><span>Trending searches</span></div>
              <div className="sp-facets dc-chips as-moods">
                {popular.map((p) => <button key={p} type="button" className="facet" onClick={() => onPick(p)}>{p}</button>)}
              </div>
            </>
          ) : null}
        </>
      )}

      <div className="as-grid">
        {items.map((p, i) => <Tile key={p.id} post={p} onOpen={() => open(p, i)} />)}
      </div>
      {loading ? <p className="sp-loading">reading…</p> : null}
      {cursor && !loading ? <button type="button" className="dc-more" onClick={more}>Show more</button> : null}
      {!loading && (searching || likeId) && !items.length ? (
        <div className="dc-empty">
          <b>{failed ? "Couldn't search right now." : "Nothing matches that yet."}</b>
          <p>{failed ? "Check your connection and try again." : "Try another word."}</p>
        </div>
      ) : null}
    </>
  );
}

function Tile({ post, onOpen }: { post: Post; onOpen: () => void }) {
  const cover = post.cover_url || post.card_image_url || post.image_url || (post.images && post.images[0]) || null;
  const audio = Boolean(post.audio_url) && !post.video_url;
  const Badge = post.video_url ? Play : audio ? AudioLines : cover ? ImageIcon : Type;
  return (
    <button type="button" className={`as-tile${cover ? "" : " plain"}`} onClick={onOpen}>
      <span className="as-thumb">
        {cover ? <Image src={cover} alt="" fill sizes="(max-width: 520px) 50vw, 240px" /> : null}
        {!cover ? <span className="as-quote">{audio ? <AudioLines size={34} strokeWidth={2} aria-hidden /> : (post.content || "").slice(0, 140)}</span> : null}
        <span className="as-badge" aria-hidden><Badge size={13} strokeWidth={2} /></span>
        {post.kind === "hookup" ? <span className="as-kind"><Flame size={12} strokeWidth={2} aria-hidden /> Hookup</span> : null}
        <span className="as-likes">{compact(post.likes_count || 0)} likes</span>
      </span>
      {post.kind === "hookup" && hookupTags(post.hookup).length ? (
        <span className="as-tags">{hookupTags(post.hookup).slice(0, 3).map((t) => <span key={t}>{t}</span>)}</span>
      ) : null}
      {cover && post.content ? <span className="as-cap">{post.content}</span> : null}
    </button>
  );
}
