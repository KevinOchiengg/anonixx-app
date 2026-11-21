"use client";
import { useState } from "react";
import { livesApi, type PayoutProfile } from "@/lib/lives";

/** Where a host's weekly earnings are sent. Shown before the first live and on the earnings page. */
export default function PayoutForm({ initial, onSaved }: { initial?: PayoutProfile | null; onSaved: (p: PayoutProfile) => void }) {
  const [name, setName] = useState(initial?.legal_name || "");
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState(initial?.mpesa_phone ? `0${initial.mpesa_phone.slice(3)}` : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await livesApi.savePayoutProfile({ legal_name: name.trim(), id_number: idNumber.trim(), mpesa_phone: phone.trim() });
      onSaved(r.profile);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="lv-form" onSubmit={save}>
      <p className="muted small">Your earnings are sent here every week. Only Anonixx sees these details; viewers never do.</p>
      <label className="field">
        Full name (as on your ID)
        <input value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={80} required autoComplete="name" />
      </label>
      <label className="field">
        ID number
        <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} minLength={5} maxLength={20} required inputMode="numeric"
          placeholder={initial ? `Ends in ${initial.id_number_last4}` : undefined} />
      </label>
      <label className="field">
        M-Pesa number
        <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" placeholder="0712 345 678" autoComplete="tel" />
      </label>
      {error ? <p className="err">{error}</p> : null}
      <button className="pill" disabled={busy || !name.trim() || !idNumber.trim() || !phone.trim()}>{busy ? "Saving…" : "Save payout details"}</button>
    </form>
  );
}
