"use client";
import { useEffect, useState } from "react";
import { livesApi, type PayoutMethod, type PayoutProfile } from "@/lib/lives";

const METHOD_LABEL: Record<PayoutMethod, string> = { mpesa: "M-Pesa", paypal: "PayPal", bank: "Bank transfer" };
const METHOD_NOTE: Record<PayoutMethod, string> = {
  mpesa: "Paid in KES to your Safaricom number.",
  paypal: "Paid in USD to your PayPal account.",
  bank: "Paid in USD to your bank account.",
};

/** Where a host's weekly earnings are sent. Shown before the first live and on the earnings page. */
export default function PayoutForm({ initial, onSaved }: { initial?: PayoutProfile | null; onSaved: (p: PayoutProfile) => void }) {
  const [methods, setMethods] = useState<PayoutMethod[] | null>(null);
  const [method, setMethod] = useState<PayoutMethod>(initial?.method || "paypal");
  const [name, setName] = useState(initial?.legal_name || "");
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [bankName, setBankName] = useState("");
  const [account, setAccount] = useState("");
  const [swift, setSwift] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    livesApi.payoutProfile()
      .then((r) => {
        setMethods(r.methods);
        if (!initial || !r.methods.includes(initial.method)) setMethod(r.methods[0]);
      })
      .catch(() => setMethods(["paypal", "bank"]));
  }, [initial]);

  const destinationReady =
    method === "mpesa" ? phone.trim().length >= 9
      : method === "paypal" ? email.includes("@")
        : bankName.trim().length >= 2 && account.trim().length >= 4;
  const ready = name.trim().length >= 3 && idNumber.trim().length >= 5 && destinationReady;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await livesApi.savePayoutProfile({
        legal_name: name.trim(), id_number: idNumber.trim(), method,
        ...(method === "mpesa" ? { mpesa_phone: phone.trim() } : {}),
        ...(method === "paypal" ? { paypal_email: email.trim() } : {}),
        ...(method === "bank" ? { bank_name: bankName.trim(), account_number: account.trim(), swift_code: swift.trim() || undefined } : {}),
      });
      onSaved(r.profile);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!methods) return <p className="muted small">Loading…</p>;

  return (
    <form className="lv-form" onSubmit={save}>
      <p className="muted small">Your earnings are sent here every week. Only Anonixx sees these details; viewers never do.</p>

      <fieldset className="lv-field">
        <legend>Get paid by</legend>
        <div className="lv-chips">
          {methods.map((m) => (
            <button key={m} type="button" className={method === m ? "on" : ""} onClick={() => setMethod(m)}>{METHOD_LABEL[m]}</button>
          ))}
        </div>
        <small className="muted">{METHOD_NOTE[method]}</small>
      </fieldset>

      <label className="field">
        Full name (as on your ID)
        <input value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={80} required autoComplete="name" />
      </label>
      <label className="field">
        ID or passport number
        <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} minLength={5} maxLength={20} required
          placeholder={initial ? `Ends in ${initial.id_number_last4}` : undefined} />
      </label>

      {method === "mpesa" ? (
        <label className="field">
          M-Pesa number
          <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" placeholder="0712 345 678" autoComplete="tel" />
        </label>
      ) : null}
      {method === "paypal" ? (
        <label className="field">
          PayPal email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={120} autoComplete="email" placeholder="you@example.com" />
        </label>
      ) : null}
      {method === "bank" ? (
        <>
          <label className="field">
            Bank name
            <input value={bankName} onChange={(e) => setBankName(e.target.value)} required maxLength={80} />
          </label>
          <label className="field">
            Account number or IBAN
            <input value={account} onChange={(e) => setAccount(e.target.value)} required maxLength={40} />
          </label>
          <label className="field">
            SWIFT / BIC <small className="muted">for international transfers</small>
            <input value={swift} onChange={(e) => setSwift(e.target.value)} maxLength={11} placeholder="e.g. EQBLKENA" />
          </label>
        </>
      ) : null}

      {error ? <p className="err">{error}</p> : null}
      <button className="pill" disabled={busy || !ready}>{busy ? "Saving…" : "Save payout details"}</button>
    </form>
  );
}
