"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { flag, type Row } from "./shared";
import { usePaged } from "@/components/admin/bits";

type Best = { grid: number[][]; suggestions: { weekday: number; hour: number; visitors: number }[]; enough_data: boolean };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** When visitors are on the site, by weekday and hour, in the admin's own time zone. */
export function BestTimes() {
  const [d, setD] = useState<Best | null>(null);
  useEffect(() => {
    const tz = -new Date().getTimezoneOffset();
    api<Best>(`/admin/insights/best-times?days=28&tz=${tz}`).then(setD).catch(() => {});
  }, []);
  if (!d) return null;
  const max = Math.max(1, ...d.grid.flat());
  return (
    <div className="adm-panel">
      <h3>When people are here</h3>
      <p className="muted small">Visitors by weekday and hour over the last 4 weeks, in your time zone. Darker = busier. Schedule drops just before the busy hours.</p>
      {!d.enough_data ? <p className="adm-empty">Not enough visits yet. This fills in as traffic grows.</p> : (
        <>
          <div className="adm-heat" role="img" aria-label="Visitors by weekday and hour">
            <span />
            {Array.from({ length: 24 }, (_, h) => <span key={h}>{h % 3 === 0 ? h : ""}</span>)}
            {d.grid.map((row, wd) => [
              <span key={`l${wd}`}>{DAYS[wd]}</span>,
              ...row.map((n, h) => <i key={`${wd}-${h}`} style={{ "--v": n / max } as React.CSSProperties} title={`${DAYS[wd]} ${h}:00 · ${n} visitors`} />),
            ])}
          </div>
          <p className="small">Busiest: {d.suggestions.slice(0, 3).map((s) => `${DAYS[s.weekday]} ${s.hour}:00`).join(" · ")}</p>
        </>
      )}
    </div>
  );
}

type CountryTaste = {
  country: string; cc: string | null; opens: number; web: number; app: number;
  kinds: Row[]; moods: Row[]; top_drop: { id: string; opens: number; teaser: string };
};

/** What each country opens, from website visitors (IP country) and app users (profile country). */
export function CountryTastes({ days, onPick }: { days: number; onPick: (p: string) => void }) {
  const span = Math.max(days, 7);
  const [d, setD] = useState<CountryTaste[] | null>(null);
  const pg = usePaged(d || [], { text: (c) => c.country });
  useEffect(() => {
    api<{ countries: CountryTaste[] }>(`/admin/insights/country-tastes?days=${span}`).then((r) => setD(r.countries)).catch(() => {});
  }, [span]);
  if (!d) return null;
  const mix = (rows: Row[]) => {
    const total = rows.reduce((n, r) => n + r.count, 0) || 1;
    return rows.map((r) => `${r.key} ${Math.round((100 * r.count) / total)}%`).join(" · ");
  };
  return (
    <div className="adm-panel">
      <h3>What each country loves</h3>
      <p className="muted small">Drop opens by country, website and app together, over the last {span} days.</p>
      {d.length ? (
        <div className="adm-scroll">
          <table className="adm-table">
            <thead><tr><th>Country</th><th>Opens</th><th>Moods</th><th>Kinds</th><th>Most opened drop</th></tr></thead>
            <tbody>{pg.rows.map((c) => (
              <tr key={c.country}>
                <td>{flag(c.cc)} {c.country}</td>
                <td>{c.opens}<br /><small className="muted">{c.web} web · {c.app} app</small></td>
                <td>{mix(c.moods) || "—"}</td>
                <td>{mix(c.kinds)}</td>
                <td>
                  <button type="button" className="adm-linkbtn" onClick={() => onPick(`/drop/${c.top_drop.id}`)}>{c.top_drop.teaser}</button>
                  <small className="muted"> · {c.top_drop.opens} opens</small>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {pg.tools}
        </div>
      ) : <p className="adm-empty">No drop opens with a known country yet.</p>}
    </div>
  );
}

