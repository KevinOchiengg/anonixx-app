"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, teaser } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { uploadFile } from "@/lib/upload";
import AppShell from "./AppShell";
import "@/app/account.css";

const GENDERS: [string, string][] = [
  ["", "Leave as is"],
  ["female", "Female"],
  ["male", "Male"],
  ["nonbinary", "Non-binary"],
  ["prefer_not_to_say", "Prefer not to say"],
];

// ── Change password ──────────────────────────────────────────────────────────
function ChangePasswordInner() {
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setOk("");
    if (pw.length < 8) { setErr("Use at least 8 characters."); return; }
    if (pw !== again) { setErr("The new passwords don't match."); return; }
    setBusy(true);
    try {
      await api("/auth/change-password", { method: "PUT", body: { current_password: cur, new_password: pw } });
      setOk("Password changed.");
      setCur(""); setPw(""); setAgain("");
    } catch (x) {
      setErr((x as Error).message);
    }
    setBusy(false);
  }

  return (
    <form className="form pad" onSubmit={submit}>
      <label className="field">Current password
        <input type="password" required autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
      </label>
      <label className="field">New password
        <input type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </label>
      <label className="field">Repeat new password
        <input type="password" required autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      </label>
      {err ? <div className="err">{err}</div> : null}
      {ok ? <div className="ok">{ok}</div> : null}
      <button className="btn" disabled={busy || !cur || !pw}>{busy ? "Saving…" : "Change password"}</button>
    </form>
  );
}
export const ChangePasswordPage = () => (
  <AppShell title="Change password" back="/settings"><ChangePasswordInner /></AppShell>
);

// ── Edit profile ─────────────────────────────────────────────────────────────
function EditProfileInner() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.anonymous_name || "");
  const [gender, setGender] = useState("");
  const [avatar, setAvatar] = useState(user?.avatar_url || "");
  const [avail, setAvail] = useState<null | boolean>(null);
  const [availMsg, setAvailMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const original = user?.anonymous_name || "";
  const changed = name.trim() !== original;

  useEffect(() => {
    setAvail(null); setAvailMsg("");
    const n = name.trim();
    if (!changed || !n) return;
    const t = setTimeout(() => {
      api<{ available: boolean; message?: string }>(`/auth/check-name?name=${encodeURIComponent(n)}`)
        .then((r) => { setAvail(r.available); setAvailMsg(r.available ? "Available" : r.message || "Already taken"); })
        .catch(() => setAvail(null));
    }, 400);
    return () => clearTimeout(t);
  }, [name, changed]);

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(""); setOk(""); setBusy(true);
    try {
      setAvatar(await uploadFile(f, "image"));
    } catch (x) {
      setErr((x as Error).message);
    }
    setBusy(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setOk(""); setBusy(true);
    try {
      const body: Record<string, string> = {};
      if (changed && name.trim()) body.anonymous_name = name.trim();
      if (avatar && avatar !== user?.avatar_url) body.avatar_url = avatar;
      if (Object.keys(body).length) await api("/auth/update-profile", { method: "PUT", body });
      if (gender) await api("/auth/gender", { method: "PUT", body: { gender } });
      await refresh();
      setGender("");
      setOk("Profile saved.");
    } catch (x) {
      setErr((x as Error).message);
    }
    setBusy(false);
  }

  if (!user) return null;
  const dirty = (changed && avail !== false) || avatar !== (user.avatar_url || "") || Boolean(gender);

  return (
    <form className="form pad" onSubmit={save}>
      <div className="acct-avatar">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="Your photo" />
        ) : (
          <span className="ph">{(original || "?").charAt(0).toUpperCase()}</span>
        )}
        <div>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => fileRef.current?.click()}>{avatar ? "Change photo" : "Add photo"}</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
          <div className="muted acct-hint">Max 5MB.</div>
        </div>
      </div>
      <label className="field">Hidden name
        <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        {avail !== null && changed ? <span className={`acct-hint ${avail ? "good" : "bad"}`}>{availMsg}</span> : null}
      </label>
      <label className="field">Gender
        <select value={gender} onChange={(e) => setGender(e.target.value)}>
          {GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {err ? <div className="err">{err}</div> : null}
      {ok ? <div className="ok">{ok}</div> : null}
      <button className="btn" disabled={busy || !dirty}>{busy ? "Saving…" : "Save profile"}</button>
    </form>
  );
}
export const EditProfilePage = () => (
  <AppShell title="Edit profile" back="/settings"><EditProfileInner /></AppShell>
);

