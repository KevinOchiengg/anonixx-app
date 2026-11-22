"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AtSign, Bell, Coins, DoorOpen, Gift, Heart, MessageCircle, Radio, Sparkles, type LucideIcon,
} from "lucide-react";
import AppShell from "./AppShell";
import AuthorAvatar from "./AuthorAvatar";
import {
  ACTIVITY_FILTERS, ACTIVITY_READ_EVENT, activityApi, sectionOf, timeAgo,
  type ActivityCategory, type ActivityItem,
} from "@/lib/activity";

const KIND_ICON: Record<string, { Icon: LucideIcon; tone: string }> = {
  like: { Icon: Heart, tone: "rose" },
  comment_like: { Icon: Heart, tone: "rose" },
  comment: { Icon: MessageCircle, tone: "blue" },
  reply: { Icon: MessageCircle, tone: "blue" },
  mention: { Icon: AtSign, tone: "violet" },
  linkup_in: { Icon: DoorOpen, tone: "rose" },
  linkup_accepted: { Icon: DoorOpen, tone: "rose" },
  linkup_mutual: { Icon: Sparkles, tone: "rose" },
  linkup_short: { Icon: Coins, tone: "gold" },
  linkup_declined: { Icon: DoorOpen, tone: "muted" },
  coins: { Icon: Coins, tone: "gold" },
  gift: { Icon: Gift, tone: "violet" },
  live_join: { Icon: Radio, tone: "rose" },
  live_started: { Icon: Radio, tone: "rose" },
  live_payout: { Icon: Coins, tone: "gold" },
};
const FALLBACK_ICON = { Icon: Bell, tone: "rose" };

function iconFor(kind: string) {
  return KIND_ICON[kind] || FALLBACK_ICON;
}

function Who({ item }: { item: ActivityItem }) {
  const [first, second] = item.actors;
  if (!first) return null;
  const others = item.count - 1;
  if (others <= 0) return <b>{first.name}</b>;
  if (others === 1 && second) return <><b>{first.name}</b> and <b>{second.name}</b></>;
  return <><b>{first.name}</b> and {others} others</>;
}

function Avatar({ item }: { item: ActivityItem }) {
  const { Icon, tone } = iconFor(item.kind);
  const [first, second] = item.actors;
  return (
    <span className={`act-ava${second ? " stack" : ""}`}>
      {first ? (
        <>
          <span className="act-face">
            <AuthorAvatar src={first.avatar_url} seed={first.id} name={first.name} gender={first.gender} size={48} />
          </span>
          {second ? (
            <span className="act-face back">
              <AuthorAvatar src={second.avatar_url} seed={second.id} name={second.name} gender={second.gender} size={48} />
            </span>
          ) : null}
          <i className={`act-kind ${tone}`}><Icon strokeWidth={2.4} aria-hidden /></i>
        </>
      ) : (
        <span className={`act-tile ${tone}`}><Icon strokeWidth={2} aria-hidden /></span>
      )}
    </span>
  );
}

function Thumb({ item }: { item: ActivityItem }) {
  const d = item.drop;
  if (d?.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="act-thumb" src={d.image} alt="" loading="lazy" />;
  }
  if (d?.snippet) return <span className="act-thumb text">{d.snippet}</span>;
  if (item.coins && (item.kind === "gift" || item.kind === "live_join" || item.kind === "coins")) {
    return <span className="act-coins">+{item.coins}</span>;
  }
  return null;
}

function Row({ item }: { item: ActivityItem }) {
  const body = (
    <>
      <Avatar item={item} />
      <span className="act-body">
        <span className="act-line">
          {item.actors.length ? <><Who item={item} /> {item.action}</> : <b>{item.title}</b>}
          <time dateTime={item.at}> · {timeAgo(item.at)}</time>
        </span>
        {item.text ? <span className="act-text">{item.actors.length ? `“${item.text}”` : item.text}</span> : null}
      </span>
      <Thumb item={item} />
    </>
  );
  const cls = `act-row${item.read ? "" : " unread"}`;
  return item.url ? <Link href={item.url} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Inner() {
  const [filter, setFilter] = useState<ActivityCategory>("all");
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setError("");
    activityApi.list(filter)
      .then((r) => {
        if (!alive) return;
        setItems(r.items);
        setNext(r.next);
        if (r.items.some((i) => !i.read)) {
          activityApi.markRead(filter)
            .then(() => window.dispatchEvent(new Event(ACTIVITY_READ_EVENT)))
            .catch(() => {});
        }
      })
      .catch((e) => { if (alive) { setError((e as Error).message); setItems([]); } });
    return () => { alive = false; };
  }, [filter]);

  const loadMore = useCallback(() => {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    activityApi.list(filter, next)
      .then((r) => { setItems((cur) => [...(cur || []), ...r.items]); setNext(r.next); })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [filter, next, loadingMore]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next) return;
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) loadMore(); }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [next, loadMore]);

  const sections: { name: string; rows: ActivityItem[] }[] = [];
  for (const it of items || []) {
    const name = sectionOf(it);
    const last = sections[sections.length - 1];
    if (last?.name === name) last.rows.push(it);
    else sections.push({ name, rows: [it] });
  }

  return (
    <div className="act">
      <div className="act-chips" role="tablist" aria-label="Filter notifications">
        {ACTIVITY_FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            className={filter === f.key ? "on" : ""}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items === null ? (
        <div className="act-skel" aria-label="Loading">{[0, 1, 2, 3, 4].map((i) => <span key={i} />)}</div>
      ) : error ? (
        <div className="err pad">{error}</div>
      ) : items.length === 0 ? (
        <div className="act-empty">
          <span className="act-tile rose"><Bell strokeWidth={2} aria-hidden /></span>
          <b>Nothing here yet</b>
          <p>Likes, comments and Link Ups land here.</p>
        </div>
      ) : (
        sections.map((s) => (
          <section key={s.name} className="act-section">
            <h2>{s.name}</h2>
            {s.rows.map((it) => <Row key={it.id} item={it} />)}
          </section>
        ))
      )}
      {next ? <div ref={sentinel} className="act-more">{loadingMore ? "Loading…" : ""}</div> : null}
    </div>
  );
}

export default function ActivityPage() {
  return (
    <AppShell title="Activity">
      <Inner />
    </AppShell>
  );
}
