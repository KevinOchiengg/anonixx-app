import { api } from "@/lib/api";

export type LiveStatus = "scheduled" | "live" | "ended";

export type LiveHost = { id: string; name?: string; avatar_url?: string | null; gender?: string | null };

export type LiveCard = {
  id: string;
  title: string;
  about: string | null;
  cover_url: string | null;
  price: number;
  adult: boolean;
  status: LiveStatus;
  starts_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  members: number;
  viewers: number;
  promoted: boolean;
  host: LiveHost;
};

export type LiveDetail = {
  live: LiveCard;
  viewer: { is_host: boolean; is_member: boolean; preview_left: number; reminded: boolean; following: boolean };
  host_followers: number;
  top_gifters: { user_id: string; coins: number; name?: string; avatar_url?: string | null; gender?: string | null }[];
  preview_seconds: number;
};

export type Stream = { app_id: string; channel: string; uid: number; token: string; host_uid: number; expires_at: string };

export type WatchReply = { stream: Stream; member: boolean; preview_ends_at?: string };

export type LiveMessage = {
  id: string;
  kind: "chat" | "gift" | "join";
  text: string | null;
  gift: string | null;
  coins: number | null;
  user: { id: string; name?: string; avatar_url?: string | null; gender?: string | null };
  created_at: string;
};

export type Gift = { id: string; label: string; coins: number };

export type PayoutProfile = { legal_name: string; id_number_last4: string; mpesa_phone: string; verified: boolean; submitted_at: string | null };

export type Earnings = {
  weeks: { week: string; coins: number; paid_coins: number; kes: number; status: "in_progress" | "due" | "paid" }[];
  owed_coins: number;
  owed_kes: number;
  kes_per_coin: number;
  host_share: number;
  profile: PayoutProfile | null;
};

export const PROMO_OPTIONS: { hours: number; coins: number; label: string }[] = [
  { hours: 1, coins: 3, label: "1 hour" },
  { hours: 6, coins: 10, label: "6 hours" },
  { hours: 24, coins: 25, label: "24 hours" },
];

export const GIFT_EMOJI: Record<string, string> = { rose: "🌹", heart: "💖", fire: "🔥", diamond: "💎", crown: "👑" };

export const livesApi = {
  browse: (tab: "live" | "upcoming" | "mine") => api<{ lives: LiveCard[] }>(`/lives?tab=${tab}&platform=web`),
  promoted: () => api<{ lives: LiveCard[] }>("/lives/promoted"),
  detail: (id: string) => api<LiveDetail>(`/lives/${id}?platform=web`),
  create: (body: { title: string; about?: string; cover_url?: string; price: number; starts_at?: string | null; adult?: boolean }) =>
    api<{ live: LiveCard }>("/lives", { body }),
  start: (id: string) => api<{ stream: Stream }>(`/lives/${id}/start`, { method: "POST" }),
  end: (id: string) => api(`/lives/${id}/end`, { method: "POST" }),
  watch: (id: string) => api<WatchReply>(`/lives/${id}/watch`, { method: "POST" }),
  join: (id: string) => api<WatchReply>(`/lives/${id}/join`, { method: "POST" }),
  renew: (id: string) => api<{ stream: Stream }>(`/lives/${id}/renew`, { method: "POST" }),
  heartbeat: (id: string) => api<{ viewers: number }>(`/lives/${id}/heartbeat`, { method: "POST" }),
  messages: (id: string, after?: string) =>
    api<{ messages: LiveMessage[]; status: LiveStatus }>(`/lives/${id}/messages${after ? `?after=${after}` : ""}`),
  send: (id: string, text: string) => api<{ message: LiveMessage }>(`/lives/${id}/messages`, { body: { text } }),
  gift: (id: string, gift: string) => api<{ message: LiveMessage }>(`/lives/${id}/gifts`, { body: { gift } }),
  gifts: () => api<{ gifts: Gift[] }>("/lives/gifts"),
  promote: (id: string, hours: number) => api<{ promo_until: string }>(`/lives/${id}/promote`, { body: { hours } }),
  remind: (id: string) => api<{ reminded: boolean }>(`/lives/${id}/remind`, { method: "POST" }),
  follow: (hostId: string) => api<{ following: boolean; followers: number }>(`/lives/hosts/${hostId}/follow`, { method: "POST" }),
  report: (id: string, reason: string) => api(`/lives/${id}/report`, { body: { reason } }),
  earnings: () => api<Earnings>("/lives/earnings"),
  payoutProfile: () => api<{ profile: PayoutProfile | null }>("/lives/payout-profile"),
  savePayoutProfile: (body: { legal_name: string; id_number: string; mpesa_phone: string }) =>
    api<{ profile: PayoutProfile }>("/lives/payout-profile", { method: "PUT", body }),
};

export function startsLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? `Today, ${time}` : `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}
