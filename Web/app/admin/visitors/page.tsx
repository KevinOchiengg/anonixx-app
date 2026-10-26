"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAdminRole } from "@/components/admin/AdminShell";
import { fmtDate } from "@/components/admin/bits";
import { LineChart } from "@/components/admin/charts";

type Row = { key: string; count: number; visitors?: number };
type Visitor = {
  vid: string; first_seen: string | null; last_seen: string | null; country: string | null; device: string | null;
  browser: string | null; views: number; sessions: number; first_path: string | null; first_ref: string | null;
  last_path: string | null; signed_up: boolean; signed_in: boolean;
};
type Data = {
  days: number;
  summary: {
    visitors: number; new_visitors: number; returning_visitors: number; sessions: number; views: number;
    pages_per_session: number; bounce_rate: number; avg_session_seconds: number; live_now: number;
  };
  live: { vid: string; path: string; country: string | null; device: string | null }[];
  series: { labels: string[]; visitors: number[]; views: number[] };
  pages: Row[]; landing: Row[]; referrers: Row[]; campaigns: Row[]; sources: Row[];
  countries: Row[]; devices: Row[]; browsers: Row[];
  searches: Row[]; search_themes: Row[]; search_places: Row[]; zero_result_searches: Row[];
  clicks: Row[]; dwell: { key: string; seconds: number; count: number }[];
  top_drops: { id: string | null; views: number; visitors: number; kind: string; mood: string | null; teaser: string }[];
  interest_kinds: Row[]; interest_moods: Row[];
  funnel: { visitors: number; searched: number; saw_signup: number; signed_up: number };
  recent: Visitor[];
};
type Journey = {
  visitor: Visitor & { first_utm?: Record<string, string> };
  events: { type: string; path: string; created_at: string; q?: string; target?: string; ms?: number; ref?: string; results?: number }[];
};

type PageStats = {
  path: string; days: number;
  summary: { views: number; visitors: number; landings: number; avg_seconds: number; exit_rate: number };
  series: { labels: string[]; visitors: number[]; views: number[] };
  referrers: Row[]; countries: Row[]; devices: Row[]; clicks: Row[]; searches: Row[];
  came_from: Row[]; went_to: Row[];
  drop: { teaser: string; kind: string; mood: string | null; created_at: string | null } | null;
};

const RANGES = [1, 7, 30, 90] as const;

const flag = (cc?: string | null) =>
  cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "🌐";
const country = (cc?: string | null) => {
  if (!cc) return "Unknown";
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(cc) || cc; } catch { return cc; }
};
const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
const ago = (iso?: string | null) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

