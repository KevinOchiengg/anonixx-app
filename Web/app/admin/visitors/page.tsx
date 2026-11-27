"use client";
import { useKept } from "@/lib/pageMemory";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAdminRole } from "@/components/admin/AdminShell";
import { Tabs, kindLabel, useTab } from "@/components/admin/bits";
import { ExternalLink } from "lucide-react";
import { LineChart } from "@/components/admin/charts";
import { Bars, country, dur, flag, regionName, type Row } from "@/components/admin/visitors/shared";
import { JourneyModal, PageDetail, type Journey } from "@/components/admin/visitors/Details";
import { LivePanel, RecentVisitors } from "@/components/admin/visitors/Live";
import { BestTimes, CountryTastes } from "@/components/admin/visitors/Panels";
import { usePaged } from "@/components/admin/bits";

type Period = {
  visitors: number; new_visitors: number; returning_visitors: number; sessions: number; views: number;
  pages_per_session: number; bounce_rate: number; avg_session_seconds: number;
};
// One tab's slice of /admin/visitors; only the fields that tab asked for come back.
type Data = Partial<{
  summary: Period; previous: Period;
  series: { labels: string[]; visitors: number[]; views: number[] };
  funnel: { visitors: number; searched: number; saw_signup: number; signed_up: number };
  pages: Row[]; landing: Row[]; clicks: Row[]; dwell: { key: string; seconds: number; count: number }[];
  top_drops: { id: string | null; views: number; visitors: number; kind: string; teaser: string }[];
  interest_kinds: Row[];
  searches: Row[]; search_themes: Row[]; search_places: Row[]; zero_result_searches: Row[];
  referrers: Row[]; campaigns: Row[]; sources: Row[]; countries: Row[]; regions?: Row[]; cities?: Row[]; devices: Row[]; browsers: Row[];
}>;

const RANGES = [1, 7, 30, 90] as const;
const TABS = ["overview", "live", "content", "search", "sources"] as const;

/** "▲ 18%" against the period before; lower is better for bounce rate. */
function Delta({ now, before, lowerIsBetter }: { now: number; before: number; lowerIsBetter?: boolean }) {
  if (!before) return now ? <span className="adm-delta up">new</span> : null;
  const p = Math.round((100 * (now - before)) / before);
  if (!p) return <span className="adm-delta">same</span>;
  const good = lowerIsBetter ? p < 0 : p > 0;
  return <span className={`adm-delta ${good ? "up" : "down"}`}>{p > 0 ? "▲" : "▼"} {Math.abs(p)}%</span>;
}

