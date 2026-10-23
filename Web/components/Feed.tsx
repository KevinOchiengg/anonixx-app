"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, loadMoreClient, type FeedAd, type MarketTease, type Post, type Sound } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Slide from "./Slide";
import AdSlot from "./AdSlot";
import { AdSlide, MarketSlide } from "./FeedPromo";
import { MapPin, MenuIcon, SearchIcon } from "./feedicons";
import Hero from "./Hero";
import BottomNav from "./BottomNav";
import CommentsSheet from "./CommentsSheet";
import LinkUpSheet from "./LinkUpSheet";
import AuthorSheet from "./AuthorSheet";
import ReportSheet from "./ReportSheet";

type Item =
  | { kind: "hero" }
  | { kind: "post"; post: Post; first: boolean; key?: string }
  | { kind: "ad"; key: string }
  | { kind: "promo"; key: string; ad: FeedAd }
  | { kind: "market"; key: string; item: MarketTease }
  | { kind: "status" };

type AuthedFeed = {
  posts: (Post & { type?: string })[];
  next_cursor: string | null;
  has_more: boolean;
  session_posts?: number;
  message?: string;
};

const AD_EVERY = 6;
const MARKET_EVERY = 7;
const FEED_AD_EVERY = 8;
const ADSENSE_ON = Boolean(process.env.NEXT_PUBLIC_ADSENSE_CLIENT && process.env.NEXT_PUBLIC_ADSENSE_SLOT);
const LOCATION_LABELS: Record<string, string> = { country: "Country", county: "Region", sub_county: "Area", estate: "Nearby" };
const LOAD_AHEAD = 4;
const CACHE_KEY = "anonixx.feed.cache.v1";

type Props = {
  initialPosts: Post[];
  initialCursor: string | null;
  withHero?: boolean;
  startId?: string;
  /** Load the public feed after the server-rendered posts, in the browser (drop pages). */
  fillAfterStart?: boolean;
};

const realPosts = (list: (Post & { type?: string })[]) => list.filter((p) => p.id && p.type !== "divider");

