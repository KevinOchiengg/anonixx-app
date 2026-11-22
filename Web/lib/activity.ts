import { api } from "./api";

export type ActivityCategory = "all" | "likes" | "comments" | "mentions" | "linkups" | "coins" | "lives" | "system";

export type ActivityActor = { id: string; name: string; avatar_url: string | null; gender: string | null };

export type ActivityItem = {
  id: string;
  kind: string;
  category: Exclude<ActivityCategory, "all">;
  actors: ActivityActor[];
  count: number;
  action: string | null;
  title: string | null;
  text: string | null;
  coins: number;
  drop: { id: string; image: string | null; media_type: string | null; snippet: string | null } | null;
  url: string | null;
  read: boolean;
  at: string;
};

export type ActivityPage = { items: ActivityItem[]; next: string | null; unread: number };

export const ACTIVITY_FILTERS: { key: ActivityCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "mentions", label: "Mentions" },
  { key: "linkups", label: "Link Ups" },
  { key: "coins", label: "Coins" },
  { key: "lives", label: "Lives" },
  { key: "system", label: "From Anonixx" },
];

export const ACTIVITY_READ_EVENT = "anx:activity-read";

export const activityApi = {
  list: (category: ActivityCategory, before?: string | null) => {
    const q = new URLSearchParams({ category });
    if (before) q.set("before", before);
    return api<ActivityPage>(`/notifications/activity?${q}`);
  },
  unread: () => api<{ unread: number }>("/notifications/activity/unread"),
  markRead: (category: ActivityCategory) =>
    api<{ updated: number }>("/notifications/activity/read", { method: "POST", body: { category } }),
};

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function sectionOf(item: ActivityItem): string {
  if (!item.read) return "New";
  const s = (Date.now() - new Date(item.at).getTime()) / 1000;
  if (s < 86400) return "Today";
  if (s < 604800) return "This week";
  return "Earlier";
}
