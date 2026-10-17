"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import GoogleButton, { GOOGLE_CLIENT_ID } from "./GoogleButton";

function nextPath(): string {
  if (typeof window === "undefined") return "/";
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

function isAdult(d: string) {
  const b = new Date(d);
  if (Number.isNaN(b.getTime())) return false;
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
  return age >= 18;
}

const GENDERS = [
  ["", "Prefer not to say"],
  ["female", "Female"],
  ["male", "Male"],
  ["nonbinary", "Non-binary"],
];

type GoogleHold = { token: string; email: string };

// Google button plus the "or" rule. Existing accounts go straight in; a new
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
      <div className="g-or"><span>or</span></div>
      <GoogleButton onToken={onToken} text={text} />
    </>
  );
}

function GoogleFinish({ hold, refCode, onBack }: { hold: GoogleHold; refCode: string; onBack: () => void }) {
  const { googleLogin } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!isAdult(dob)) { setError("Anonixx is for adults 18 and over."); return; }
    setBusy(true);
    try {
      await googleLogin(hold.token, {
        date_of_birth: dob,
        username: username.trim() || undefined,
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
    <main className="page narrow">
      <Link href="/" className="wordmark">anonix<b>x</b></Link>
      <h1>One last thing.</h1>
      <p>Signing up as {hold.email}. Google doesn&apos;t tell us your age, and Anonixx is 18+. Your Google name and photo are never shown to anyone.</p>
      <form className="form" onSubmit={submit}>
        <label className="field">Your hidden name <span className="opt">optional</span>
          <input type="text" maxLength={30} autoComplete="off" placeholder="We'll make one if you skip" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="field">Date of birth
          <input type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
        </label>
        <label className="field">Gender <span className="opt">optional</span>
          <select value={gender} onChange={(e) => setGender(e.target.value)}>
            {GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
          <span>I&apos;m 18 or older and I agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</span>
        </label>
        {error ? <div className="err">{error}</div> : null}
        <button className="btn" disabled={busy || !agree}>{busy ? "Creating…" : "Create account"}</button>
      </form>
      <p className="alt"><button type="button" className="linkish" onClick={onBack}>Use a different account</button></p>
    </main>
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

  useEffect(() => {
    if (ready && user) router.replace(nextPath());
  }, [ready, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email.trim(), password);
      router.replace(nextPath());
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (hold) return <GoogleFinish hold={hold} refCode="" onBack={() => setHold(null)} />;

  return (
    <main className="page narrow">
      <Link href="/" className="wordmark">anonix<b>x</b></Link>
      <h1>Welcome back.</h1>
      <p>Pick up where you left off. Nobody sees who you are.</p>
      <form className="form" onSubmit={submit}>
        <label className="field">Email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">Password
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error ? <div className="err">{error}</div> : null}
        <button className="btn" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <GoogleSection text="signin_with" onNew={setHold} onError={setError} />
      <p className="alt"><Link href="/forgot-password">Forgot password?</Link></p>
      <p className="alt">New here? <Link href="/signup">Create an account</Link></p>
    </main>
  );
}

export function SignupForm() {
  const { signup, user, ready } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ref, setRef] = useState("");
  const [hold, setHold] = useState<GoogleHold | null>(null);

  useEffect(() => {
    setRef(new URLSearchParams(window.location.search).get("ref") || "");
  }, []);
  useEffect(() => {
    if (ready && user) router.replace(nextPath());
  }, [ready, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!isAdult(dob)) { setError("Anonixx is for adults 18 and over."); return; }
    if (password.length < 8) { setError("Use at least 8 characters for your password."); return; }
    setBusy(true);
    try {
      await signup({
        email: email.trim(),
        password,
        username: username.trim() || undefined,
        date_of_birth: dob,
        gender: gender || undefined,
        referral_code: ref || undefined,
      });
      router.replace(nextPath());
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (hold) return <GoogleFinish hold={hold} refCode={ref} onBack={() => setHold(null)} />;

  return (
    <main className="page narrow">
      <Link href="/" className="wordmark">anonix<b>x</b></Link>
      <h1>Say it. Stay hidden.</h1>
      <p>Free to join. You get 33 coins on us.</p>
      <form className="form" onSubmit={submit}>
        <label className="field">Email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">Password
          <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">Your hidden name <span className="opt">optional</span>
          <input type="text" maxLength={30} autoComplete="off" placeholder="We'll make one if you skip" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="field">Date of birth
          <input type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
        </label>
        <label className="field">Gender <span className="opt">optional</span>
          <select value={gender} onChange={(e) => setGender(e.target.value)}>
            {GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
          <span>I&apos;m 18 or older and I agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</span>
        </label>
        {error ? <div className="err">{error}</div> : null}
        <button className="btn" disabled={busy || !agree}>{busy ? "Creating…" : "Create account"}</button>
      </form>
      <GoogleSection text="signup_with" onNew={setHold} onError={setError} />
      <p className="alt">Already in? <Link href="/login">Sign in</Link></p>
    </main>
  );
}
