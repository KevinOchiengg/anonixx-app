"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "@/app/auth.css";
import { ArrowLeft, CircleCheck, Eye, EyeOff, Gift, KeyRound, Lock, Mail, User } from "lucide-react";

/** Web auth screen building blocks, matching the app's login and signup. */

const S = { strokeWidth: 2, "aria-hidden": true } as const;
export const IcMail = () => <Mail {...S} />;
export const IcLock = () => <Lock {...S} />;
export const IcUser = () => <User {...S} />;
export const IcGift = () => <Gift {...S} />;
export const IcKey = () => <KeyRound {...S} />;
export const IcCheck = () => <CircleCheck {...S} className="good" />;
const IcEye = () => <Eye {...S} />;
const IcEyeOff = () => <EyeOff {...S} />;
const IcBack = () => <ArrowLeft {...S} />;

// Same 40 stars on the server and in the browser (seeded), so nothing jumps on load.
const STARS = (() => {
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 40 }, () => ({ top: r() * 100, left: r() * 100, size: r() * 2.5 + 0.5, opacity: r() * 0.45 + 0.1 }));
})();

export function AuthShell({ children, scroll = false }: { children: React.ReactNode; scroll?: boolean }) {
  const router = useRouter();
  const back = () => (window.history.length > 1 ? router.back() : router.push("/"));
  return (
    <main className={`au${scroll ? " scroll top-orb" : ""}`}>
      <div className="au-stars" aria-hidden>
        {STARS.map((st, i) => (
          <i key={i} style={{ top: `${st.top}%`, left: `${st.left}%`, width: st.size, height: st.size, opacity: st.opacity }} />
        ))}
      </div>
      <div className="au-orb" aria-hidden />
      <div className="au-col">
        <div className="au-top">
          <button type="button" className="au-back" onClick={back} aria-label="Back"><IcBack /></button>
        </div>
        <Link href="/" className="au-brand" aria-label="Anonixx home"><i /><b>ANONIXX</b></Link>
        <div className="au-body">{children}</div>
      </div>
    </main>
  );
}

export function AuthHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="au-head">
      <h1>{title}</h1>
      <p>{sub}</p>
    </div>
  );
}

export function Field({
  label, optional, icon, error, hint, children, after, rowClass = "",
}: {
  label: string; optional?: boolean; icon: React.ReactNode; error?: string; hint?: string;
  children: React.ReactNode; after?: React.ReactNode; rowClass?: string;
}) {
  return (
    <div className="au-field">
      <label className="au-label">
        {label}{optional ? <em> (optional)</em> : null}
        <span className={`au-row ${rowClass}${error ? " bad" : ""}`}>
          {icon}
          {children}
        </span>
      </label>
      {after}
      {error ? <p className="au-err">{error}</p> : hint ? <p className="au-hint">{hint}</p> : null}
    </div>
  );
}

export function PasswordInput({
  value, onChange, placeholder, autoComplete,
}: {
  value: string; onChange: (v: string) => void; placeholder: string; autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <>
      <input
        type={show ? "text" : "password"} value={value} maxLength={128} autoComplete={autoComplete}
        placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="au-eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
        {show ? <IcEyeOff /> : <IcEye />}
      </button>
    </>
  );
}

export function SubmitButton({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button className="au-btn" disabled={busy || disabled}>
      {busy ? <span className="au-spin" aria-label="Working" /> : children}
    </button>
  );
}

// Mirrors getPasswordStrength in SignUpScreen.jsx.
export function strength(pw: string) {
  if (!pw) return { score: 0, label: "", color: "transparent" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Weak", color: "#ef4444" };
  if (score <= 3) return { score, label: "Fair", color: "#f59e0b" };
  return { score, label: "Strong", color: "#22c55e" };
}

export function StrengthMeter({ pw }: { pw: string }) {
  const s = strength(pw);
  if (!pw) return null;
  return (
    <div className="au-strength" aria-live="polite">
      <span>{[0, 1, 2, 3, 4].map((i) => <i key={i} style={i < s.score ? { background: s.color } : undefined} />)}</span>
      <b style={{ color: s.color }}>{s.label}</b>
    </div>
  );
}
