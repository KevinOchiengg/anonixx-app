"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/admin/bits";
import { askConfirm } from "@/lib/confirm";

type Arm = { searches: number; zero_result_rate: number; tap_rate: number; median_seconds_to_first_tap: number | null };
type Stats = { days: number; arms: Record<string, Arm>; top: { q: string; searches: number }[]; open_flags: number };
type Unmet = { q: string; searches: number; people: number; no_results: boolean };
type Flag = { id: string; query: string; term: string; at: string };
type Syn = { id: string; term: string; expands: string[]; topics: string[]; active: boolean };
type Topic = { id: string; label: string };
type Pane = "quality" | "unmet" | "blocked" | "slang";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function AdminSearch() {
  const [pane, setPane] = useState<Pane>("quality");
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<Stats | null>(null);
  const [unmet, setUnmet] = useState<Unmet[] | null>(null);
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [syns, setSyns] = useState<Syn[] | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      if (pane === "quality") setStats(await api<Stats>(`/search/admin/stats?days=${days}`));
      if (pane === "unmet") setUnmet((await api<{ unmet: Unmet[] }>(`/search/admin/unmet?days=${days}`)).unmet);
      if (pane === "blocked") setFlags((await api<{ flags: Flag[] }>("/search/admin/flags")).flags);
      if (pane === "slang") {
        const r = await api<{ synonyms: Syn[]; topics: Topic[] }>("/search/admin/synonyms");
        setSyns(r.synonyms);
        setTopics(r.topics);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [pane, days]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <h2>Search</h2>
      <p className="muted small">How search is doing, what people can&apos;t find, blocked searches and the slang list.</p>
      <div className="adm-panes" role="tablist">
        {([["quality", "Quality"], ["unmet", "Can't find"], ["blocked", `Blocked${stats?.open_flags ? ` · ${stats.open_flags}` : ""}`], ["slang", "Slang"]] as [Pane, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={pane === k} className={pane === k ? "on" : ""} onClick={() => setPane(k)}>{l}</button>
        ))}
        {pane === "quality" || pane === "unmet" ? (
          <select className="adm-select" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
            {[1, 7, 30, 90].map((d) => <option key={d} value={d}>Last {d === 1 ? "day" : `${d} days`}</option>)}
          </select>
        ) : null}
      </div>
      {error ? <p className="err">{error}</p> : null}

      {pane === "quality" ? <Quality stats={stats} /> : null}
      {pane === "unmet" ? <UnmetList rows={unmet} /> : null}
      {pane === "blocked" ? <Blocked rows={flags} onDone={load} /> : null}
      {pane === "slang" ? <Slang rows={syns} topics={topics} onChange={load} /> : null}
    </>
  );
}

function Quality({ stats }: { stats: Stats | null }) {
  if (!stats) return <p className="muted">Loading…</p>;
  const arms = Object.entries(stats.arms);
  return (
    <>
      {!arms.length ? <p className="muted">No searches in this period yet.</p> : null}
      <div className="adm-dash">
        {arms.map(([arm, a]) => (
          <div key={arm} className="adm-card">
            <b>{arms.length > 1 ? `Ranking ${arm.toUpperCase()}` : "All searches"}</b>
            <p className="small" style={{ margin: 0 }}>{a.searches.toLocaleString()} searches</p>
            <p className="small" style={{ margin: 0 }}>Found nothing: <b>{pct(a.zero_result_rate)}</b></p>
            <p className="small" style={{ margin: 0 }}>Tapped a result: <b>{pct(a.tap_rate)}</b></p>
            <p className="small" style={{ margin: 0 }}>Time to first tap: <b>{a.median_seconds_to_first_tap == null ? "—" : `${a.median_seconds_to_first_tap}s`}</b></p>
          </div>
        ))}
      </div>
      {stats.top.length ? (
        <div className="adm-card" style={{ marginTop: 12 }}>
          <b>Top searches</b>
          {stats.top.map((t) => <p key={t.q} className="small" style={{ margin: 0 }}>{t.q} <span className="muted">· {t.searches}</span></p>)}
        </div>
      ) : null}
    </>
  );
}

