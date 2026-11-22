"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAdminRole } from "./AdminShell";
import { fmtDate } from "./bits";
import { askConfirm } from "@/lib/confirm";

// Everything waiting on an admin, in one list, with the common decision right on the row.
type Act = { label: string; tone?: "primary" | "danger"; confirm?: string; run: () => Promise<unknown> };
type Item = { key: string; kind: string; title: string; sub: string; at: string | null; href: string; acts: Act[] };

const get = <T,>(path: string) => api<T>(path).catch(() => null);
const clip = (s: string | null | undefined, n = 90) => (!s ? "" : s.length > n ? `${s.slice(0, n)}…` : s);

export default function Inbox() {
  const { isSuper } = useAdminRole();
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [ref, mod, dec, sup, al] = await Promise.all([
      get<{ refunds: { id: string; coins: number | null; reason: string | null; user_name: string | null; created_at: string | null }[] }>("/admin/refunds?status=pending&skip=0&limit=5"),
      get<{ drops: { id: string; confession: string; report_count: number; flagged_at: string | null }[] }>("/admin/moderation-queue?skip=0&limit=5"),
      get<{ reports: { id: string; confession: string; sender_name: string; created_at: string }[] }>("/deception-reports?status=pending&skip=0&limit=5"),
      get<{ conversations: { user_id: string; name: string; last_text: string; last_at: string | null; unread: number }[] }>("/admin/support/conversations?limit=100"),
      get<{ alerts: { id: string; title: string; body: string; link: string | null; created_at: string | null }[] }>("/admin/alerts"),
    ]);
    const out: Item[] = [];
    al?.alerts.forEach((a) => out.push({
      key: `a${a.id}`, kind: "Alert", title: a.title, sub: clip(a.body), at: a.created_at, href: a.link || "/admin/alerts",
      acts: [{ label: "Handled", tone: "primary", run: () => api(`/admin/alerts/${a.id}/dismiss`, { method: "POST" }) }],
    }));
    ref?.refunds.forEach((r) => out.push({
      key: `r${r.id}`, kind: "Refund", title: `${r.coins} coins · ${r.user_name || "User"}`, sub: clip(r.reason), at: r.created_at, href: "/admin/refunds",
      acts: isSuper ? [
        { label: "Reject", confirm: "Reject this refund request?", run: () => api(`/admin/refunds/${r.id}/reject`, { body: {} }) },
        { label: "Accept", tone: "primary", confirm: `Removes up to ${r.coins} coins and tells them the money is coming back. You still send the money yourself. Continue?`, run: () => api(`/admin/refunds/${r.id}/accept`, { body: {} }) },
      ] : [],
    }));
    mod?.drops.forEach((d) => out.push({
      key: `m${d.id}`, kind: "Flagged", title: clip(d.confession, 70) || "[no text]", sub: `${d.report_count} report${d.report_count === 1 ? "" : "s"}`, at: d.flagged_at, href: "/admin/moderation",
      acts: [
        { label: "Dismiss", run: () => api(`/admin/drops/${d.id}/dismiss`, { method: "PATCH" }) },
        { label: "Delete", tone: "danger", confirm: "Delete this post for everyone? This cannot be undone.", run: () => api(`/admin/drops/${d.id}`, { method: "DELETE" }) },
      ],
    }));
    dec?.reports.forEach((r) => out.push({
      key: `d${r.id}`, kind: "Deception", title: r.sender_name, sub: clip(r.confession), at: r.created_at, href: "/admin/moderation?tab=deception",
      acts: [
        { label: "Dismiss", run: () => api(`/deception-reports/${r.id}/dismiss`, { method: "POST" }) },
        { label: "Confirm", tone: "danger", confirm: `Confirm as deceptive? The reporter is refunded and ${r.sender_name} gets a strike.`, run: () => api(`/deception-reports/${r.id}/confirm`, { method: "POST" }) },
      ],
    }));
    sup?.conversations.filter((c) => c.unread > 0).forEach((c) => out.push({
      key: `s${c.user_id}`, kind: "Support", title: `${c.name} · ${c.unread} unread`, sub: clip(c.last_text), at: c.last_at, href: "/admin/support", acts: [],
    }));
    out.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    setItems(out);
  }, [isSuper]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30000);
    return () => window.clearInterval(t);
  }, [load]);

  async function run(it: Item, a: Act) {
    if (a.confirm && !(await askConfirm({ title: a.confirm, confirmLabel: a.label, tone: a.tone === "danger" ? "danger" : "default", icon: a.tone === "danger" ? "delete" : "info" }))) return;
    setBusy(it.key);
    try { await a.run(); setError(""); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-head"><h3>Needs you now</h3>{items?.length ? <span className="adm-badge">{items.length}</span> : null}</div>
      {error ? <p className="err">{error}</p> : null}
      {!items ? <p className="muted small">Loading…</p> : items.length === 0 ? <p className="adm-empty">All clear. Nothing is waiting on you.</p> : (
        <ul className="adm-feed adm-inbox">
          {items.map((it) => (
            <li key={it.key}>
              <span className="adm-badge">{it.kind}</span>
              <Link href={it.href} className="wh"><b>{it.title}</b><small>{it.sub ? `${it.sub} · ` : ""}{fmtDate(it.at)}</small></Link>
              {it.acts.length ? (
                <span className="adm-actions">
                  {it.acts.map((a) => <button key={a.label} type="button" className={`adm-btn${a.tone ? ` ${a.tone}` : ""}`} disabled={busy === it.key} onClick={() => run(it, a)}>{a.label}</button>)}
                </span>
              ) : <Link href={it.href} className="adm-btn">Open</Link>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
