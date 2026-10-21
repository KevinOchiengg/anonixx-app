"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Item = {
  id: string; status: string; publish_at: string; display_name: string | null; confession: string;
  media_type: string | null; thumb: string | null; promo_kind: string | null; drop_id: string | null; error: string | null;
};

// datetime-local wants "YYYY-MM-DDTHH:mm" in the viewer's own time zone.
export function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// Drops queued in the Post Studio, waiting for their time. `refresh` bumps when a new one is added.
export default function ScheduledDrops({ refresh }: { refresh: number }) {
  const [items, setItems] = useState<{ upcoming: Item[]; recent: Item[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [moving, setMoving] = useState<{ id: string; at: string } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    // A failed background load just hides the panel; only failed actions show an error.
    try { setItems(await api("/admin/scheduled")); } catch { setItems(null); }
  }, []);
  useEffect(() => { load(); }, [load, refresh]);

  async function act(id: string, run: () => Promise<unknown>) {
    setBusy(id);
    try { await run(); setMoving(null); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }

  if (!items || (!items.upcoming.length && !items.recent.some((r) => r.status === "failed"))) return error ? <p className="ps-sched-err">{error}</p> : null;
  const failed = items.recent.filter((r) => r.status === "failed");

  return (
    <section className="ps-sec ps-sched">
      <h3>Coming up <em>{items.upcoming.length}</em></h3>
      {error ? <p className="ps-sched-err">{error}</p> : null}
      {[...items.upcoming, ...failed].map((s) => (
        <div key={s.id} className={`ps-sched-row${s.status === "failed" ? " bad" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.thumb ? <img src={s.thumb} alt="" /> : <span className="ph">{(s.media_type || "text").slice(0, 1).toUpperCase()}</span>}
          <div className="txt">
            <b>{s.status === "failed" ? "Didn't publish" : when(s.publish_at)}{s.promo_kind ? <i>{s.promo_kind}</i> : null}</b>
            <span>{s.status === "failed" ? s.error : s.confession || `[${s.media_type || "post"}]`}</span>
            <small>as {s.display_name || "Anonixx"}</small>
          </div>
          {moving?.id === s.id ? (
            <div className="acts">
              <input type="datetime-local" value={moving.at} min={toLocalInput(new Date(Date.now() + 120000))} onChange={(e) => setMoving({ id: s.id, at: e.target.value })} />
              <button type="button" className="ps-btn" onClick={() => setMoving(null)}>Cancel</button>
              <button type="button" className="ps-btn primary" disabled={busy === s.id || !moving.at}
                onClick={() => act(s.id, () => api(`/admin/scheduled/${s.id}`, { method: "PATCH", body: { publish_at: new Date(moving.at).toISOString() } }))}>Save</button>
            </div>
          ) : (
            <div className="acts">
              {s.status === "pending" ? (
                <>
                  <button type="button" className="ps-btn" disabled={busy === s.id} onClick={() => setMoving({ id: s.id, at: toLocalInput(new Date(s.publish_at)) })}>Move</button>
                  <button type="button" className="ps-btn" disabled={busy === s.id} onClick={() => act(s.id, () => api(`/admin/scheduled/${s.id}/publish-now`, { method: "POST" }))}>Post now</button>
                </>
              ) : null}
              <button type="button" className="ps-btn danger" disabled={busy === s.id || s.status === "publishing"}
                onClick={() => window.confirm("Cancel this scheduled drop?") && act(s.id, () => api(`/admin/scheduled/${s.id}`, { method: "DELETE" }))}>
                {s.status === "failed" ? "Dismiss" : "Cancel"}
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
