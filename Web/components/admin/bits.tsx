"use client";

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

export function Badge({ children, tone }: { children: React.ReactNode; tone?: "ok" | "bad" | "warn" }) {
  return <span className={`adm-badge${tone ? ` ${tone}` : ""}`}>{children}</span>;
}