function UnmetList({ rows }: { rows: Unmet[] | null }) {
  if (!rows) return <p className="muted">Loading…</p>;
  return (
    <div className="adm-card">
      <b>Searches nobody found anything for</b>
      <p className="muted small" style={{ margin: 0 }}>Post drops for these, or add slang so they match what&apos;s there.</p>
      {!rows.length ? <p className="muted small">Nothing unmet. Search is finding what people want.</p> : rows.map((r) => (
        <p key={r.q} className="small" style={{ margin: 0 }}>
          <b>{r.q}</b> <span className="muted">· {r.people} {r.people === 1 ? "person" : "people"}, {r.searches} searches</span> {r.no_results ? <Badge tone="warn">no results</Badge> : <Badge>no taps</Badge>} <Link href={`/admin/post?topic=${encodeURIComponent(r.q)}`}>Post one</Link>
        </p>
      ))}
    </div>
  );
}

function Blocked({ rows, onDone }: { rows: Flag[] | null; onDone: () => void }) {
  if (!rows) return <p className="muted">Loading…</p>;
  async function review(id: string) {
    await api(`/search/admin/flags/${id}`, { method: "PATCH" }).catch(() => {});
    onDone();
  }
  return (
    <div className="adm-card">
      <b>Blocked searches</b>
      <p className="muted small" style={{ margin: 0 }}>Searches for illegal content. They returned nothing. Review and clear them.</p>
      {!rows.length ? <p className="muted small">None waiting.</p> : rows.map((f) => (
        <div key={f.id} className="adm-foot" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <span className="small"><b>{f.query}</b> <span className="muted">· matched “{f.term}” · {new Date(f.at).toLocaleString()}</span></span>
          <button type="button" className="adm-btn" onClick={() => review(f.id)}>Reviewed</button>
        </div>
      ))}
    </div>
  );
}

function Slang({ rows, topics, onChange }: { rows: Syn[] | null; topics: Topic[]; onChange: () => void }) {
  const [term, setTerm] = useState("");
  const [expands, setExpands] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  function edit(s: Syn) {
    setEditId(s.id); setTerm(s.term); setExpands(s.expands.join(", ")); setPicked(s.topics);
  }
  function reset() {
    setEditId(null); setTerm(""); setExpands(""); setPicked([]); setErr("");
  }
  async function save() {
    const body = { term, expands: expands.split(",").map((x) => x.trim()).filter(Boolean), topics: picked, active: true };
    try {
      if (editId) await api(`/search/admin/synonyms/${editId}`, { method: "PUT", body });
      else await api("/search/admin/synonyms", { body });
      reset();
      onChange();
    } catch (e) { setErr((e as Error).message); }
  }
  async function remove(s: Syn) {
    if (!(await askConfirm({ title: `Remove “${s.term}”?`, message: "Searches for it stop matching these words.", confirmLabel: "Remove", icon: "warning" }))) return;
    await api(`/search/admin/synonyms/${s.id}`, { method: "DELETE" }).catch(() => {});
    onChange();
  }

  return (
    <>
      <div className="adm-card">
        <b>{editId ? `Edit “${term}”` : "Add a word"}</b>
        <input className="adm-input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Word people type, e.g. fwb" aria-label="Word" />
        <input className="adm-input" value={expands} onChange={(e) => setExpands(e.target.value)} placeholder="Means the same as (comma separated), e.g. friends with benefits, no strings" aria-label="Same meaning" />
        <div className="adm-panes">
          {topics.map((t) => (
            <button key={t.id} type="button" className={picked.includes(t.id) ? "on" : ""} aria-pressed={picked.includes(t.id)}
              onClick={() => setPicked((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : p.length < 5 ? [...p, t.id] : p))}>{t.label}</button>
          ))}
        </div>
        {err ? <p className="err small">{err}</p> : null}
        <div className="adm-actions" style={{ justifyContent: "flex-start" }}>
          <button type="button" className="adm-btn primary" disabled={term.trim().length < 2} onClick={save}>{editId ? "Save" : "Add"}</button>
          {editId ? <button type="button" className="adm-btn" onClick={reset}>Cancel</button> : null}
        </div>
      </div>
      <div className="adm-card" style={{ marginTop: 12 }}>
        <b>Slang list</b>
        {!rows ? <p className="muted">Loading…</p> : rows.map((s) => (
          <div key={s.id} className="adm-foot" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="small"><b>{s.term}</b> <span className="muted">= {s.expands.join(", ") || "—"}{s.topics.length ? ` · ${s.topics.join(", ")}` : ""}</span></span>
            <span className="adm-actions">
              <button type="button" className="adm-btn" onClick={() => edit(s)}>Edit</button>
              <button type="button" className="adm-btn danger" onClick={() => remove(s)}>Remove</button>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
