"use client";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  IcDash, IcPost, IcUsers, IcPosts, IcShield, IcRefund, IcChat, IcMegaphone, IcMusic, IcFlag,
  IcCalendar, IcKanban, IcMenu, IcBell, IcClose, IcHome, IcEye, IcTrendUp, IcCoin, IcPulse, IcBot, IcList,
} from "./adminicons";
import "../../app/admin.css";

// `scope` = what the admin's role must cover (Backend/app/dependencies.py ADMIN_ROLES);
// superOnly = super admin only. Items an admin can't use are hidden.
type NavItem = { href: string; label: string; icon: React.ReactNode; superOnly?: boolean; scope?: string };
const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Dashboard",
    items: [
      { href: "/admin", label: "Overview", icon: <IcDash /> },
      { href: "/admin/visitors", label: "Visitors", icon: <IcEye />, superOnly: true },
      { href: "/admin/growth", label: "Growth", icon: <IcTrendUp />, scope: "growth" },
      { href: "/admin/money", label: "Money", icon: <IcCoin />, scope: "finance" },
      { href: "/admin/alerts", label: "Alerts", icon: <IcBell /> },
    ],
  },
  {
    title: "Create",
    items: [
      { href: "/admin/post", label: "Post a drop", icon: <IcPost />, scope: "content" },
      { href: "/admin/agents", label: "Agent hub", icon: <IcBot />, scope: "content" },
      { href: "/admin/sounds", label: "Sounds", icon: <IcMusic />, scope: "content" },
    ],
  },
  {
    title: "Manage",
    items: [
      { href: "/admin/users", label: "Users", icon: <IcUsers /> },
      { href: "/admin/posts", label: "Posts", icon: <IcPosts /> },
      { href: "/admin/moderation", label: "Moderation", icon: <IcShield />, scope: "moderation" },
      { href: "/admin/refunds", label: "Refunds", icon: <IcRefund />, scope: "finance" },
      { href: "/admin/support", label: "Support", icon: <IcChat />, scope: "support" },
      { href: "/admin/ads", label: "Ads", icon: <IcMegaphone />, scope: "content" },
      { href: "/admin/deception-reports", label: "Deception", icon: <IcFlag />, scope: "moderation" },
    ],
  },
  {
    title: "Apps",
    items: [
      { href: "/admin/kanban", label: "Refund board", icon: <IcKanban />, scope: "finance" },
      { href: "/admin/calendar", label: "Calendar", icon: <IcCalendar />, scope: "content" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/admin/health", label: "Health", icon: <IcPulse />, scope: "system" },
      { href: "/admin/audit", label: "Activity log", icon: <IcList />, superOnly: true },
    ],
  },
];

type Role = { isSuper: boolean };
const RoleCtx = createContext<Role>({ isSuper: false });
export const useAdminRole = () => useContext(RoleCtx);

type Alerts = { refunds: number; chats: number; system: number };
const THEME_KEY = "anonixx_adm_theme";

const GATE_LINES = [
  "checking you're one of us…",
  "lowering the lights…",
  "nobody sees this side of anonixx…",
  "unlocking the back room…",
];

// Shown while /admin/me answers: the brand mark under a sweeping scanner ring.
function GateLoader() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % GATE_LINES.length), 1800);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="adm-load" role="status" aria-label="Checking admin access">
      <div className="adm-load-orb" aria-hidden>
        <span className="ripple" />
        <span className="ripple" />
        <span className="sweep" />
        <span className="mark">A</span>
      </div>
      <p key={i} className="adm-load-line" aria-hidden>{GATE_LINES[i]}</p>
      <span className="adm-load-bar" aria-hidden />
    </div>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const path = usePathname() || "/admin";
  const [state, setState] = useState<"checking" | "ok" | "denied">("checking");
  const [isSuper, setIsSuper] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"" | "bell">("");
  const [alerts, setAlerts] = useState<Alerts>({ refunds: 0, chats: 0, system: 0 });
  const [scopes, setScopes] = useState<string[]>(["*"]);
  const can = (n: NavItem) => (n.superOnly ? isSuper : !n.scope || scopes.includes("*") || scopes.includes(n.scope));

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
        .then((s) => { if (live) setAlerts((a) => ({ ...a, refunds: s.support.pending_refunds, chats: s.support.open_conversations })); })
        .catch(() => {});
    load();
    const t = window.setInterval(load, 30000);
    return () => { live = false; window.clearInterval(t); };
  }, [state]);

  useEffect(() => {
    if (state !== "ok") return;
    let live = true;
    api<{ scopes: string[] }>("/admin/me/scopes").then((r) => { if (live) setScopes(r.scopes); }).catch(() => {});
    const loadAlerts = () => api<{ open: number }>("/admin/alerts").then((r) => { if (live) setAlerts((a) => ({ ...a, system: r.open })); }).catch(() => {});
    loadAlerts();
    const t = window.setInterval(loadAlerts, 60000);
    return () => { live = false; window.clearInterval(t); };
  }, [state]);

  if (state === "checking") return <div className="adm"><GateLoader /></div>;
  if (state !== "ok") {
    return (
      <div className="adm">
        <div className="adm-card adm-gate">
          <h2>Admins only</h2>
          <p className="muted">{user ? "This account doesn't have admin access." : "Sign in with an admin account."}</p>
          <Link href={user ? "/" : `/login?next=${encodeURIComponent(path)}`} className="adm-btn primary">
            {user ? "Back to Anonixx" : "Sign in"}
          </Link>
        </div>
      </div>
    );
  }

  const total = alerts.refunds + alerts.chats + alerts.system;
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
            {GROUPS.filter((g) => g.items.some(can)).map((g) => (
              <div key={g.title} className="adm-group">
                <div className="adm-grouptitle">{g.title}</div>
                {g.items.filter(can).map((n) => {
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
                  <Link href="/admin/alerts"><span>System alerts</span><em>{alerts.system}</em></Link>
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
