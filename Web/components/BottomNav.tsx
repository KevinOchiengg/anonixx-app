"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Door, Flame, Person, Plus, Requests } from "./icons";

type Tab = { href: string; label: string; Icon: (p: { filled?: boolean }) => React.ReactElement; match: (p: string, q: string) => boolean };

const TABS: (Tab | "create")[] = [
  { href: "/", label: "Desires", Icon: Flame, match: (p: string) => p === "/" || p.startsWith("/drop/") },
  { href: "/inbox", label: "Rooms", Icon: Door, match: (p: string, q: string) => (p.startsWith("/inbox") && !q.includes("tab=requests")) || p.startsWith("/chat") },
  "create",
  { href: "/inbox?tab=requests", label: "Requests", Icon: Requests, match: (p: string, q: string) => p.startsWith("/inbox") && q.includes("tab=requests") },
  { href: "/profile", label: "You", Icon: Person, match: (p: string) => p.startsWith("/settings") || p.startsWith("/profile") },
];

type Counts = { rooms?: number; messages?: number; unlock_requests?: number };

/** Badge counts for the nav: Rooms = unread messages + knocks + missed calls; Requests = knocks.
 * Checked on every page change, every 20s while the tab is visible, and when it comes back. */
function useBadges(signedIn: boolean, path: string) {
  const [c, setC] = useState<Counts>({});
  useEffect(() => {
    if (!signedIn) { setC({}); return; }
    let alive = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      let seen = "";
      try { seen = localStorage.getItem("rooms_calls_seen_at") || ""; } catch { /* private mode */ }
      api<Counts>(`/notifications/badge-counts${seen ? `?calls_seen=${encodeURIComponent(seen)}` : ""}`)
        .then((r) => { if (alive) setC(r); }).catch(() => {});
    };
    load();
    const t = window.setInterval(load, 20_000);
    document.addEventListener("visibilitychange", load);
    return () => { alive = false; window.clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, [signedIn, path]);
  return { "/inbox": c.rooms ?? c.messages ?? 0, "/inbox?tab=requests": c.unlock_requests ?? 0 } as Record<string, number>;
}

export default function BottomNav() {
  const path = usePathname() || "/";
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const badges = useBadges(Boolean(user), path + query);
  useEffect(() => { setQuery(window.location.search); }, [path]);

  return (
    <nav className="bottomnav" aria-label="Main">
      {TABS.map((t) => {
        if (t === "create") {
          return (
            <Link key="create" href="/compose" className="create" aria-label="Drop a confession">
              <span><Plus /></span>
            </Link>
          );
        }
        const on = t.match(path, query);
        const n = badges[t.href] || 0;
        return (
          <Link key={t.href} href={t.href} className={on ? "on" : ""} aria-label={n ? `${t.label}, ${n} new` : t.label}>
            <span className="bn-ic">
              {t.href === "/profile" && user ? (
                // Your own photo (or initial) on the You tab, ringed in coral when open.
                <span className="me-ava">
                  {user.avatar_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={user.avatar_url} alt="" />
                    : (user.anonymous_name || user.username || "Y").slice(0, 1).toUpperCase()}
                </span>
              ) : <t.Icon filled={on} />}
              {n ? <b className="bn-badge">{n > 99 ? "99+" : n}</b> : null}
            </span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
