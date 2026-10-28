"use client";
// Discover (backend discover.py). Near: fresh Link Ups and Rooms in a chosen place. Stories:
// confessions by latest, unanswered, trending, mood, topic. Place and recent searches stay on
// this device and never change your posts' location.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, compact, type Post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { trackSearch } from "@/lib/track";
import { hookupTags } from "@/lib/linkup";
import { COUNTRIES, KENYA_COUNTIES } from "@/lib/locations";
import AgeGate from "./AgeGate";
import BottomNav from "./BottomNav";
import { Clock, Close, MapPin, SearchIcon } from "./feedicons";

type Tab = "near" | "stories";
type Scope = "close" | "area" | "country" | "anywhere";
type Place = { scope: Scope; country: string; county: string; sub: string };
type Room = { user_id: string; listing: string; open: boolean; intro: string | null; room_theme: string; avatar_url: string | null; door_rule: string; anonymous_name?: string | null; place?: string | null };
type NearCard = { post: Post; place: string | null; room: Room; more_posts: number };
type Page<T> = { results: T[]; has_more: boolean; cursor: string | null; gate?: "signin" | "adult"; needs_place?: string; trending_ready?: boolean; loose?: boolean };
type Chip = { kind: "place" | "country" | "gender" | "fresh" | "topic"; value: string; label: string; country?: string };
type Parsed = { query: string; surface: Tab | null; gender: string | null; country: string | null; county: string | null; topic: string | null; fresh: string | null; keyword: string; chips: Chip[]; suggest: Chip[] };
type Suggestion = { kind: string; label: string; apply?: Chip; text?: string };
type Filters = { gender: string; fresh: string; ageMin: string; ageMax: string; hosting: string; openOnly: boolean };

const WHERE_KEY = "@anonixx_discover_in";
const TAB_KEY = "@anonixx_discover_tab";
const HISTORY_KEY = "@anonixx_search_history";
const NO_FILTERS: Filters = { gender: "", fresh: "", ageMin: "", ageMax: "", hosting: "", openOnly: false };
const SCOPES: { id: Scope; label: string; hint: string }[] = [
  { id: "close", label: "Close by", hint: "Your part of town" },
  { id: "area", label: "My area", hint: "Your city or county" },
  { id: "country", label: "My country", hint: "Anywhere in the country" },
  { id: "anywhere", label: "Anywhere", hint: "The whole world" },
];
const STORY_TABS = [["latest", "Latest"], ["unanswered", "Unanswered"], ["trending", "Trending"]] as const;
const FRESH = [["tonight", "Tonight"], ["weekend", "This weekend"], ["week", "This week"]] as const;

const store = {
  get<T>(k: string, fallback: T): T {
    try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
  },
  set(k: string, v: unknown) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ }
  },
};

function placeLabel(p: Place): string {
  if (p.scope === "anywhere") return "Anywhere";
  if (p.scope === "country") return p.country || "Pick a country";
  if (p.scope === "close") return p.sub ? `${p.sub}${p.county ? `, ${p.county}` : ""}` : "Pick your area";
  return p.county || p.country || "Pick a place";
}

