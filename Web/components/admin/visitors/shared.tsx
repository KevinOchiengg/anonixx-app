"use client";
import { usePaged } from "@/components/admin/bits";

export type Row = { key: string; count: number; visitors?: number };

export const flag = (cc?: string | null) =>
  cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "🌐";
export const country = (cc?: string | null) => {
  if (!cc) return "Unknown";
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(cc) || cc; } catch { return cc; }
};
export const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
export const ago = (iso?: string | null) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

export function Bars({ rows, color, label, empty, onPick, find }: {
  rows: Row[]; color?: string; label?: (k: string) => React.ReactNode; empty: string; onPick?: (k: string) => void;
  find?: (k: string) => string;   // extra words to search by, e.g. the country name for "KE"
}) {
  const pg = usePaged(rows, { text: (r) => `${r.key} ${find ? find(r.key) : ""}` });
  if (!rows.length) return <p className="adm-empty">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <><ul className="adm-bars" style={color ? ({ "--bar": color } as React.CSSProperties) : undefined}>
      {pg.rows.map((r) => (
        <li key={r.key}>
          <i style={{ width: `${(100 * r.count) / max}%` }} />
          <span title={r.key}>
            {onPick
              ? <button type="button" className="adm-linkbtn" onClick={() => onPick(r.key)}>{label ? label(r.key) : r.key}</button>
              : label ? label(r.key) : r.key}
          </span>
          <b>{r.count}</b>
          {r.visitors !== undefined ? <small>{r.visitors} ppl</small> : null}
        </li>
      ))}
    </ul>{pg.tools}</>
  );
}

/** A page path that opens its own stats. */
export function PageLink({ path, onPick }: { path?: string | null; onPick: (p: string) => void }) {
  if (!path) return <>—</>;
  return <button type="button" className="adm-linkbtn" onClick={() => onPick(path)} title="See this page's stats">{path}</button>;
}

