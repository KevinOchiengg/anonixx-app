"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import "@/app/account.css";

export default function ForgotPassword() {
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    setNote("");
    try {
      await api("/auth/forgot-password", { body: { email: email.trim().toLowerCase() } });
      if (step === "code") setNote("New code sent. Check your inbox.");
      setStep("code");
    } catch (x) {
      setError((x as Error).message);
    }
    setBusy(false);
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(otp.trim())) { setError("Enter the 6-digit code from your email."); return; }
    if (pw.length < 8) { setError("Use at least 8 characters for your password."); return; }
    setBusy(true);
    try {
      await api("/auth/reset-password", { body: { email: email.trim().toLowerCase(), otp: otp.trim(), new_password: pw } });
      setStep("done");
    } catch (x) {
      setError((x as Error).message);
    }
    setBusy(false);
  }

  return (
    <main className="page narrow">
      <Link href="/" className="wordmark">anonix<b>x</b></Link>
      {step === "email" ? (
        <>
          <h1>Locked out?</h1>
          <p>Enter your email and we&apos;ll send a 6-digit code. Your secrets stay exactly where they are.</p>
          <form className="form" onSubmit={sendCode}>
            <label className="field">Email
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error ? <div className="err">{error}</div> : null}
            <button className="btn" disabled={busy || !email.trim()}>{busy ? "Sending…" : "Send code"}</button>
          </form>
        </>
      ) : null}
      {step === "code" ? (
        <>
          <h1>Check your inbox.</h1>
          <p>We sent a code to {email.trim()}. It expires soon, so use it now.</p>
          <form className="form" onSubmit={reset}>
            <label className="field">6-digit code
              <input inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
            </label>
            <label className="field">New password
              <input type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            {note ? <div className="ok">{note}</div> : null}
            {error ? <div className="err">{error}</div> : null}
            <button className="btn" disabled={busy}>{busy ? "Saving…" : "Set new password"}</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => sendCode()}>Resend code</button>
          </form>
        </>
      ) : null}
      {step === "done" ? (
        <>
          <h1>You&apos;re back in.</h1>
          <p>Your password is updated. Sign in with the new one.</p>
          <div className="cta"><Link href="/login" className="btn">Sign in</Link></div>
        </>
      ) : null}
      <p className="alt">Remembered it? <Link href="/login">Sign in</Link></p>
    </main>
  );
}
