"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AppShell from "./AppShell";

type SupportMsg = { id: string; sender: "user" | "admin"; text: string };

function Inner() {
  const { user, logout, refresh } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(user?.anonymous_name || "");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [dob, setDob] = useState("");
  const [support, setSupport] = useState<SupportMsg[] | null>(null);
  const [supportText, setSupportText] = useState("");
  const [delPw, setDelPw] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setName(user?.anonymous_name || ""); }, [user?.anonymous_name]);

  const say = (n: string, e = "") => { setNote(n); setErr(e); };

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    say("");
    try {
      await api("/auth/update-profile", { method: "PUT", body: { anonymous_name: name.trim() } });
      await refresh();
      say("Name updated.");
    } catch (x) {
      say("", (x as Error).message);
    }
  }

  async function verifyAge(e: React.FormEvent) {
    e.preventDefault();
    say("");
    try {
      await api("/users/me/verify-age", { body: { date_of_birth: dob } });
      await refresh();
      say("Age confirmed. Mature posts are now available.");
    } catch (x) {
      say("", (x as Error).message);
    }
  }

  async function openSupport() {
    try {
      const r = await api<{ messages: SupportMsg[] }>("/support/messages");
      setSupport(r.messages);
    } catch (x) {
      say("", (x as Error).message);
    }
  }

  async function sendSupport(e: React.FormEvent) {
    e.preventDefault();
    if (!supportText.trim()) return;
    try {
      await api("/support/messages", { body: { text: supportText.trim() } });
      setSupportText("");
      await openSupport();
    } catch (x) {
      say("", (x as Error).message);
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    say("");
    try {
      await api("/users/me", { method: "DELETE", body: { password: delPw } });
      logout();
      router.replace("/");
    } catch (x) {
      say("", (x as Error).message);
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="pad settings">
      <div className="who">
        <strong>{user.anonymous_name || user.username || "You"}</strong>
        <small>{user.email}</small>
      </div>
      {note ? <div className="ok">{note}</div> : null}
      {err ? <div className="err">{err}</div> : null}

      <ul className="rows links">
        <li><Link href="/coins" className="row-item"><span className="grow"><b>Coins and subscription</b><small>{user.coin_balance} coins</small></span>›</Link></li>
        <li><Link href="/saved" className="row-item"><span className="grow"><b>Saved posts</b></span>›</Link></li>
        <li><Link href="/search" className="row-item"><span className="grow"><b>Search</b></span>›</Link></li>
        <li><Link href="/premium" className="row-item"><span className="grow"><b>Premium</b></span>›</Link></li>
        <li><Link href="/dashboard" className="row-item"><span className="grow"><b>Earnings</b></span>›</Link></li>
        <li><Link href="/market" className="row-item"><span className="grow"><b>Market</b></span>›</Link></li>
        <li><Link href="/vibe" className="row-item"><span className="grow"><b>Vibe score</b></span>›</Link></li>
        <li><Link href="/whatsapp" className="row-item"><span className="grow"><b>Send anonymous WhatsApp</b></span>›</Link></li>
        <li><Link href="/ads/new" className="row-item"><span className="grow"><b>Advertise</b></span>›</Link></li>
        <li><Link href="/referrals" className="row-item"><span className="grow"><b>Invite friends</b><small>Earn coins for every friend who joins</small></span>›</Link></li>
        {user.is_admin ? <li><Link href="/admin" className="row-item"><span className="grow"><b>Admin</b></span>›</Link></li> : null}
      </ul>

      <h2 className="sec">Profile and privacy</h2>
      <ul className="rows links">
        <li><Link href="/profile/edit" className="row-item"><span className="grow"><b>Edit profile</b><small>Name, photo, gender</small></span>›</Link></li>
        <li><Link href="/change-password" className="row-item"><span className="grow"><b>Change password</b></span>›</Link></li>
        <li><Link href="/location" className="row-item"><span className="grow"><b>Feed location</b><small>Lean your feed toward people nearby</small></span>›</Link></li>
        <li><Link href="/blocked" className="row-item"><span className="grow"><b>Blocked people</b></span>›</Link></li>
        <li><Link href="/moderation" className="row-item"><span className="grow"><b>Flagged posts</b><small>See what was reported or hidden</small></span>›</Link></li>
      </ul>

      <form className="form" onSubmit={rename}>
        <label className="field">Hidden name
          <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn ghost" disabled={!name.trim() || name.trim() === user.anonymous_name}>Save name</button>
      </form>

      {!user.age_verified ? (
        <form className="form" onSubmit={verifyAge}>
          <label className="field">Confirm you&apos;re 18+ to see mature posts
            <input type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
          </label>
          <button className="btn ghost">Confirm age</button>
        </form>
      ) : null}

      <h2 className="sec">Need to talk to someone?</h2>
      <p className="muted small">If you are in crisis or thinking of hurting yourself, you are not alone. In Kenya, call Befrienders Kenya on <a href="tel:+254722178177">+254 722 178 177</a> or the Kenya Red Cross free line on <a href="tel:1199">1199</a>. In an emergency, call 999 or 112.</p>

      <h2 className="sec">Support</h2>
      {support === null ? (
        <button className="btn ghost" onClick={openSupport}>Message support</button>
      ) : (
        <div className="support">
          <div className="support-log">
            {support.length === 0 ? <p className="muted small">Tell us what&apos;s wrong. We reply here.</p> : null}
            {support.map((m) => <div key={m.id} className={`bubble${m.sender === "user" ? " own" : ""}`}><span>{m.text}</span></div>)}
          </div>
          <form className="cmt-input" onSubmit={sendSupport}>
            <input value={supportText} onChange={(e) => setSupportText(e.target.value)} placeholder="Write to support…" maxLength={1000} />
            <button className="pill" disabled={!supportText.trim()}>Send</button>
          </form>
        </div>
      )}

      <h2 className="sec">Legal</h2>
      <ul className="rows links">
        <li><Link href="/terms" className="row-item"><span className="grow"><b>Terms of Service</b></span>›</Link></li>
        <li><Link href="/privacy" className="row-item"><span className="grow"><b>Privacy Policy</b></span>›</Link></li>
        <li><Link href="/delete-account" className="row-item"><span className="grow"><b>Account deletion</b></span>›</Link></li>
      </ul>

      <h2 className="sec">Account</h2>
      <button className="btn ghost" onClick={() => { logout(); router.replace("/"); }}>Sign out</button>
      {!delOpen ? (
        <button className="btn danger" onClick={() => setDelOpen(true)}>Delete my account</button>
      ) : (
        <form className="form danger-box" onSubmit={deleteAccount}>
          <p>This permanently erases your account, your posts and your chats. It can&apos;t be undone.</p>
          <label className="field">Enter your password to confirm
            <input type="password" required autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
          </label>
          <div className="row">
            <button className="btn danger" disabled={busy || !delPw}>{busy ? "Deleting…" : "Delete forever"}</button>
            <button type="button" className="btn ghost" onClick={() => { setDelOpen(false); setDelPw(""); }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AppShell title="Me">
      <Inner />
    </AppShell>
  );
}
