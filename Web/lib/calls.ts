// Room calls API (Backend/app/api/v1/drop_calls.py). Same as the app's services/calls.js.
import { api } from "./api";
import type { CallInfo } from "@/components/CallRoom";

export type Person = { user_id?: string; name?: string; avatar_url?: string | null };
type TokenReply = {
  call_id: string; channel: string; token: string; uid: number; app_id: string;
  kind?: "group" | "direct"; video?: boolean; status?: "ringing" | "active"; ring_seconds?: number; other?: Person;
  reachable?: boolean; connection_id?: string;
};
export type LiveCall = {
  id: string; kind: "group" | "direct"; status: string; video: boolean; host_user_id: string;
  guest_count: number; max_guests: number; invite_only: boolean; started_at: string;
  host?: Person; joined?: boolean; connection_id?: string; incoming?: boolean; other?: Person;
};
export type Live = { hosting: LiveCall | null; sessions: LiveCall[]; direct: LiveCall[] };
export type Participant = { user_id: string; uid: number | null; is_host: boolean; name: string; avatar_url?: string | null };

const post = <T>(path: string, body?: unknown) => api<T>(`/drop-calls${path}`, { method: "POST", ...(body ? { body } : {}) });

export const callsApi = {
  /** Ring the other person in a Room conversation. */
  direct: (connectionId: string, video: boolean) => post<TokenReply>("/direct", { connection_id: connectionId, video }),
  accept: (id: string) => post<TokenReply>(`/${id}/accept`),
  decline: (id: string) => post(`/${id}/decline`),
  ringing: (id: string) => post(`/${id}/ringing`),
  askVideo: (id: string) => post(`/${id}/video-request`),
  replyVideo: (id: string, accept: boolean) => post(`/${id}/video-reply`, { accept }),
  react: (id: string, emoji: string) => post(`/${id}/react`, { emoji }),
  leave: (id: string) => post(`/${id}/leave`),
  end: (id: string) => post(`/${id}/end`),
  renew: (id: string) => post<{ token: string }>(`/${id}/renew`),
  remove: (id: string, userId: string) => post(`/${id}/remove`, { user_id: userId }),
  mute: (id: string, userId: string) => post(`/${id}/mute`, { user_id: userId }),
  details: (id: string) => api<{ status: string; is_host: boolean; participants: Participant[] }>(`/drop-calls/${id}`),
  live: () => api<Live>("/drop-calls/live"),
};

export const QUICK_REPLIES = [
  "Can’t talk right now. Text me?",
  "I’ll call you back in a bit.",
  "Busy now. Call me later?",
  "Can’t pick up, but I’m here. What’s up?",
];

/** Declining with a message: the text lands in your Room chat with them. */
export const sendQuickReply = (connectionId: string, content: string) =>
  api(`/drops/connections/${connectionId}/message`, { body: { content } });

/** CallRoom info from a token reply (start / join / direct / accept). */
export function callInfo(r: TokenReply, extra: Partial<CallInfo> = {}): CallInfo {
  const video = r.video !== false;
  return {
    callId: r.call_id, channel: r.channel, token: r.token, uid: r.uid, appId: r.app_id,
    kind: r.kind || "group", status: r.status || "active", ringSeconds: r.ring_seconds,
    reachable: r.reachable !== false, connectionId: r.connection_id,
    other: r.other, isHost: false, audioOnly: !video, ...extra,
  };
}
