"use client";
/** Rooms, built like a messenger home: Chats (everyone you're connected with), Updates (who's
 * live + your Room), Knocks (who's at your door; your sent knocks too) and Calls (the log).
 * Each chat's ⌄ menu (or right-click) pins, mutes or archives it. The ⋮ menu has Starred,
 * Archived and every Room setting.
 * ?tab=chats|updates|knocks|sent|calls (old connections / requests / live / myroom still work). */
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { intentLabel } from "@/lib/linkup";
import { callsApi, callInfo } from "@/lib/calls";
import { chatsApi, chatTime, type Chat, type ThreadItem } from "@/lib/chats";
import AppShell from "./AppShell";
import KnockClues, { type KnockClue } from "./KnockClues";
import CallRoom, { type CallInfo } from "./CallRoom";
import RoomSettingsMenu from "./rooms/RoomSettingsMenu";
import UpdatesPanel from "./rooms/UpdatesPanel";
import { StartSession } from "./rooms/LivePanel";
import { CallsPanel, ChatRow, Icon, PickChats } from "./rooms/Messenger";
import { Star } from "lucide-react";

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
type View = "chats" | "updates" | "knocks" | "sent" | "calls" | "archived" | "starred";
type Tab = "chats" | "updates" | "knocks" | "calls";
const TABS: [Tab, string][] = [["chats", "Chats"], ["updates", "Updates"], ["knocks", "Knocks"], ["calls", "Calls"]];
const FILTERS = [["all", "All"], ["unread", "Unread"], ["guests", "Guests"], ["rooms", "Their Rooms"]] as const;
type Filter = (typeof FILTERS)[number][0];
const FROM_QS: Record<string, View> = {
  chats: "chats", connections: "chats", updates: "updates", live: "updates", myroom: "updates",
  knocks: "knocks", requests: "knocks", sent: "sent", calls: "calls", archived: "archived", starred: "starred",
};

