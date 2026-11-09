/** Room calls API (Backend/app/api/v1/drop_calls.py). Every call returns the parsed body or
 * throws an Error whose message is the server's reason, so screens can show it as is. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

async function request(path, method = 'POST', body) {
  const token = await AsyncStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}/api/v1/drop-calls${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data?.detail;
    const err = new Error(typeof d === 'string' ? d : d?.message || 'Something went wrong with the call.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const callsApi = {
  /** Ring the other person in a Room conversation. */
  direct: (connectionId, video) => request('/direct', 'POST', { connection_id: connectionId, video: !!video }),
  accept: (id) => request(`/${id}/accept`),
  decline: (id) => request(`/${id}/decline`),
  /** Owner opens a group session; inviteUserIds empty = everyone inside may join. */
  startSession: ({ inviteUserIds, video = true } = {}) =>
    request('/start', 'POST', { invite_user_ids: inviteUserIds?.length ? inviteUserIds : null, video }),
  join: (id) => request(`/${id}/join`),
  leave: (id) => request(`/${id}/leave`),
  end: (id) => request(`/${id}/end`),
  renew: (id) => request(`/${id}/renew`),
  remove: (id, userId) => request(`/${id}/remove`, 'POST', { user_id: userId }),
  mute: (id, userId) => request(`/${id}/mute`, 'POST', { user_id: userId }),
  details: (id) => request(`/${id}`, 'GET'),
  live: () => request('/live', 'GET'),
};

/** Params for the DropCall screen from a token reply (start/join/direct/accept). */
export function callParams(data, extra = {}) {
  return {
    callId: data.call_id,
    channel: data.channel,
    token: data.token,
    uid: data.uid,
    appId: data.app_id,
    kind: data.kind || 'group',
    video: data.video !== false,
    status: data.status || 'active',
    ringSeconds: data.ring_seconds,
    other: data.other || null,
    ...extra,
  };
}