// When the feed runs out it keeps going on a shuffled replay of what's loaded: videos if
// there are enough of them, else anything with media, else everything. A new round never
// opens with the post that closed the last one.
const REPLAY_MIN = 3;
function replayRound(posts: Post[], lastId: string | undefined): string[] {
  const videos = posts.filter((p) => p.video_url);
  const media = posts.filter((p) => p.video_url || p.media_url || p.images?.length);
  const pool = (videos.length >= REPLAY_MIN ? videos : media.length >= REPLAY_MIN ? media : posts).map((p) => p.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  if (pool.length > 1 && pool[0] === lastId) pool.push(pool.shift()!);
  return pool;
}

export default function Feed({ initialPosts, initialCursor, withHero = false, startId, fillAfterStart = false }: Props) {
  const { user, ready } = useAuth();
  const router = useRouter();
  // Avatars open the person's Room; Link up on a hookup goes through it too, so the pitch lands with context.
  const openRoom = (p: Post) => (p.user_id && !p.is_admin_drop ? router.push(`/room/${p.user_id}?post=${p.id}`) : setProfileFor(p));
  const linkUp = (p: Post) => (p.kind === "hookup" && p.user_id ? router.push(`/room/${p.user_id}?post=${p.id}`) : setLinkFor(p));
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [authed, setAuthed] = useState(false);
  const [sessionPosts, setSessionPosts] = useState(0);
  const [ended, setEnded] = useState(false);
  const [replay, setReplay] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [gate, setGate] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [commentsFor, setCommentsFor] = useState<Post | null>(null);
  const [linkFor, setLinkFor] = useState<Post | null>(null);
  const [profileFor, setProfileFor] = useState<Post | null>(null);
  const [reportFor, setReportFor] = useState<Post | null>(null);
  const [ads, setAds] = useState<FeedAd[]>([]);
  const [market, setMarket] = useState<MarketTease[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const [coach, setCoach] = useState(false);
  const loading = useRef(false);
  const [retry, setRetry] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [first, setFirst] = useState<"idle" | "loading" | "failed">(initialPosts.length ? "idle" : "loading");
  const [sounds, setSounds] = useState<Sound[]>([]);

  const showHero = withHero && !user;

  useEffect(() => {
    if (!ready) return;
    api<{ sounds?: Sound[] }>("/sounds").then((r) => setSounds(r.sounds || [])).catch(() => {});
    api<{ ads?: FeedAd[] }>("/ads/active?limit=10").then((r) => setAds(r.ads || [])).catch(() => {});
    api<{ items?: MarketTease[] }>("/market/items?limit=20&offset=0").then((r) => setMarket(r.items || [])).catch(() => {});
  }, [ready, user]);

  // The server couldn't hand us any posts (backend slow or down at build time): fetch them here,
  // and fall back to the last feed this browser saw.
  const [firstTry, setFirstTry] = useState(0);
  const authedRef = useRef(false);
  authedRef.current = authed;
  useEffect(() => { if (authed) setFirst("idle"); }, [authed]);
  useEffect(() => {
    if (initialPosts.length) return;
    let live = true;
    setFirst("loading");
    loadMoreClient(null).then((page) => {
      if (!live || authedRef.current) return;
      if (page && page.posts.length) {
        setPosts(page.posts);
        setCursor(page.next_cursor);
        setFirst("idle");
        return;
      }
      let cached: Post[] = [];
      try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}").posts || []; } catch { /* ignore */ }
      if (cached.length) { setPosts(cached); setFirst("idle"); }
      else setFirst("failed");
    });
    return () => { live = false; };
  }, [initialPosts.length, firstTry]);

  // Drop pages server-render only their own drop; queue the public feed after it here.
  useEffect(() => {
    if (!fillAfterStart) return;
    let live = true;
    loadMoreClient(null).then((page) => {
      if (!live || authedRef.current || !page) return;
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.posts.filter((p) => !seen.has(p.id))];
      });
      setCursor(page.next_cursor);
    });
    return () => { live = false; };
  }, [fillAfterStart]);

  const topId = posts[0]?.id;
  useEffect(() => {
    if (authed || !topId) return;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ posts: posts.slice(0, 12) })); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, topId]);

  // Once we know who the viewer is, swap the public feed for their own (likes, saves, mature posts).
  useEffect(() => {
    if (!ready || !user || authed) return;
    let cancelled = false;
    (async () => {
      try {
        const [feed, single] = await Promise.all([
          api<AuthedFeed>("/drops/feed?session_posts=0"),
          startId ? api<{ post: Post }>(`/drops/single/${startId}`).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const list = realPosts(feed.posts).filter((p) => p.id !== startId);
        setPosts(single ? [single.post, ...list] : list);
        setCursor(feed.next_cursor);
        setSessionPosts(feed.session_posts ?? list.length);
        setEnded(feed.message === "session_limit");
        setReplay([]);
        setAuthed(true);
      } catch {
        /* keep the public feed */
      }
    })();
    return () => { cancelled = true; };
  }, [ready, user, authed, startId]);

  // Signing out hands the feed back to the public version.
  useEffect(() => {
    if (ready && !user && authed) {
      setAuthed(false);
      setPosts(initialPosts);
      setCursor(initialCursor);
      setEnded(false);
      setReplay([]);
    }
  }, [ready, user, authed, initialPosts, initialCursor]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (showHero) out.push({ kind: "hero" });
    let mIdx = 0;
    let aIdx = 0;
    posts.forEach((post, i) => {
      out.push({ kind: "post", post, first: i === 0 && !showHero });
      const n = i + 1;
      const next = posts[i + 1];
      const calm = post.sensitivity !== "mature" && next?.sensitivity !== "mature";
      if (!calm) return;
      if (n % MARKET_EVERY === 0 && mIdx < market.length) {
        const m = market[mIdx++];
        out.push({ kind: "market", key: `market-${m.id}`, item: m });
      }
      if (n % FEED_AD_EVERY === 0 && ads.length > 0) {
        const a = ads[aIdx % ads.length];
        aIdx++;
        out.push({ kind: "promo", key: `ad-${a.id}-${n}`, ad: a });
      } else if (ads.length === 0 && ADSENSE_ON && n % AD_EVERY === 0) {
        out.push({ kind: "ad", key: `adsense-${i}` });
      }
    });
    if (loadingMore || loadFailed || first !== "idle") out.push({ kind: "status" });
    if (replay.length) {
      const byId = new Map(posts.map((p) => [p.id, p]));
      replay.forEach((id, i) => {
        const post = byId.get(id);
        if (post) out.push({ kind: "post", post, first: false, key: `${id}~r${i}` });
      });
    }
    return out;
  }, [posts, showHero, replay, ads, market, loadingMore, loadFailed, first]);

  // Out of new posts (no next page, or the server's session cap): add another replay round
  // as the viewer nears the end, so the scroll never hits a wall.
  const exhausted = posts.length > 0 && first === "idle" && !loadFailed && (authed ? ended || !cursor : !cursor);
  useEffect(() => {
    if (!exhausted || active < items.length - LOAD_AHEAD) return;
    setReplay((prev) => [...prev, ...replayRound(posts, prev[prev.length - 1] ?? posts[posts.length - 1]?.id)]);
  }, [exhausted, active, items.length, posts]);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            setActive(Number((e.target as HTMLElement).dataset.idx));
          }
        }
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll("[data-idx]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [items.length]);

  useEffect(() => {
    const it = items[active];
    if (!it) return;
    if (it.kind === "post") window.history.replaceState(null, "", `/drop/${it.post.id}`);
    else if (it.kind === "hero") window.history.replaceState(null, "", "/");
  }, [active, items]);

  useEffect(() => {
    if (!cursor || loading.current || loadFailed || active < items.length - LOAD_AHEAD) return;
    loading.current = true;
    setLoadingMore(true);
    const run = async () => {
      if (authed) {
        const page = await api<AuthedFeed>(
          `/drops/feed?session_posts=${sessionPosts}&cursor=${encodeURIComponent(cursor)}`,
        );
        const fresh = realPosts(page.posts);
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...fresh.filter((p) => !seen.has(p.id))];
        });
        setCursor(page.next_cursor);
        setSessionPosts(page.session_posts ?? sessionPosts + fresh.length);
        if (page.message === "session_limit" || (!page.has_more && !page.next_cursor)) setEnded(true);
      } else {
        const page = await loadMoreClient(cursor);
        if (!page) throw new Error("load");
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...page.posts.filter((p) => !seen.has(p.id))];
        });
        setCursor(page.next_cursor);
      }
    };
    run()
      .then(() => setLoadFailed(false))
      .catch(() => setLoadFailed(true))
      .finally(() => { loading.current = false; setLoadingMore(false); });
  }, [active, cursor, items.length, authed, sessionPosts, retry, loadFailed]);

  const tryAgain = useCallback(() => {
    setLoadFailed(false);
    setRetry((n) => n + 1);
    setFirstTry((n) => n + 1);
  }, []);

  useEffect(() => {
    const back = () => { if (loadFailed || first === "failed") tryAgain(); };
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [loadFailed, first, tryAgain]);

  useEffect(() => {
    try { if (localStorage.getItem("anonixx.coach.v1")) return; } catch { return; }
    const show = window.setTimeout(() => setCoach(true), 1200);
    return () => window.clearTimeout(show);
  }, []);

  useEffect(() => {
    if (!coach) return;
    const el = scroller.current;
    const done = () => {
      setCoach(false);
      try { localStorage.setItem("anonixx.coach.v1", "1"); } catch { /* ignore */ }
    };
    const t = window.setTimeout(done, 6000);
    el?.addEventListener("scroll", done, { once: true });
    return () => { window.clearTimeout(t); el?.removeEventListener("scroll", done); };
  }, [coach]);

  const step = useCallback((dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ top: dir * el.clientHeight, behavior: "instant" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k") { e.preventDefault(); step(-1); }
      else if (e.key === "m") setMuted((m) => !m);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  // Touch: the slide follows the finger, then snaps instantly on release (no glide).
  // Native vertical panning is off for the feed (touch-action: pan-x in feedparity.css)
  // so the browser's own snap animation never runs; sideways swipes still reach photo
  // carousels. A flick or a drag past 15% of the screen moves one slide.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let tracking = false;
    let axis: "" | "x" | "y" = "";
    let x0 = 0, y0 = 0, top0 = 0, t0 = 0, from = 0;
    const skip = (t: EventTarget | null) =>
      (t as HTMLElement | null)?.closest?.(".confession:not(.clamp), .sheet, textarea, input, select, audio, .vp-scrub");
    const start = (e: TouchEvent) => {
      tracking = e.touches.length === 1 && !skip(e.target);
      if (!tracking) return;
      axis = "";
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      top0 = el.scrollTop;
      t0 = performance.now();
      from = Math.round(top0 / el.clientHeight);
    };
    const move = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - x0;
      const dy = e.touches[0].clientY - y0;
      if (!axis) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        axis = Math.abs(dy) >= Math.abs(dx) ? "y" : "x";
        if (axis === "y") el.style.scrollSnapType = "none"; // let it track the finger freely
      }
      if (axis === "y") el.scrollTop = top0 - dy;
    };
    const end = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      if (axis !== "y") return;
      const h = el.clientHeight;
      const dy = (e.changedTouches[0]?.clientY ?? y0) - y0;
      const v = dy / Math.max(1, performance.now() - t0); // px per ms
      let next = from;
      if (e.type === "touchend") {
        if (dy < -h * 0.15 || v < -0.5) next += 1;
        else if (dy > h * 0.15 || v > 0.5) next -= 1;
      }
      const last = Math.max(0, Math.round(el.scrollHeight / h) - 1);
      el.scrollTo({ top: Math.min(Math.max(0, next), last) * h, behavior: "instant" });
      el.style.scrollSnapType = "";
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, []);

  // Mouse wheels and trackpads: one gesture = one slide, like the app's swipe.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let locked = false;
    let steppedAt = 0;
    let idle: number | undefined;
    const onWheel = (e: WheelEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(".confession:not(.clamp), .sheet, textarea, input, audio")) return;
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      e.preventDefault();
      window.clearTimeout(idle);
      idle = window.setTimeout(() => { if (Date.now() - steppedAt > 450) locked = false; else idle = window.setTimeout(() => { locked = false; }, 450); }, 140);
      if (locked || Math.abs(e.deltaY) < 8) return;
      locked = true;
      steppedAt = Date.now();
      step(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => { el.removeEventListener("wheel", onWheel); window.clearTimeout(idle); };
  }, [step]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  const patch = useCallback((id: string, p: Partial<Post>) => {
    setPosts((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
    setCommentsFor((c) => (c && c.id === id ? { ...c, ...p } : c));
  }, []);

  const share = useCallback(async (post: Post) => {
    const url = `${window.location.origin}/drop/${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Anonixx", text: `"${post.content.substring(0, 100)}..." — Anonixx`, url });
      } else {
        await navigator.clipboard.writeText(url);
        flash("Link copied");
      }
    } catch { /* share sheet dismissed */ }
  }, [flash]);

  const commentsId = commentsFor?.id;
  const onCount = useCallback((n: number) => {
    if (commentsId) patch(commentsId, { thread_count: n });
  }, [commentsId, patch]);

  return (
    <div className="stage">
      <div className="phone hasnav">
        <header className="topbar">
          <Link href="/" className="wordmark">anonix<b>x</b></Link>
          <span className="topbar-actions">
            {user && user.feed_location_scope && user.feed_location_scope !== "off" ? (
              <Link href="/location" className="loc-pill"><MapPin />{LOCATION_LABELS[user.feed_location_scope] || "Nearby"}</Link>
            ) : null}
            {!user ? (
              <>
                <Link href="/login" className="pill ghost">Sign in</Link>
                <Link href="/signup" className="pill">Join</Link>
              </>
            ) : null}
            <Link href="/search" className="hbtn" aria-label="Search"><SearchIcon /></Link>
            {user ? <Link href="/settings" className="hbtn" aria-label="Menu"><MenuIcon /></Link> : null}
          </span>
        </header>

        <div className="scroller" ref={scroller}>
          {items.map((it, i) => {
            if (it.kind === "hero") return <Hero key="hero" index={i} />;
            if (it.kind === "ad") return <AdSlot key={it.key} index={i} />;
            if (it.kind === "promo") return <AdSlide key={it.key} ad={it.ad} index={i} />;
            if (it.kind === "market") return <MarketSlide key={it.key} item={it.item} index={i} />;
            if (it.kind === "status") {
              const bad = first === "failed" || loadFailed;
              return (
                <section key="status" className="slide limit-slide net-slide" data-idx={i}>
                  {bad ? (
                    <>
                      <span className="limit-moon" aria-hidden>📡</span>
                      <h2>{first === "failed" ? "Can't reach Anonixx." : "Couldn't load more."}</h2>
                      <p>Check your connection. Nothing you've seen is lost.</p>
                      <button className="pill" onClick={tryAgain}>Try again</button>
                    </>
                  ) : (
                    <div className="sk" aria-label="Loading">
                      <i className="sk-av" /><i className="sk-line w60" /><i className="sk-line" /><i className="sk-line w80" /><i className="sk-line w40" />
                      <p>Finding more confessions…</p>
                    </div>
                  )}
                </section>
              );
            }
            return (
              <Slide
                key={it.key ?? it.post.id}
                post={it.post}
                index={i}
                active={active === i}
                near={Math.abs(active - i) <= 1}
                muted={muted}
                sounds={sounds}
                headline={it.first}
                onToggleMute={() => setMuted((m) => !m)}
                onGate={setGate}
                onShare={share}
                onPatch={patch}
                onComments={setCommentsFor}
                onLinkUp={linkUp}
                onProfile={openRoom}
                onReport={setReportFor}
                onToast={flash}
              />
            );
          })}
        </div>

        {coach ? <div className="coach" role="status"><span>Swipe up for the next one</span><i /><span>Double-tap to like</span></div> : null}
        <BottomNav />

        {gate ? (
          <div className="sheet-back" onClick={() => setGate(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <span className="sheet-handle" aria-hidden />
              <h3>{gate}</h3>
              <p>It&apos;s free. Your name stays hidden the whole way.</p>
              <div className="row">
                <Link href="/signup" className="pill">Join Anonixx</Link>
                <Link href="/login" className="pill ghost">Sign in</Link>
                <button className="pill ghost" onClick={() => setGate(null)}>Not now</button>
              </div>
            </div>
          </div>
        ) : null}

        {commentsFor ? (
          <CommentsSheet
            postId={commentsFor.id}
            isOwner={Boolean(commentsFor.is_own_post)}
            onClose={() => setCommentsFor(null)}
            onCount={onCount}
            onNeedAuth={() => { setCommentsFor(null); setGate("Sign in to join the thread. Your name stays hidden."); }}
          />
        ) : null}
        {profileFor ? <AuthorSheet post={profileFor} onClose={() => setProfileFor(null)} onLinkUp={setLinkFor} /> : null}
        {/* a confession has no card Link up, so one landing here came through AuthorSheet */}
        {linkFor ? <LinkUpSheet post={linkFor} onClose={() => setLinkFor(null)} viaProfile={linkFor.kind === "confession"} /> : null}
        {reportFor ? (
          <ReportSheet
            post={reportFor}
            onClose={() => setReportFor(null)}
            onBlocked={(p) => setPosts((prev) => prev.filter((x) => !p.user_id || x.user_id !== p.user_id))}
            onDone={(m) => { setReportFor(null); flash(m); }}
          />
        ) : null}

        {toast ? <div className="toast">{toast}</div> : null}
      </div>

      <div className="nav-arrows" aria-hidden>
        <button onClick={() => step(-1)}>↑</button>
        <button onClick={() => step(1)}>↓</button>
      </div>
    </div>
  );
}
