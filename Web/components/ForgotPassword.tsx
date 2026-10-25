"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { AuthHead, AuthShell, Field, IcKey, IcLock, IcMail, PasswordInput, StrengthMeter, SubmitButton } from "./AuthUI";

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
    <AuthShell>
      {step === "email" ? (
        <>
          <AuthHead title="Locked out?" sub="Enter your email and we'll send a 6-digit code. Your secrets stay exactly where they are." />
          <form className="au-form" onSubmit={sendCode}>
            <Field label="Email" icon={<IcMail />}>
              <input type="email" required autoComplete="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {error ? <div className="au-alert">{error}</div> : null}
            <SubmitButton busy={busy} disabled={!email.trim()}>Send code</SubmitButton>
          </form>
        </>
      ) : null}
      {step === "code" ? (
        <>
          <AuthHead title="Check your inbox" sub={`We sent a code to ${email.trim()}. It expires soon, so use it now.`} />
          <form className="au-form" onSubmit={reset}>
            <Field label="6-digit code" icon={<IcKey />}>
              <input inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="000000" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="New password" icon={<IcLock />} after={<StrengthMeter pw={pw} />}>
              <PasswordInput value={pw} onChange={setPw} placeholder="Min. 8 characters" autoComplete="new-password" />
            </Field>
            {note ? <div className="au-alert ok">{note}</div> : null}
            {error ? <div className="au-alert">{error}</div> : null}
            <SubmitButton busy={busy}>Set new password</SubmitButton>
            <button type="button" className="au-btn ghost" style={{ marginTop: 12 }} disabled={busy} onClick={() => sendCode()}>Resend code</button>
          </form>
        </>
      ) : null}
      {step === "done" ? (
        <>
          <AuthHead title="You're back in" sub="Your password is updated. Sign in with the new one." />
          <Link href="/login" className="au-btn">Sign In</Link>
        </>
      ) : null}
      <p className="au-alt" style={{ marginTop: 28 }}>Remembered it?&nbsp; <Link href="/login">Sign In</Link></p>
    </AuthShell>
  );
}
