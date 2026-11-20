"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, fmtDate, theirTime } from "@/components/admin/bits";
import { PageLink, ago, country, flag } from "./shared";
import type { Visitor } from "./Details";
import { usePaged } from "@/components/admin/bits";

type LiveWeb = {
  vid: string; path: string; country: string | null; device: string | null; browser: string | null;
  signed_in: boolean; signed_up: boolean; returning: boolean; came_from: string | null; tz: string | null; since: string | null; pages: number;
  drops: { id: string; teaser: string; kind: string | null; mood: string | null }[]; searches: string[];
};
type LiveApp = {
  user_id: string; name: string | null; country: string | null; cc: string | null; gender: string | null; tz: string | null; joined: string | null;
  since: string | null; is_new: boolean; premium: boolean; admin: boolean; purchases: number; coins: number; drops_seen: number;
};
type Live = { minutes: number; web: LiveWeb[]; app: LiveApp[]; app_total: number };

const onFor = (iso?: string | null) => {
  if (!iso) return "—";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

/** Everyone here right now: app users (signed in, so with their account) and site visitors (anonymous). */
export function LivePanel({ onJourney, onPick }: { onJourney: (vid: string) => void; onPick: (p: string) => void }) {
  const [d, setD] = useState<Live | null>(null);
  const pApp = usePaged(d?.app || [], { text: (a) => `${a.name || ""} ${a.user_id}` });
  const pWeb = usePaged(d?.web || [], { text: (w) => w.vid });
  useEffect(() => {
    let live = true;
    const load = () => api<Live>("/admin/live").then((r) => { if (live) setD(r); }).catch(() => {});
    load();
    const t = window.setInterval(load, 15000);
    return () => { live = false; window.clearInterval(t); };
  }, []);
  if (!d) return null;
  return (
    <div className="adm-panel">
      <div className="adm-label">Right now</div>
      <div className="adm-big"><span className="adm-live">{d.app_total + d.web.length}</span></div>
      <p className="muted small">{d.app_total} in the app · {d.web.length} on the website in the last {d.minutes} minutes. Refreshes every 15s.</p>

      <h3>In the app</h3>
      {d.app.length ? (
        <div className="adm-scroll">
          <table className="adm-table">
            <thead><tr><th>Person</th><th>Where</th><th>On for</th><th>Drops seen</th><th>Joined</th><th>Money</th></tr></thead>
            <tbody>{pApp.rows.map((a) => (
              <tr key={a.user_id}>
                <td>
                  <Link href={`/admin/users/${a.user_id}`}>{a.name || a.user_id.slice(-6)}</Link>
                  {a.gender ? <small className="muted"> · {a.gender}</small> : null}
                  <div className="adm-chips">
                    {a.is_new ? <Badge tone="ok">new this week</Badge> : null}
                    {a.premium ? <Badge>premium</Badge> : null}
                    {a.admin ? <Badge tone="warn">admin</Badge> : null}
                  </div>
                </td>
                <td>{flag(a.cc)} {a.country || "Unknown"}{theirTime(a.tz) ? <><br /><small className="muted" title={a.tz || ""}>{theirTime(a.tz)} there</small></> : null}</td>
                <td>{onFor(a.since)}</td>
                <td>{a.drops_seen}</td>
                <td title={fmtDate(a.joined)}>{ago(a.joined)}</td>
                <td>{a.purchases ? <Badge tone="ok">paid ×{a.purchases}</Badge> : <span className="muted small">never paid</span>}<br /><small className="muted">{a.coins} coins</small></td>
              </tr>
            ))}</tbody>
          </table>
          {pApp.tools}
        </div>
      ) : <p className="adm-empty">Nobody in the app right now.</p>}

      <h3>On the website</h3>
      <p className="muted small">Anonymous: a browser, never linked to an account.</p>
      {d.web.length ? (
        <div className="adm-scroll">
          <table className="adm-table">
            <thead><tr><th>Visitor</th><th>Where</th><th>On for</th><th>This visit</th><th>Opened</th><th>Now on</th></tr></thead>
            <tbody>{pWeb.rows.map((w) => (
              <tr key={w.vid}>
                <td>
                  <button type="button" className="adm-linkbtn" onClick={() => onJourney(w.vid)}>#{w.vid.slice(0, 6)}</button>
                  <div className="adm-chips">
                    {w.signed_up ? <Badge tone="ok">signed up</Badge> : w.signed_in ? <Badge>member</Badge> : <Badge>guest</Badge>}
                    <Badge tone={w.returning ? undefined : "ok"}>{w.returning ? "returning" : "first visit"}</Badge>
                  </div>
                </td>
                <td>{flag(w.country)} {country(w.country)}<br /><small className="muted">{w.device} · {w.browser}{theirTime(w.tz) ? <> · <span title={w.tz || ""}>{theirTime(w.tz)} there</span></> : null}</small></td>
                <td>{onFor(w.since)}</td>
                <td>
                  {w.pages} page{w.pages === 1 ? "" : "s"}<br /><small className="muted">from {w.came_from || "direct"}</small>
                  {w.searches.length ? <><br /><small className="muted">searched: {w.searches.join(", ")}</small></> : null}
                </td>
                <td>{w.drops.length ? w.drops.map((x) => (
                  <div key={x.id}>
                    <button type="button" className="adm-linkbtn" onClick={() => onPick(`/drop/${x.id}`)}>{x.teaser}</button>
                    {x.mood ? <small className="muted"> · {x.mood}</small> : null}
                  </div>
                )) : <span className="muted small">no drops yet</span>}</td>
                <td><PageLink path={w.path} onPick={onPick} /></td>
              </tr>
            ))}</tbody>
          </table>
          {pWeb.tools}
        </div>
      ) : <p className="adm-empty">Nobody on the website right now.</p>}
    </div>
  );
}


/** The latest visitors in the range; click one to see their path through the site. */
export function RecentVisitors({ days, onJourney, onPick }: { days: number; onJourney: (vid: string) => void; onPick: (p: string) => void }) {
  const [rows, setRows] = useState<Visitor[] | null>(null);
  const pg = usePaged(rows || [], { text: (v) => v.vid });
  useEffect(() => {
    let live = true;
    const load = () => api<{ recent: Visitor[] }>(`/admin/visitors?days=${days}&tab=recent`).then((r) => { if (live) setRows(r.recent); }).catch(() => {});
    load();
    const t = window.setInterval(load, 30000);
    return () => { live = false; window.clearInterval(t); };
  }, [days]);
  return (
    <div className="adm-panel">
      <h3>Recent visitors</h3>
      {!rows ? <p className="muted small">Loading…</p> : rows.length ? (
        <div className="adm-scroll">
          <table className="adm-table">
            <thead><tr><th>Visitor</th><th>Where</th><th>Device</th><th>Came from</th><th>Pages</th><th>Visits</th><th>Last seen</th><th>Last page</th></tr></thead>
            <tbody>
              {pg.rows.map((v) => (
                <tr key={v.vid}>
                  <td>
                    <button type="button" className="adm-linkbtn" onClick={() => onJourney(v.vid)}>#{v.vid.slice(0, 6)}</button>
                    {v.signed_up ? <span className="adm-badge"> signed up</span> : v.signed_in ? <span className="adm-badge"> member</span> : null}
                  </td>
                  <td>{flag(v.country)} {country(v.country)}</td>
                  <td>{v.device} · {v.browser}</td>
                  <td>{v.first_ref || "direct"}<br /><small><PageLink path={v.first_path} onPick={onPick} /></small></td>
                  <td>{v.views}</td>
                  <td>{v.sessions}</td>
                  <td title={fmtDate(v.last_seen)}>{ago(v.last_seen)}</td>
                  <td><PageLink path={v.last_path} onPick={onPick} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {pg.tools}
        </div>
      ) : <p className="adm-empty">No visitors yet. They appear here as soon as someone opens the site.</p>}
    </div>
  );
}
