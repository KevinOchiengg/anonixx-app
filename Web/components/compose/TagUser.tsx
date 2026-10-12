"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type Tagged = { id: string; username: string; anonymous_name?: string } | null;
export const HINT_MAX = 16;

type Conn = { other_user_id: string; other_anonymous_name: string };

export default function TagUser({ value, onChange, hint, onHint }: { value: Tagged; onChange: (u: Tagged) => void; hint: string; onHint: (h: string) => void }) {
  const [recent, setRecent] = useState<{ id: string; username: string; anonymous_name: string }[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; username: string; anonymous_name?: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ connections: Conn[] }>("/drops/connections")
      .then((r) => {
        const seen = new Set<string>();
        const list: { id: string; username: string; anonymous_name: string }[] = [];
        for (const c of r.connections || []) {
          if (seen.has(c.other_user_id)) continue;
          seen.add(c.other_user_id);
          list.push({ id: c.other_user_id, username: "", anonymous_name: c.other_anonymous_name });
          if (list.length >= 5) break;
        }
        setRecent(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = q.trim();
    if (!t || value) { setResults([]); return; }
    const timer = setTimeout(() => {
      setBusy(true);
      api<{ users: { id: string; username: string; anonymous_name?: string }[] }>(`/users/search?q=${encodeURIComponent(t)}`)
        .then((r) => setResults(r.users || []))
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, value]);

  const label = (u: { username?: string; anonymous_name?: string }) => (u.username ? `@${u.username}` : u.anonymous_name || "Anonymous");

  if (value) {
    return (
      <div className="tag-box">
        <div className="tag-picked">
          <span className="tag-av">{(value.anonymous_name || value.username || "?").charAt(0).toUpperCase()}</span>
          <span className="grow"><b>{label(value)}</b><small>They get it too, anonymously.</small></span>
          <button type="button" className="pill ghost" onClick={() => { onChange(null); onHint(""); setQ(""); }}>Remove</button>
        </div>
        <label className="field">
          One word only they&apos;d catch
          <input
            value={hint}
            maxLength={HINT_MAX}
            onChange={(e) => onHint(e.target.value.split(/\s+/)[0].slice(0, HINT_MAX))}
            placeholder="e.g. rain, august, friday…"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <span className="acct-hint">They might pick up on it. Or not. {HINT_MAX - hint.length} left.</span>
        </label>
      </div>
    );
  }

  return (
    <div className="tag-box">
      <p className="muted small">If you tag someone they also receive it, anonymously.</p>
      {recent.length ? (
        <>
          <small className="tag-label">RECENT</small>
          <div className="tag-recent">
            {recent.map((u) => (
              <button type="button" key={u.id} onClick={() => onChange(u)}>
                <span className="tag-av">{(u.anonymous_name || "?").charAt(0).toUpperCase()}</span>
                <span>{u.anonymous_name}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by username" aria-label="Search people" />
      {busy ? <p className="muted small">Searching…</p> : null}
      {results.length ? (
        <ul className="tag-results">
          {results.map((u) => (
            <li key={u.id}>
              <button type="button" onClick={() => { onChange(u); setQ(""); setResults([]); }}>
                <span className="tag-av">{(u.anonymous_name || u.username || "?").charAt(0).toUpperCase()}</span>
                <b>@{u.username}</b>
                {u.anonymous_name ? <small>{u.anonymous_name}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
