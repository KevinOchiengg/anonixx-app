"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Inbox, Plus, User } from "./icons";

const TABS = [
  { href: "/", label: "Home", Icon: Home, accent: false },
  { href: "/compose", label: "Drop", Icon: Plus, accent: true },
  { href: "/inbox", label: "Inbox", Icon: Inbox, accent: false },
  { href: "/settings", label: "Me", Icon: User, accent: false },
];

export default function BottomNav() {
  const path = usePathname() || "/";
  return (
    <nav className="bottomnav" aria-label="Main">
      {TABS.map(({ href, label, Icon, accent }) => {
        const on = href === "/" ? path === "/" || path.startsWith("/drop/") : path.startsWith(href);
        return (
          <Link key={href} href={href} className={`${on ? "on" : ""}${accent ? " accent" : ""}`} aria-label={label}>
            <Icon />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
