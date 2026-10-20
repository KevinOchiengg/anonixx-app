"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
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
  requester_anonymous_name: string;
  requester_avatar_url?: string | null;
  media_url?: string | null;
  media_type?: string | null;
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

function ClueThumb({ r, onOpen }: { r: Req; onOpen: () => void }) {
  if (!r.media_url) return null;
  return (
    <button className="u-thumb" onClick={onOpen} aria-label="View clue">
      {r.media_type === "video" ? <video src={r.media_url} muted loop autoPlay playsInline /> : <Image src={r.media_url} alt="" width={40} height={40} />}
    </button>
  );
}

function Inner({ search, view, setView }: { search: string; view: View; setView: (v: View) => void }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Req | null>(null);
  const [preview, setPreview] = useState<{ url: string; type: string } | null>(null);

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
      setDetail(null);
      if (openChat && d.connection_id) {
        router.push(`/chat/${d.connection_id}`);
      } else {
        setNote("Accepted — chat started.");
        load();
      }
    } catch (e) {
      setError((e as Error).message || "Could not accept right now.");
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
      setDetail(null);
    } catch {
      setError("Could not decline right now.");
    } finally {
      setBusyIds([r.id], false);
    }
  }

  async function acceptAll(group: { target_type: string; target_id: string; data: Req[] }) {
    const ids = group.data.map((r) => r.id);
    setBusyIds(ids, true);
    setError("");
    try {
      const d = await api<{ accepted_count: number; failed?: { request_id: string }[] }>("/unlock-requests/accept-all", {
        body: { target_type: group.target_type, target_id: group.target_id },
      });
      const failed = new Set((d.failed || []).map((f) => f.request_id));
      setReqs((p) => (p || []).filter((r) => !ids.includes(r.id) || failed.has(r.id)));
      if (d.accepted_count > 0) setNote(`Accepted ${d.accepted_count} — chats started.`);
      if (failed.size) setError(`${failed.size} couldn't be accepted right now.`);
      load();
    } catch {
      setError("Could not accept all right now.");
    } finally {
      setBusyIds(ids, false);
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
      await api("/unlock-requests", { body: { target_type: s.target_type, target_id: s.target_id, payment_method: "coins" } });
      setNote("Request sent again.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyIds([s.id], false);
    }
  }

  const groups = useMemo(() => {
    const m = new Map<string, { key: string; target_type: string; target_id: string; title: string; data: Req[] }>();
    (reqs || []).forEach((r) => {
      const key = `${r.target_type}:${r.target_id}`;
      if (!m.has(key)) m.set(key, { key, target_type: r.target_type, target_id: r.target_id, title: r.confession_snippet || "A confession", data: [] });
      m.get(key)!.data.push(r);
    });
    return Array.from(m.values());
  }, [reqs]);

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

  const previewModal = preview ? (
    <div className="u-modal" onClick={() => setPreview(null)}>
      {preview.type === "video" ? (
        <video src={preview.url} controls autoPlay loop playsInline onClick={(e) => e.stopPropagation()} />
      ) : (
        <Image src={preview.url} alt="" width={800} height={800} />
      )}
      <button className="u-modal-x" aria-label="Close" onClick={() => setPreview(null)}>×</button>
    </div>
  ) : null;

  if (view === "requests") {
    return (
      <div>
        <div className="u-segs">
          <button className="u-seg" onClick={() => setView("chats")}>← Messages</button>
        </div>
        {banner}
        {reqs === null ? (
          <p className="muted center">Loading…</p>
        ) : groups.length === 0 ? (
          <div className="u-empty">No one&apos;s waiting to unlock a confession right now.</div>
        ) : (
          <div className="u-reqs">
            {groups.map((g) => (
              <div className="u-group" key={g.key}>
                <div className="u-group-h">
                  <p>&ldquo;{g.title}&rdquo;</p>
                  <button className="u-all" onClick={() => acceptAll(g)}>Accept All ({g.data.length})</button>
                </div>
                {g.data.map((r) => {
                  const b = busy.has(r.id);
                  return (
                    <div className="u-req" key={r.id}>
                      <div className="u-req-who">
                        <ClueThumb r={r} onOpen={() => setPreview({ url: r.media_url!, type: r.media_type || "image" })} />
                        <span className="u-avatar">
                          {r.requester_avatar_url ? <Image src={r.requester_avatar_url} alt="" width={30} height={30} /> : r.requester_anonymous_name?.[0]?.toUpperCase() || "A"}
                        </span>
                        <b>{r.requester_anonymous_name}</b>
                      </div>
                      <div className="u-acts">
                        <button className="u-dec" disabled={b} onClick={() => decline(r)}>Decline</button>
                        <button className="u-acc" disabled={b} onClick={() => accept(r, false)}>Accept</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        {previewModal}
      </div>
    );
  }

  if (view === "sent") {
    return (
      <div>
        <div className="u-segs">
          <button className="u-seg" onClick={() => setView("chats")}>← Messages</button>
        </div>
        {banner}
        {sent === null ? (
          <p className="muted center">Loading…</p>
        ) : sent.length === 0 ? (
          <div className="u-empty">You haven&apos;t sent any link-up requests. Tap Link up on a post you can&apos;t stop thinking about.</div>
        ) : (
          sent.map((s) => (
            <div className="u-sent" key={s.id}>
              {s.status === "pending" ? (
                <>
                  <b>Waiting for a response…</b>
                  <small>Nothing&apos;s been charged yet — you&apos;ll only pay coins if they accept.</small>
                </>
              ) : s.status === "accepted" ? (
                <b>They said yes.</b>
              ) : s.status === "declined" ? (
                <>
                  <b>They&apos;re not up for it right now</b>
                  <small>You can send another request anytime — no coins were spent.</small>
                </>
              ) : (
                <>
                  <b>{s.status === "expired" ? "This confession expired" : s.status[0].toUpperCase() + s.status.slice(1)}</b>
                  <small>It&apos;s gone before they got to respond — no coins were spent.</small>
                </>
              )}
              <div className="row">
                {s.status === "accepted" && s.connection_id ? <Link href={`/chat/${s.connection_id}`} className="pill">Open chat</Link> : null}
                {s.status === "pending" ? <button className="pill ghost" disabled={busy.has(s.id)} onClick={() => cancel(s)}>Cancel request</button> : null}
                {s.status === "declined" ? <button className="pill" disabled={busy.has(s.id)} onClick={() => resend(s)}>Send another request</button> : null}
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
            <small>All</small>
          </button>
          {reqs.map((r) => {
            const clue = r.media_url ? (r.media_type === "video" ? poster(r.media_url) : r.media_url) : null;
            return (
              <button className="u-story" key={r.id} onClick={() => setDetail(r)}>
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
          {q ? `No chats match “${search.trim()}”` : filter === "unread" ? "You're all caught up." : "No chats yet. Link up with someone from the feed and it shows up here."}
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

      {detail ? (
        <div className="sheet-back" onClick={() => setDetail(null)}>
          <div className="sheet u-mini" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
            <div className="u-mini-media">
              {detail.media_url ? (
                detail.media_type === "video" ? <video src={detail.media_url} muted loop autoPlay playsInline /> : <Image src={detail.media_url} alt="" width={400} height={400} />
              ) : (
                detail.requester_anonymous_name?.[0]?.toUpperCase() || "A"
              )}
            </div>
            <div className="u-mini-body">
              <h3>{detail.requester_anonymous_name || "Anonymous"}</h3>
              <p>wants to unlock your confession</p>
              {detail.confession_snippet ? <p className="u-quote">&ldquo;{detail.confession_snippet}&rdquo;</p> : null}
              <div className="u-mini-acts">
                <button className="d" disabled={busy.has(detail.id)} onClick={() => decline(detail)}>Decline</button>
                <button className="a" disabled={busy.has(detail.id)} onClick={() => accept(detail, true)}>
                  {busy.has(detail.id) ? "…" : "Accept"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("chats");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "requests" || t === "sent") setView(t);
  }, []);

  const toggle = () => {
    if (searchOpen) setSearch("");
    setSearchOpen(!searchOpen);
  };

  const right =
    view === "chats" ? (
      <>
        <button className="u-icon" onClick={() => router.push("/chat-setup")} aria-label="Chat interface"><PaletteIcon size={18} /></button>
        <button className="u-icon" onClick={toggle} aria-label="Search">{searchOpen ? <CloseIcon size={18} /> : <SearchIcon size={18} />}</button>
        <button className="u-add" onClick={() => router.push("/")} aria-label="Find someone on the feed"><PlusIcon size={18} /></button>
      </>
    ) : null;

  return (
    <AppShell title={view === "requests" ? "Requests" : view === "sent" ? "Sent" : "messages"} right={right}>
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
