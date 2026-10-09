"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { normalizeKePhone } from "@/lib/phone";
import AppShell from "./AppShell";
import "@/app/money.css";

type Sent = { id: string; to: string; text: string; status: string };
const LABEL: Record<string, string> = {
  pending: "Waiting for them", delivered: "Delivered", declined: "Declined", expired: "Expired", failed: "Not delivered",
};

function Inner() {
  const { refresh } = useAuth();
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needCoins, setNeedCoins] = useState(false);
  const [ok, setOk] = useState("");
  const [sent, setSent] = useState<Sent[] | null>(null);

  const load = useCallback(() => {
    api<{ messages: Sent[] }>("/whatsapp/sent").then((r) => setSent(r.messages)).catch(() => setSent([]));
  }, []);
  useEffect(load, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const num = normalizeKePhone(phone);
    if (num.length < 12) { setError("Enter a valid phone number."); return; }
    setBusy(true); setError(""); setOk(""); setNeedCoins(false);
    try {
      await api("/whatsapp/send", { body: { phone: num, text: text.trim() } });
      setOk("Sent. They get a request first and only see your message if they agree. Your name stays hidden.");
      setText(""); setPhone("");
      load(); refresh();
    } catch (err) {
      if ((err as { status?: number }).status === 402) setNeedCoins(true);
      setError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="pad">
      <form className="form" onSubmit={submit}>
        <p className="muted small">Send an anonymous message to someone&apos;s WhatsApp. They approve before they read it and never see who you are. 3 coins, free for premium.</p>
        <label className="field">Their number
          <input inputMode="tel" required placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="field">Message
          <textarea maxLength={500} required value={text} onChange={(e) => setText(e.target.value)} placeholder="Say what you could never say to their face" />
        </label>
        <div className="counter">{text.length}/500</div>
        {error ? <div className="err">{error}</div> : null}
        {ok ? <div className="ok">{ok}</div> : null}
        {needCoins ? <Link href="/coins" className="pill">Buy coins</Link> : null}
        <button className="btn" disabled={busy || !text.trim()}>{busy ? "Sending…" : "Send anonymously"}</button>
      </form>

      <h2 className="sec">Sent</h2>
      {sent === null ? <p className="muted">Loading…</p> : sent.length === 0 ? <p className="muted small">Nothing sent yet.</p> : sent.map((m) => (
        <div key={m.id} className="tx">
          <span className="grow"><b>{m.to}</b><small className="muted">{m.text.length > 70 ? `${m.text.slice(0, 70)}…` : m.text}</small></span>
          <span className="badge">{LABEL[m.status] || m.status}</span>
        </div>
      ))}
    </div>
  );
}

export default function WhatsAppPage() {
  return <AppShell title="Anonymous WhatsApp" back="/settings"><Inner /></AppShell>;
}