export default function SearchPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("near");
  const [query, setQuery] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [where, setWhere] = useState<Place | null>(null);       // saved "Discover in"
  const [override, setOverride] = useState<Place | null>(null); // from a typed place, this visit only
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [stab, setStab] = useState<(typeof STORY_TABS)[number][0]>("latest");
  const [topic, setTopic] = useState("");
  const [topics, setTopics] = useState<{ moods: { id: string; label: string }[]; topics: { id: string; label: string }[] }>({ moods: [], topics: [] });
  const [sheet, setSheet] = useState<"" | "where" | "filters">("");
  const [history, setHistory] = useState<string[]>([]);
  const [applied, setApplied] = useState<Chip[]>([]);          // chips in force, from typing or a suggestion
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [focused, setFocused] = useState(false);

  const place = override || where;
  const keyword = parsed ? parsed.keyword : query.trim();

  // ── first load: tab, saved place (else the profile's own area), topics, history ──
  useEffect(() => {
    setTab(store.get<Tab>(TAB_KEY, "near"));
    setHistory(store.get<string[]>(HISTORY_KEY, []));
    api<typeof topics>("/discover/topics").then(setTopics).catch(() => {});
    const saved = store.get<Place | null>(WHERE_KEY, null);
    if (saved) { setWhere(saved); return; }
    setWhere({ scope: "anywhere", country: "", county: "", sub: "" });
  }, []);
  useEffect(() => {
    if (!user || store.get<Place | null>(WHERE_KEY, null)) return;
    api<{ location_country?: string | null; location_county?: string | null; location_sub_county?: string | null }>("/users/me")
      .then((d) => {
        const p: Place = {
          scope: d.location_county ? "area" : d.location_country ? "country" : "anywhere",
          country: d.location_country || "", county: d.location_county || "", sub: d.location_sub_county || "",
        };
        setWhere(p);
      })
      .catch(() => {});
  }, [user]);

  const pickTab = (t: Tab) => { setTab(t); store.set(TAB_KEY, t); };
  const saveWhere = (p: Place) => { setWhere(p); setOverride(null); store.set(WHERE_KEY, p); setSheet(""); };

  // ── typed text -> chips ──
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setParsed(null); return; }
    const t = window.setTimeout(() => {
      api<Parsed>(`/discover/parse?q=${encodeURIComponent(q)}`)
        .then((p) => {
          setParsed(p);
          if (p.surface) pickTab(p.surface);
          if (p.county) p.chips = p.chips.map((c) => (c.kind === "place" ? { ...c, country: p.country || "" } : c));
          p.chips.forEach((c) => applyChip(c, false));   // the parsed surface already picked the tab
        })
        .catch(() => setParsed(null));
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // ── suggestions while typing (curated lists only) + matching recent searches ──
  useEffect(() => {
    if (!focused) return;
    const t = window.setTimeout(() => {
      api<{ suggestions: Suggestion[] }>(`/discover/suggest?surface=${tab}&q=${encodeURIComponent(query.trim())}`)
        .then((r) => setSugs(r.suggestions))
        .catch(() => setSugs([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [query, focused, tab]);

  /** Put a chip in force: the same effect whether it came from typing or a tap. */
  function applyChip(c: Chip, switchTab = true) {
    if (c.kind === "gender") setFilters((f) => ({ ...f, gender: c.value }));
    if (c.kind === "fresh") setFilters((f) => ({ ...f, fresh: c.value }));
    if (c.kind === "topic") { setTopic(c.value); if (switchTab) pickTab("stories"); }
    if (c.kind === "place") setOverride({ scope: "area", country: c.country || "", county: c.value, sub: "" });
    if (c.kind === "country") setOverride({ scope: "country", country: c.value, county: "", sub: "" });
    if (switchTab && (c.kind === "gender" || c.kind === "fresh" || c.kind === "place" || c.kind === "country")) pickTab("near");
    setApplied((cur) => [...cur.filter((x) => x.kind !== c.kind), c]);
  }

  function dropChip(c: Chip) {
    if (c.kind === "place" || c.kind === "country") setOverride(null);
    if (c.kind === "gender") setFilters((f) => ({ ...f, gender: "" }));
    if (c.kind === "fresh") setFilters((f) => ({ ...f, fresh: "" }));
    if (c.kind === "topic") setTopic("");
    setApplied((cur) => cur.filter((x) => x !== c));
  }

  function pickSuggestion(sg: Suggestion) {
    if (sg.apply) { applyChip(sg.apply); setQuery(""); setParsed(null); }
    else if (sg.text) setQuery(sg.text);
    setFocused(false);
  }

  function clearAll() {
    applied.forEach(dropChip);
    setQuery(""); setParsed(null); setOverride(null); setApplied([]);
  }

  function remember() {
    const q = query.trim();
    if (!q) return;
    const next = [q, ...history.filter((h) => h !== q)].slice(0, 8);
    setHistory(next);
    store.set(HISTORY_KEY, next);
  }
  const clearHistory = () => { setHistory([]); store.set(HISTORY_KEY, []); };

  const surprise = async () => {
    try {
      const r = await api<{ post: Post | null }>("/discover/surprise");
      if (r.post) router.push(`/drop/${r.post.id}`);
    } catch { /* nothing to show */ }
  };

  return (
    <div className="stage">
      <div className="phone sp-phone dc hasnav">
        <form className="sp-head" onSubmit={(e) => { e.preventDefault(); remember(); }}>
          <button type="button" className="sp-back" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} aria-label="Back">←</button>
          <div className="sp-input">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => window.setTimeout(() => setFocused(false), 150)}
              placeholder={tab === "near" ? "try “dem wa Kisumu”, “jamaa Thika tonight”" : "try “stories za heartbreak”"}
              aria-label="Search"
              aria-autocomplete="list"
              aria-expanded={focused && sugs.length > 0}
              enterKeyHint="search"
            />
            {query || applied.length ? <button type="button" onClick={clearAll} aria-label="Clear search and filters"><Close /></button> : null}
          </div>
          {focused && (sugs.length || history.length) ? (
            <ul className="dc-sug" role="listbox" aria-label="Suggestions">
              {history.filter((h) => !query.trim() || h.toLowerCase().startsWith(query.trim().toLowerCase())).slice(0, 3).map((h) => (
                <li key={`h-${h}`} role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(h); setFocused(false); }}>
                  <Clock /><span>{h}</span><small>recent</small>
                </li>
              ))}
              {sugs.map((sg) => (
                <li key={`${sg.kind}-${sg.label}`} role="option" aria-selected={false} data-track={`discover:suggestion:${sg.kind}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pickSuggestion(sg)}>
                  {sg.kind === "place" || sg.kind === "country" ? <MapPin /> : <SearchIcon />}
                  <span>{sg.label}</span>
                  <small>{sg.apply ? ({ place: "place", country: "country", gender: "who", fresh: "when", topic: "mood" } as Record<string, string>)[sg.kind] || "filter" : ""}</small>
                </li>
              ))}
            </ul>
          ) : null}
        </form>

        <div className="dc-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "near"} className={tab === "near" ? "on" : ""} onClick={() => pickTab("near")}>Near</button>
          <button role="tab" aria-selected={tab === "stories"} className={tab === "stories" ? "on" : ""} onClick={() => pickTab("stories")}>Stories</button>
        </div>

        {applied.length ? (
          <div className="dc-read" aria-label="Filters from your search">
            <span>{parsed?.chips.length ? "Reading it as" : "Filtering by"}</span>
            {applied.map((c) => (
              <button key={c.kind + c.value} type="button" onClick={() => dropChip(c)} aria-label={`Remove ${c.label}`}>{c.label}<Close /></button>
            ))}
          </div>
        ) : null}
        {parsed?.suggest?.filter((c) => !applied.some((a) => a.kind === c.kind && a.value === c.value)).length ? (
          <div className="dc-read maybe" aria-label="Did you mean">
            <span>Did you mean</span>
            {parsed.suggest.filter((c) => !applied.some((a) => a.kind === c.kind && a.value === c.value)).map((c) => (
              <button key={c.kind + c.value} type="button" onClick={() => applyChip(c)}>+ {c.label}</button>
            ))}
          </div>
        ) : null}

        <div className="sp-body">
          {tab === "near" ? (
            <Near
              place={place}
              overridden={!!override}
              filters={filters}
              setFilters={setFilters}
              keyword={keyword}
              signedIn={!!user}
              onWhere={() => setSheet("where")}
              onFilters={() => setSheet("filters")}
              onWiden={(p) => saveWhere(p)}
              onStories={() => pickTab("stories")}
              onTrack={(n) => trackSearch(query, { theme: `near:${place?.scope || ""}`, place: place?.county || place?.country || "", n })}
            />
          ) : (
            <Stories
              stab={stab}
              setStab={setStab}
              topic={topic}
              setTopic={setTopic}
              topics={topics}
              keyword={keyword}
              onSurprise={surprise}
              onTrack={(n) => trackSearch(query, { theme: topic || stab, n })}
            />
          )}

          {!query && history.length ? (
            <div className="dc-hist">
              <div className="sp-section"><span>Recent on this device</span><button type="button" onClick={clearHistory}>Clear history</button></div>
              {history.map((h) => (
                <div key={h} className="sp-hist" onClick={() => setQuery(h)}>
                  <Clock /><span>{h}</span>
                  <button type="button" aria-label="Remove" onClick={(e) => { e.stopPropagation(); const n = history.filter((x) => x !== h); setHistory(n); store.set(HISTORY_KEY, n); }}><Close /></button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {sheet === "where" && where ? <WhereSheet current={place || where} onSave={saveWhere} onClose={() => setSheet("")} /> : null}
        {sheet === "filters" ? <FilterSheet value={filters} onSave={(f) => { setFilters(f); setSheet(""); }} onClose={() => setSheet("")} /> : null}
        <BottomNav />
      </div>
    </div>
  );
}

// ── shared paging hook ──
function usePaged<T>(url: string | null, onFirst?: (n: number) => void) {
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<Omit<Page<T>, "results">>({ has_more: false, cursor: null });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  const first = useRef(onFirst);
  first.current = onFirst;

  useEffect(() => {
    if (!url) { setItems([]); setMeta({ has_more: false, cursor: null }); return; }
    const mine = ++seq.current;
    setLoading(true);
    setFailed(false);
    api<Page<T>>(url)
      .then((r) => {
        if (mine !== seq.current) return;
        setItems(r.results);
        const { results: _r, ...rest } = r;
        setMeta(rest);
        first.current?.(r.results.length);
      })
      .catch(() => { if (mine === seq.current) { setItems([]); setFailed(true); } })
      .finally(() => { if (mine === seq.current) setLoading(false); });
  }, [url]);

  const more = useCallback(async () => {
    if (!url || !meta.cursor || loading) return;
    const mine = seq.current;
    setLoading(true);
    try {
      const r = await api<Page<T>>(`${url}${url.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(meta.cursor)}${meta.loose ? "&loose=true" : ""}`);
      if (mine !== seq.current) return;
      setItems((cur) => [...cur, ...r.results]);
      const { results: _r, ...rest } = r;
      setMeta(rest);
    } catch { /* keep what's shown */ } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [url, meta.cursor, loading]);

  return { items, meta, loading, failed, more };
}

function placeParams(p: Place): URLSearchParams {
  const q = new URLSearchParams({ scope: p.scope });
  if (p.scope !== "anywhere" && p.country) q.set("country", p.country);
  if ((p.scope === "area" || p.scope === "close") && p.county) q.set("county", p.county);
  if (p.scope === "close" && p.sub) q.set("sub_county", p.sub);
  return q;
}

const WIDER: Record<Scope, Scope | null> = { close: "area", area: "country", country: "anywhere", anywhere: null };

// ── NEAR ──
function Near({
  place, overridden, filters, setFilters, keyword, signedIn, onWhere, onFilters, onWiden, onStories, onTrack,
}: {
  place: Place | null; overridden: boolean; filters: Filters; setFilters: (f: Filters) => void; keyword: string; signedIn: boolean;
  onWhere: () => void; onFilters: () => void; onWiden: (p: Place) => void; onStories: () => void; onTrack: (n: number) => void;
}) {
  const [gateOpen, setGateOpen] = useState(false);
  const base = useMemo(() => {
    if (!place) return null;
    const q = placeParams(place);
    if (filters.gender) q.set("gender", filters.gender);
    if (filters.fresh) q.set("fresh", filters.fresh);
    if (filters.ageMin) q.set("age_min", filters.ageMin);
    if (filters.ageMax) q.set("age_max", filters.ageMax);
    if (filters.hosting) q.set("hosting", filters.hosting);
    if (filters.openOnly) q.set("open_only", "true");
    return q;
  }, [place, filters]);
  const nearUrl = base ? `/discover/near?${base}${keyword ? `&q=${encodeURIComponent(keyword)}` : ""}` : null;
  const roomsUrl = place && !keyword ? `/discover/rooms?${placeParams(place)}${filters.openOnly ? "&open_only=true" : ""}` : null;
  const near = usePaged<NearCard>(nearUrl, onTrack);
  const rooms = usePaged<Room>(roomsUrl);
  const advanced = [filters.ageMin || filters.ageMax, filters.hosting, filters.openOnly].filter(Boolean).length;
  const set = (k: keyof Filters, v: string) => setFilters({ ...filters, [k]: filters[k] === v ? "" : v });
  const wider = place ? WIDER[place.scope] : null;

  return (
    <>
      <div className="dc-where">
        <button type="button" className="dc-place" onClick={onWhere}>
          <MapPin />
          <span><small>Discover in{overridden ? " · from your search" : ""}</small><b>{place ? placeLabel(place) : "…"}</b></span>
          <em>Change</em>
        </button>
      </div>
      <div className="sp-facets dc-chips">
        <button type="button" className={`facet${filters.gender === "woman" ? " on" : ""}`} onClick={() => set("gender", "woman")}>Women</button>
        <button type="button" className={`facet${filters.gender === "man" ? " on" : ""}`} onClick={() => set("gender", "man")}>Men</button>
        {FRESH.map(([id, label]) => (
          <button key={id} type="button" className={`facet${filters.fresh === id ? " on" : ""}`} onClick={() => set("fresh", id)}>{label}</button>
        ))}
        <button type="button" className={`facet${advanced ? " on" : ""}`} onClick={onFilters}>Filters{advanced ? ` · ${advanced}` : ""}</button>
      </div>

      {near.meta.gate ? (
        <div className="dc-empty">
          <b>Near is for adults.</b>
          {near.meta.gate === "signin" ? (
            <>
              <p>Sign in and confirm you&apos;re 18+ to see who&apos;s looking near you. Nobody sees that you looked.</p>
              <div className="dc-acts"><Link className="dc-cta" href="/login?next=/search">Sign in</Link><button type="button" className="pill" onClick={onStories}>Read Stories</button></div>
            </>
          ) : gateOpen ? (
            <AgeGate compact onDone={() => window.location.reload()} />
          ) : (
            <>
              <p>Confirm you&apos;re 18+ once and Near opens.</p>
              <div className="dc-acts"><button type="button" className="dc-cta" onClick={() => setGateOpen(true)}>I&apos;m 18+</button><button type="button" className="pill" onClick={onStories}>Read Stories</button></div>
            </>
          )}
        </div>
      ) : near.meta.needs_place ? (
        <div className="dc-empty">
          <b>{place?.scope === "close" ? "Tell us your part of town." : "Pick a place first."}</b>
          <p>{place?.scope === "close" ? "Close by needs your area (like Westlands or Milimani). Nobody sees it but you." : "Choose where to look."}</p>
          <div className="dc-acts">
            <button type="button" className="dc-cta" onClick={onWhere}>Choose a place</button>
            {place && wider ? <button type="button" className="pill" onClick={() => onWiden({ ...place, scope: wider })}>Look wider</button> : null}
          </div>
        </div>
      ) : (
        <>
          {rooms.items.length ? (
            <section className="dc-rooms" aria-label="Open Rooms">
              <div className="sp-section"><span>Rooms you can knock on</span></div>
              <div className="dc-rooms-row">
                {rooms.items.map((r) => (
                  <Link key={r.user_id} href={`/room/${r.user_id}`} className="dc-room" data-track="discover:rooms:open">
                    <Avatar url={r.avatar_url} name={r.anonymous_name} />
                    <b>{r.anonymous_name || "Anonymous"}</b>
                    {r.place ? <small>{r.place}</small> : null}
                    {r.intro ? <p>{r.intro}</p> : null}
                    <span className={r.open ? "dc-open" : "dc-break"}>{r.open ? "Open" : "Taking a break"}</span>
                  </Link>
                ))}
                {rooms.meta.has_more ? <button type="button" className="dc-room more" onClick={rooms.more}>More Rooms</button> : null}
              </div>
            </section>
          ) : null}

          {near.meta.loose && near.items.length ? <p className="dc-note">No post has all of those words, so these have some of them.</p> : null}
          {near.items.map((c) => <NearItem key={c.post.id} card={c} />)}

          {near.loading ? <p className="sp-loading">looking…</p> : null}
          {near.meta.has_more && !near.loading ? <button type="button" className="dc-more" onClick={near.more}>Show more</button> : null}

          {!near.loading && !near.items.length && !near.failed ? (
            <div className="dc-empty">
              <b>No fresh connections {place?.scope === "anywhere" ? "right now" : "in this area yet"}.</b>
              <p>{keyword || filters.gender || filters.fresh || advanced ? "Nothing matches all of that. Loosen a filter or look wider." : "Be the first one people find here, or look a little wider."}</p>
              <div className="dc-acts">
                {place && wider ? <button type="button" className="dc-cta" data-track="discover:near:widen" onClick={() => onWiden({ ...place, scope: wider })}>Look in {wider === "anywhere" ? "the whole world" : wider === "country" ? "my country" : "my area"}</button> : null}
                <button type="button" className="pill" onClick={onWhere}>Change place</button>
                <button type="button" className="pill" onClick={onStories}>Read Stories</button>
                {signedIn ? <Link className="pill" href="/compose">Post a hookup</Link> : null}
              </div>
            </div>
          ) : null}
          {near.failed ? <div className="dc-empty"><b>Couldn&apos;t load Near.</b><p>Check your connection and try again.</p></div> : null}
        </>
      )}
    </>
  );
}

function Avatar({ url, name }: { url: string | null; name?: string | null }) {
  return (
    <span className="dc-ava">
      {url ? <Image src={url} alt="" width={88} height={88} /> : <i>{(name || "A").trim().charAt(0).toUpperCase()}</i>}
    </span>
  );
}

function NearItem({ card }: { card: NearCard }) {
  const { post, room } = card;
  const tags = hookupTags(post.hookup);
  return (
    <article className="dc-card">
      <div className="dc-card-top">
        <Link href={`/room/${room.user_id}`} aria-label="Open their Room"><Avatar url={room.avatar_url || post.avatar_url || null} name={post.anonymous_name} /></Link>
        <div className="dc-who">
          <b>{post.anonymous_name || "Anonymous"}</b>
          <small>{[card.place, post.time_ago].filter(Boolean).join(" · ")}</small>
        </div>
        <span className={room.open ? "dc-open" : "dc-break"}>{room.open ? "Open to knocks" : "Taking a break"}</span>
      </div>
      {tags.length ? <div className="dc-tags">{tags.map((t) => <span key={t}>{t}</span>)}</div> : null}
      <Link href={`/drop/${post.id}`} className="dc-text">{post.content}</Link>
      {room.intro ? <p className="dc-intro">“{room.intro}”</p> : null}
      <div className="dc-acts">
        <Link className="dc-cta" href={`/room/${room.user_id}`} data-track="discover:near:view-room">View Room</Link>
        <Link className="pill" href={`/drop/${post.id}`} data-track="discover:near:read">Read it</Link>
        {card.more_posts ? <small>+{card.more_posts} more in their Room</small> : null}
      </div>
    </article>
  );
}

// ── STORIES ──
function Stories({
  stab, setStab, topic, setTopic, topics, keyword, onSurprise, onTrack,
}: {
  stab: (typeof STORY_TABS)[number][0]; setStab: (s: (typeof STORY_TABS)[number][0]) => void; topic: string; setTopic: (t: string) => void;
  topics: { moods: { id: string; label: string }[]; topics: { id: string; label: string }[] }; keyword: string;
  onSurprise: () => void; onTrack: (n: number) => void;
}) {
  const q = new URLSearchParams({ tab: stab });
  if (topic) q.set("topic", topic);
  if (keyword) q.set("q", keyword);
  const list = usePaged<Post>(`/discover/stories?${q}`, onTrack);

  return (
    <>
      <div className="dc-stabs">
        {STORY_TABS.map(([id, label]) => (
          <button key={id} type="button" className={stab === id ? "on" : ""} onClick={() => setStab(id)}>{label}</button>
        ))}
        <button type="button" className="dc-surprise" onClick={onSurprise} data-track="discover:surprise">Surprise me</button>
      </div>
      {topics.moods.length ? (
        <>
          <div className="sp-section"><span>Moods</span>{topic ? <button type="button" onClick={() => setTopic("")}>Clear</button> : null}</div>
          <div className="sp-facets dc-chips">
            {topics.moods.map((m) => <button key={m.id} type="button" className={`facet${topic === m.id ? " on" : ""}`} onClick={() => setTopic(topic === m.id ? "" : m.id)}>{m.label}</button>)}
          </div>
          <div className="sp-section"><span>Topics</span></div>
          <div className="sp-facets dc-chips">
            {topics.topics.map((m) => <button key={m.id} type="button" className={`facet${topic === m.id ? " on" : ""}`} onClick={() => setTopic(topic === m.id ? "" : m.id)}>{m.label}</button>)}
          </div>
        </>
      ) : null}

      {stab === "trending" && list.meta.trending_ready === false ? (
        <p className="dc-note">Not enough going on for Trending yet, so here&apos;s what&apos;s newest.</p>
      ) : null}
      {stab === "unanswered" && list.items.length ? <p className="dc-note">Nobody has answered these yet. Be the first.</p> : null}
      {list.meta.loose && list.items.length ? <p className="dc-note">No post has all of those words, so these have some of them.</p> : null}

      <div className="sp-results">{list.items.map((p) => <StoryCard key={p.id} post={p} />)}</div>
      {list.loading ? <p className="sp-loading">reading…</p> : null}
      {list.meta.has_more && !list.loading ? <button type="button" className="dc-more" onClick={list.more}>Show more</button> : null}
      {!list.loading && !list.items.length ? (
        <div className="dc-empty">
          <b>{list.failed ? "Couldn't load Stories." : "Nothing here yet."}</b>
          <p>{list.failed ? "Check your connection and try again." : keyword || topic ? "Try a different word, or a braver one." : "Be the first to say it."}</p>
          <div className="dc-acts">
            {topic || keyword ? <button type="button" className="pill" onClick={() => setTopic("")}>Clear topic</button> : null}
            <Link className="dc-cta" href="/compose">Write a confession</Link>
          </div>
        </div>
      ) : null}
    </>
  );
}

function StoryCard({ post }: { post: Post }) {
  const media = post.cover_url || post.card_image_url || post.image_url || (post.images && post.images[0]) || null;
  const text = post.content || "";
  return (
    <Link href={`/drop/${post.id}`} className="sp-card" data-track="discover:stories:open">
      <div className="sp-card-top">
        <span className="sp-time">{post.time_ago}</span>
      </div>
      {media ? <Image className="sp-media" src={media} alt="" width={800} height={450} sizes="100vw" /> : null}
      {text ? <p className="sp-text">{text}</p> : <p className="sp-text dim">A post with media</p>}
      <div className="sp-card-foot">
        <b>{post.anonymous_name || "Anonymous"}</b>
        <span>♥ {compact(post.likes_count || 0)}</span>
        <span>💬 {post.thread_count ? compact(post.thread_count) : "be first"}</span>
      </div>
    </Link>
  );
}

// ── sheets ──
function WhereSheet({ current, onSave, onClose }: { current: Place; onSave: (p: Place) => void; onClose: () => void }) {
  const [p, setP] = useState<Place>(current);
  const [elsewhere, setElsewhere] = useState(false);
  const needsCounty = p.scope === "area" || p.scope === "close";
  const ready = p.scope === "anywhere" || (p.country && (!needsCounty || p.county) && (p.scope !== "close" || p.sub));
  return (
    <div className="dc-sheet" role="dialog" aria-modal="true" aria-label="Where to discover" onClick={onClose}>
      <div className="dc-sheet-in" onClick={(e) => e.stopPropagation()}>
        <h3>Discover in</h3>
        <p className="dc-note">This is only where you&apos;re looking. The location on your posts doesn&apos;t change, and nobody sees where you browse.</p>
        <div className="dc-scopes">
          {SCOPES.map((s) => (
            <button key={s.id} type="button" className={p.scope === s.id ? "on" : ""} onClick={() => setP({ ...p, scope: s.id })}>
              <b>{s.label}</b><small>{s.hint}</small>
            </button>
          ))}
        </div>
        {p.scope !== "anywhere" ? (
          <>
            <button type="button" className="sp-clear" onClick={() => setElsewhere((v) => !v)}>{elsewhere ? "Done" : "Somewhere else?"}</button>
            {elsewhere || !p.country || (needsCounty && !p.county) || (p.scope === "close" && !p.sub) ? (
              <div className="sp-loc">
                <input list="dc-countries" placeholder="Country" value={p.country} onChange={(e) => setP({ ...p, country: e.target.value })} />
                {needsCounty ? <input list={p.country === "Kenya" ? "dc-counties" : undefined} placeholder="City, county or region" value={p.county} onChange={(e) => setP({ ...p, county: e.target.value })} /> : null}
                {p.scope === "close" ? <input placeholder="Part of town (e.g. Westlands)" value={p.sub} onChange={(e) => setP({ ...p, sub: e.target.value })} /> : null}
                <datalist id="dc-countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
                <datalist id="dc-counties">{KENYA_COUNTIES.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            ) : (
              <p className="dc-note">Looking in <b>{placeLabel(p)}</b>.</p>
            )}
          </>
        ) : null}
        <div className="dc-acts">
          <button type="button" className="dc-cta" disabled={!ready} onClick={() => onSave({ ...p, country: p.country.trim(), county: p.county.trim(), sub: p.sub.trim() })}>Show me</button>
          <button type="button" className="pill" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function FilterSheet({ value, onSave, onClose }: { value: Filters; onSave: (f: Filters) => void; onClose: () => void }) {
  const [f, setF] = useState<Filters>(value);
  const age = (v: string) => v.replace(/\D/g, "").slice(0, 2);
  return (
    <div className="dc-sheet" role="dialog" aria-modal="true" aria-label="Filters" onClick={onClose}>
      <div className="dc-sheet-in" onClick={(e) => e.stopPropagation()}>
        <h3>Filters</h3>
        <label className="dc-field">
          <span>Their age</span>
          <span className="dc-range">
            <input inputMode="numeric" placeholder="18" value={f.ageMin} onChange={(e) => setF({ ...f, ageMin: age(e.target.value) })} aria-label="Youngest" />
            <em>to</em>
            <input inputMode="numeric" placeholder="99" value={f.ageMax} onChange={(e) => setF({ ...f, ageMax: age(e.target.value) })} aria-label="Oldest" />
          </span>
        </label>
        <div className="dc-field">
          <span>Hosting</span>
          <div className="sp-facets">
            {[["", "Any"], ["can_host", "Can host"], ["can_travel", "Can travel"]].map(([id, label]) => (
              <button key={id} type="button" className={`facet${f.hosting === id ? " on" : ""}`} onClick={() => setF({ ...f, hosting: id })}>{label}</button>
            ))}
          </div>
        </div>
        <label className="dc-toggle">
          <input type="checkbox" checked={f.openOnly} onChange={(e) => setF({ ...f, openOnly: e.target.checked })} />
          <span>Only people open to knocks</span>
        </label>
        <div className="dc-acts">
          <button
            type="button"
            className="dc-cta"
            onClick={() => {
              const lo = Number(f.ageMin), hi = Number(f.ageMax);
              onSave({ ...f, ageMin: lo && lo < 18 ? "18" : f.ageMin, ageMax: hi && lo && hi < lo ? f.ageMin : f.ageMax });
            }}
          >Apply</button>
          <button type="button" className="pill" onClick={() => setF({ ...NO_FILTERS, gender: f.gender, fresh: f.fresh })}>Reset</button>
        </div>
      </div>
    </div>
  );
}
