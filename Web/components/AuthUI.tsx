"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "@/app/auth.css";

/** Web auth screen building blocks, matching the app's login and signup. */

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24" } as const;
export const IcMail = () => (<svg {...S}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>);
export const IcLock = () => (<svg {...S}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
export const IcUser = () => (<svg {...S}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>);
export const IcGift = () => (<svg {...S}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" /></svg>);
export const IcKey = () => (<svg {...S}><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" /></svg>);
export const IcCheck = () => (<svg {...S} className="good"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>);
const IcEye = () => (<svg {...S}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>);
const IcEyeOff = () => (<svg {...S}><path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20" /></svg>);
const IcBack = () => (<svg {...S}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>);

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