export default function VisitorsPage() {
  const { isSuper } = useAdminRole();
  const [tab, setTab] = useTab(TABS);
  const [days, setDays] = useKept<(typeof RANGES)[number]>("days", 7);
  const [cache, setCache] = useState<Record<string, Data>>({});
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Journey | null>(null);
  const [page, setPage] = useKept<string | null>("page", null);
  const pick = (p: string) => { setOpen(null); setPage(p); };
  const key = `${tab}:${days}`;
  const data = cache[key];

  // Range and open page live in the URL, so Back from a drop or a user lands on the same view.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const d = Number(q.get("days"));
    if ((RANGES as readonly number[]).includes(d)) setDays(d as (typeof RANGES)[number]);
    if (q.get("page")) setPage(q.get("page"));
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    q.set("days", String(days));
    if (page) q.set("page", page); else q.delete("page");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${q}`);
  }, [days, page]);

  // Only the open tab loads (and refreshes); a tab seen before shows at once while it updates.
  useEffect(() => {
    if (!isSuper || tab === "live") return;
    let live = true;
    const load = () =>
      api<Data>(`/admin/visitors?days=${days}&tab=${tab}`)
        .then((r) => { if (live) { setCache((c) => ({ ...c, [`${tab}:${days}`]: r })); setError(""); } })
        .catch((e) => { if (live) setError((e as Error).message); });
    load();
    const t = window.setInterval(load, 60000);
    return () => { live = false; window.clearInterval(t); };
  }, [tab, days, isSuper]);

  const openJourney = (vid: string) => {
    api<Journey>(`/admin/visitors/${vid}`).then(setOpen).catch((e) => setError((e as Error).message));
  };

  if (!isSuper) {
    return <div className="adm-card adm-gate"><h2>Super admins only</h2><p className="muted">Visitor analytics are visible to the super admin.</p></div>;
  }

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
      <Tabs value={tab} options={TABS} onChange={setTab} />
      {error ? <p className="err">{error}</p> : null}

      {tab === "live" ? (
        <div className="adm-dash">
          <LivePanel onJourney={openJourney} onPick={pick} />
          <RecentVisitors days={days} onJourney={openJourney} onPick={pick} />
        </div>
      ) : !data ? <p className="muted small">Loading…</p> : (
        <div className="adm-dash">
          {tab === "overview" ? <Overview d={data} /> : null}
          {tab === "content" ? <Content d={data} days={days} pick={pick} /> : null}
          {tab === "search" ? <Search d={data} /> : null}
          {tab === "sources" ? <Sources d={data} /> : null}
        </div>
      )}

      {open ? <JourneyModal open={open} onClose={() => setOpen(null)} pick={pick} /> : null}
      {page ? <PageDetail path={page} days={days} onClose={() => setPage(null)} onPick={setPage} /> : null}
    </>
  );
}

function Overview({ d }: { d: Data }) {
  const s = d.summary, b = d.previous, f = d.funnel;
  const pct = (n: number) => (f && f.visitors ? Math.round((100 * n) / f.visitors) : 0);
  const kpis = s && b ? [
    { label: "Visitors", value: s.visitors, delta: <Delta now={s.visitors} before={b.visitors} />, sub: `${s.new_visitors} new · ${s.returning_visitors} back`, color: "#3B82F6" },
    { label: "Page views", value: s.views, delta: <Delta now={s.views} before={b.views} />, sub: `${s.pages_per_session} pages / visit`, color: "#FF634A" },
    { label: "Avg visit", value: dur(s.avg_session_seconds), delta: <Delta now={s.avg_session_seconds} before={b.avg_session_seconds} />, sub: `${s.sessions} visits`, color: "#34d399" },
    { label: "Bounce rate", value: `${s.bounce_rate}%`, delta: <Delta now={s.bounce_rate} before={b.bounce_rate} lowerIsBetter />, sub: "left after 1 page", color: "#F59E0B" },
  ] : [];
  return (
    <>
      <div>
        <div className="adm-kpis">
          {kpis.map((k) => (
            <div key={k.label} className="adm-kpi" style={{ "--k": k.color } as React.CSSProperties}>
              <span className="v">{k.value}</span>
              <span className="l">{k.label} {k.delta}</span>
              <span className="s">{k.sub}</span>
            </div>
          ))}
        </div>
        <p className="muted small">Arrows compare with the same length of time just before.</p>
      </div>

      {d.series ? (
        <div className="adm-panel w8">
          <h3>Traffic</h3>
          <LineChart
            labels={d.series.labels}
            series={[
              { name: "Visitors", color: "#3B82F6", values: d.series.visitors },
              { name: "Page views", color: "#FF634A", values: d.series.views },
            ]}
          />
          <div className="adm-legend">
            <span><i style={{ background: "#3B82F6" }} />Visitors</span>
            <span><i style={{ background: "#FF634A" }} />Page views</span>
          </div>
        </div>
      ) : null}

      {f ? (
        <div className="adm-panel w4">
          <h3>From visit to signup</h3>
          <div className="adm-funnel">
            {([["Visited", f.visitors], ["Searched", f.searched], ["Saw signup", f.saw_signup], ["Signed up", f.signed_up]] as [string, number][]).map(([l, n]) => (
              <div key={l}><span>{l}</span><span><i style={{ width: `${pct(n)}%` }} /></span><b>{n}</b></div>
            ))}
          </div>
          <p className="muted small">Signups counted from the website only.</p>
        </div>
      ) : null}

      <BestTimes />
    </>
  );
}

function Content({ d, days, pick }: { d: Data; days: number; pick: (p: string) => void }) {
  const pg = usePaged(d.top_drops || [], { text: (x) => x.teaser });
  return (
    <>
      <div className="adm-panel w7">
        <h3>Drops that pull people in</h3>
        {d.top_drops?.length ? (
          <><ul className="adm-bars">
            {pg.rows.map((x) => (
              <li key={x.id || x.teaser}>
                <span>
                  {x.id ? <button type="button" className="adm-linkbtn" onClick={() => pick(`/drop/${x.id}`)}>{x.teaser}</button> : x.teaser}
                  <small className="muted"> · {kindLabel(x.kind)}</small>
                  {x.id ? (
                    <Link href={`/drop/${x.id}`} className="adm-open" aria-label="Open drop" title="Open drop">
                      <ExternalLink size={13} strokeWidth={2} aria-hidden />
                    </Link>
                  ) : null}
                </span>
                <b>{x.views}</b><small>{x.visitors} ppl</small>
              </li>
            ))}
          </ul>{pg.tools}</>
        ) : <p className="adm-empty">No drop pages opened yet.</p>}
      </div>
      <div className="adm-panel w5">
        <h3>What interests them</h3>
        <Bars rows={d.interest_kinds || []} color="#FF634A" label={kindLabel} empty="No drop views yet." />
      </div>

      <CountryTastes days={days} onPick={pick} />

      <div className="adm-panel w6"><h3>Top pages</h3><Bars rows={d.pages || []} empty="No page views yet." onPick={pick} /></div>
      <div className="adm-panel w6"><h3>Where they land first</h3><Bars rows={d.landing || []} empty="No visits yet." onPick={pick} /></div>
      <div className="adm-panel w6"><h3>What they click</h3><Bars rows={d.clicks || []} color="#8B5CF6" empty="No clicks recorded yet." /></div>
      <div className="adm-panel w6">
        <h3>Where they stay longest</h3>
        <Bars rows={(d.dwell || []).map((x) => ({ key: x.key, count: x.seconds }))} color="#34d399" empty="Not enough visits yet." onPick={pick} />
        <p className="muted small">Average seconds on the page, while the tab is open.</p>
      </div>
    </>
  );
}

function Search({ d }: { d: Data }) {
  const zero = d.zero_result_searches || [];
  return (
    <>
      <div className="adm-panel w6">
        <h3>What they search for</h3>
        <Bars rows={d.searches || []} color="#8B5CF6" empty="No searches yet." />
        {d.search_themes?.length ? <><h3>Themes picked</h3><Bars rows={d.search_themes} color="#FF6B8A" empty="" /></> : null}
        {d.search_places?.length ? <><h3>Places searched</h3><Bars rows={d.search_places} color="#4FC3E8" empty="" /></> : null}
      </div>
      <div className="adm-panel w6">
        <h3>Searched, found nothing</h3>
        <p className="muted small">Demand Anonixx doesn&apos;t meet yet: ideas for official drops.</p>
        <Bars rows={zero} color="#ff5d6c" empty="Every search found something." />
        {zero.length ? (
          <div className="adm-chips">
            {zero.slice(0, 6).map((z) => (
              <Link key={z.key} href={`/admin/post?topic=${encodeURIComponent(z.key)}`} className="adm-btn" title="Open the Post Studio with this topic">Draft “{z.key}”</Link>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

function Sources({ d }: { d: Data }) {
  return (
    <>
      <div className="adm-panel w4">
        <h3>Where they come from</h3>
        <Bars rows={d.referrers || []} color="#34d399" empty="Direct visits only so far." />
        {d.sources?.length ? <><h3>Campaign sources</h3><Bars rows={d.sources} color="#34d399" empty="" /></> : null}
        {d.campaigns?.length ? <><h3>Campaigns</h3><Bars rows={d.campaigns} color="#34d399" empty="" /></> : null}
      </div>
      <div className="adm-panel w4">
        <h3>Countries</h3>
        <Bars rows={d.countries || []} color="#3B82F6" label={(k) => `${flag(k)} ${country(k)}`} find={country} empty="No visits yet." />
      </div>
      <div className="adm-panel w4">
        <h3>Regions</h3>
        <Bars rows={d.regions || []} color="#3B82F6" label={(k) => `${flag(k.split("-")[0])} ${regionName(k)}`} find={regionName} empty="Collecting from today." />
        <h3>Cities</h3>
        <Bars rows={d.cities || []} color="#3B82F6" empty="Collecting from today." />
      </div>
      <div className="adm-panel w4">
        <h3>Devices</h3>
        <Bars rows={d.devices || []} color="#F59E0B" empty="—" />
        <h3>Browsers</h3>
        <Bars rows={d.browsers || []} color="#F59E0B" empty="—" />
      </div>
    </>
  );
}
