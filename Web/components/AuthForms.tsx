"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import GoogleButton, { GOOGLE_CLIENT_ID } from "./GoogleButton";
import {
  AuthHead, AuthShell, Field, IcCake, IcCheck, IcGift, IcLock, IcMail, IcUser,
  PasswordInput, StrengthMeter, SubmitButton,
} from "./AuthUI";

// The current ?next=/?ref= carried over to the other auth page. Read after mount so the
// server and browser render the same link first.
function useCarry(): string {
  const [q, setQ] = useState("");
  useEffect(() => { setQ(window.location.search); }, []);
  return q;
}

function nextPath(): string {
  if (typeof window === "undefined") return "/";
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mirrors Frontend/src/utils/anonymousName.js (and the backend's _ANON_NAME_RE).
const NAME_CHARS = `[a-zA-Z0-9._\\-\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]`;
const NAME_RE = new RegExp(`^(?=.{3,30}$)${NAME_CHARS}+(?: ${NAME_CHARS}+)*$`, "u");

const GENDERS = [
  { id: "male", label: "Male", symbol: "♂" },
  { id: "female", label: "Female", symbol: "♀" },
  { id: "nonbinary", label: "Non-binary", symbol: "⚧" },
  { id: "prefer_not_to_say", label: "Prefer not to say", symbol: "—" },
];

// Friendlier copy for the errors people actually hit (same as the app's toasts).
function loginError(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("not found") || m.includes("invalid") || m.includes("incorrect")) return "Incorrect email or password.";
  if (m.includes("network") || m.includes("fetch")) return "Check your internet and try again.";
  return msg || "Something went wrong. Please try again.";
}

type Dob = { d: string; m: string; y: string };
type DobErr = string;

function checkDob({ d, m, y }: Dob): DobErr {
  if (!d || !m || !y) return "Date of birth is required";
  const day = +d, month = +m, year = +y;
  const date = new Date(year, month - 1, day);
  if (!(day >= 1 && day <= 31) || !(month >= 1 && month <= 12) || !(year >= 1900 && year <= new Date().getFullYear()) || date.getMonth() !== month - 1) {
    return "Enter a valid date";
  }
  const t = new Date();
  let age = t.getFullYear() - year;
  if (t.getMonth() < month - 1 || (t.getMonth() === month - 1 && t.getDate() < day)) age--;
  return age < 18 ? "Anonixx is for adults 18+" : "";
}
const dobIso = ({ d, m, y }: Dob) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;

/** dd / mm / yyyy, moving to the next box as each fills (like the app). */
function DobField({ value, onChange, error }: { value: Dob; onChange: (v: Dob) => void; error?: string }) {
  const mRef = useRef<HTMLInputElement>(null);
  const yRef = useRef<HTMLInputElement>(null);
  const num = (v: string, n: number) => v.replace(/\D/g, "").slice(0, n);
  return (
    <Field label="Date of birth" icon={<IcCake />} error={error} rowClass="au-dob" hint="Just for age checks. Anonixx is 18+ only, and this is never shown to anyone.">
        <input inputMode="numeric" placeholder="dd" aria-label="Day" autoComplete="bday-day" value={value.d}
          onChange={(e) => { const d = num(e.target.value, 2); onChange({ ...value, d }); if (d.length === 2) mRef.current?.focus(); }} />
        <span>/</span>
        <input ref={mRef} inputMode="numeric" placeholder="mm" aria-label="Month" autoComplete="bday-month" value={value.m}
          onChange={(e) => { const m = num(e.target.value, 2); onChange({ ...value, m }); if (m.length === 2) yRef.current?.focus(); }} />
        <span>/</span>
        <input ref={yRef} className="yr" inputMode="numeric" placeholder="yyyy" aria-label="Year" autoComplete="bday-year" value={value.y}
          onChange={(e) => onChange({ ...value, y: num(e.target.value, 4) })} />
    </Field>
  );
}

function GenderChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="au-field">
      <span className="au-label solo">Gender <em>(optional)</em></span>
      <div className="au-chips" role="group" aria-label="Gender">
        {GENDERS.map((g) => (
          <button key={g.id} type="button" className="au-chip" aria-pressed={value === g.id} onClick={() => onChange(value === g.id ? "" : g.id)}>
            {g.symbol}&nbsp; {g.label}
          </button>
        ))}
      </div>
      <p className="au-hint">Only visible on your anonymous connect profile.</p>
    </div>
  );
}

function Terms({ agree, setAgree }: { agree: boolean; setAgree: (v: boolean) => void }) {
  return (
    <label className="au-check">
      <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
      <span>I&apos;m 18 or older and I agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</span>
    </label>
  );
}

type GoogleHold = { token: string; email: string };

