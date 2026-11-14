// Room chats: messenger features (drops.py) and the call log (drop_calls.py). Same as the app's services/chats.js.
import { api } from "./api";
import type { Person } from "./calls";

export type Chat = {
  id: string;
  confession: string | null;
  other_anonymous_name: string;
  other_avatar_url?: string | null;
  other_user_id?: string;
  other_is_online: boolean;
  unread_count: number;
  last_message: string | null;
  last_message_type?: string | null;
  last_message_deleted?: boolean;
  last_message_at: string | null;
  last_message_is_own?: boolean;
  last_message_seen?: boolean;
  is_sender?: boolean;
  pinned?: boolean;
  archived?: boolean;
  muted_until?: string | null;
};
export type Prefs = { pinned: boolean; pinned_at: string | null; archived: boolean; muted_until: string | null };
export type ThreadItem = {
  id: string; connection_id: string; content: string; media_url: string | null; media_type: string | null;
  duration_seconds?: number | null; is_own: boolean; preview: string; created_at: string;
  other_anonymous_name?: string; links?: string[];
};
export type CallLog = {
  id: string; kind: "direct" | "group"; video: boolean; status: string;
  direction: "incoming" | "outgoing" | "hosted" | "joined"; missed: boolean; started_at: string;
  duration_seconds: number | null; connection_id?: string | null; guest_count?: number | null; other: Person | null;
};

export const chatsApi = {
  list: () => api<{ connections: Chat[] }>("/drops/connections"),
  prefs: (cid: string, body: { pinned?: boolean; archived?: boolean; mute?: string }) => api<Prefs>(`/drops/connections/${cid}/prefs`, { body }),
  clear: (cid: string) => api(`/drops/connections/${cid}/clear`, { method: "POST" }),
  media: (cid: string, kind: "media" | "voice" | "links") =>
    api<{ items: ThreadItem[]; counts: { media: number; voice: number; links: number } }>(`/drops/connections/${cid}/media?kind=${kind}`),
  callHistory: () => api<{ calls: CallLog[] }>("/drop-calls/history"),
  clearCalls: () => api("/drop-calls/history/clear", { method: "POST" }),
};

export const MUTE_OPTIONS: [string, string][] = [["8h", "8 hours"], ["1w", "1 week"], ["always", "Always"]];

function toDate(iso?: string | null) {
  if (!iso) return null;
  const t = iso.replace(" ", "T");
  const d = new Date(/Z$|[+-]\d{2}:\d{2}$/.test(t) ? t : t + "Z");
  return isNaN(d.getTime()) ? null : d;
}

/** "14:02", "Yesterday", "Tuesday", "4 Mar". */
export function chatTime(iso?: string | null) {
  const d = toDate(iso);
  if (!d) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  const w = new Date(now); w.setDate(now.getDate() - 6);
  if (d > w) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export function callTime(iso?: string | null) {
  const d = toDate(iso);
  if (!d) return "";
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Today, ${t}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday, ${t}`;
  return `${d.toLocaleDateString([], { day: "numeric", month: "long" })}, ${t}`;
}

export function duration(sec?: number | null) {
  if (sec == null || sec < 1) return "";
  const h = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

export function mutedLabel(iso?: string | null) {
  if (!iso) return "Off";
  const d = new Date(iso);
  if (d.getFullYear() > 9000) return "Always";
  return `Until ${d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`;
}

const COLORS = ["#C96F53", "#C97B84", "#D98E4A", "#B56576", "#A8674F"];
export function avatarColor(seed?: string) {
  if (!seed) return COLORS[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}
