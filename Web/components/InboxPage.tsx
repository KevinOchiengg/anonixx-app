"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, teaser } from "@/lib/api";
import AppShell from "./AppShell";

type Conn = {
  id: string;
  confession: string;
  other_anonymous_name: string;
  other_is_online: boolean;
  unread_count: number;
  last_message: string | null;
  last_message_at: string | null;
};
type Req = {
  id: string;
  confession_snippet: string;
  requester_anonymous_name: string;
};
type Sent = { id: string; status: string; connection_id: string | null; target_id: string };

function Inner() {
  const [tab, setTab] = useState<"chats" | "requests" | "sent">("chats");
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, r, s] = await Promise.all([
        api<{ connections: Conn[] }>("/drops/connections"),
        api<{ requests: Req[] }>("/unlock-requests/incoming"),
        api<{ requests: Sent[] }>("/unlock-requests/sent"),
      ]);
      setConns(c.connections);
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

  async function act(id: string, action: "accept" | "decline" | "cancel") {
    setBusy(id);
    setError("");
    try {
      await api(`/unlock-requests/${id}/${action}`, { method: "POST" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const tabs: [typeof tab, string, number][] = [
    ["chats", "Chats", conns?.reduce((n, c) => n + (c.unread_count || 0), 0) ?? 0],
    ["requests", "Requests", reqs?.length ?? 0],
    ["sent", "Sent", 0],
  ];

  return (
    <div>
      <div className="tabs">
        {tabs.map(([k, label, n]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {label}{n ? <i>{n}</i> : null}
          </button>
        ))}
      </div>
      {error ? <div className="err pad">{error}</div> : null}

      {tab === "chats" ? (
        conns === null ? <p className="muted center">Loading…</p> :
        conns.length === 0 ? (
          <div className="empty"><h2>No chats yet</h2><p>Link up with someone from the feed and it shows up here.</p></div>
        ) : (
          <ul className="rows">
            {conns.map((c) => (
              <li key={c.id}>
                <Link href={`/chat/${c.id}`} className="row-item">
                  <span className={`dot${c.other_is_online ? " on" : ""}`} />
                  <span className="grow">
                    <b>{c.other_anonymous_name}</b>
                    <small>{teaser(c.last_message || c.confession, 60)}</small>
                  </span>
                  {c.unread_count ? <i className="badge">{c.unread_count}</i> : null}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "requests" ? (
        reqs === null ? <p className="muted center">Loading…</p> :
        reqs.length === 0 ? (
          <div className="empty"><h2>Nothing waiting</h2><p>When someone wants to link up with your confession, you&apos;ll see it here.</p></div>
        ) : (
          <ul className="rows">
            {reqs.map((r) => (
              <li key={r.id} className="req">
                <b>{r.requester_anonymous_name} wants to link up</b>
                <small>on “{teaser(r.confession_snippet, 80)}”</small>
                <div className="row">
                  <button className="pill" disabled={busy === r.id} onClick={() => act(r.id, "accept")}>Accept</button>
                  <button className="pill ghost" disabled={busy === r.id} onClick={() => act(r.id, "decline")}>Decline</button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "sent" ? (
        sent === null ? <p className="muted center">Loading…</p> :
        sent.length === 0 ? (
          <div className="empty"><h2>No requests sent</h2><p>Tap Link up on a post you can&apos;t stop thinking about.</p></div>
        ) : (
          <ul className="rows">
            {sent.map((s) => (
              <li key={s.id} className="req">
                <b>{s.status === "accepted" ? "Accepted" : s.status === "pending" ? "Waiting for a reply" : s.status[0].toUpperCase() + s.status.slice(1)}</b>
                <small><Link href={`/drop/${s.target_id}`}>View the post</Link></small>
                <div className="row">
                  {s.status === "accepted" && s.connection_id ? <Link href={`/chat/${s.connection_id}`} className="pill">Open chat</Link> : null}
                  {s.status === "pending" ? <button className="pill ghost" disabled={busy === s.id} onClick={() => act(s.id, "cancel")}>Cancel</button> : null}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

export default function InboxPage() {
  return (
    <AppShell title="Inbox">
      <Inner />
    </AppShell>
  );
}
