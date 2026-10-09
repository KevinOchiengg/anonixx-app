"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, loadMoreClient, type Post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Slide from "./Slide";
import AdSlot from "./AdSlot";
import Hero from "./Hero";
import BottomNav from "./BottomNav";
import CommentsSheet from "./CommentsSheet";
import LinkUpSheet from "./LinkUpSheet";
import ReportSheet from "./ReportSheet";

type Item =
  | { kind: "hero" }
  | { kind: "post"; post: Post; first: boolean }
  | { kind: "ad"; key: string }
  | { kind: "end" };

type AuthedFeed = {
  posts: (Post & { type?: string })[];
  next_cursor: string | null;
  has_more: boolean;
  session_posts?: number;
  message?: string;
};

const AD_EVERY = 6;
const LOAD_AHEAD = 4;

type Props = {
  initialPosts: Post[];
  initialCursor: string | null;
  withHero?: boolean;
  startId?: string;
};

const realPosts = (list: (Post & { type?: string })[]) => list.filter((p) => p.id && p.type !== "divider");

export default function Feed({ initialPosts, initialCursor, withHero = false, startId }: Props) {
  const { user, ready } = useAuth();
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [authed, setAuthed] = useState(false);
  const [sessionPosts, setSessionPosts] = useState(0);
  const [ended, setEnded] = useState(false);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [gate, setGate] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [commentsFor, setCommentsFor] = useState<Post | null>(null);
  const [linkFor, setLinkFor] = useState<Post | null>(null);
  const [reportFor, setReportFor] = useState<Post | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const loading = useRef(false);

  const showHero = withHero && !user;

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
    }
  }, [ready, user, authed, initialPosts, initialCursor]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (showHero) out.push({ kind: "hero" });
    posts.forEach((post, i) => {
      out.push({ kind: "post", post, first: i === 0 && !showHero });
      const next = posts[i + 1];
      const calm = post.sensitivity !== "mature" && next?.sensitivity !== "mature";
      if ((i + 1) % AD_EVERY === 0 && calm) out.push({ kind: "ad", key: `ad-${i}` });
    });
    if (ended) out.push({ kind: "end" });
    return out;
  }, [posts, showHero, ended]);

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
    if (!cursor || loading.current || active < items.length - LOAD_AHEAD) return;
    loading.current = true;
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
        if (!page) return;
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...page.posts.filter((p) => !seen.has(p.id))];
        });
        setCursor(page.next_cursor);
      }
    };
    run().catch(() => {}).finally(() => { loading.current = false; });
  }, [active, cursor, items.length, authed, sessionPosts]);

  const step = useCallback((dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ top: dir * el.clientHeight, behavior: "smooth" });
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
        await navigator.share({ title: "Anonixx", text: "Someone confessed something on Anonixx", url });
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
      <div className={`phone${user ? " hasnav" : ""}`}>
        <header className="topbar">
          <Link href="/" className="wordmark">anonix<b>x</b></Link>
          {user ? (
            <span className="topbar-actions">
              <Link href="/search" className="pill ghost">Search</Link>
              <Link href="/coins" className="pill ghost">{user.coin_balance} coins</Link>
            </span>
          ) : (
            <span className="topbar-actions">
              <Link href="/login" className="pill ghost">Sign in</Link>
              <Link href="/signup" className="pill">Join</Link>
            </span>
          )}
        </header>

        <div className="scroller" ref={scroller}>
          {items.map((it, i) => {
            if (it.kind === "hero") return <Hero key="hero" index={i} />;
            if (it.kind === "ad") return <AdSlot key={it.key} index={i} />;
            if (it.kind === "end") {
              return (
                <section key="end" className="slide g0" data-idx={i}>
                  <h2 className="confession">You&apos;re all caught up.</h2>
                  <p className="byline">Come back in a bit. There&apos;s always something new. Or drop your own.</p>
                  <div className="row" style={{ marginTop: 18 }}>
                    <Link href="/compose" className="pill">Drop a confession</Link>
                  </div>
                </section>
              );
            }
            return (
              <Slide
                key={it.post.id}
                post={it.post}
                index={i}
                active={active === i}
                near={Math.abs(active - i) <= 1}
                muted={muted}
                headline={it.first}
                onToggleMute={() => setMuted((m) => !m)}
                onGate={setGate}
                onShare={share}
                onPatch={patch}
                onComments={setCommentsFor}
                onLinkUp={setLinkFor}
                onReport={setReportFor}
                onToast={flash}
              />
            );
          })}
        </div>

        {user ? <BottomNav /> : null}

        {gate ? (
          <div className="sheet-back" onClick={() => setGate(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
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
            onClose={() => setCommentsFor(null)}
            onCount={onCount}
            onNeedAuth={() => { setCommentsFor(null); setGate("Sign in to join the thread. Your name stays hidden."); }}
          />
        ) : null}
        {linkFor ? <LinkUpSheet post={linkFor} onClose={() => setLinkFor(null)} /> : null}
        {reportFor ? (
          <ReportSheet
            postId={reportFor.id}
            onClose={() => setReportFor(null)}
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
