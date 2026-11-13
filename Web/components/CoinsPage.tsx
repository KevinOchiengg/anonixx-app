"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AppShell from "./AppShell";

/** Coins and plans, priced for the visitor's country (GET /geo/config). M-Pesa checkout only
 * where M-Pesa exists; everywhere else prices show in USD and buying happens in the app. */
type Pack = { id: string; coins: number; label: string; tag: string | null; display_price: string; kes?: number };
type Plan = { id: string; label: string; days: number; kes: number; usd_display?: string };

type Buying = { kind: "coins" | "premium"; id: string; title: string; price: string };

function Inner() {
  const { user, refresh } = useAuth();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [mpesa, setMpesa] = useState(false);
  const [buying, setBuying] = useState<Buying | null>(null);
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "waiting" | "done" | "failed">("idle");
  const [msg, setMsg] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    api<{ show_mpesa: boolean; packages: Pack[] }>("/geo/config")
      .then((r) => { setMpesa(Boolean(r.show_mpesa)); setPacks(r.packages); })
      .catch(() => {});
    api<{ plans: Plan[] }>("/premium/plans").then((r) => setPlans(r.plans)).catch(() => {});
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, []);

  const poll = useCallback((b: Buying, checkoutId: string, tries = 0) => {
    const path = b.kind === "coins" ? `/coins/buy/status/${checkoutId}` : `/premium/mpesa/status/${checkoutId}`;
    timer.current = window.setTimeout(async () => {
      try {
        const r = await api<{ status: string }>(path);
        if (r.status === "completed") {
          setState("done");
          setMsg(b.kind === "coins" ? "Coins added." : "You're subscribed. Posting and link-ups are free.");
          refresh();
          return;
        }
        if (r.status === "failed") {
          setState("failed");
          setMsg("The payment didn't go through. You were not charged.");
          return;
        }
      } catch { /* keep trying */ }
      if (tries >= 40) {
        setState("failed");
        setMsg("Not confirmed yet. If you were charged, your coins are on the way.");
        return;
      }
      poll(b, checkoutId, tries + 1);
    }, 3000);
  }, [refresh]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!buying) return;
    setState("sending");
    setMsg("");
    try {
      const r =
        buying.kind === "coins"
          ? await api<{ checkout_request_id: string; message: string }>("/coins/buy/mpesa", {
              body: { package_id: buying.id, phone_number: phone.trim() },
            })
          : await api<{ checkout_request_id: string; message: string }>("/premium/mpesa", {
              body: { plan_id: buying.id, phone_number: phone.trim() },
            });
      setState("waiting");
      setMsg(r.message || "Check your phone and enter your M-Pesa PIN.");
      poll(buying, r.checkout_request_id);
    } catch (err) {
      setState("failed");
      setMsg((err as Error).message);
    }
  }

  const planPrice = (p: Plan) => (mpesa ? `KES ${p.kes}` : p.usd_display || "");

  function close() {
    if (timer.current) window.clearTimeout(timer.current);
    setBuying(null);
    setState("idle");
    setMsg("");
  }

  return (
    <div className="pad">
      <div className="balance">
        <span>Your coins</span>
        <strong>{user?.coin_balance ?? 0}</strong>
      </div>

      <h2 className="sec">Buy coins</h2>
      <div className="cards">
        {packs.map((p) => (
          <button key={p.id} className="card" onClick={() => setBuying({ kind: "coins", id: p.id, title: `${p.coins} coins`, price: p.display_price })}>
            {p.tag ? <em>{p.tag}</em> : null}
            <strong>{p.coins} coins</strong>
            <span>{p.display_price}</span>
          </button>
        ))}
      </div>

      {plans.length ? (
        <>
          <h2 className="sec">Go unlimited</h2>
          <div className="cards">
            {plans.map((p) => (
              <button key={p.id} className="card wide" onClick={() => setBuying({ kind: "premium", id: p.id, title: `Subscription, ${p.label}`, price: planPrice(p) })}>
                <strong>{p.label}</strong>
                <span>{planPrice(p)}</span>
                <small>Posting and link-ups free for {p.days} days</small>
              </button>
            ))}
          </div>
        </>
      ) : null}

      <p className="muted small">{mpesa ? "Pay with M-Pesa." : "Buy in the Anonixx app, by card or through your app store."} Coins have no cash value. Need a refund? Message support in Settings.</p>

      {buying ? (
        <div className="sheet-back" onClick={close}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>{buying.title} · {buying.price}</h3>
            {!mpesa ? (
              <>
                <p>Buy in the app. Same account, same coins here.</p>
                <div className="row"><button className="pill ghost" onClick={close}>Close</button></div>
              </>
            ) : state === "idle" || state === "sending" ? (
              <form onSubmit={pay} className="form">
                <label className="field">M-Pesa number
                  <input inputMode="tel" required placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </label>
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
            {state === "idle" && msg ? <div className="err">{msg}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CoinsPage() {
  return (
    <AppShell title="Coins" back="/settings">
      <Inner />
    </AppShell>
  );
}
