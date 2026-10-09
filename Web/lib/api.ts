export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace(/\/$/, "");
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export type Poll = {
  question: string;
  options: { text: string; votes: number | null; percent: number | null }[];
  total_votes: number;
  voted_option: number | null;
};

export type Post = {
  id: string;
  content: string;
  anonymous_name: string | null;
  avatar_url: string | null;
  is_admin_drop: boolean;
  mood_tag: string | null;
  sensitivity: "general" | "mature";
  media_url: string | null;
  media_type: "image" | "video" | "voice" | null;
  video_url: string | null;
  audio_url: string | null;
  image_url: string | null;
  images: string[] | null;
  card_image_url: string | null;
  poll: Poll | null;
  thread_count: number;
  views_count: number;
  likes_count: number;
  created_at: string;
  time_ago: string;
  is_liked?: boolean;
  is_saved?: boolean;
  is_own_post?: boolean;
  type?: string;
};

export type FeedPage = { posts: Post[]; next_cursor: string | null; has_more: boolean };

// Server-side fetches revalidate so crawlers get fast cached HTML but fresh posts still appear.
async function get<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const fetchPublicFeed = (cursor?: string | null) =>
  get<FeedPage>(`/public/feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);

export type PublicDrop = { restricted: true; id: string } | { restricted: false; post: Post };
export const fetchPublicDrop = (id: string) => get<PublicDrop>(`/public/drops/${encodeURIComponent(id)}`, 300);

export type Sitemap = { total: number; pages: number; items: { id: string; lastmod: string }[] };
export const fetchSitemap = (page = 0) => get<Sitemap>(`/public/sitemap?page=${page}`, 3600);

// Browser-side page loader for infinite scroll.
export async function loadMoreClient(cursor: string): Promise<FeedPage | null> {
  try {
    const res = await fetch(`${API_URL}/public/feed?cursor=${encodeURIComponent(cursor)}`);
    return res.ok ? ((await res.json()) as FeedPage) : null;
  } catch {
    return null;
  }
}

export function teaser(text: string, max = 155): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

// ── Authenticated client ─────────────────────────────────────────────────────

const TOKEN_KEY = "anonixx_token";
const MODE_KEY = "anonixx_adult";

export const getToken = (): string | null => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t: string | null) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
};
export const setAdultMode = (on: boolean) => {
  try { on ? localStorage.setItem(MODE_KEY, "1") : localStorage.removeItem(MODE_KEY); } catch { /* storage blocked */ }
};
const adultMode = () => {
  try { return localStorage.getItem(MODE_KEY) === "1"; } catch { return false; }
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function errorText(body: unknown, fallback: string): string {
  const d = (body as { detail?: unknown } | null)?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0] && typeof d[0] === "object") return String((d[0] as { msg?: string }).msg || fallback);
  return fallback;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    if (adultMode()) headers["X-Content-Mode"] = "full";
  }
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach Anonixx right now. Check your connection.");
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  if (!res.ok) throw new ApiError(res.status, errorText(data, `Something went wrong (${res.status}).`));
  return data as T;
}

export type AuthUser = {
  id: string;
  email: string;
  username: string | null;
  anonymous_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  coin_balance: number;
  age_verified: boolean;
};

export const COST = { post: 3, linkUp: 6 };

export function compact(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}
