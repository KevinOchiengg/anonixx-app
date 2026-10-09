"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { normalizeKePhone } from "@/lib/phone";
import AppShell from "./AppShell";
import "@/app/money.css";

type Plan = { id: string; label: string; usd_display?: string; kes: number; days: number; save?: string | null };

function Inner() {
  const { refresh } = useAuth();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "waiting" | "done" | "failed">("idle");
  const [msg, setMsg] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    api<{ plans: Plan[] }>("/premium/plans").then((r) => setPlans(r.plans)).catch(() => setPlans([]));
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, []);

  function poll(id: string, tries = 0) {
    timer.current = window.setTimeout(async () => {
      try {
        const r = await api<{ status: string }>(`/premium/mpesa/status/${id}`);
        if (r.status === "completed") { setState("done"); setMsg("You're premium. Posting and link-ups are free."); refresh(); return; }
        if (r.status === "failed") { setState("failed"); setMsg("The payment didn't go through. You were not charged."); return; }
      } catch { /* keep trying */ }
      if (tries >= 40) { setState("failed"); setMsg("No confirmation yet. If you were charged, premium will activate shortly."); return; }
      poll(id, tries + 1);
    }, 3000);
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!plan) return;
    const num = normalizeKePhone(phone);
    if (num.length < 12) { setMsg("Enter a valid M-Pesa number."); return; }
    setState("sending"); setMsg("");
    try {
      const r = await api<{ checkout_request_id: string; message: string }>("/premium/mpesa", { body: { plan_id: plan.id, phone_number: num } });
      setState("waiting"); setMsg(r.message || "Check your phone and enter your M-Pesa PIN.");
      poll(r.checkout_request_id);
    } catch (err) { setState("failed"); setMsg((err as Error).message); }
  }

  function close() {
    if (timer.current) window.clearTimeout(timer.current);
    setPlan(null); setState("idle"); setMsg("");
  }

  return (
    <div className="pad">
      <div className="balance"><span>Premium</span><strong>∞</strong></div>
      <p className="muted small">Post and link up without spending coins. Pay with M-Pesa, no auto-renew.</p>
      <h2 className="sec">Choose a plan</h2>
      {plans === null ? <p className="muted">Loading…</p> : plans.length === 0 ? <p className="muted">Plans aren&apos;t available right now.</p> : (
        <div className="cards">
          {plans.map((p) => (
            <button key={p.id} className="card wide" onClick={() => setPlan(p)}>
              <strong>{p.label}</strong>
              <span>KES {p.kes}{p.usd_display ? ` · ${p.usd_display}` : ""}</span>
              <small>{p.days} days</small>
              {p.save ? <span className="plan-save">{p.save}</span> : null}
            </button>
          ))}
        </div>
      )}
      <p className="muted small">Card payments are only available in the app.</p>

      {plan ? (
        <div className="sheet-back" onClick={close}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>{plan.label} · KES {plan.kes}</h3>
            {state === "idle" || state === "sending" ? (
              <form onSubmit={pay} className="form">
                <label className="field">M-Pesa number
                  <input inputMode="tel" required placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </label>
                {msg ? <div className="err">{msg}</div> : null}
                <button className="btn" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send M-Pesa prompt"}</button>
              </form>
            ) : (
              <>
                <p>{msg}</p>
                {state === "waiting" ? <p className="muted small">Waiting for confirmation…</p> : null}
                <div className="row">
                  {state === "failed" ? <button className="pill" onClick={() => { setState("idle"); setMsg(""); }}>Try again</button> : null}
                  <button className="pill ghost" onClick={close}>{state === "done" ? "Done" : "Close"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function PremiumPage() {
  return <AppShell title="Premium" back="/settings"><Inner /></AppShell>;
}
