"use client";
import { useEffect, useState } from "react";

export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

/** The time right now in a user's zone, e.g. "2:14 am", or null if unknown. */
export function theirTime(tz?: string | null): string | null {
  if (!tz) return null;
  try { return new Date().toLocaleTimeString(undefined, { timeZone: tz, hour: "numeric", minute: "2-digit" }); } catch { return null; }
}

export function Pager({
  skip, limit, total, onSkip,
}: { skip: number; limit: number; total: number; onSkip: (n: number) => void }) {
  if (total <= limit) return null;
  const from = total ? skip + 1 : 0;
  const to = Math.min(skip + limit, total);
  return (
    <div className="adm-pager">
      <button className="adm-btn" disabled={skip <= 0} onClick={() => onSkip(Math.max(0, skip - limit))}>← Prev</button>
      <span className="muted">{from}–{to} of {total}</span>
      <button className="adm-btn" disabled={skip + limit >= total} onClick={() => onSkip(skip + limit)}>Next →</button>
    </div>
  );
}

export function Tabs<T extends string>({
  value, options, onChange,
}: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="adm-tabs">
      {options.map((o) => (
        <button key={o} className={o === value ? "on" : ""} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
}

/** Tab state kept in ?tab=, so a link can open a tab directly. */
export function useTab<T extends string>(options: readonly T[]): [T, (v: T) => void] {
  const [tab, setTab] = useState<T>(options[0]);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as T | null;
    if (t && options.includes(t)) setTab(t);
  }, [options]);
  const pick = (v: T) => {
    setTab(v);
    const u = new URL(window.location.href);
    if (v === options[0]) u.searchParams.delete("tab"); else u.searchParams.set("tab", v);
    window.history.replaceState(null, "", u);
  };
  return [tab, pick];
}

export function Badge({ children, tone }: { children: React.ReactNode; tone?: "ok" | "bad" | "warn" }) {
  return <span className={`adm-badge${tone ? ` ${tone}` : ""}`}>{children}</span>;
}

/** Long lists stay short: the top `size` rows, then "Show all" opens search and pages of `page`.
 * Returns the rows to draw and the controls to put under them (null when the list is short). */
export function usePaged<T>(items: T[], { size = 8, page = 20, text }: { size?: number; page?: number; text?: (x: T) => string } = {}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const n = items.length;
  useEffect(() => { setAt(0); }, [q, n]);
  const term = q.trim().toLowerCase();
  const list = term && text ? items.filter((x) => text(x).toLowerCase().includes(term)) : items;
  const rows = open ? list.slice(at, at + page) : items.slice(0, size);
  const tools = n <= size ? null : !open ? (
    <div className="adm-more"><button type="button" className="adm-btn" onClick={() => setOpen(true)}>Show all {n.toLocaleString()}</button></div>
  ) : (
    <div className="adm-more">
      {text ? <input className="adm-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this list" aria-label="Search this list" /> : null}
      <button type="button" className="adm-btn" disabled={at <= 0} onClick={() => setAt(Math.max(0, at - page))} aria-label="Previous page">←</button>
      <span className="muted small">{list.length ? `${at + 1}–${Math.min(at + page, list.length)} of ${list.length.toLocaleString()}` : "No matches"}</span>
      <button type="button" className="adm-btn" disabled={at + page >= list.length} onClick={() => setAt(at + page)} aria-label="Next page">→</button>
      <button type="button" className="adm-linkbtn small" onClick={() => { setOpen(false); setQ(""); setAt(0); }}>Show less</button>
    </div>
  );
  return { rows, tools };
}