function Bars({ rows, color, label, empty, onPick }: {
  rows: Row[]; color?: string; label?: (k: string) => React.ReactNode; empty: string; onPick?: (k: string) => void;
}) {
  if (!rows.length) return <p className="adm-empty">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="adm-bars" style={color ? ({ "--bar": color } as React.CSSProperties) : undefined}>
      {rows.map((r) => (
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
    </ul>
  );
}

/** A page path that opens its own stats. */
function PageLink({ path, onPick }: { path?: string | null; onPick: (p: string) => void }) {
  if (!path) return <>—</>;
  return <button type="button" className="adm-linkbtn" onClick={() => onPick(path)} title="See this page's stats">{path}</button>;
}

function PageDetail({ path, days, onClose, onPick }: { path: string; days: number; onClose: () => void; onPick: (p: string) => void }) {
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

export default function VisitorsPage() {
  const { isSuper } = useAdminRole();
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Journey | null>(null);
  const [page, setPage] = useState<string | null>(null);
  const pick = (p: string) => { setOpen(null); setPage(p); };

  useEffect(() => {
    if (!isSuper) return;
    let live = true;
    const load = () =>
      api<Data>(`/admin/visitors?days=${days}`)
        .then((r) => { if (live) { setData(r); setError(""); } })
        .catch((e) => { if (live) setError((e as Error).message); });
    load();
    const t = window.setInterval(load, 30000);
    return () => { live = false; window.clearInterval(t); };
  }, [days, isSuper]);

  const openJourney = (vid: string) => {
    api<Journey>(`/admin/visitors/${vid}`).then(setOpen).catch((e) => setError((e as Error).message));
  };

  if (!isSuper) {
    return <div className="adm-card adm-gate"><h2>Super admins only</h2><p className="muted">Visitor analytics are visible to the super admin.</p></div>;
  }

  const s = data?.summary;
  const f = data?.funnel;
  const pct = (n: number) => (f && f.visitors ? Math.round((100 * n) / f.visitors) : 0);
  const kpis = [
    { label: "Visitors", value: s?.visitors, sub: s ? `${s.new_visitors} new · ${s.returning_visitors} back` : "", color: "#3B82F6" },
    { label: "Page views", value: s?.views, sub: s ? `${s.pages_per_session} pages / visit` : "", color: "#FF634A" },
    { label: "Avg visit", value: s ? dur(s.avg_session_seconds) : undefined, sub: s ? `${s.sessions} visits` : "", color: "#34d399" },
    { label: "Bounce rate", value: s ? `${s.bounce_rate}%` : undefined, sub: "left after 1 page", color: "#F59E0B" },
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h2>Visitors</h2>
          <p>Who comes to anonixx.com, from where, and what they look for. Anonymous: no accounts, no IPs.</p>
        </div>
        <div className="adm-seg-sm">
          {RANGES.map((r) => <button key={r} type="button" className={days === r ? "on" : ""} onClick={() => setDays(r)}>{r === 1 ? "Today" : `${r}d`}</button>)}
        </div>
      </div>
      {error ? <p className="err">{error}</p> : null}
      {!data ? <p className="muted small">Loading…</p> : (
        <div className="adm-dash">
          <div className="adm-panel w4">
            <div className="adm-label">Right now</div>
            <div className="adm-big"><span className="adm-live">{s?.live_now ?? 0}</span></div>
            <p className="muted small">on the site in the last 5 minutes</p>
            {data.live.length ? (
              <ul className="adm-bars">
                {data.live.slice(0, 6).map((l) => (
                  <li key={l.vid}><span>{flag(l.country)} <PageLink path={l.path} onPick={pick} /></span><small>{l.device}</small></li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="w8">
            <div className="adm-kpis">
              {kpis.map((k) => (
                <div key={k.label} className="adm-kpi" style={{ "--k": k.color } as React.CSSProperties}>
                  <span className="v">{k.value ?? "—"}</span>
                  <span className="l">{k.label}</span>
                  <span className="s">{k.sub}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="adm-panel w8">
            <h3>Traffic</h3>
            <LineChart
              labels={data.series.labels}
              series={[
                { name: "Visitors", color: "#3B82F6", values: data.series.visitors },
                { name: "Page views", color: "#FF634A", values: data.series.views },
              ]}
            />
            <div className="adm-legend">
              <span><i style={{ background: "#3B82F6" }} />Visitors</span>
              <span><i style={{ background: "#FF634A" }} />Page views</span>
            </div>
          </div>

          <div className="adm-panel w4">
            <h3>From visit to signup</h3>
            {f ? (
              <div className="adm-funnel">
                {[
                  ["Visited", f.visitors],
                  ["Searched", f.searched],
                  ["Saw signup", f.saw_signup],
                  ["Signed up", f.signed_up],
                ].map(([l, n]) => (
                  <div key={l as string}>
                    <span>{l}</span>
                    <span><i style={{ width: `${pct(n as number)}%` }} /></span>
                    <b>{n as number}</b>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="muted small">Signups counted from the website only.</p>
          </div>

          <div className="adm-panel w6">
            <h3>What they search for</h3>
            <Bars rows={data.searches} color="#8B5CF6" empty="No searches yet." />
          </div>
          <div className="adm-panel w6">
            <h3>Searched, found nothing</h3>
            <p className="muted small">Demand Anonixx doesn&apos;t meet yet: ideas for official drops.</p>
            <Bars rows={data.zero_result_searches} color="#ff5d6c" empty="Every search found something." />
            {data.search_themes.length ? <><h3>Themes picked</h3><Bars rows={data.search_themes} color="#FF6B8A" empty="" /></> : null}
            {data.search_places.length ? <><h3>Places searched</h3><Bars rows={data.search_places} color="#4FC3E8" empty="" /></> : null}
          </div>

          <div className="adm-panel w7">
            <h3>Drops that pull people in</h3>
            {data.top_drops.length ? (
              <ul className="adm-bars">
                {data.top_drops.map((d) => (
                  <li key={d.id || d.teaser}>
                    <span>
                      {d.id ? <button type="button" className="adm-linkbtn" onClick={() => pick(`/drop/${d.id}`)}>{d.teaser}</button> : d.teaser}
                      {d.id ? <Link href={`/drop/${d.id}`} className="muted small" aria-label="Open drop"> open</Link> : null}
                      <small className="muted"> · {d.kind}{d.mood ? ` · ${d.mood}` : ""}</small>
                    </span>
                    <b>{d.views}</b><small>{d.visitors} ppl</small>
                  </li>
                ))}
              </ul>
            ) : <p className="adm-empty">No drop pages opened yet.</p>}
          </div>
          <div className="adm-panel w5">
            <h3>What interests them</h3>
            <Bars rows={data.interest_kinds} color="#FF634A" empty="No drop views yet." />
            {data.interest_moods.length ? <><h3>Moods</h3><Bars rows={data.interest_moods} color="#F59E0B" empty="" /></> : null}
          </div>

          <div className="adm-panel w6"><h3>Top pages</h3><Bars rows={data.pages} empty="No page views yet." onPick={pick} /></div>
          <div className="adm-panel w6"><h3>Where they land first</h3><Bars rows={data.landing} empty="No visits yet." onPick={pick} /></div>

          <div className="adm-panel w4">
            <h3>Where they come from</h3>
            <Bars rows={data.referrers} color="#34d399" empty="Direct visits only so far." />
            {data.sources.length ? <><h3>Campaign sources</h3><Bars rows={data.sources} color="#34d399" empty="" /></> : null}
            {data.campaigns.length ? <><h3>Campaigns</h3><Bars rows={data.campaigns} color="#34d399" empty="" /></> : null}
          </div>
          <div className="adm-panel w4">
            <h3>Countries</h3>
            <Bars rows={data.countries} color="#3B82F6" label={(k) => `${flag(k)} ${country(k)}`} empty="No visits yet." />
          </div>
          <div className="adm-panel w4">
            <h3>Devices</h3>
            <Bars rows={data.devices} color="#F59E0B" empty="—" />
            <h3>Browsers</h3>
            <Bars rows={data.browsers} color="#F59E0B" empty="—" />
          </div>

          <div className="adm-panel w6">
            <h3>What they click</h3>
            <Bars rows={data.clicks} color="#8B5CF6" empty="No clicks recorded yet." />
          </div>
          <div className="adm-panel w6">
            <h3>Where they stay longest</h3>
            <Bars rows={data.dwell.map((d) => ({ key: d.key, count: d.seconds }))} color="#34d399" label={(k) => k} empty="Not enough visits yet." onPick={pick} />
            <p className="muted small">Average seconds on the page, while the tab is open.</p>
          </div>

          <div className="adm-panel">
            <h3>Recent visitors</h3>
            {data.recent.length ? (
              <div className="adm-scroll">
                <table className="adm-table">
                  <thead><tr><th>Visitor</th><th>Where</th><th>Device</th><th>Came from</th><th>Pages</th><th>Visits</th><th>Last seen</th><th>Last page</th></tr></thead>
                  <tbody>
                    {data.recent.map((v) => (
                      <tr key={v.vid}>
                        <td>
                          <button type="button" className="adm-linkbtn" onClick={() => openJourney(v.vid)}>#{v.vid.slice(0, 6)}</button>
                          {v.signed_up ? <span className="adm-badge"> signed up</span> : v.signed_in ? <span className="adm-badge"> member</span> : null}
                        </td>
                        <td>{flag(v.country)} {country(v.country)}</td>
                        <td>{v.device} · {v.browser}</td>
                        <td>{v.first_ref || "direct"}<br /><small><PageLink path={v.first_path} onPick={pick} /></small></td>
                        <td>{v.views}</td>
                        <td>{v.sessions}</td>
                        <td title={fmtDate(v.last_seen)}>{ago(v.last_seen)}</td>
                        <td><PageLink path={v.last_path} onPick={pick} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="adm-empty">No visitors yet. They appear here as soon as someone opens the site.</p>}
          </div>
        </div>
      )}

      {open ? (
        <div className="adm-modal" onClick={() => setOpen(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <div className="adm-panel-head">
              <h3>Visitor #{open.visitor.vid.slice(0, 6)}</h3>
              <button type="button" className="adm-btn" onClick={() => setOpen(null)}>Close</button>
            </div>
            <p className="muted small">
              {flag(open.visitor.country)} {country(open.visitor.country)} · {open.visitor.device} · first seen {fmtDate(open.visitor.first_seen)} · came from {open.visitor.first_ref || "direct"}
              {open.visitor.first_utm?.campaign ? ` (campaign: ${open.visitor.first_utm.campaign})` : ""}
            </p>
            <ul className="adm-journey">
              {open.events.map((e, i) => (
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
            </ul>
          </div>
        </div>
      ) : null}

      {page ? <PageDetail path={page} days={days} onClose={() => setPage(null)} onPick={setPage} /> : null}
    </>
  );
}
