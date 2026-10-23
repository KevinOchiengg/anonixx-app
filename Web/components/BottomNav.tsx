"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Door, Flame, Person, Plus, Requests } from "./icons";

type Tab = { href: string; label: string; Icon: (p: { filled?: boolean }) => React.ReactElement; match: (p: string, q: string) => boolean };

const TABS: (Tab | "create")[] = [
  { href: "/", label: "Desires", Icon: Flame, match: (p: string) => p === "/" || p.startsWith("/drop/") },
  { href: "/inbox", label: "Rooms", Icon: Door, match: (p: string, q: string) => (p.startsWith("/inbox") && !q.includes("tab=requests")) || p.startsWith("/chat") },
  "create",
  { href: "/inbox?tab=requests", label: "Requests", Icon: Requests, match: (p: string, q: string) => p.startsWith("/inbox") && q.includes("tab=requests") },
  { href: "/profile", label: "You", Icon: Person, match: (p: string) => p.startsWith("/settings") || p.startsWith("/profile") },
];

export default function BottomNav() {
  const path = usePathname() || "/";
  const [query, setQuery] = useState("");
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
        return (
          <Link key={t.href} href={t.href} className={on ? "on" : ""} aria-label={t.label}>
            <t.Icon filled={on} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
