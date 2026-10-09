"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import BottomNav from "./BottomNav";

export default function AppShell({
  title,
  back,
  right,
  children,
}: {
  title: string;
  back?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user, ready } = useAuth();
  const path = usePathname() || "/";

  return (
    <div className="stage">
      <div className="phone hasnav">
        <header className="apphead">
          {back ? <Link href={back} className="back" aria-label="Back">←</Link> : <span />}
          <h1>{title}</h1>
          <span className="apphead-right">{right}</span>
        </header>
        <div className="pagebody">
          {!ready ? (
            <p className="muted center">Loading…</p>
          ) : !user ? (
            <div className="empty">
              <h2>Sign in to continue</h2>
              <p>It takes a minute and your name stays hidden.</p>
              <div className="row">
                <Link href={`/login?next=${encodeURIComponent(path)}`} className="pill">Sign in</Link>
                <Link href={`/signup?next=${encodeURIComponent(path)}`} className="pill ghost">Join free</Link>
              </div>
            </div>
          ) : (
            children
          )}
        </div>
        <BottomNav />
      </div>
    </div>
  );
}
