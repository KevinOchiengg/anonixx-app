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
  ringing: (id) => request(`/${id}/ringing`),
  askVideo: (id) => request(`/${id}/video-request`),
  replyVideo: (id, accept) => request(`/${id}/video-reply`, 'POST', { accept }),
  react: (id, emoji) => request(`/${id}/react`, 'POST', { emoji }),
  leave: (id) => request(`/${id}/leave`),
  end: (id) => request(`/${id}/end`),
  renew: (id) => request(`/${id}/renew`),
  remove: (id, userId) => request(`/${id}/remove`, 'POST', { user_id: userId }),
  mute: (id, userId) => request(`/${id}/mute`, 'POST', { user_id: userId }),
  details: (id) => request(`/${id}`, 'GET'),
  live: () => request('/live', 'GET'),
};

export const QUICK_REPLIES = [
  'Can’t talk right now. Text me?',
  'I’ll call you back in a bit.',
  'Busy now. Call me later?',
  'Can’t pick up, but I’m here. What’s up?',
];

/** Declining with a message: the text lands in your Room chat with them. */
export async function sendQuickReply(connectionId, content) {
  const token = await AsyncStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}/api/v1/drops/connections/${connectionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Could not send it. Try again.');
}

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
    reachable: data.reachable !== false,
    connectionId: data.connection_id || null,
    other: data.other || null,
    ...extra,
  };
}
