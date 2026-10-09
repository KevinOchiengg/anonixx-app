"use client";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import "../../app/admin.css";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/posts", label: "Posts" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/refunds", label: "Refunds" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/ads", label: "Ads" },
  { href: "/admin/deception-reports", label: "Deception" },
];

type Role = { isSuper: boolean };
const RoleCtx = createContext<Role>({ isSuper: false });
export const useAdminRole = () => useContext(RoleCtx);

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const path = usePathname() || "/admin";
  const [state, setState] = useState<"checking" | "ok" | "denied">("checking");
  const [isSuper, setIsSuper] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setState("denied"); return; }
    let live = true;
    api<{ is_super_admin: boolean }>("/admin/me")
      .then((r) => { if (live) { setIsSuper(Boolean(r.is_super_admin)); setState("ok"); } })
      .catch(() => { if (live) setState("denied"); });
    return () => { live = false; };
  }, [ready, user]);

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

  return (
    <RoleCtx.Provider value={{ isSuper }}>
      <div className="adm">
        <header className="adm-top">
          <Link href="/" className="adm-brand">Anonixx</Link>
          <span className="adm-role">{isSuper ? "Super admin" : "Admin"}</span>
        </header>
        <nav className="adm-nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href ? "on" : ""}>{n.label}</Link>
          ))}
        </nav>
        <main className="adm-main">{children}</main>
      </div>
    </RoleCtx.Provider>
  );
}