function Knocks({ view, setView, reqs, sent, reload }: { view: "knocks" | "sent"; setView: (v: View) => void; reqs: Req[] | null; sent: Sent[] | null; reload: () => void }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const mark = (id: string, on: boolean) => setBusy((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  useEffect(() => { if (!note) return; const t = window.setTimeout(() => setNote(""), 3500); return () => window.clearTimeout(t); }, [note]);

  async function accept(r: Req) {
    mark(r.id, true); setError("");
    try {
      const d = await api<{ connection_id?: string }>(`/unlock-requests/${r.id}/accept`, { method: "POST" });
      if (d.connection_id) router.push(`/chat/${d.connection_id}`);
      else { setNote("Let in. They're inside your Room."); reload(); }
    } catch (e) { setError((e as Error).message || "Could not let them in right now."); } finally { mark(r.id, false); }
  }
  async function decline(r: Req) {
    mark(r.id, true); setError("");
    try { await api(`/unlock-requests/${r.id}/decline`, { method: "POST" }); reload(); } catch { setError("Could not decline right now."); } finally { mark(r.id, false); }
  }
  async function cancel(s: Sent) {
    mark(s.id, true);
    try { await api(`/unlock-requests/${s.id}/cancel`, { method: "POST" }); reload(); } catch (e) { setError((e as Error).message); } finally { mark(s.id, false); }
  }
  async function resend(s: Sent) {
    mark(s.id, true);
    try {
      await api("/unlock-requests", { body: { target_type: s.target_type, target_id: s.target_id, payment_method: "coins", via_profile: true } });
      setNote("Knock sent again."); reload();
    } catch (e) { setError((e as Error).message); } finally { mark(s.id, false); }
  }

  const pendingSent = (sent || []).filter((s) => s.status === "pending").length;
  return (
    <div>
      <div className="u-segs">
        <button className={`u-seg${view === "knocks" ? " on" : ""}`} onClick={() => setView("knocks")}>Received{reqs?.length ? ` · ${reqs.length}` : ""}</button>
        <button className={`u-seg${view === "sent" ? " on" : ""}`} onClick={() => setView("sent")}>Sent{pendingSent ? ` · ${pendingSent}` : ""}</button>
      </div>
      {note ? <div className="ok pad">{note}</div> : null}
      {error ? <div className="err pad">{error}</div> : null}
      {view === "knocks" ? (
        reqs === null ? <p className="muted center">Loading…</p> : reqs.length === 0 ? (
          <div className="rx-empty">
            <span className="rx-door" aria-hidden><i /></span>
            <b>Nobody at the door yet</b>
            <p>Post something tonight. The knocks land here.</p>
            <Link href="/compose" className="u-cta">Post something</Link>
          </div>
        ) : (
          <div className="lr-list">
            <p className="rs-info">Knocking is free. Let them in and their coins move, once. Decline: nothing.</p>
            {reqs.map((r) => {
              const b = busy.has(r.id);
              const thumbs = (r.requester_gallery || []).slice(0, 3);
              const open = () => router.push(`/room/${r.requester_id}`);
              return (
                <div className="lr-row" key={r.id} role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === "Enter" && open()}>
                  <span className="lr-ava">
                    <span>{r.requester_avatar_url ? <Image src={r.requester_avatar_url} alt="" width={48} height={48} /> : r.requester_anonymous_name?.[0]?.toUpperCase() || "A"}</span>
                  </span>
                  <span className="lr-main">
                    <span className="lr-top"><b>{r.requester_anonymous_name || "Anonymous"}</b><time>{chatTime(r.created_at || null)}</time></span>
                    <span className={`lr-pitch${r.pitch ? "" : " none"}`}>{r.pitch || "knocked on your door"}</span>
                    {r.intents?.length ? <span className="room-intents">{r.intents.map((i) => <i key={i}>{intentLabel(i)}</i>)}</span> : null}
                    {r.confession_snippet ? <span className="lr-on">on &ldquo;{r.confession_snippet}&rdquo;</span> : null}
                    <KnockClues k={r} />
                    {thumbs.length ? (
                      <span className="lr-thumbs">
                        {thumbs.map((g, k) => <span key={k}>{g.media_type === "video" ? <video src={g.media_url} muted playsInline preload="metadata" /> : <Image src={g.media_url} alt="" width={34} height={44} />}</span>)}
                      </span>
                    ) : null}
                    <span className="lr-acts" onClick={(e) => e.stopPropagation()}>
                      <button className="d" disabled={b} onClick={() => decline(r)}>Decline</button>
                      <button className="a" disabled={b} onClick={() => accept(r)}>{b ? "…" : "Let In"}</button>
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )
      ) : sent === null ? <p className="muted center">Loading…</p> : sent.length === 0 ? (
        <div className="u-empty">No knocks yet. Find a post you can&apos;t stop thinking about.</div>
      ) : sent.map((s) => (
        <div className="u-sent" key={s.id}>
          {s.status === "pending" ? (<><b>Waiting for a response…</b><small>Nothing&apos;s charged unless they let you in.</small></>)
            : s.status === "accepted" ? <b>You&apos;re inside.</b>
            : s.status === "declined" ? (<><b>They&apos;re not up for it right now</b><small>You can knock again anytime. No coins were spent.</small></>)
            : (<><b>{s.status === "expired" ? "This confession expired" : s.status[0].toUpperCase() + s.status.slice(1)}</b><small>Gone before they answered. No coins spent.</small></>)}
          <div className="row">
            {s.status === "accepted" && s.connection_id ? <Link href={`/chat/${s.connection_id}`} className="pill">Open chat</Link> : null}
            {s.status === "pending" ? <button className="pill ghost" disabled={busy.has(s.id)} onClick={() => cancel(s)}>Take back knock</button> : null}
            {s.status === "declined" ? <button className="pill" disabled={busy.has(s.id)} onClick={() => resend(s)}>Knock again</button> : null}
            <Link href={`/drop/${s.target_id}`} className="pill ghost">View the post</Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function Starred({ back }: { back: () => void }) {
  const [items, setItems] = useState<ThreadItem[] | null>(null);
  const load = useCallback(() => { chatsApi.starred().then((r) => setItems(r.messages)).catch(() => setItems([])); }, []);
  useEffect(() => { load(); }, [load]);
  async function unstar(m: ThreadItem) {
    setItems((x) => (x || []).filter((i) => i.id !== m.id));
    try { await chatsApi.star(m.connection_id, m.id, false); } catch { load(); }
  }
  return (
    <div>
      <button className="mx-backrow" onClick={back}>{Icon.back(18)} Starred messages</button>
      {items === null ? <p className="muted center">Loading…</p> : items.length === 0 ? (
        <div className="rx-empty"><b>No starred messages</b><p>Star a message to keep it here. Only you see them.</p></div>
      ) : (
        <ul className="mx-starred">
          {items.map((m) => (
            <li key={m.id}>
              <div className="mx-st-meta"><b>{m.is_own ? `You ▸ ${m.other_anonymous_name}` : `${m.other_anonymous_name} ▸ You`}</b><time>{chatTime(m.created_at)}</time></div>
              <Link href={`/chat/${m.connection_id}`} className={`mx-st-bub${m.is_own ? " own" : ""}`}>
                {m.media_type === "image" && m.media_url ? <Image src={m.media_url} alt="" width={220} height={220} style={{ height: "auto" }} /> : null}
                {m.media_type && m.media_type !== "image" ? <span>{m.preview}</span> : null}
                {m.content ? <span>{m.content}</span> : null}
                <i aria-hidden><Star size={12} fill="currentColor" strokeWidth={2} /></i>
              </Link>
              <button className="mx-st-un" onClick={() => unstar(m)}>Unstar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const [view, setViewState] = useState<View>("chats");
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [picker, setPicker] = useState<"chat" | "call" | null>(null);
  const [starting, setStarting] = useState(false);
  const [call, setCall] = useState<CallInfo | null>(null);
  const [missed, setMissed] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [callsKey, setCallsKey] = useState(0);

  const setView = useCallback((v: View) => {
    setViewState(v);
    window.history.replaceState(null, "", `/inbox?tab=${v}`);
  }, []);

  const load = useCallback(async () => {
    try {
      const [c, r, s] = await Promise.all([
        chatsApi.list(),
        api<{ requests: Req[] }>("/unlock-requests/incoming"),
        api<{ requests: Sent[] }>("/unlock-requests/sent"),
      ]);
      setChats(c.connections);
      setReqs(r.requests);
      setSent(s.requests);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); const t = window.setInterval(load, 15000); return () => window.clearInterval(t); }, [load]);

  // Missed calls since you last looked at Calls.
  useEffect(() => {
    if (view === "calls") { setMissed(0); return; }
    chatsApi.callHistory().then((h) => {
      let seen = "";
      try { seen = localStorage.getItem("rooms_calls_seen_at") || ""; } catch { /* private mode */ }
      setMissed(h.calls.filter((c) => c.missed && (!seen || c.started_at > seen)).length);
    }).catch(() => {});
  }, [view]);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const t = qs.get("tab");
    if (t && FROM_QS[t]) setViewState(FROM_QS[t]);
    // From a knock push: Accept lands on ?accept=, a plain tap on ?request=.
    const acc = qs.get("accept");
    const req = qs.get("request");
    if (acc) {
      api<{ connection_id?: string }>(`/unlock-requests/${acc}/accept`, { method: "POST" })
        .then((d) => router.replace(d.connection_id ? `/chat/${d.connection_id}` : "/inbox?tab=knocks"))
        .catch(() => { setViewState("knocks"); router.replace("/inbox?tab=knocks"); });
    } else if (req) {
      api<{ requests: Req[] }>("/unlock-requests/incoming")
        .then((d) => { const r = d.requests.find((x) => x.id === req); if (r) router.replace(`/room/${r.requester_id}`); else setViewState("knocks"); })
        .catch(() => setViewState("knocks"));
    }
  }, [router]);

  async function setPrefs(c: Chat, body: { pinned?: boolean; archived?: boolean; mute?: string }) {
    setError("");
    try {
      const p = await chatsApi.prefs(c.id, body);
      setChats((x) => (x || []).map((y) => (y.id === c.id ? { ...y, ...p } : y)));
      void load();
    } catch (e) { setError((e as Error).message); }
  }

  async function startCall(c: Chat, video: boolean) {
    setPicker(null); setError("");
    try { setCall(callInfo(await callsApi.direct(c.id, video), { other: { name: c.other_anonymous_name, avatar_url: c.other_avatar_url } })); }
    catch (e) { setError((e as Error).message); }
  }

  const inbox = useMemo(() => (chats || []).filter((c) => !c.archived), [chats]);
  const archived = useMemo(() => (chats || []).filter((c) => c.archived), [chats]);
  const unreadChats = inbox.filter((c) => c.unread_count > 0).length;
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const base = view === "archived" ? archived : q ? chats || [] : inbox;
    return base.filter((c) => {
      if (filter === "unread" && !(c.unread_count > 0)) return false;
      if (filter === "guests" && !c.is_sender) return false;
      if (filter === "rooms" && c.is_sender) return false;
      if (!q) return true;
      return c.other_anonymous_name?.toLowerCase().includes(q) || c.last_message?.toLowerCase().includes(q) || c.confession?.toLowerCase().includes(q);
    });
  }, [chats, inbox, archived, filter, q, view]);

  const tab: Tab | null = view === "sent" ? "knocks" : view === "archived" || view === "starred" ? null : (view as Tab);
  const counts: Record<Tab, number> = { chats: unreadChats, updates: liveCount, knocks: reqs?.length || 0, calls: missed };

  const right = searching ? null : (
    <>
      <button className="u-icon" onClick={() => { setSearching(true); setView("chats"); }} aria-label="Search chats">{Icon.search(19)}</button>
      <span className="mx-menu-wrap">
        <button className="u-icon" onClick={() => setMenu((m) => !m)} aria-label="More options" aria-expanded={menu}>{Icon.dots(19)}</button>
        {menu ? (
          <>
            <div className="mx-scrim" onClick={() => setMenu(false)} />
            <div className="mx-menu right" role="menu" onClick={() => setMenu(false)}>
              {view === "calls" ? <button role="menuitem" onClick={async () => { if (window.confirm("Clear your call log? It's only cleared for you.")) { await chatsApi.clearCalls().catch(() => {}); setCallsKey((k) => k + 1); } }}>Clear call log</button> : null}
              <button role="menuitem" onClick={() => setStarting(true)}>Go live</button>
              <button role="menuitem" onClick={() => setView("starred")}>Starred messages</button>
              <button role="menuitem" onClick={() => setView("archived")}>Archived{archived.length ? ` (${archived.length})` : ""}</button>
              <button role="menuitem" onClick={() => setView("updates")}>My Room</button>
              <button role="menuitem" onClick={() => setSettings(true)}>Room settings</button>
            </div>
          </>
        ) : null}
      </span>
    </>
  );

  const chatsList = (
    <div>
      {view === "archived" ? <button className="mx-backrow" onClick={() => setView("chats")}>{Icon.back(18)} Archived</button> : null}
      {!q && view === "chats" ? (
        <div className="mx-chips">
          {FILTERS.map(([k, label]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{label}{k === "unread" && unreadChats ? ` ${unreadChats}` : ""}</button>
          ))}
        </div>
      ) : null}
      {!q && view === "chats" && archived.length ? (
        <button className="mx-row mx-util" onClick={() => setView("archived")}>
          <span className="mx-util-ic">{Icon.archive(20)}</span><b>Archived</b>
          {archived.some((c) => c.unread_count > 0) ? <em>{archived.filter((c) => c.unread_count > 0).length}</em> : null}
        </button>
      ) : null}
      {!q && view === "chats" && reqs?.length ? (
        <button className="mx-row mx-util" onClick={() => setView("knocks")}>
          <span className="mx-util-ic hot">{Icon.door(20)}</span>
          <span className="mx-body"><b>{reqs.length === 1 ? "1 person is knocking" : `${reqs.length} people are knocking`}</b><small>{reqs.slice(0, 3).map((r) => r.requester_anonymous_name || "Someone").join(", ")} · click to answer</small></span>
        </button>
      ) : null}
      {view === "archived" && archived.length ? <p className="mx-note center">These chats stay archived when new messages arrive.</p> : null}
      {chats === null ? <p className="muted center">Loading…</p> : shown.length === 0 ? (
        q ? <div className="u-empty">No chats match “{query.trim()}”.</div>
          : view === "archived" ? <div className="rx-empty"><b>No archived chats</b><p>Archive a chat to tuck it away here.</p></div>
          : filter !== "all" ? <div className="u-empty">{filter === "unread" ? "You’re all caught up." : filter === "guests" ? "Nobody you’ve let in yet." : "You’re not inside anyone’s Room yet."}</div>
          : (
            <div className="rx-empty">
              <b>No chats yet</b>
              <p>Let someone in, or go knock. Every conversation lives here.</p>
              {reqs?.length ? <button className="u-cta" onClick={() => setView("knocks")}>Answer {reqs.length} at your door</button> : <Link href="/" className="u-cta">Find someone on the feed</Link>}
            </div>
          )
      ) : (
        <ul className="mx-list">
          {shown.map((c) => <ChatRow key={c.id} c={c} href={`/chat/${c.id}`} onPrefs={setPrefs} />)}
        </ul>
      )}
      {chats && inbox.length && view === "chats" ? <p className="mx-foot">Only the two of you can read a chat.</p> : null}
    </div>
  );

  const fab = view === "chats" ? { label: "New chat", icon: Icon.chat(22), on: () => setPicker("chat") }
    : view === "calls" ? { label: "New call", icon: Icon.phone(22), on: () => setPicker("call") }
    : view === "updates" ? { label: "Go live", icon: Icon.video(22), on: () => setStarting(true) } : null;

  return (
    <AppShell title="Rooms" right={right}>
      <div className="mx-page">
        {searching ? (
          <div className="mx-searchbar">
            <button onClick={() => { setSearching(false); setQuery(""); }} aria-label="Close search">{Icon.back(19)}</button>
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats…" aria-label="Search chats" />
            {query ? <button onClick={() => setQuery("")} aria-label="Clear">{Icon.close(17)}</button> : null}
          </div>
        ) : (
          <nav className="mx-tabs" role="tablist" aria-label="Rooms">
            {TABS.map(([k, label]) => {
              const n = counts[k];
              return (
                <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setView(k)}>
                  {label}
                  {n ? (k === "updates" ? <i className="dot" /> : <b className={k === "knocks" ? "hot" : ""}>{n > 99 ? "99+" : n}</b>) : null}
                </button>
              );
            })}
          </nav>
        )}
        {error ? <div className="err pad">{error}</div> : null}
        {view === "chats" || view === "archived" ? chatsList : null}
        {view === "starred" ? <Starred back={() => setView("chats")} /> : null}
        {view === "updates" ? <UpdatesPanel onGoLive={() => setStarting(true)} onLive={setLiveCount} /> : null}
        {view === "knocks" || view === "sent" ? <Knocks view={view} setView={setView} reqs={reqs} sent={sent} reload={load} /> : null}
        {view === "calls" ? <CallsPanel onStartSession={() => setStarting(true)} refreshKey={callsKey} /> : null}
        {fab && !searching ? <button className="mx-fab" onClick={fab.on} aria-label={fab.label} title={fab.label}>{fab.icon}</button> : null}
      </div>
      {picker === "chat" ? (
        <PickChats
          mode="open" title="New chat" onClose={() => setPicker(null)}
          onOpen={(c) => router.push(`/chat/${c.id}`)}
          extras={[
            { label: "Find someone new", hint: "Browse the feed and knock on a Room", icon: Icon.compass(20), href: "/" },
            { label: "Go live", hint: "Open a voice or video session in your Room", icon: Icon.radio(20), onClick: () => { setPicker(null); setStarting(true); } },
          ]}
        />
      ) : null}
      {picker === "call" ? <PickChats mode="call" title="New call" onClose={() => setPicker(null)} onCall={startCall} /> : null}
      {starting ? <StartSession onClose={() => setStarting(false)} onStarted={(c) => { setStarting(false); setCall(c); }} /> : null}
      {call ? <CallRoom info={call} onClose={() => { setCall(null); setCallsKey((k) => k + 1); }} /> : null}
      {settings ? <RoomSettingsMenu onClose={() => setSettings(false)} /> : null}
    </AppShell>
  );
}
