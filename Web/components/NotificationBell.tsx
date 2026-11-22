"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { ACTIVITY_READ_EVENT, activityApi } from "@/lib/activity";

const POLL_MS = 30_000;

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      activityApi.unread().then((r) => { if (alive) setUnread(r.unread); }).catch(() => {});
    };
    const clear = () => setUnread(0);
    load();
    const t = window.setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    window.addEventListener(ACTIVITY_READ_EVENT, clear);
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener(ACTIVITY_READ_EVENT, clear);
    };
  }, []);

  return (
    <Link href="/activity" className="hbtn bell" aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}>
      <Bell strokeWidth={2} aria-hidden />
      {unread ? <b className="bell-badge">{unread > 99 ? "99+" : unread}</b> : null}
    </Link>
  );
}
