"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/admin/bits";

type Draft = {
  index: number; path: string; title: string; status: string; type: string | null; suggested_time: string | null;
  confession: string; poll_options: string[]; teaser: string | null; why: string | null; scheduled_id: string | null; error: string | null;
};
type Agent = { folder: string; agent: string; latest: string; count: number; recent: string[] };
type Hub = { configured: boolean; repo: string; agents: Agent[]; drafts: Draft[]; decided?: Draft[] };

const dateOf = (path: string) => (path.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || path.split("/").pop();

export default function AgentsPage() {
  const [hub, setHub] = useState<Hub | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<{ path: string; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(() => api<Hub>("/admin/agents").then(setHub).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => { load(); }, [load]);

  const read = (path: string) => {
    setOpen({ path, text: "Loading…" });
    api<{ text: string }>(`/admin/agents/file?path=${encodeURIComponent(path)}`).then((r) => setOpen({ path, text: r.text })).catch((e) => setOpen({ path, text: (e as Error).message }));
  };

  async function decide(d: Draft, decision: "approve" | "reject") {
    const key = `${d.path}#${d.title}`;
    setBusy(key); setErr(""); setNote("");
    try {
      const r = await api<{ status: string; scheduled_id: string | null; note: string | null }>("/admin/agents/decide", { body: { path: d.path, title: d.title, decision } });
      setNote(r.note || (decision === "approve" ? `“${d.title}” is scheduled. It'll post as Anonixx${d.suggested_time ? ` at ${d.suggested_time}` : " in about 10 minutes"}.` : `“${d.title}” rejected.`));
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  }

  if (hub && !hub.configured) {
    return (
      <>
        <div className="adm-pagehead"><div><h2>Agent hub</h2><p>Your agent team's reports, and one-click approval for their drafts.</p></div></div>
        <div className="adm-panel">
          <h3>Connect GitHub to switch this on</h3>
          <p className="muted">The agents write their reports into the repo ({hub.repo}). The dashboard needs permission to read them and save your decisions.</p>
          <ol className="small">
            <li>On GitHub: Settings → Developer settings → Fine-grained tokens → Generate new token.</li>
            <li>Repository access: only <b>{hub.repo}</b>. Permissions: <b>Contents: Read and write</b>.</li>
            <li>On Render: the anonixx-api service → Environment → add <code>GITHUB_TOKEN</code> with that token, then save (it redeploys).</li>
          </ol>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="adm-pagehead"><div><h2>Agent hub</h2><p>What your agents found, and their drafts waiting for a yes or no. Approving schedules the drop as Anonixx.</p></div></div>
      {err ? <p className="err">{err}</p> : null}
      {note ? <p className="ok">{note}</p> : null}
      {!hub ? <p className="muted small">Loading…</p> : (
        <div className="adm-dash">
          <div className="adm-panel w7">
            <h3>Drafts waiting for you <Badge>{hub.drafts.length}</Badge></h3>
            {hub.drafts.length === 0 ? <p className="adm-empty">Nothing waiting. The content scout drafts new drops every Tuesday.</p> : hub.drafts.map((d) => {
              const key = `${d.path}#${d.title}`;
              return (
                <div key={key} className="adm-card">
                  <div className="adm-chips"><b>{d.title}</b>{d.type ? <Badge>{d.type}</Badge> : null}<span className="muted small">{d.suggested_time || "no time set"}</span></div>
                  <p className="adm-text">{d.confession}</p>
                  {d.poll_options.length ? <ul className="small">{d.poll_options.map((o) => <li key={o}>{o}</li>)}</ul> : null}
                  {d.teaser ? <p className="muted small"><b>Social caption:</b> {d.teaser}</p> : null}
                  {d.why ? <p className="muted small"><b>Why:</b> {d.why}</p> : null}
                  <div className="adm-actions">
                    <button type="button" className="adm-btn danger" disabled={busy === key} onClick={() => decide(d, "reject")}>Reject</button>
                    <button type="button" className="adm-btn primary" disabled={busy === key} onClick={() => decide(d, "approve")}>{busy === key ? "Working…" : "Approve & schedule"}</button>
                  </div>
                </div>
              );
            })}
            {hub.decided?.length ? (
              <>
                <h3>Recently decided</h3>
                <ul className="adm-bars">{hub.decided.map((d) => <li key={`${d.path}#${d.title}`}><span>{d.title}</span><Badge tone={d.status === "rejected" ? "bad" : "ok"}>{d.status}</Badge></li>)}</ul>
              </>
            ) : null}
          </div>
          <div className="adm-panel w5">
            <h3>Latest reports</h3>
            {hub.agents.length === 0 ? <p className="adm-empty">No reports yet.</p> : hub.agents.map((a) => (
              <div key={a.folder} className="adm-check">
                <span className="dot" />
                <span style={{ flex: 1 }}>
                  <b>{a.agent}</b> <span className="muted small">· {a.count} report{a.count === 1 ? "" : "s"}</span><br />
                  {a.recent.slice(0, 3).map((p) => <button key={p} type="button" className="adm-linkbtn small" style={{ marginRight: 10 }} onClick={() => read(p)}>{dateOf(p)}</button>)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {open ? (
        <div className="adm-modal" onClick={() => setOpen(null)}>
          <div className="adm-pagedetail" onClick={(e) => e.stopPropagation()}>
            <div className="adm-panel-head"><h3 className="adm-clip">{open.path}</h3><button type="button" className="adm-btn" onClick={() => setOpen(null)}>Close</button></div>
            <pre className="adm-md">{open.text}</pre>
          </div>
        </div>
      ) : null}
    </>
  );
}
