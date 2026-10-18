"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Series = { labels: string[]; signups: number[]; drops: number[]; transactions: number[] };
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function AdminCalendar() {
  const [ts, setTs] = useState<Series | null>(null);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [sel, setSel] = useState(key(new Date()));

  useEffect(() => {
    api<Series>("/admin/timeseries?days=90").then(setTs).catch((e) => setError((e as Error).message));
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, { drops: number; signups: number; txns: number }>();
    ts?.labels.forEach((l, i) => m.set(l, { drops: ts.drops[i], signups: ts.signups[i], txns: ts.transactions[i] }));
    return m;
  }, [ts]);
  const maxDrops = Math.max(1, ...(ts?.drops ?? [0]));
  const first = ts?.labels[0];
  const todayKey = key(new Date());

  const cells = useMemo(() => {
    const lead = (month.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))] as (Date | null)[];
  }, [month]);

  const picked = byDay.get(sel);
  const canPrev = first ? new Date(month.getFullYear(), month.getMonth(), 0) >= new Date(first) : false;
  const now = new Date();
  const canNext = month < new Date(now.getFullYear(), now.getMonth(), 1);
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h2>Calendar</h2>
          <p>Drops posted each day. Darker means busier. Shows the last 90 days.</p>
        </div>
      </div>
      {error ? <p className="err">{error}</p> : null}
      <div className="adm-dash">
        <div className="adm-panel w8 adm-cal">
          <div className="adm-panel-head">
            <h3>{month.toLocaleString(undefined, { month: "long", year: "numeric" })}</h3>
            <div className="adm-actions">
              <button type="button" className="adm-btn" disabled={!canPrev} onClick={() => shift(-1)}>← Prev</button>
              <button type="button" className="adm-btn" disabled={!canNext} onClick={() => shift(1)}>Next →</button>
            </div>
          </div>
          <div className="adm-cal-grid">
            {DOW.map((d) => <div key={d} className="adm-cal-dow">{d}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={`b${i}`} />;
              const k = key(d);
              const v = byDay.get(k);
              const heat = v ? Math.min(0.55, (v.drops / maxDrops) * 0.55) : 0;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!v}
                  className={`adm-day${k === sel ? " sel" : ""}${k === todayKey ? " today" : ""}`}
                  style={{ "--heat": heat } as React.CSSProperties}
                  onClick={() => setSel(k)}
                >
                  <span className="n">{d.getDate()}</span>
                  <span className="c">{v && v.drops ? v.drops : ""}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="adm-panel w4">
          <h3>{new Date(`${sel}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</h3>
          {picked ? (
            <div className="adm-daybox">
              <div><b>{picked.drops}</b><span>drops</span></div>
              <div><b>{picked.signups}</b><span>signups</span></div>
              <div><b>{picked.txns}</b><span>coin txns</span></div>
            </div>
          ) : <p className="adm-empty">No data for this day.</p>}
        </div>
      </div>
    </>
  );
}
