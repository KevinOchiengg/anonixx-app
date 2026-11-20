"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtDate } from "@/components/admin/bits";
import { LineChart } from "@/components/admin/charts";
import { Bars, PageLink, ago, country, dur, flag, type Row } from "./shared";
import { usePaged } from "@/components/admin/bits";

type PageStats = {
  path: string; days: number;
  summary: { views: number; visitors: number; landings: number; avg_seconds: number; exit_rate: number };
  series: { labels: string[]; visitors: number[]; views: number[] };
  referrers: Row[]; countries: Row[]; devices: Row[]; clicks: Row[]; searches: Row[];
  came_from: Row[]; went_to: Row[];
  drop: { teaser: string; kind: string; mood: string | null; created_at: string | null } | null;
};

export type Visitor = {
  vid: string; first_seen: string | null; last_seen: string | null; country: string | null; device: string | null;
  browser: string | null; views: number; sessions: number; first_path: string | null; first_ref: string | null;
  last_path: string | null; signed_up: boolean; signed_in: boolean;
};
export type Journey = {
  visitor: Visitor & { first_utm?: Record<string, string> };
  events: { type: string; path: string; created_at: string; q?: string; target?: string; ms?: number; ref?: string; results?: number }[];
};

export function PageDetail({ path, days, onClose, onPick }: { path: string; days: number; onClose: () => void; onPick: (p: string) => void }) {
  const [d, setD] = useState<PageStats | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setD(null);
    setError("");
    api<PageStats>(`/admin/visitors/page?path=${encodeURIComponent(path)}&days=${days}`)
      .then((r) => { if (live) setD(r); })
      .catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [path, days]);

  return (
    <div className="adm-modal" onClick={onClose}>
      <div className="adm-pagedetail" onClick={(e) => e.stopPropagation()}>
        <div className="adm-panel-head">
          <div>
            <h3 className="adm-clip">{path}</h3>
            <p className="muted small">{days === 1 ? "Today" : `Last ${days} days`}</p>
          </div>
          <div className="adm-chips">
            <Link href={path} className="adm-btn">Open page</Link>
            <button type="button" className="adm-btn" onClick={onClose}>Close</button>
          </div>
        </div>
        {error ? <p className="err">{error}</p> : !d ? <p className="muted small">Loading…</p> : (
          <>
            {d.drop ? (
              <p className="adm-note">“{d.drop.teaser}”<br /><small className="muted">{d.drop.kind}{d.drop.mood ? ` · ${d.drop.mood}` : ""}</small></p>
            ) : null}
            <div className="adm-kpis">
              {([
                ["Views", d.summary.views],
                ["Visitors", d.summary.visitors],
                ["Avg time", dur(d.summary.avg_seconds)],
                ["Landed here first", d.summary.landings],
                ["Left the site here", `${d.summary.exit_rate}%`],
              ] as [string, string | number][]).map(([l, v]) => (
                <div key={l} className="adm-kpi" style={{ "--k": "#3B82F6" } as React.CSSProperties}>
                  <span className="v">{v}</span><span className="l">{l}</span>
                </div>
              ))}
            </div>
            <LineChart
              labels={d.series.labels}
              height={180}
              series={[
                { name: "Visitors", color: "#3B82F6", values: d.series.visitors },
                { name: "Views", color: "#FF634A", values: d.series.views },
              ]}
            />
            <div className="adm-pd-grid">
              <div><h3>Came from</h3><Bars rows={d.came_from} color="#8B5CF6" empty="Mostly arrived here first." onPick={onPick} /></div>
              <div><h3>Went next</h3><Bars rows={d.went_to} color="#34d399" empty="Nobody moved on yet." onPick={onPick} /></div>
              <div><h3>Sites that sent people</h3><Bars rows={d.referrers} color="#34d399" empty="Direct visits only." /></div>
              <div><h3>Clicked here</h3><Bars rows={d.clicks} color="#8B5CF6" empty="No key clicks yet." /></div>
              <div><h3>Countries</h3><Bars rows={d.countries} color="#3B82F6" label={(k) => `${flag(k)} ${country(k)}`} empty="—" /></div>
              <div><h3>Devices</h3><Bars rows={d.devices} color="#F59E0B" empty="—" /></div>
              {d.searches.length ? <div><h3>Searched here</h3><Bars rows={d.searches} color="#8B5CF6" empty="" /></div> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** One visitor's path through the site, step by step. */
export function JourneyModal({ open, onClose, pick }: { open: Journey; onClose: () => void; pick: (p: string) => void }) {
  const pg = usePaged(open.events, { size: 30, text: (e) => e.type });
  return (
    <div className="adm-modal" onClick={() => onClose()}>
      <div onClick={(e) => e.stopPropagation()}>
        <div className="adm-panel-head">
          <h3>Visitor #{open.visitor.vid.slice(0, 6)}</h3>
          <button type="button" className="adm-btn" onClick={() => onClose()}>Close</button>
        </div>
        <p className="muted small">
          {flag(open.visitor.country)} {country(open.visitor.country)} · {open.visitor.device} · first seen {fmtDate(open.visitor.first_seen)} · came from {open.visitor.first_ref || "direct"}
          {open.visitor.first_utm?.campaign ? ` (campaign: ${open.visitor.first_utm.campaign})` : ""}
        </p>
        <><ul className="adm-journey">
          {pg.rows.map((e, i) => (
            <li key={i}>
              <small>{ago(e.created_at)}</small>
              <b>{e.type}</b>
              <span>
                {e.type === "search" ? `“${e.q || ""}”${e.results === 0 ? " · nothing found" : ""}`
                  : e.type === "click" ? e.target
                  : e.type === "leave" ? <><PageLink path={e.path} onPick={pick} /> · {dur(Math.round((e.ms || 0) / 1000))}</>
                  : <PageLink path={e.path} onPick={pick} />}
                {e.ref ? <small> · from {e.ref}</small> : null}
              </span>
            </li>
          ))}
        </ul>{pg.tools}</>
      </div>
        </div>
  );
}