// Google button under an "or" rule. Existing accounts go straight in; a new
// person is handed to onNew to finish (Google doesn't share their age).
function GoogleSection({ text, onNew, onError }: {
  text: "signin_with" | "signup_with";
  onNew: (hold: GoogleHold) => void;
  onError: (msg: string) => void;
}) {
  const { googleLogin } = useAuth();
  const router = useRouter();

  async function onToken(token: string) {
    onError("");
    try {
      const r = await googleLogin(token);
      if (r.status === "ok") router.replace(nextPath());
      else onNew({ token, email: r.email });
    } catch (err) {
      onError((err as Error).message);
    }
  }

  if (!GOOGLE_CLIENT_ID) return null;
  return (
    <>
      <div className="au-or">or</div>
      <GoogleButton onToken={onToken} text={text} />
    </>
  );
}

function GoogleFinish({ hold, refCode, onBack }: { hold: GoogleHold; refCode: string; onBack: () => void }) {
  const { googleLogin } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [dob, setDob] = useState<Dob>({ d: "", m: "", y: "" });
  const [gender, setGender] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const errs: Record<string, string> = {};
    const name = username.trim();
    if (name && !NAME_RE.test(name)) errs.username = "Letters, numbers, spaces, dots, hyphens, underscores or emoji, 3–30 characters.";
    const de = checkDob(dob);
    if (de) errs.dob = de;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await googleLogin(hold.token, {
        date_of_birth: dobIso(dob),
        username: name || undefined,
        gender: gender || undefined,
        referral_code: refCode || undefined,
      });
      router.replace(nextPath());
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthShell scroll>
      <AuthHead title="One last thing" sub={`Signing up as ${hold.email}. Google doesn't tell us your age, and Anonixx is 18+.`} />
      <form className="au-form" onSubmit={submit} noValidate>
        <Field label="Anonymous name" optional icon={<IcUser />} error={errors.username} hint="What everyone sees you as. Your Google name and photo are never shown. Skip it and we'll make one.">
          <input type="text" maxLength={30} autoComplete="off" placeholder="what should we call you?" value={username} onChange={(e) => setUsername(e.target.value.replace(/ {2,}/g, " "))} />
          {NAME_RE.test(username.trim()) ? <IcCheck /> : null}
        </Field>
        <DobField value={dob} onChange={setDob} error={errors.dob} />
        <GenderChips value={gender} onChange={setGender} />
        <Terms agree={agree} setAgree={setAgree} />
        {error ? <div className="au-alert">{error}</div> : null}
        <SubmitButton busy={busy} disabled={!agree}>Create Account</SubmitButton>
      </form>
      <p className="au-alt" style={{ marginTop: 20 }}><button type="button" onClick={onBack}>Use a different account</button></p>
    </AuthShell>
  );
}

export function LoginForm() {
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hold, setHold] = useState<GoogleHold | null>(null);
  const carry = useCarry();

  useEffect(() => {
    if (ready && user) router.replace(nextPath());
  }, [ready, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const em = email.trim();
    if (!em) { setError("Email is required"); return; }
    if (!EMAIL_RE.test(em)) { setError("Enter a valid email address"); return; }
    if (!password) { setError("Password is required."); return; }
    setBusy(true);
    try {
      await login(em.toLowerCase(), password);
      router.replace(nextPath());
    } catch (err) {
      setError(loginError((err as Error).message));
      setBusy(false);
    }
  }

  if (hold) return <GoogleFinish hold={hold} refCode="" onBack={() => setHold(null)} />;

  const signupHref = `/signup${carry}`;
  return (
    <AuthShell>
      <AuthHead title="Welcome back" sub="Your confessions are waiting for you." />
      <form className="au-form" onSubmit={submit} noValidate>
        <Field label="Email" icon={<IcMail />}>
          <input type="email" autoComplete="email" maxLength={254} placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" icon={<IcLock />}>
          <PasswordInput value={password} onChange={setPassword} placeholder="Enter your password" autoComplete="current-password" />
        </Field>
        <Link href="/forgot-password" className="au-forgot">forgot password?</Link>
        {error ? <div className="au-alert">{error}</div> : null}
        <SubmitButton busy={busy}>Sign In</SubmitButton>
      </form>
      {GOOGLE_CLIENT_ID ? <GoogleSection text="signin_with" onNew={setHold} onError={setError} /> : <div className="au-or">or</div>}
      <p className="au-alt">New here?&nbsp; <Link href={signupHref}>Create an account</Link></p>
      <p className="au-foot">Anonymous. Safe. Yours.</p>
    </AuthShell>
  );
}

