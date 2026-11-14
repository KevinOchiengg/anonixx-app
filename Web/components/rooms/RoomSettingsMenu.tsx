"use client";
/** The Room's ⋮ menu: one entry point to every Room setting, grouped. Each row opens
 * /chat-setup on the matching tab, so there's still only one settings page. */
import Link from "next/link";
import Sheet from "../Sheet";
import { ChevronRight } from "lucide-react";

export const ROOM_SETTINGS: { tab: string; title: string; hint: string }[] = [
  { tab: "room", title: "Personalize Room", hint: "Picture, theme, fonts" },
  { tab: "welcome", title: "Welcome experience", hint: "The note they read when you let them in" },
  { tab: "inside", title: "Connections and visitors", hint: "Who's inside, remove, block, report, history" },
  { tab: "calls", title: "Calls and group sessions", hint: "Who can call you, group room size" },
  { tab: "knocks", title: "Knocks and coins", hint: "Waiting knocks, what a Let In costs them" },
  { tab: "privacy", title: "Privacy and safety", hint: "Who sees what, who can knock, where you show up" },
  { tab: "notifications", title: "Notifications", hint: "Knocks, messages, calls, quiet hours" },
];

export default function RoomSettingsMenu({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Room settings" onClose={onClose}>
      <nav className="rsm" aria-label="Room settings">
        {ROOM_SETTINGS.map((s) => (
          <Link key={s.tab} href={`/chat-setup?tab=${s.tab}`} className="rsm-row" onClick={onClose}>
            <span><b>{s.title}</b><small>{s.hint}</small></span>
            <i aria-hidden><ChevronRight size={18} strokeWidth={2} aria-hidden /></i>
          </Link>
        ))}
        <Link href="/coins" className="rsm-row" onClick={onClose}>
          <span><b>Coin history</b><small>Your wallet and every transaction</small></span>
          <i aria-hidden><ChevronRight size={18} strokeWidth={2} aria-hidden /></i>
        </Link>
      </nav>
    </Sheet>
  );
}
