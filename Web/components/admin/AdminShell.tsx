"use client";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  IcDash, IcPost, IcUsers, IcPosts, IcShield, IcRefund, IcChat, IcMegaphone, IcMusic, IcFlag,
  IcCalendar, IcKanban, IcMenu, IcBell, IcClose, IcHome,
} from "./adminicons";
import "../../app/admin.css";

const GROUPS: { title: string; items: { href: string; label: string; icon: React.ReactNode }[] }[] = [
  { title: "Dashboard", items: [{ href: "/admin", label: "Overview", icon: <IcDash /> }] },
  {
    title: "Create",
    items: [
      { href: "/admin/post", label: "Post a drop", icon: <IcPost /> },
      { href: "/admin/sounds", label: "Sounds", icon: <IcMusic /> },
    ],
  },
  {
    title: "Manage",
    items: [
      { href: "/admin/users", label: "Users", icon: <IcUsers /> },
      { href: "/admin/posts", label: "Posts", icon: <IcPosts /> },
      { href: "/admin/moderation", label: "Moderation", icon: <IcShield /> },
      { href: "/admin/refunds", label: "Refunds", icon: <IcRefund /> },
      { href: "/admin/support", label: "Support", icon: <IcChat /> },
      { href: "/admin/ads", label: "Ads", icon: <IcMegaphone /> },
      { href: "/admin/deception-reports", label: "Deception", icon: <IcFlag /> },
    ],
  },
  {
    title: "Apps",
    items: [
      { href: "/admin/kanban", label: "Refund board", icon: <IcKanban /> },
      { href: "/admin/calendar", label: "Calendar", icon: <IcCalendar /> },
    ],
  },
];

type Role = { isSuper: boolean };
const RoleCtx = createContext<Role>({ isSuper: false });
export const useAdminRole = () => useContext(RoleCtx);

type Alerts = { refunds: number; chats: number };
const THEME_KEY = "anonixx_adm_theme";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const path = usePathname() || "/admin";
  const [state, setState] = useState<"checking" | "ok" | "denied">("checking");
  const [isSuper, setIsSuper] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"" | "bell">("");
  const [alerts, setAlerts] = useState<Alerts>({ refunds: 0, chats: 0 });

  useEffect(() => {
    try {
      const t = JSON.parse(localStorage.getItem(THEME_KEY) || "{}");
      if (t.collapsed) setCollapsed(true);
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(THEME_KEY, JSON.stringify({ collapsed })); } catch {}
  }, [loaded, collapsed]);
  useEffect(() => { setOpen(false); setPanel(""); }, [path]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setState("denied"); return; }
    let live = true;
    api<{ is_super_admin: boolean }>("/admin/me")
      .then((r) => { if (live) { setIsSuper(Boolean(r.is_super_admin)); setState("ok"); } })
      .catch(() => { if (live) setState("denied"); });
    return () => { live = false; };
  }, [ready, user]);

  useEffect(() => {
    if (state !== "ok") return;
    let live = true;
    const load = () =>
      api<{ support: { open_conversations: number; pending_refunds: number } }>("/admin/stats")
        .then((s) => { if (live) setAlerts({ refunds: s.support.pending_refunds, chats: s.support.open_conversations }); })
        .catch(() => {});
    load();
    const t = window.setInterval(load, 30000);
    return () => { live = false; window.clearInterval(t); };
  }, [state]);

  if (state !== "ok") {
    return (
      <div className="adm">
        <div className="adm-card adm-gate">
          {state === "checking" ? (
            <p className="muted">Checking access…</p>
          ) : (
            <>
              <h2>Admins only</h2>
              <p className="muted">{user ? "This account doesn't have admin access." : "Sign in with an admin account."}</p>
              <Link href={user ? "/" : `/login?next=${encodeURIComponent(path)}`} className="adm-btn primary">
                {user ? "Back to Anonixx" : "Sign in"}
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  const total = alerts.refunds + alerts.chats;
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));
  const badge = (href: string) => (href === "/admin/refunds" || href === "/admin/kanban" ? alerts.refunds : href === "/admin/support" ? alerts.chats : 0);
  const initial = (user?.anonymous_name || user?.email || "A").charAt(0).toUpperCase();

  return (
    <RoleCtx.Provider value={{ isSuper }}>
      <div className="adm" data-collapsed={collapsed ? "1" : "0"} data-open={open ? "1" : "0"}>
        <div className="adm-backdrop" onClick={() => setOpen(false)} />
        <aside className="adm-side">
          <div className="adm-sidehead">
            <Link href="/admin" className="adm-brand"><span className="mark">A</span><span className="word">Anonixx</span></Link>
            <button type="button" className="adm-iconbtn adm-only-mobile" onClick={() => setOpen(false)} aria-label="Close menu"><IcClose /></button>
          </div>
          <nav className="adm-sidenav" aria-label="Admin">
            {GROUPS.map((g) => (
              <div key={g.title} className="adm-group">
                <div className="adm-grouptitle">{g.title}</div>
                {g.items.map((n) => {
                  const b = badge(n.href);
                  return (
                    <Link key={n.href} href={n.href} className={active(n.href) ? "on" : ""} title={n.label}>
                      <span className="ic">{n.icon}</span>
                      <span className="lb">{n.label}</span>
                      {b > 0 ? <span className="bd">{b}</span> : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <Link href="/" className="adm-sidefoot" title="Back to Anonixx"><span className="ic"><IcHome /></span><span className="lb">Back to Anonixx</span></Link>
        </aside>

        <div className="adm-wrap">
          <header className="adm-top">
            <button
              type="button"
              className="adm-iconbtn"
              aria-label="Toggle menu"
              onClick={() => (window.matchMedia("(min-width: 900px)").matches ? setCollapsed((c) => !c) : setOpen(true))}
            ><IcMenu /></button>
            <div className="adm-spacer" />
            <div className="adm-pop">
              <button type="button" className="adm-iconbtn" aria-label="Alerts" onClick={() => setPanel(panel === "bell" ? "" : "bell")}>
                <IcBell />{total > 0 ? <span className="dot">{total > 9 ? "9+" : total}</span> : null}
              </button>
              {panel === "bell" ? (
                <div className="adm-menu">
                  <b>Needs attention</b>
                  <Link href="/admin/refunds"><span>Pending refunds</span><em>{alerts.refunds}</em></Link>
                  <Link href="/admin/support"><span>Unread chats</span><em>{alerts.chats}</em></Link>
                </div>
              ) : null}
            </div>
            <span className="adm-role">{isSuper ? "Super admin" : "Admin"}</span>
            <span className="adm-avatar" aria-hidden>{initial}</span>
          </header>
          <main className="adm-main">{children}</main>
        </div>

      </div>
    </RoleCtx.Provider>
  );
}