export function SignupForm() {
  const { signup, user, ready } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [dob, setDob] = useState<Dob>({ d: "", m: "", y: "" });
  const [gender, setGender] = useState("");
  const [refCode, setRefCode] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [hold, setHold] = useState<GoogleHold | null>(null);
  const carry = useCarry();

  useEffect(() => {
    setRefCode((new URLSearchParams(window.location.search).get("ref") || "").toUpperCase().slice(0, 20));
  }, []);
  useEffect(() => {
    if (ready && user) router.replace(nextPath());
  }, [ready, user, router]);

  const clear = (k: string) => { if (errors[k]) setErrors((p) => ({ ...p, [k]: "" })); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const errs: Record<string, string> = {};
    const name = username.trim();
    const em = email.trim();
    if (name && !NAME_RE.test(name)) errs.username = "Letters, numbers, spaces, dots, hyphens, underscores or emoji, 3–30 characters.";
    if (!em) errs.email = "Email is required";
    else if (!EMAIL_RE.test(em)) errs.email = "Enter a valid email address";
    if (!password) errs.password = "Password is required";
    else if (password.length < 8) errs.password = "Minimum 8 characters";
    if (!confirm) errs.confirm = "Please confirm your password";
    else if (confirm !== password) errs.confirm = "Passwords do not match";
    const de = checkDob(dob);
    if (de) errs.dob = de;
    setErrors(errs);
    if (Object.keys(errs).length) { setError("Please fix the errors above."); return; }
    setBusy(true);
    try {
      await signup({
        email: em.toLowerCase(),
        password,
        username: name || undefined,
        date_of_birth: dobIso(dob),
        gender: gender || undefined,
        referral_code: refCode.trim() || undefined,
      });
      router.replace(nextPath());
    } catch (err) {
      const msg = (err as Error).message || "";
      const m = msg.toLowerCase();
      if (m.includes("email") && (m.includes("exist") || m.includes("already registered"))) {
        setErrors((p) => ({ ...p, email: "Already in use" }));
        setError("An account with this email already exists.");
      } else if (m.includes("already taken")) {
        setErrors((p) => ({ ...p, username: "Already taken" }));
        setError("That name is taken. Try a different one.");
      } else if (m.includes("username")) {
        setErrors((p) => ({ ...p, username: msg }));
        setError(msg);
      } else if (m.includes("18+")) {
        setErrors((p) => ({ ...p, dob: "Anonixx is for adults 18+" }));
        setError("Anonixx is for adults 18+.");
      } else {
        setError(m.includes("network") || m.includes("fetch") ? "Check your internet and try again." : msg || "Something went wrong. Please try again.");
      }
      setBusy(false);
    }
  }

  if (hold) return <GoogleFinish hold={hold} refCode={refCode} onBack={() => setHold(null)} />;

  const loginHref = `/login${carry}`;
  return (
    <AuthShell scroll>
      <AuthHead title="Create account" sub="No names. No judgment. Just what's real." />
      <form className="au-form" onSubmit={submit} noValidate>
        <Field label="Anonymous name" optional icon={<IcUser />} error={errors.username}
          hint="This is what everyone sees you as. No real names. Skip it and we'll make one.">
          <input type="text" maxLength={30} autoComplete="off" placeholder="what should we call you?" value={username}
            onChange={(e) => { setUsername(e.target.value.replace(/ {2,}/g, " ")); clear("username"); }} />
          {NAME_RE.test(username.trim()) && !errors.username ? <IcCheck /> : null}
        </Field>
        <Field label="Email" icon={<IcMail />} error={errors.email}>
          <input type="email" autoComplete="email" maxLength={254} placeholder="your@email.com" value={email}
            onChange={(e) => { setEmail(e.target.value); clear("email"); }} />
        </Field>
        <Field label="Password" icon={<IcLock />} error={errors.password} after={<StrengthMeter pw={password} />}>
          <PasswordInput value={password} onChange={(v) => { setPassword(v); clear("password"); }} placeholder="Min. 8 characters" autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" icon={<IcLock />} error={errors.confirm}>
          <PasswordInput value={confirm} onChange={(v) => { setConfirm(v); clear("confirm"); }} placeholder="Re-enter your password" autoComplete="new-password" />
        </Field>
        <DobField value={dob} onChange={(v) => { setDob(v); clear("dob"); }} error={errors.dob} />
        <GenderChips value={gender} onChange={setGender} />
        <Field label="Referral code" optional icon={<IcGift />}>
          <input type="text" autoComplete="off" maxLength={20} placeholder="e.g. ABC12XYZ" value={refCode}
            onChange={(e) => setRefCode(e.target.value.toUpperCase())} />
          {refCode.length >= 4 ? <IcCheck /> : null}
        </Field>
        <Terms agree={agree} setAgree={setAgree} />
        {error ? <div className="au-alert">{error}</div> : null}
        <SubmitButton busy={busy} disabled={!agree}>Create Account</SubmitButton>
      </form>
      <GoogleSection text="signup_with" onNew={setHold} onError={setError} />
      <p className="au-alt" style={{ marginTop: 20 }}>Already have an account?&nbsp; <Link href={loginHref}>Sign In</Link></p>
      <p className="au-terms">Free to join. You get 33 coins on us.</p>
    </AuthShell>
  );
}
