"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAdminRole } from "@/components/admin/AdminShell";
import { Badge } from "@/components/admin/bits";

type Channel = {
  channel: string; signups: number; posted: number; active_7d: number; payers: number; usd: number; kes: number;
  posted_pct: number; active_pct: number; payer_pct: number;
};
type Cohort = { week: string; users: number; d1: number | null; d7: number | null; d30: number | null; age_days: number };
type DropRow = { path: string; id: string | null; teaser: string; kind: string; media: string | null; viewers: number; signups: number; assisted: number; rate: number };
type Exp = {
  key: string; name: string; description: string; active: boolean; variants: { id: string; value: string }[];
  results: { variant: string; visitors: number; signups: number; rate: number }[];
};

const TABS = ["channels", "retention", "drops", "discover", "tests"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = { channels: "Where users come from", retention: "Who comes back", drops: "Drops that convert", discover: "Discover", tests: "A/B tests" };

const pctCell = (v: number | null) => (v == null ? <span className="muted">too new</span> : <b style={{ color: v >= 30 ? "#34d399" : v >= 15 ? "#F59E0B" : "#ff5d6c" }}>{v}%</b>);
const money = (usd: number, kes: number) => [usd ? `$${usd.toFixed(2)}` : "", kes ? `KES ${kes.toLocaleString()}` : ""].filter(Boolean).join(" + ") || "—";

function Channels() {
  const [days, setDays] = useState(90);
  const [d, setD] = useState<{ total_signups: number; channels: Channel[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setD(null);
    api<{ total_signups: number; channels: Channel[] }>(`/admin/insights/channels?days=${days}`).then(setD).catch((e) => setErr((e as Error).message));
  }, [days]);
  return (
    <div className="adm-panel">
      <div className="adm-panel-head">
        <div><h3>Signups by channel</h3><p className="muted small">Where people joined from, and what they did after. Tracked from 27 Oct 2026; older accounts show as “before tracking”.</p></div>
        <div className="adm-seg-sm">{[30, 90, 365].map((n) => <button key={n} type="button" className={days === n ? "on" : ""} onClick={() => setDays(n)}>{n}d</button>)}</div>
      </div>
      {err ? <p className="err">{err}</p> : !d ? <p className="muted small">Loading…</p> : d.channels.length === 0 ? <p className="adm-empty">No signups in this period.</p> : (
        <div className="adm-scroll">
          <table className="adm-table">
            <thead><tr><th>Channel</th><th>Signups</th><th>Posted</th><th>Active 7d</th><th>Paid</th><th>Revenue</th></tr></thead>
            <tbody>
              {d.channels.map((c) => (
                <tr key={c.channel}>
                  <td><b>{c.channel}</b></td>
                  <td>{c.signups}</td>
                  <td>{c.posted} <span className="muted small">({c.posted_pct}%)</span></td>
                  <td>{c.active_7d} <span className="muted small">({c.active_pct}%)</span></td>
                  <td>{c.payers} <span className="muted small">({c.payer_pct}%)</span></td>
                  <td>{money(c.usd, c.kes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Tip: share links with <code>?utm_source=tiktok&amp;utm_campaign=…</code> (or a referral code) so each channel gets its own row.</p>
    </div>
  );
}

function Retention() {
  const [d, setD] = useState<{ cohorts: Cohort[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<{ cohorts: Cohort[] }>("/admin/insights/retention?weeks=10").then(setD).catch((e) => setErr((e as Error).message)); }, []);
  return (
    <div className="adm-panel">
      <h3>Weekly cohorts</h3>
      <p className="muted small">Of the people who joined each week: how many came back the next day, in their second week, and a month later. This is the number that says whether Anonixx is becoming a nightly habit. Green ≥ 30%, amber ≥ 15%.</p>
      {err ? <p className="err">{err}</p> : !d ? <p className="muted small">Loading…</p> : (
        <div className="adm-scroll">
          <table className="adm-table">
            <thead><tr><th>Joined week of</th><th>People</th><th>Next day</th><th>Week 2</th><th>Month 2</th></tr></thead>
            <tbody>
              {[...d.cohorts].reverse().map((c) => (
                <tr key={c.week}>
                  <td>{new Date(c.week).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</td>
                  <td>{c.users}</td>
                  <td>{c.users ? pctCell(c.d1) : "—"}</td>
                  <td>{c.users ? pctCell(c.d7) : "—"}</td>
                  <td>{c.users ? pctCell(c.d30) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Activity is counted from signed-in visits since 27 Oct 2026, plus the days people posted, so older weeks may read low.</p>
    </div>
  );
}

function Drops() {
  const { isSuper } = useAdminRole();
  const [d, setD] = useState<{ signups_total: number; signups_after_a_drop: number; drops: DropRow[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (isSuper) api<{ signups_total: number; signups_after_a_drop: number; drops: DropRow[] }>("/admin/insights/drop-conversions?days=30").then(setD).catch((e) => setErr((e as Error).message));
  }, [isSuper]);
  if (!isSuper) return <p className="adm-empty">This uses visitor data, so only the super admin can see it.</p>;
  return (
    <div className="adm-panel">
      <h3>Drops that turned visitors into members</h3>
      <p className="muted small">Last 30 days, website. “Signups” = the last drop someone read before joining. “Helped” = read at some point before joining. Make more like the top ones.</p>
      {err ? <p className="err">{err}</p> : !d ? <p className="muted small">Loading…</p> : (
        <>
          <p className="small">{d.signups_after_a_drop} of {d.signups_total} website signups read a drop first.</p>
          {d.drops.length === 0 ? <p className="adm-empty">No drop pages opened yet.</p> : (
            <div className="adm-scroll">
              <table className="adm-table">
                <thead><tr><th>Drop</th><th>Read by</th><th>Signups</th><th>Helped</th><th>Rate</th></tr></thead>
                <tbody>
                  {d.drops.map((r) => (
                    <tr key={r.path}>
                      <td>{r.id ? <Link href={`/drop/${r.id}`}>{r.teaser}</Link> : r.teaser} <span className="muted small">· {r.kind}{r.media ? ` · ${r.media}` : ""}</span></td>
                      <td>{r.viewers}</td><td><b>{r.signups}</b></td><td>{r.assisted}</td><td>{r.rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const BLANK = { key: "", name: "", description: "", a: "", b: "", c: "" };

function Tests() {
  const [list, setList] = useState<Exp[] | null>(null);
  const [form, setForm] = useState(BLANK);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<{ experiments: Exp[] }>("/admin/experiments").then((r) => setList(r.experiments)).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const variants = [["a", form.a], ["b", form.b], ["c", form.c]].filter(([, v]) => v.trim()).map(([id, value]) => ({ id, value }));
      await api("/admin/experiments", { body: { key: form.key.trim(), name: form.name.trim() || form.key.trim(), description: form.description, variants, active: true } });
      setForm(BLANK);
      await load();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  const toggle = async (x: Exp) => { await api(`/admin/experiments/${x.key}?active=${!x.active}`, { method: "PATCH" }).catch((e) => setErr((e as Error).message)); load(); };

  return (
    <>
      <div className="adm-panel">
        <h3>Running tests</h3>
        <p className="muted small">Each visitor always sees the same version. The winner is the one with the higher signup rate once each has a few hundred visitors.</p>
        {err ? <p className="err">{err}</p> : null}
        {!list ? <p className="muted small">Loading…</p> : list.length === 0 ? <p className="adm-empty">No tests yet. The /join page headline is ready to test: use the key <code>join_headline</code>.</p> : list.map((x) => {
          const best = Math.max(...x.results.map((r) => r.rate));
          return (
            <div key={x.key} className="adm-card">
              <div className="adm-panel-head">
                <div><b>{x.name}</b> <span className="muted small">· {x.key}</span> {x.active ? <Badge tone="ok">running</Badge> : <Badge>stopped</Badge>}</div>
                <button type="button" className="adm-btn" onClick={() => toggle(x)}>{x.active ? "Stop" : "Start"}</button>
              </div>
              {x.description ? <p className="muted small">{x.description}</p> : null}
              <table className="adm-table">
                <thead><tr><th>Version</th><th>Text</th><th>Visitors</th><th>Signups</th><th>Rate</th></tr></thead>
                <tbody>
                  {x.variants.map((v) => {
                    const r = x.results.find((y) => y.variant === v.id) || { visitors: 0, signups: 0, rate: 0 };
                    return (
                      <tr key={v.id}>
                        <td><b>{v.id.toUpperCase()}</b></td><td>{v.value}</td><td>{r.visitors}</td><td>{r.signups}</td>
                        <td>{r.rate}%{r.visitors >= 100 && r.rate === best && best > 0 ? <Badge tone="ok"> leading</Badge> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
      <form className="adm-panel" onSubmit={save}>
        <h3>New test</h3>
        <div className="adm-form-grid">
          <label>Key<input className="adm-input" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="join_headline" required /></label>
          <label>Name<input className="adm-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Join page headline" /></label>
        </div>
        <label>What it tests<input className="adm-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Trust angle vs desire angle" /></label>
        <label>Version A<input className="adm-input" value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value })} placeholder="The anonymous confession app." required /></label>
        <label>Version B<input className="adm-input" value={form.b} onChange={(e) => setForm({ ...form, b: e.target.value })} placeholder="Nothing here is fake." required /></label>
        <label>Version C <span className="muted small">optional</span><input className="adm-input" value={form.c} onChange={(e) => setForm({ ...form, c: e.target.value })} /></label>
        <button className="adm-btn primary" disabled={busy}>{busy ? "Saving…" : "Start test"}</button>
        <p className="muted small">Live hooks on the site: <code>join_headline</code> (the /join page headline). Saving a key that exists replaces it.</p>
      </form>
    </>
  );
}

type DiscoverStats = {
  days: number;
  fairness: { impressions: number; owners_shown: number; top_10pct_share: number | null; top_owner_share: number | null; gini: number | null };
  daily: { day: string; surface: string; requests: number; zero_rate: number; loose_rate: number; avg_ms: number; max_ms: number }[];
};
const pc = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);

// Discover (Backend api/v1/discover.py /discover/admin/stats): is attention in Near
// concentrating on a few people, and is search finding things? Daily counters only.
function Discover() {
  const [days, setDays] = useState(7);
  const [d, setD] = useState<DiscoverStats | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setD(null);
    api<DiscoverStats>(`/discover/admin/stats?days=${days}`).then(setD).catch((e) => setErr((e as Error).message));
  }, [days]);
  const f = d?.fairness;
  return (
    <div className="adm-panel">
      <h3>Discover</h3>
      <p className="muted small">How Near spreads attention, and how often searches come back empty. Counted per day, with no searches or viewers stored.</p>
      <div className="adm-tabs">{[7, 14, 30].map((n) => <button key={n} type="button" className={days === n ? "on" : ""} onClick={() => setDays(n)}>{n} days</button>)}</div>
      {err ? <p className="err">{err}</p> : !d || !f ? <p className="muted small">Loading…</p> : (
        <>
          <div className="adm-scroll">
            <table className="adm-table">
              <thead><tr><th>Near cards shown</th><th>People shown</th><th>Top 10% got</th><th>Top person got</th><th>Spread (gini)</th></tr></thead>
              <tbody><tr><td>{f.impressions}</td><td>{f.owners_shown}</td><td>{pc(f.top_10pct_share)}</td><td>{pc(f.top_owner_share)}</td><td>{f.gini ?? "—"}</td></tr></tbody>
            </table>
          </div>
          <p className="muted small">Gini near 0 means attention is spread evenly; near 1 means a few people get it all. Watch it as Near grows.</p>
          <div className="adm-scroll">
            <table className="adm-table">
              <thead><tr><th>Day</th><th>Where</th><th>Searches</th><th>Empty</th><th>Any-word fallback</th><th>Avg ms</th><th>Slowest</th></tr></thead>
              <tbody>
                {d.daily.length ? [...d.daily].reverse().map((r) => (
                  <tr key={r.day + r.surface}>
                    <td>{r.day}</td><td>{r.surface}</td><td>{r.requests}</td><td>{pc(r.zero_rate)}</td><td>{pc(r.loose_rate)}</td><td>{r.avg_ms}</td><td>{r.max_ms}</td>
                  </tr>
                )) : <tr><td colSpan={7} className="muted">Nothing yet. It fills in as people use Discover.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function GrowthPage() {
  const [tab, setTab] = useState<Tab>("channels");
  return (
    <>
      <div className="adm-pagehead"><div><h2>Growth</h2><p>Which channels bring people who stay, and what to make more of.</p></div></div>
      <div className="adm-tabs">{TABS.map((t) => <button key={t} type="button" className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{LABELS[t]}</button>)}</div>
      <div className="adm-list">
        {tab === "channels" ? <Channels /> : tab === "retention" ? <Retention /> : tab === "drops" ? <Drops /> : tab === "discover" ? <Discover /> : <Tests />}
      </div>
    </>
  );
}
