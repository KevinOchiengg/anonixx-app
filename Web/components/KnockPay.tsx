"use client";
/** One tap Knock: pays the Link Up fee and opens the chat. Short on coins, it opens a pay
 * sheet with the smallest pack that covers it (M-Pesa), and walks them in once it's paid.
 * Backend: POST /unlock-requests (refunds itself if the poster never replies). */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, COST } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useConfirm } from "@/lib/confirm";
import Sheet from "./Sheet";
import AgeGate from "./AgeGate";

type Pack = { id: string; coins: number; display_price: string };
type Target = { id: string; anonymous_name?: string | null; kind?: string | null };
const PHONE_KEY = "anonixx.mpesa.phone";

export function useKnock(onToast?: (m: string) => void) {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState("");
  const [pay, setPay] = useState<Target | null>(null);
  const [age, setAge] = useState<Target | null>(null);
  const confirm = useConfirm();

  const payIn = useCallback(async (post: Target) => {
    if (busy) return;
    setBusy(post.id);
    try {
      const viaProfile = !!post.kind && post.kind !== "hookup";
      const r = await api<{ connection_id?: string }>("/unlock-requests", { body: { target_type: "drop", target_id: post.id, payment_method: "coins", ...(viaProfile ? { via_profile: true } : {}) } });
      refresh();
      if (r.connection_id) router.push(`/chat/${r.connection_id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "coins_short") setPay(post);
      else if (e instanceof ApiError && e.code === "age_verification_required") setAge(post);
      else onToast?.((e as Error).message);
    } finally {
      setBusy("");
    }
  }, [busy, refresh, router, onToast]);

  const knock = useCallback(async (post: Target) => {
    if (busy) return;
    const cost = user?.is_premium ? 0 : COST.linkUp;
    const balance = user?.coin_balance ?? 0;
    const name = post.anonymous_name || "them";
    const ok = await confirm({
      title: `Link up with ${name}?`,
      message: cost
        ? "You go straight into the chat. If they don't reply within 24 hours, your coins come back."
        : "Free for you. You go straight into the chat.",
      detail: cost ? (
        <>
          <div className="cf-row"><span>Link Up</span><b className="cf-cost">{cost} coins</b></div>
          <div className="cf-row"><span>Your balance</span><b>{balance} coins</b></div>
        </>
      ) : undefined,
      confirmLabel: cost ? `Pay ${cost} coins` : "Link Up",
    });
    if (ok) await payIn(post);
  }, [busy, user?.is_premium, user?.coin_balance, confirm, payIn]);

  const ui = (
    <>
      {pay ? <PaySheet need={Math.max(1, COST.linkUp - (user?.coin_balance ?? 0))} name={pay.anonymous_name ?? null} onClose={() => setPay(null)} onPaid={() => { const p = pay; setPay(null); payIn(p); }} /> : null}
      {age ? (
        <Sheet onClose={() => setAge(null)}>
          <AgeGate onDone={() => { const p = age; setAge(null); payIn(p); }} />
        </Sheet>
      ) : null}
    </>
  );
  return { knock, busy, ui };
}

function PaySheet({ need, name, onClose, onPaid }: { need: number; name: string | null; onClose: () => void; onPaid: () => void }) {
  const { refresh } = useAuth();
  const [pack, setPack] = useState<Pack | null>(null);
  const [mpesa, setMpesa] = useState<boolean | null>(null);
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "waiting" | "failed">("idle");
  const [msg, setMsg] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    try { setPhone(localStorage.getItem(PHONE_KEY) || ""); } catch { /* ignore */ }
    api<{ show_mpesa: boolean; packages: Pack[] }>("/geo/config").then((r) => {
      setMpesa(Boolean(r.show_mpesa));
      const fits = [...r.packages].sort((a, b) => a.coins - b.coins);
      setPack(fits.find((p) => p.coins >= need) || fits[fits.length - 1] || null);
    }).catch(() => setMpesa(false));
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [need]);

  const poll = (id: string, tries = 0) => {
    timer.current = window.setTimeout(async () => {
      try {
        const r = await api<{ status: string }>(`/coins/buy/status/${id}`);
        if (r.status === "completed") { await refresh(); onPaid(); return; }
        if (r.status === "failed") { setState("failed"); setMsg("The payment didn't go through. You were not charged."); return; }
      } catch { /* keep trying */ }
      if (tries >= 40) { setState("failed"); setMsg("Not confirmed yet. If you were charged, your coins are on the way."); return; }
      poll(id, tries + 1);
    }, 3000);
  };

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!pack) return;
    setState("sending");
    setMsg("");
    try {
      try { localStorage.setItem(PHONE_KEY, phone.trim()); } catch { /* ignore */ }
      const r = await api<{ checkout_request_id: string; message?: string }>("/coins/buy/mpesa", { body: { package_id: pack.id, phone_number: phone.trim() } });
      setState("waiting");
      setMsg("Check your phone and enter your M-Pesa PIN. You'll go straight in.");
      poll(r.checkout_request_id);
    } catch (err) {
      setState("failed");
      setMsg((err as Error).message);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <form className="kp" onSubmit={go}>
        <h3>Link up with {name || "them"}</h3>
        <p className="muted small">Link Up is {COST.linkUp} coins. You go straight into their Room. No reply in 24 hours and your coins come back.</p>
        {mpesa === null ? <p className="muted small">Loading…</p> : mpesa && pack ? (
          <>
            <input className="hk-field" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="M-Pesa number, 07…" aria-label="M-Pesa number" required disabled={state === "waiting"} />
            <button className="btn" disabled={state === "sending" || state === "waiting" || phone.trim().length < 9}>
              {state === "sending" ? "Sending…" : state === "waiting" ? "Waiting for your PIN…" : `Pay ${pack.display_price} and go in`}
            </button>
            <p className="muted small">Adds {pack.coins} coins. The rest stay in your wallet.</p>
          </>
        ) : (
          <a className="btn" href="/coins">Get coins</a>
        )}
        {msg ? <p className={state === "failed" ? "hk-missing" : "muted small"}>{msg}</p> : null}
      </form>
    </Sheet>
  );
}
