"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { intentLabel } from "@/lib/linkup";
import AppShell from "./AppShell";

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
};
type Req = {
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
type View = "chats" | "requests" | "sent";

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
const PaletteIcon = ({ size }: { size?: number }) => <Svg size={size} d={<><circle cx="13.5" cy="6.5" r="1" /><circle cx="17.5" cy="10.5" r="1" /><circle cx="8.5" cy="7.5" r="1" /><circle cx="6.5" cy="12.5" r="1" /><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4a4.6 4.6 0 0 0 4.6-4.6C22 6 17.5 2 12 2z" /></>} />;
const InboxIcon = ({ size }: { size?: number }) => <Svg size={size} d={<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /></>} />;

function Inner({ search, view, setView }: { search: string; view: View; setView: (v: View) => void }) {
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
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

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

  if (view === "requests") {
    return (
      <div>
        <div className="u-segs">
          <button className="u-seg" onClick={() => setView("chats")}>← Rooms</button>
        </div>
        {banner}
        {reqs === null ? (
          <p className="muted center">Loading…</p>
        ) : reqs.length === 0 ? (
          <div className="u-empty">No knocks yet. Post something for tonight and watch your door.</div>
        ) : (
          <div className="lr-list">
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
        <div className="u-segs">
          <button className="u-seg" onClick={() => setView("chats")}>← Rooms</button>
        </div>
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
          <button className="u-story" onClick={() => setView("requests")}>
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
                  <span>{clue ? <Image src={clue} alt="" width={58} height={58} /> : r.requester_anonymous_name?.[0]?.toUpperCase() || "A"}</span>
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
        {sent && sent.length ? (
          <button className="u-seg" style={{ marginLeft: "auto" }} onClick={() => setView("sent")}>
            Sent{sent.some((s) => s.status === "pending") ? ` · ${sent.filter((s) => s.status === "pending").length}` : ""}
          </button>
        ) : null}
      </div>

      {conns === null ? (
        <p className="muted center">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="u-empty">
          {q ? `No Rooms match “${search.trim()}”` : filter === "unread" ? "You're all caught up." : "No Rooms yet. Knock on someone tonight and their door opens here."}
        </div>
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
  const [view, setView] = useState<View>("chats");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const t = qs.get("tab");
    if (t === "requests" || t === "sent") setView(t);
    // From a link up push: the Accept action lands on ?accept=, a plain tap on ?request=.
    const acc = qs.get("accept");
    const req = qs.get("request");
    if (acc) {
      api<{ connection_id?: string }>(`/unlock-requests/${acc}/accept`, { method: "POST" })
        .then((d) => router.replace(d.connection_id ? `/chat/${d.connection_id}` : "/inbox?tab=requests"))
        .catch(() => { setView("requests"); router.replace("/inbox?tab=requests"); });
    } else if (req) {
      api<{ requests: Req[] }>("/unlock-requests/incoming")
        .then((d) => {
          const r = d.requests.find((x) => x.id === req);
          if (r) router.replace(`/room/${r.requester_id}`);
          else setView("requests");
        })
        .catch(() => setView("requests"));
    }
  }, [router]);

  const toggle = () => {
    if (searchOpen) setSearch("");
    setSearchOpen(!searchOpen);
  };

  const right =
    view === "chats" ? (
      <>
        <button className="u-icon" onClick={() => router.push("/chat-setup")} aria-label="Your Room"><PaletteIcon size={18} /></button>
        <button className="u-icon" onClick={toggle} aria-label="Search">{searchOpen ? <CloseIcon size={18} /> : <SearchIcon size={18} />}</button>
        <button className="u-add" onClick={() => router.push("/")} aria-label="Find someone on the feed"><PlusIcon size={18} /></button>
      </>
    ) : null;

  return (
    <AppShell title={view === "requests" ? "Knocks" : view === "sent" ? "Your knocks" : "rooms"} right={right}>
      {searchOpen && view === "chats" ? (
        <div className="u-search">
          <label>
            <SearchIcon size={16} />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
            {search ? <button onClick={() => setSearch("")} aria-label="Clear"><CloseIcon size={15} /></button> : null}
          </label>
        </div>
      ) : null}
      <Inner search={search} view={view} setView={setView} />
    </AppShell>
  );
}
