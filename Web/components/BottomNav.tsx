"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Activity, Door, Flame, Lives, Plus } from "./icons";
import { ACTIVITY_READ_EVENT } from "@/lib/activity";

type Tab = { href: string; label: string; Icon: (p: { filled?: boolean }) => React.ReactElement; match: (p: string, q: string) => boolean };

const TABS: (Tab | "create")[] = [
  { href: "/", label: "Desires", Icon: Flame, match: (p: string) => p === "/" || p.startsWith("/drop/") },
  { href: "/inbox", label: "Rooms", Icon: Door, match: (p: string) => p.startsWith("/inbox") || p.startsWith("/chat") },
  "create",
  { href: "/lives", label: "Lives", Icon: Lives, match: (p: string) => p.startsWith("/lives") },
  { href: "/activity", label: "Activity", Icon: Activity, match: (p: string) => p.startsWith("/activity") },
];

type Counts = { rooms?: number; messages?: number; unlock_requests?: number; activity?: number };

/** Badge counts for the nav: Rooms = unread messages + knocks + missed calls; Activity = unread notifications.
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
    const read = () => setC((cur) => ({ ...cur, activity: 0 }));
    load();
    const t = window.setInterval(load, 20_000);
    document.addEventListener("visibilitychange", load);
    window.addEventListener(ACTIVITY_READ_EVENT, read);
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener(ACTIVITY_READ_EVENT, read);
    };
  }, [signedIn, path]);
  return { "/inbox": c.rooms ?? c.messages ?? 0, "/activity": c.activity ?? 0 } as Record<string, number>;
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
              <t.Icon filled={on} />
              {n ? <b className="bn-badge">{n > 99 ? "99+" : n}</b> : null}
            </span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
