"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** One tap 18+ confirmation, shown wherever the backend answers age_verification_required. */
export default function AgeGate({ onDone, compact = false }: { onDone: () => void; compact?: boolean }) {
  const { refresh } = useAuth();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/users/me/verify-age", { body: { adult_confirmed: true } });
      await refresh();
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`age-gate${compact ? " compact" : ""}`} onSubmit={confirm}>
      <b>Adults only past this point.</b>
      <p>Confirm you&apos;re 18+ once and every Room opens.</p>
      <label className="check">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} required />
        <span>I&apos;m 18 or older and I agree to the <a href="/terms">Terms</a>.</span>
      </label>
      {error ? <div className="err">{error}</div> : null}
      <button className="u-cta" disabled={busy || !ok}>{busy ? "Checking…" : "I'm 18+, let me in"}</button>
    </form>
  );
}
