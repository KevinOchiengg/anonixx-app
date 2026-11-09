"use client";
/** Rooms: Knocks (who's at your door, first; your sent knocks too), Connections (your
 * conversations), Live (sessions and calls) and My Room. The ⋮ menu opens every Room setting.
 * ?tab=knocks|sent|connections|live|myroom (old ?tab=requests still works). */
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { intentLabel } from "@/lib/linkup";
import AppShell from "./AppShell";
import KnockClues, { type KnockClue } from "./KnockClues";
import LivePanel from "./rooms/LivePanel";
import MyRoomPanel from "./rooms/MyRoomPanel";
import RoomSettingsMenu from "./rooms/RoomSettingsMenu";

type Conn = {
  id: string;
  confession: string | null;
  other_anonymous_name: string;
  other_avatar_url?: string | null;
  other_user_id?: string;
  other_is_online: boolean;
  unread_count: number;
  last_message: string | null;
  last_message_at: string | null;
  last_message_is_own?: boolean;
  last_message_seen?: boolean;
  is_sender?: boolean;
};
type Req = KnockClue & {
  id: string;
  target_type: string;
  target_id: string;
  confession_snippet: string;
  requester_id: string;
  requester_anonymous_name: string;
  requester_avatar_url?: string | null;
  requester_gallery?: { media_url: string; media_type: string }[];
  pitch?: string | null;
  intents?: string[];
  media_url?: string | null;
  media_type?: string | null;
  created_at?: string;
};
type Sent = { id: string; target_type: string; status: string; connection_id: string | null; target_id: string };
type View = "knocks" | "sent" | "connections" | "live" | "myroom";
const SECTIONS: [View, string][] = [["knocks", "Knocks"], ["connections", "Connections"], ["live", "Live"], ["myroom", "My Room"]];