// ── Blocked users ────────────────────────────────────────────────────────────
type Blocked = { id: string; username: string; anonymous_name: string };
function BlockedInner() {
  const [items, setItems] = useState<Blocked[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ users: Blocked[] }>("/users/me/blocked")
      .then((r) => setItems(r.users))
      .catch((e) => { setErr((e as Error).message); setItems([]); });
  }, []);

  async function unblock(id: string) {
    setErr("");
    try {
      await api(`/users/${id}/block`, { method: "DELETE" });
      setItems((cur) => (cur || []).filter((u) => u.id !== id));
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  if (items === null) return <p className="muted center">Loading…</p>;
  return (
    <>
      {err ? <div className="err pad">{err}</div> : null}
      {items.length === 0 ? (
        <div className="empty"><h2>Nobody blocked</h2><p>People you block can&apos;t see your posts or message you.</p></div>
      ) : (
        <ul className="rows">
          {items.map((u) => (
            <li key={u.id} className="row-item">
              <span className="grow"><b>{u.anonymous_name || "Anonymous"}</b></span>
              <button className="pill ghost" onClick={() => unblock(u.id)}>Unblock</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
export const BlockedPage = () => (
  <AppShell title="Blocked" back="/settings"><BlockedInner /></AppShell>
);

// ── Feed location ────────────────────────────────────────────────────────────
const SCOPES: [string, string, string][] = [
  ["off", "Everyone", "No location filter"],
  ["country", "Country", "Same country as you"],
  ["county", "Region", "Same county or state"],
  ["sub_county", "Area", "Same sub-county or district"],
  ["estate", "Neighborhood", "Same estate. Closest match"],
];
type MeLoc = {
  location_country?: string | null; location_county?: string | null;
  location_sub_county?: string | null; location_estate?: string | null;
  feed_location_scope?: string | null;
};
function LocationInner() {
  const [loaded, setLoaded] = useState(false);
  const [f, setF] = useState({ country: "", county: "", sub: "", estate: "" });
  const [scope, setScope] = useState("off");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    api<MeLoc>("/users/me")
      .then((d) => {
        setF({ country: d.location_country || "", county: d.location_county || "", sub: d.location_sub_county || "", estate: d.location_estate || "" });
        setScope(d.feed_location_scope || "off");
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoaded(true));
  }, []);

  const has = (s: string) => {
    const c = f.country.trim(), co = f.county.trim(), sc = f.sub.trim(), es = f.estate.trim();
    if (s === "off") return true;
    if (s === "country") return !!c;
    if (s === "county") return !!c && !!co;
    if (s === "sub_county") return !!c && !!co && !!sc;
    return !!c && !!co && !!sc && !!es;
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    setOk("");
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setOk("");
    const use = has(scope) ? scope : "off";
    setBusy(true);
    try {
      await api("/users/me", {
        method: "PUT",
        body: {
          location_country: f.country.trim(), location_county: f.county.trim(),
          location_sub_county: f.sub.trim(), location_estate: f.estate.trim(),
          feed_location_scope: use,
        },
      });
      setScope(use);
      setOk("Feed location saved.");
    } catch (x) {
      setErr((x as Error).message);
    }
    setBusy(false);
  }

  if (!loaded) return <p className="muted center">Loading…</p>;
  return (
    <form className="form pad" onSubmit={save}>
      <p className="muted small">Tell us where home is and we&apos;ll lean your feed toward people nearby. Posts with no location still show.</p>
      <label className="field">Country<input value={f.country} onChange={set("country")} placeholder="Kenya" /></label>
      <label className="field">County or region<input value={f.county} onChange={set("county")} placeholder="Nairobi" /></label>
      <label className="field">Sub-county or area<input value={f.sub} onChange={set("sub")} placeholder="Westlands" /></label>
      <label className="field">Estate or neighborhood<input value={f.estate} onChange={set("estate")} placeholder="Kileleshwa" /></label>
      <div className="acct-scope" role="radiogroup" aria-label="Feed scope">
        {SCOPES.map(([id, label, sub]) => (
          <button type="button" key={id} role="radio" aria-checked={scope === id} className={scope === id ? "on" : ""} disabled={!has(id)} onClick={() => setScope(id)}>
            <b>{label}</b><small>{has(id) ? sub : "Fill in your location down to this level first"}</small>
          </button>
        ))}
      </div>
      {err ? <div className="err">{err}</div> : null}
      {ok ? <div className="ok">{ok}</div> : null}
      <button className="btn" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
    </form>
  );
}
export const LocationPage = () => (
  <AppShell title="Feed location" back="/settings"><LocationInner /></AppShell>
);

// ── Moderation history ───────────────────────────────────────────────────────
type Flagged = { id: string; confession: string | null; moderation_status: "flagged" | "hidden" };
function ModerationInner() {
  const [items, setItems] = useState<Flagged[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<{ items: Flagged[] }>("/users/me/moderation-history")
      .then((r) => setItems(r.items || []))
      .catch((e) => { setErr((e as Error).message); setItems([]); });
  }, []);
  if (items === null) return <p className="muted center">Loading…</p>;
  if (err) return <div className="err pad">{err}</div>;
  if (items.length === 0) {
    return <div className="empty"><h2>All clear</h2><p>None of your posts have been flagged.</p></div>;
  }
  return (
    <ul className="rows">
      {items.map((d) => (
        <li key={d.id} className="row-item">
          <span className="grow"><b>{teaser(d.confession || "A post with media", 80)}</b></span>
          <span className={`acct-flag ${d.moderation_status}`}>{d.moderation_status === "hidden" ? "Hidden" : "Under review"}</span>
        </li>
      ))}
    </ul>
  );
}
export const ModerationPage = () => (
  <AppShell title="Flagged posts" back="/settings"><ModerationInner /></AppShell>
);

// ── Referrals ────────────────────────────────────────────────────────────────
type RefStats = { referral_code: string | null; share_link: string | null; total_referred: number; coins_earned: number; reward_per_ref: number };
type RefCode = { code: string; share_link: string };
function ReferralsInner() {
  const [stats, setStats] = useState<RefStats | null>(null);
  const [code, setCode] = useState<RefCode | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setCode(await api<RefCode>("/referrals/my-code"));
        setStats(await api<RefStats>("/referrals/stats"));
      } catch (x) {
        setErr((x as Error).message);
      }
    })();
  }, []);

  const link = code?.share_link || stats?.share_link || "";

  async function share() {
    const text = `Come say what you can't say out loud. Join me on Anonixx: ${link}`;
    try {
      if (navigator.share) { await navigator.share({ text, url: link }); return; }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* cancelled */ }
  }

  if (err) return <div className="err pad">{err}</div>;
  if (!code) return <p className="muted center">Loading…</p>;
  return (
    <div className="pad">
      <h2 style={{ margin: "0 0 6px" }}>Bring someone along.</h2>
      <p className="muted small">You get {stats?.reward_per_ref ?? 30} coins for every friend who joins with your link.</p>
      <div className="acct-code">{code.code}</div>
      <button className="btn" onClick={share}>{copied ? "Link copied" : "Share your link"}</button>
      <div className="acct-stats">
        <div><b>{stats?.total_referred ?? 0}</b><small>Friends joined</small></div>
        <div><b>{stats?.coins_earned ?? 0}</b><small>Coins earned</small></div>
      </div>
    </div>
  );
}
export const ReferralsPage = () => (
  <AppShell title="Invite friends" back="/settings"><ReferralsInner /></AppShell>
);

// ── Search ───────────────────────────────────────────────────────────────────
type Hit = { id: string; content: string | null; mood_tag: string | null; anonymous_name: string | null; time_ago: string };
const INTENTS: [string, string][] = [
  ["meet-me", "Meet Me"],
  ["skeleton-in-the-closet", "Skeleton In The Closet"],
  ["just-tonight", "Just Tonight"],
  ["the-exchange", "The Exchange"],
];
const MOODS = ["longing", "untold", "horny", "discreet"];

function SearchInner() {
  const [q, setQ] = useState("");
  const [intent, setIntent] = useState("");
  const [mood, setMood] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = useCallback(async (query: string, i: string, m: string) => {
    if (!query.trim() && !i && !m) { setHits(null); return; }
    setBusy(true); setErr("");
    const p = new URLSearchParams({ filter: "recent", limit: "30" });
    if (query.trim()) p.set("q", query.trim());
    if (i) p.set("intent", i);
    if (m) p.set("mood_tag", m);
    try {
      const r = await api<{ results: Hit[] }>(`/drops/search?${p}`);
      setHits(r.results || []);
    } catch (x) {
      setErr((x as Error).message);
    }
    setBusy(false);
  }, []);

  function pick(kind: "intent" | "mood", v: string) {
    const ni = kind === "intent" ? (intent === v ? "" : v) : intent;
    const nm = kind === "mood" ? (mood === v ? "" : v) : mood;
    setIntent(ni); setMood(nm);
    run(q, ni, nm);
  }

  return (
    <>
      <form className="acct-search" onSubmit={(e) => { e.preventDefault(); run(q, intent, mood); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search confessions…" aria-label="Search" />
        <button className="pill" disabled={busy}>Search</button>
      </form>
      <div className="acct-pad">
        <div className="acct-chips">
          {INTENTS.map(([v, l]) => <button key={v} type="button" className={intent === v ? "on" : ""} onClick={() => pick("intent", v)}>{l}</button>)}
        </div>
        <div className="acct-chips">
          {MOODS.map((v) => <button key={v} type="button" className={mood === v ? "on" : ""} onClick={() => pick("mood", v)}>{v}</button>)}
        </div>
      </div>
      {err ? <div className="err pad">{err}</div> : null}
      {busy ? <p className="muted center">Searching…</p> : null}
      {!busy && hits === null ? <div className="empty"><h2>Looking for something?</h2><p>Search a word, or pick a vibe above.</p></div> : null}
      {!busy && hits && hits.length === 0 ? <div className="empty"><h2>Nothing found</h2><p>Try different words, or drop your own.</p></div> : null}
      {!busy && hits && hits.length > 0 ? (
        <ul className="rows">
          {hits.map((h) => (
            <li key={h.id}>
              <Link href={`/drop/${h.id}`} className="row-item">
                <span className="grow">
                  <b>{teaser(h.content || "A post with media", 90)}</b>
                  <small>{[h.anonymous_name, h.mood_tag, h.time_ago].filter(Boolean).join(" · ")}</small>
                </span>›
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
export const SearchPage = () => (
  <AppShell title="Search" back="/"><SearchInner /></AppShell>
);
