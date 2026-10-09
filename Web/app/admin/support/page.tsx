"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Badge, fmtDate } from "@/components/admin/bits";

type Conv = { user_id: string; name: string; last_text: string; last_sender: string; last_at: string | null; unread: number };
type Msg = { id: string; sender: string; text: string; created_at: string | null };

export default function AdminSupport() {
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [open, setOpen] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const loadConvs = useCallback(async () => {
    try {
      setConvs((await api<{ conversations: Conv[] }>("/admin/support/conversations?limit=100")).conversations);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadThread = useCallback(async (userId: string) => {
    try {
      setMsgs((await api<{ messages: Msg[] }>(`/admin/support/conversations/${userId}/messages`)).messages);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadConvs();
    const t = window.setInterval(loadConvs, 15000);
    return () => window.clearInterval(t);
  }, [loadConvs]);

  useEffect(() => {
    if (!open) return;
    setMsgs([]);
    loadThread(open.user_id);
    const t = window.setInterval(() => loadThread(open.user_id), 5000);
    return () => window.clearInterval(t);
  }, [open, loadThread]);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !open) return;
    setBusy(true);
    try {
      await api(`/admin/support/conversations/${open.user_id}/messages`, { body: { text: t } });
      setText("");
      await loadThread(open.user_id);
      loadConvs();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (open) {
    return (
      <>
        <div className="adm-foot">
          <h2>{open.name}</h2>
          <button className="adm-btn" onClick={() => { setOpen(null); loadConvs(); }}>← All chats</button>
        </div>
        {error ? <p className="err">{error}</p> : null}
        <div className="adm-thread">
          {msgs.map((m) => (
            <div key={m.id} className={`adm-msg${m.sender === "admin" ? " mine" : ""}`}>
              <span>{m.text}</span>
              <small>{m.sender === "admin" ? "Support" : open.name} · {fmtDate(m.created_at)}</small>
            </div>
          ))}
          <div ref={end} />
        </div>
        <form className="adm-search" onSubmit={reply}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply as Anonixx support…" maxLength={2000} />
          <button className="adm-btn primary" disabled={busy || !text.trim()}>Send</button>
        </form>
      </>
    );
  }

  return (
    <>
      <h2>Customer support</h2>
      {error ? <p className="err">{error}</p> : null}
      {!convs ? <p className="muted">Loading…</p> : convs.length === 0 ? <p className="muted">No one has written in yet.</p> : (
        <div className="adm-list">
          {convs.map((c) => (
            <button key={c.user_id} className="adm-card adm-link" onClick={() => setOpen(c)}>
              <div className="adm-foot">
                <b>{c.name}</b>
                {c.unread ? <Badge tone="bad">{c.unread} new</Badge> : null}
              </div>
              <span className="muted small adm-clip">{c.last_sender === "admin" ? "You: " : ""}{c.last_text}</span>
              <span className="muted small">{fmtDate(c.last_at)}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
