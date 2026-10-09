"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAdminRole } from "@/components/admin/AdminShell";
import { Badge, Pager, fmtDate } from "@/components/admin/bits";

type U = {
  id: string; email: string | null; username: string | null; anonymous_name: string | null;
  is_active: boolean; is_admin: boolean; is_super_admin: boolean; is_verified: boolean; is_premium: boolean;
  coin_balance: number; created_at: string | null; last_login: string | null;
};
type Page = { total: number; skip: number; limit: number; users: U[] };
const LIMIT = 20;

export default function AdminUsers() {
  const { isSuper } = useAdminRole();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ skip: String(skip), limit: String(LIMIT) });
      if (search) p.set("search", search);
      setData(await api<Page>(`/admin/users?${p}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [skip, search]);

  useEffect(() => { load(); }, [load]);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setError("");
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  const toggle = (u: U, path: "ban" | "verify" | "admin") => run(u.id, () => api(`/admin/users/${u.id}/${path}`, { method: "PATCH" }));

  const remove = (u: U) => {
    if (!window.confirm(`Permanently delete ${u.anonymous_name || u.email}? This removes their posts and cannot be undone.`)) return;
    run(u.id, () => api(`/admin/users/${u.id}`, { method: "DELETE" }));
  };

  const coins = (u: U) => {
    const raw = window.prompt(`Coins to add (negative to remove). Balance: ${u.coin_balance}`);
    if (!raw) return;
    const amount = parseInt(raw, 10);
    if (!amount) { setError("Enter a whole number that isn't zero."); return; }
    const reason = (window.prompt("Reason (shown in their history)") || "").trim();
    if (!reason) { setError("A reason is required."); return; }
    run(u.id, () => api(`/admin/users/${u.id}/coins`, { body: { amount, reason } }));
  };

  return (
    <>
      <h2>Users</h2>
      <form className="adm-search" onSubmit={(e) => { e.preventDefault(); setSkip(0); setSearch(q.trim()); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email, username or anonymous name" />
        <button className="adm-btn primary">Search</button>
      </form>
      {error ? <p className="err">{error}</p> : null}
      {!data ? <p className="muted">Loading…</p> : data.users.length === 0 ? <p className="muted">No users found.</p> : (
        <div className="adm-scroll">
          <table className="adm-table">
            <thead>
              <tr><th>User</th><th>Status</th><th>Coins</th><th>Joined</th><th>Last login</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.anonymous_name || u.username || "—"}</b>
                    <div className="muted small">{u.email}</div>
                  </td>
                  <td className="adm-chips">
                    {!u.is_active ? <Badge tone="bad">banned</Badge> : null}
                    {u.is_super_admin ? <Badge tone="warn">super admin</Badge> : u.is_admin ? <Badge tone="warn">admin</Badge> : null}
                    {u.is_verified ? <Badge tone="ok">verified</Badge> : null}
                    {u.is_premium ? <Badge>premium</Badge> : null}
                  </td>
                  <td>{u.coin_balance}</td>
                  <td className="small">{fmtDate(u.created_at)}</td>
                  <td className="small">{fmtDate(u.last_login)}</td>
                  <td>
                    <div className="adm-actions">
                      <button className="adm-btn" disabled={busy === u.id} onClick={() => toggle(u, "ban")}>{u.is_active ? "Ban" : "Unban"}</button>
                      <button className="adm-btn" disabled={busy === u.id} onClick={() => toggle(u, "verify")}>{u.is_verified ? "Unverify" : "Verify"}</button>
                      {isSuper ? (
                        <>
                          <button className="adm-btn" disabled={busy === u.id} onClick={() => coins(u)}>Coins</button>
                          <button className="adm-btn" disabled={busy === u.id} onClick={() => toggle(u, "admin")}>{u.is_admin ? "Remove admin" : "Make admin"}</button>
                          <button className="adm-btn danger" disabled={busy === u.id} onClick={() => remove(u)}>Delete</button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data ? <Pager skip={data.skip} limit={data.limit} total={data.total} onSkip={setSkip} /> : null}
    </>
  );
}
