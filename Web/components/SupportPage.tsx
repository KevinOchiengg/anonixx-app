"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import AppShell from "./AppShell";

type Msg = { id: string; sender: "user" | "admin"; text: string; created_at?: string };
type Purchase = { id: string; coins: number; kes?: number | null; created_at?: string };

function Inner() {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [refund, setRefund] = useState(false);
  const [buys, setBuys] = useState<Purchase[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const count = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await api<{ messages: Msg[] }>("/support/messages");
      setMsgs(r.messages);
    } catch (e) { setErr((e as Error).message); }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (msgs && msgs.length !== count.current) {
      count.current = msgs.length;
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setErr(""); setText("");
    try { await api("/support/messages", { body: { text: t } }); await load(); }
    catch (x) { setErr((x as Error).message); setText(t); }
  }

  async function openRefund() {
    setRefund(true); setNote(""); setPick(null); setReason("");
    try { const r = await api<{ purchases: Purchase[] }>("/support/refundable-purchases"); setBuys(r.purchases); }
    catch { setBuys([]); }
  }

  async function submitRefund(e: React.FormEvent) {
    e.preventDefault();
    if (!pick || !reason.trim()) return;
    try {
      await api("/support/refund-requests", { body: { purchase_id: pick, reason: reason.trim() } });
      setRefund(false); await load();
    } catch (x) { setNote((x as Error).message); }
  }

  return (
    <div className="support-page">
      <div className="support-thread">
        {msgs === null ? <p className="muted center">Loading…</p> : msgs.length === 0 ? (
          <div className="empty"><h2>We&apos;re listening</h2><p>Tell us what&apos;s wrong. A real person replies here.</p></div>
        ) : msgs.map((m) => (
          <div key={m.id} className={`bubble${m.sender === "user" ? " own" : ""}`}>
            <span>{m.text}</span>
            {m.created_at ? <small>{new Date(m.created_at).toLocaleString(undefined, { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}</small> : null}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {err ? <div className="err">{err}</div> : null}
      <button type="button" className="support-refund" onClick={openRefund}>Request a coin refund</button>
      <form className="cmt-input support-send" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write to support…" maxLength={1000} />
        <button className="pill" disabled={!text.trim()}>Send</button>
      </form>

      {refund ? (
        <div className="sheet-back" onClick={() => setRefund(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Request a refund</h3>
            {buys === null ? <p className="muted">Loading…</p> : buys.length === 0 ? (
              <p className="muted">No coin purchases can be refunded right now.</p>
            ) : (
              <form className="form" onSubmit={submitRefund}>
                <div className="refund-list">
                  {buys.map((b) => (
                    <button type="button" key={b.id} className={`refund-item${pick === b.id ? " on" : ""}`} onClick={() => setPick(b.id)}>
                      <b>{b.coins} coins</b>
                      <small>{b.kes ? `KES ${b.kes} · ` : ""}{b.created_at ? new Date(b.created_at).toLocaleDateString() : ""}</small>
                    </button>
                  ))}
                </div>
                <label className="field">Why?
                  <textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
                {note ? <div className="err">{note}</div> : null}
                <button className="btn" disabled={!pick || !reason.trim()}>Send request</button>
              </form>
            )}
            <button className="pill ghost" onClick={() => setRefund(false)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function SupportPage() {
  return <AppShell title="Support" back="/profile"><Inner /></AppShell>;
}