const AVATAR_COLORS = ["#C96F53", "#C97B84", "#D98E4A", "#B56576", "#A8674F"];
function avatarColor(seed?: string) {
  if (!seed) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function chatTime(iso: string | null) {
  if (!iso) return "";
  const t = iso.replace(" ", "T");
  const d = new Date(/Z$|[+-]\d{2}:\d{2}$/.test(t) ? t : t + "Z");
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  const w = new Date(now);
  w.setDate(now.getDate() - 7);
  if (d > w) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const poster = (url: string) => url.replace(/\.\w+(\?.*)?$/, ".jpg$1");

const Svg = ({ d, size = 20 }: { d: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);
const SearchIcon = ({ size }: { size?: number }) => <Svg size={size} d={<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>} />;
const CloseIcon = ({ size }: { size?: number }) => <Svg size={size} d={<path d="M18 6 6 18M6 6l12 12" />} />;
const PlusIcon = ({ size }: { size?: number }) => <Svg size={size} d={<path d="M12 5v14M5 12h14" />} />;
const DotsIcon = ({ size }: { size?: number }) => <Svg size={size} d={<><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></>} />;
const InboxIcon = ({ size }: { size?: number }) => <Svg size={size} d={<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /></>} />;

function Inner({ search, view, setView, onCounts }: { search: string; view: View; setView: (v: View) => void; onCounts: (k: number, u: number) => void }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [c, r, s] = await Promise.all([
        api<{ connections: Conn[] }>("/drops/connections"),
        api<{ requests: Req[] }>("/unlock-requests/incoming"),
        api<{ requests: Sent[] }>("/unlock-requests/sent"),
      ]);
      setConns([...c.connections].sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || "")));
      setReqs(r.requests);
      setSent(s.requests);
      onCounts(r.requests.length, c.connections.reduce((n, x) => n + (x.unread_count || 0), 0));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [onCounts]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 15000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(""), 3500);
    return () => window.clearTimeout(t);
  }, [note]);

  const setBusyIds = (ids: string[], on: boolean) =>
    setBusy((prev) => {
      const n = new Set(prev);
      ids.forEach((i) => (on ? n.add(i) : n.delete(i)));
      return n;
    });

  async function accept(r: Req, openChat: boolean) {
    setBusyIds([r.id], true);
    setError("");
    try {
      const d = await api<{ connection_id?: string }>(`/unlock-requests/${r.id}/accept`, { method: "POST" });
      setReqs((p) => (p || []).filter((x) => x.id !== r.id));
      if (openChat && d.connection_id) {
        router.push(`/chat/${d.connection_id}`);
      } else {
        setNote("Let in. They're inside your Room.");
        load();
      }
    } catch (e) {
      setError((e as Error).message || "Could not let them in right now.");
    } finally {
      setBusyIds([r.id], false);
    }
  }

  async function decline(r: Req) {
    setBusyIds([r.id], true);
    setError("");
    try {
      await api(`/unlock-requests/${r.id}/decline`, { method: "POST" });
      setReqs((p) => (p || []).filter((x) => x.id !== r.id));
    } catch {
      setError("Could not decline right now.");
    } finally {
      setBusyIds([r.id], false);
    }
  }

  async function cancel(s: Sent) {
    setBusyIds([s.id], true);
    try {
      await api(`/unlock-requests/${s.id}/cancel`, { method: "POST" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyIds([s.id], false);
    }
  }

  async function resend(s: Sent) {
    setBusyIds([s.id], true);
    try {
      await api("/unlock-requests", { body: { target_type: s.target_type, target_id: s.target_id, payment_method: "coins", via_profile: true } });
      setNote("Request sent again.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyIds([s.id], false);
    }
  }

  const q = search.trim().toLowerCase();
  const shown = useMemo(() => {
    let base = conns || [];
    if (filter === "unread") base = base.filter((c) => (c.unread_count || 0) > 0);
    if (!q) return base;
    return base.filter(
      (c) =>
        c.other_anonymous_name?.toLowerCase().includes(q) ||
        c.last_message?.toLowerCase().includes(q) ||
        c.confession?.toLowerCase().includes(q),
    );
  }, [conns, filter, q]);

  const banner = (
    <>
      {note ? <div className="ok pad">{note}</div> : null}
      {error ? <div className="err pad">{error}</div> : null}
    </>
  );

  if (view === "live") return <LivePanel />;
  if (view === "myroom") return <MyRoomPanel />;

  const pendingSent = (sent || []).filter((s) => s.status === "pending").length;
  const knockTabs = (
    <div className="u-segs">
      <button className={`u-seg${view === "knocks" ? " on" : ""}`} onClick={() => setView("knocks")}>Received{reqs?.length ? ` · ${reqs.length}` : ""}</button>
      <button className={`u-seg${view === "sent" ? " on" : ""}`} onClick={() => setView("sent")}>Sent{pendingSent ? ` · ${pendingSent}` : ""}</button>
    </div>
  );

  if (view === "knocks") {
    return (
      <div>
        {knockTabs}
        {banner}
        {reqs === null ? (
          <p className="muted center">Loading…</p>
        ) : reqs.length === 0 ? (
          <div className="rx-empty">
            <span className="rx-door" aria-hidden><i /></span>
            <b>Nobody at the door yet</b>
            <p>Post something for tonight and the knocks come here. You decide who comes in.</p>
            <Link href="/compose" className="u-cta">Post something</Link>
          </div>
        ) : (
          <div className="lr-list">
            <p className="rs-info">Knocking is free for them. Let someone in and their coins move automatically, once. Decline and nothing is charged.</p>
            {reqs.map((r) => {
              const b = busy.has(r.id);
              const thumbs = (r.requester_gallery || []).slice(0, 3);
              const open = () => router.push(`/room/${r.requester_id}`);
              return (
                <div className="lr-row" key={r.id} role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === "Enter" && open()}>
                  <span className="lr-ava">
                    <span>
                      {r.requester_avatar_url ? <Image src={r.requester_avatar_url} alt="" width={48} height={48} /> : r.requester_anonymous_name?.[0]?.toUpperCase() || "A"}
                    </span>
                  </span>
                  <span className="lr-main">
                    <span className="lr-top">
                      <b>{r.requester_anonymous_name || "Anonymous"}</b>
                      <time>{chatTime(r.created_at || null)}</time>
                    </span>
                    <span className={`lr-pitch${r.pitch ? "" : " none"}`}>{r.pitch || "knocked on your door"}</span>
                    {r.intents?.length ? <span className="room-intents">{r.intents.map((i) => <i key={i}>{intentLabel(i)}</i>)}</span> : null}
                    {r.confession_snippet ? <span className="lr-on">on &ldquo;{r.confession_snippet}&rdquo;</span> : null}
                    <KnockClues k={r} />
                    {thumbs.length ? (
                      <span className="lr-thumbs">
                        {thumbs.map((g, k) => (
                          <span key={k}>{g.media_type === "video" ? <video src={g.media_url} muted playsInline preload="metadata" /> : <Image src={g.media_url} alt="" width={34} height={44} />}</span>
                        ))}
                      </span>
                    ) : null}
                    <span className="lr-acts" onClick={(e) => e.stopPropagation()}>
                      <button className="d" disabled={b} onClick={() => decline(r)}>Decline</button>
                      <button className="a" disabled={b} onClick={() => accept(r, true)}>{b ? "…" : "Let In"}</button>
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (view === "sent") {
    return (
      <div>
        {knockTabs}
        {banner}
        {sent === null ? (
          <p className="muted center">Loading…</p>
        ) : sent.length === 0 ? (
          <div className="u-empty">You haven&apos;t knocked on anyone yet. Tap Knock on a post you can&apos;t stop thinking about.</div>
        ) : (
          sent.map((s) => (
            <div className="u-sent" key={s.id}>
              {s.status === "pending" ? (
                <>
                  <b>Waiting for a response…</b>
                  <small>Nothing&apos;s charged yet. Coins move only if they let you in.</small>
                </>
              ) : s.status === "accepted" ? (
                <b>You&apos;re inside.</b>
              ) : s.status === "declined" ? (
                <>
                  <b>They&apos;re not up for it right now</b>
                  <small>You can knock again anytime. No coins were spent.</small>
                </>
              ) : (
                <>
                  <b>{s.status === "expired" ? "This confession expired" : s.status[0].toUpperCase() + s.status.slice(1)}</b>
                  <small>It&apos;s gone before they got to respond — no coins were spent.</small>
                </>
              )}
              <div className="row">
                {s.status === "accepted" && s.connection_id ? <Link href={`/chat/${s.connection_id}`} className="pill">Open chat</Link> : null}
                {s.status === "pending" ? <button className="pill ghost" disabled={busy.has(s.id)} onClick={() => cancel(s)}>Take back knock</button> : null}
                {s.status === "declined" ? <button className="pill" disabled={busy.has(s.id)} onClick={() => resend(s)}>Knock again</button> : null}
                <Link href={`/drop/${s.target_id}`} className="pill ghost">View the post</Link>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div>
      {banner}
      {reqs && reqs.length ? (
        <div className="u-stories">
          <button className="u-story" onClick={() => setView("knocks")}>
            <span className="u-ring all">
              <InboxIcon size={20} />
              <i>{reqs.length > 99 ? "99+" : reqs.length}</i>
            </span>
            <small>Knocking</small>
          </button>
          {reqs.map((r) => {
            const clue = r.media_url ? (r.media_type === "video" ? poster(r.media_url) : r.media_url) : null;
            return (
              <button className="u-story" key={r.id} onClick={() => router.push(`/room/${r.requester_id}`)}>
                <span className="u-ring">
                  <span>{clue ? <Image src={clue} alt="" width={58} height={58} className="kc-blur" /> : r.requester_anonymous_name?.[0]?.toUpperCase() || "A"}</span>
                </span>
                <small>{r.requester_anonymous_name || "Anonymous"}</small>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="u-segs">
        {([["all", "All"], ["unread", "Unread"]] as const).map(([k, label]) => (
          <button key={k} className={`u-seg${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      {conns === null ? (
        <p className="muted center">Loading…</p>
      ) : shown.length === 0 ? (
        q || filter === "unread" ? (
          <div className="u-empty">{q ? `No conversations match “${search.trim()}”` : "You're all caught up."}</div>
        ) : (
          <div className="rx-empty">
            <b>No connections yet</b>
            <p>Let someone in from Knocks, or knock on a Room you like. Conversations live here.</p>
            {reqs?.length ? <button className="u-cta" onClick={() => setView("knocks")}>See {reqs.length} at your door</button> : <Link href="/" className="u-cta">Find someone on the feed</Link>}
          </div>
        )
      ) : (
        <ul className="u-cards">
          {shown.map((c) => {
            const unread = c.unread_count > 0;
            const tick = c.last_message_is_own;
            return (
              <li key={c.id}>
                <Link href={`/chat/${c.id}`} className={`u-card${unread ? " unread" : ""}`}>
                  <span className="u-ava">
                    <span style={c.other_avatar_url ? undefined : { background: avatarColor(c.other_user_id || c.other_anonymous_name) }}>
                      {c.other_avatar_url ? <Image src={c.other_avatar_url} alt="" width={50} height={50} /> : c.other_anonymous_name?.[0]?.toUpperCase() || "A"}
                    </span>
                    {c.other_is_online ? <em /> : null}
                  </span>
                  <span className="u-info">
                    <span className="u-top">
                      <b>{c.other_anonymous_name}</b>
                      {c.is_sender !== undefined ? <em className="u-role">{c.is_sender ? "your guest" : "their Room"}</em> : null}
                      <time>{chatTime(c.last_message_at)}</time>
                    </span>
                    <span className="u-bot">
                      <span className="u-prev">
                        {tick ? <span className={`u-tick${c.last_message_seen ? " seen" : ""}`}>{c.last_message_seen ? "✓✓ " : "✓ "}</span> : null}
                        {c.last_message || (c.confession ? `"${c.confession}"` : "nothing said yet")}
                      </span>
                      {unread ? <span className="u-unread">{c.unread_count > 99 ? "99+" : c.unread_count}</span> : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

    </div>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const [view, setViewState] = useState<View>("knocks");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState(false);
  const [counts, setCounts] = useState({ knocks: 0, unread: 0 });
  const onCounts = useCallback((knocks: number, unread: number) => setCounts({ knocks, unread }), []);
  const setView = useCallback((v: View) => {
    setViewState(v);
    window.history.replaceState(null, "", `/inbox?tab=${v}`);
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const t = qs.get("tab");
    if (t === "requests") setViewState("knocks");
    else if (t === "chats") setViewState("connections");
    else if (t && ["knocks", "sent", "connections", "live", "myroom"].includes(t)) setViewState(t as View);
    // From a link up push: the Accept action lands on ?accept=, a plain tap on ?request=.
    const acc = qs.get("accept");
    const req = qs.get("request");
    if (acc) {
      api<{ connection_id?: string }>(`/unlock-requests/${acc}/accept`, { method: "POST" })
        .then((d) => router.replace(d.connection_id ? `/chat/${d.connection_id}` : "/inbox?tab=knocks"))
        .catch(() => { setViewState("knocks"); router.replace("/inbox?tab=knocks"); });
    } else if (req) {
      api<{ requests: Req[] }>("/unlock-requests/incoming")
        .then((d) => {
          const r = d.requests.find((x) => x.id === req);
          if (r) router.replace(`/room/${r.requester_id}`);
          else setViewState("knocks");
        })
        .catch(() => setViewState("knocks"));
    }
  }, [router]);

  const toggle = () => {
    if (searchOpen) setSearch("");
    setSearchOpen(!searchOpen);
  };

  const right = (
    <>
      {view === "connections" ? (
        <button className="u-icon" onClick={toggle} aria-label={searchOpen ? "Close search" : "Search conversations"}>{searchOpen ? <CloseIcon size={18} /> : <SearchIcon size={18} />}</button>
      ) : null}
      <button className="u-add" onClick={() => router.push("/")} aria-label="Find someone on the feed"><PlusIcon size={18} /></button>
      <button className="u-icon" onClick={() => setMenu(true)} aria-label="Room settings"><DotsIcon size={18} /></button>
    </>
  );
  const section = view === "sent" ? "knocks" : view;

  return (
    <AppShell title="rooms" right={right}>
      <nav className="rx-tabs" role="tablist" aria-label="Rooms">
        {SECTIONS.map(([k, label]) => {
          const n = k === "knocks" ? counts.knocks : k === "connections" ? counts.unread : 0;
          return (
            <button key={k} role="tab" aria-selected={section === k} className={section === k ? "on" : ""} onClick={() => setView(k)}>
              {label}
              {n ? <b className={k === "knocks" ? "hot" : ""}>{n > 99 ? "99+" : n}</b> : null}
            </button>
          );
        })}
      </nav>
      {searchOpen && view === "connections" ? (
        <div className="u-search">
          <label>
            <SearchIcon size={16} />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
            {search ? <button onClick={() => setSearch("")} aria-label="Clear"><CloseIcon size={15} /></button> : null}
          </label>
        </div>
      ) : null}
      <Inner search={search} view={view} setView={setView} onCounts={onCounts} />
      {menu ? <RoomSettingsMenu onClose={() => setMenu(false)} /> : null}
    </AppShell>
  );
}
