"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, compact, type Post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { COUNTRIES, KENYA_COUNTIES } from "@/lib/locations";
import BottomNav from "./BottomNav";
import { Clock, Close, MapPin, SearchIcon } from "./feedicons";

const FILTERS = ["all", "recent", "popular"] as const;
const SUGGESTIONS = ["secrets", "heartbreak", "late night thoughts", "desire", "carrying it alone", "family"];
const THEMES: { id: string; label: string; accent: string }[] = [
  { id: "meet-me", label: "Meet Me", accent: "#FF6B8A" },
  { id: "skeleton-in-the-closet", label: "Skeleton In The Closet", accent: "#FF3B7A" },
  { id: "just-tonight", label: "Just Tonight", accent: "#FF1744" },
  { id: "the-exchange", label: "The Exchange", accent: "#4FC3E8" },
];
const HISTORY_KEY = "@anonixx_search_history";

type Loc = { country: string; county: string; sub: string; estate: string };
const NO_LOC: Loc = { country: "", county: "", sub: "", estate: "" };

export default function SearchPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [intent, setIntent] = useState("");
  const [loc, setLoc] = useState<Loc>(NO_LOC);
  const [locOpen, setLocOpen] = useState(false);
  const [results, setResults] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const seq = useRef(0);

  const hasLoc = Boolean(loc.country || loc.county || loc.sub || loc.estate);

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"));
    } catch { /* no history */ }
  }, []);

  const saveHistory = (list: string[]) => {
    setHistory(list);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
  };

  const run = useCallback(
    async (q: string, f: string, theme: string, l: Loc, remember = false) => {
      const trimmed = q.trim();
      const anyLoc = Boolean(l.country || l.county || l.sub || l.estate);
      if (!trimmed && !theme && !anyLoc) {
        setSearched(false);
        setResults([]);
        return;
      }
      const mine = ++seq.current;
      setLoading(true);
      setSearched(true);
      if (remember && trimmed) {
        setHistory((prev) => {
          const next = [trimmed, ...prev.filter((h) => h !== trimmed)].slice(0, 8);
          try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
          return next;
        });
      }
      const p = new URLSearchParams({ filter: f, limit: "30" });
      if (trimmed) p.set("q", trimmed);
      if (theme) p.set("intent", theme);
      if (l.country) p.set("location_country", l.country);
      if (l.county) p.set("location_county", l.county);
      if (l.sub) p.set("location_sub_county", l.sub);
      if (l.estate) p.set("location_estate", l.estate);
      try {
        const r = await api<{ results: Post[]; total: number }>(`/drops/search?${p}`);
        if (mine !== seq.current) return;
        setResults(r.results || []);
        setTotal(r.total || 0);
      } catch {
        if (mine !== seq.current) return;
        setResults([]);
        setTotal(0);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [],
  );

  // Live search as you type.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (query.trim().length >= 2 || (!query.trim() && (intent || hasLoc))) run(query, filter, intent, loc);
      else if (!query.trim()) { setSearched(false); setResults([]); }
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filter, intent, loc]);

  const where = useMemo(() => [loc.estate, loc.sub, loc.county, loc.country].filter(Boolean), [loc]);
  const themeLabel = THEMES.find((t) => t.id === intent)?.label;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(query, filter, intent, loc, true);
  };
  const fromChip = (s: string) => {
    setQuery(s);
    run(s, filter, intent, loc, true);
  };

  return (
    <div className="stage">
      <div className={`phone sp-phone${user ? " hasnav" : ""}`}>
        <form className="sp-head" onSubmit={submit}>
          <button type="button" className="sp-back" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} aria-label="Back">←</button>
          <div className="sp-input">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search secrets, moods, names…"
              aria-label="Search"
              autoFocus
            />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear"><Close /></button> : null}
          </div>
        </form>

        <div className="sp-filters">
          <div className="sp-sort">
            <span>Sort</span>
            {FILTERS.map((f) => (
              <button key={f} type="button" className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
          <div className="sp-facets">
            <button type="button" className={`facet${hasLoc ? " on" : ""}`} onClick={() => setLocOpen((v) => !v)}>
              <MapPin />{hasLoc ? where[0] : "Location"}
            </button>
            {THEMES.map((t) => (
              <button key={t.id} type="button" className={`facet${intent === t.id ? " on" : ""}`} onClick={() => setIntent(intent === t.id ? "" : t.id)}>
                <i style={{ background: t.accent }} />{t.label}
              </button>
            ))}
          </div>
          {locOpen ? (
            <div className="sp-loc">
              <input list="sp-countries" placeholder="Country" value={loc.country} onChange={(e) => setLoc({ ...loc, country: e.target.value })} />
              <input list={loc.country === "Kenya" ? "sp-counties" : undefined} placeholder="County or region" value={loc.county} onChange={(e) => setLoc({ ...loc, county: e.target.value })} />
              <input placeholder="Sub-county or area" value={loc.sub} onChange={(e) => setLoc({ ...loc, sub: e.target.value })} />
              <input placeholder="Estate or neighborhood" value={loc.estate} onChange={(e) => setLoc({ ...loc, estate: e.target.value })} />
              <datalist id="sp-countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
              <datalist id="sp-counties">{KENYA_COUNTIES.map((c) => <option key={c} value={c} />)}</datalist>
              {hasLoc ? <button type="button" className="sp-clear" onClick={() => setLoc(NO_LOC)}>Clear location</button> : null}
            </div>
          ) : null}
        </div>

        <div className="sp-body">
          {!searched ? (
            <div className="sp-pre">
              {history.length > 0 ? (
                <>
                  <div className="sp-section"><span>Recent</span><button type="button" onClick={() => saveHistory([])}>Clear all</button></div>
                  {history.map((h) => (
                    <div key={h} className="sp-hist" onClick={() => fromChip(h)}>
                      <Clock /><span>{h}</span>
                      <button type="button" aria-label="Remove" onClick={(e) => { e.stopPropagation(); saveHistory(history.filter((x) => x !== h)); }}><Close /></button>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className="sp-section"><span>Try searching for</span></div>
                  <div className="sp-chips">
                    {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => fromChip(s)}>{s}</button>)}
                  </div>
                </>
              )}
            </div>
          ) : loading ? (
            <p className="sp-loading">searching…</p>
          ) : results.length > 0 ? (
            <div className="sp-results">
              <p className="sp-count">
                {total} result{total !== 1 ? "s" : ""}
                {query.trim() ? ` for "${query.trim()}"` : intent && themeLabel ? ` in ${themeLabel}` : ""}
                {hasLoc ? ` near ${where.join(", ")}` : ""}
              </p>
              {results.map((p) => <ResultCard key={p.id} post={p} />)}
            </div>
          ) : (
            <div className="sp-empty">
              <SearchIcon />
              <b>nothing found</b>
              <p>try a different word — or a braver one</p>
            </div>
          )}
        </div>
        {user ? <BottomNav /> : null}
      </div>
    </div>
  );
}

function ResultCard({ post }: { post: Post }) {
  const media = post.card_image_url || post.image_url || (post.images && post.images[0]) || null;
  const text = post.content || "";
  return (
    <Link href={`/drop/${post.id}`} className="sp-card">
      <div className="sp-card-top">
        {post.kind === "hookup" ? <span className="tag">Hookup</span> : null}
        {post.mood_tag ? <span className="tag">{post.mood_tag}</span> : null}
        <span className="sp-time">{post.time_ago}</span>
      </div>
      {media ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="sp-media" src={media} alt="" loading="lazy" />
      ) : null}
      {text ? <p className="sp-text">{text}</p> : <p className="sp-text dim">A post with media</p>}
      <div className="sp-card-foot">
        <b>{post.anonymous_name || "Anonymous"}</b>
        <span>♥ {compact(post.likes_count || 0)}</span>
        <span>💬 {compact(post.thread_count || 0)}</span>
      </div>
    </Link>
  );
}
