// Room calls API (Backend/app/api/v1/drop_calls.py). Same as the app's services/calls.js.
import { api } from "./api";
import type { CallInfo } from "@/components/CallRoom";

export type Person = { user_id?: string; name?: string; avatar_url?: string | null };
type TokenReply = {
  call_id: string; channel: string; token: string; uid: number; app_id: string;
  kind?: "group" | "direct"; video?: boolean; status?: "ringing" | "active"; ring_seconds?: number; other?: Person;
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
  /** Owner opens a group session; no invite list = everyone inside may join. */
  startSession: (inviteUserIds: string[] | null, video: boolean) =>
    post<TokenReply>("/start", { invite_user_ids: inviteUserIds?.length ? inviteUserIds : null, video }),
  join: (id: string) => post<TokenReply>(`/${id}/join`),
  leave: (id: string) => post(`/${id}/leave`),
  end: (id: string) => post(`/${id}/end`),
  renew: (id: string) => post<{ token: string }>(`/${id}/renew`),
  remove: (id: string, userId: string) => post(`/${id}/remove`, { user_id: userId }),
  mute: (id: string, userId: string) => post(`/${id}/mute`, { user_id: userId }),
  details: (id: string) => api<{ status: string; is_host: boolean; participants: Participant[] }>(`/drop-calls/${id}`),
  live: () => api<Live>("/drop-calls/live"),
};

/** CallRoom info from a token reply (start / join / direct / accept). */
export function callInfo(r: TokenReply, extra: Partial<CallInfo> = {}): CallInfo {
  const video = r.video !== false;
  return {
    callId: r.call_id, channel: r.channel, token: r.token, uid: r.uid, appId: r.app_id,
    kind: r.kind || "group", status: r.status || "active", ringSeconds: r.ring_seconds,
    other: r.other, isHost: false, audioOnly: !video, ...extra,
  };
}
