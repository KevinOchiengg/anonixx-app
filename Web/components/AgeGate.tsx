"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** One tap 18+ confirmation, shown wherever the backend answers age_verification_required. */
export default function AgeGate({ onDone, compact = false }: { onDone: () => void; compact?: boolean }) {
  const { refresh } = useAuth();
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!dob || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/users/me/verify-age", { body: { date_of_birth: dob } });
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
      <p>Confirm you&apos;re 18+ once and every Room opens. Your birthday stays private.</p>
      <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} max={new Date().toISOString().slice(0, 10)} required aria-label="Date of birth" />
      {error ? <div className="err">{error}</div> : null}
      <button className="u-cta" disabled={busy || !dob}>{busy ? "Checking…" : "I'm 18+, let me in"}</button>
    </form>
  );
}
