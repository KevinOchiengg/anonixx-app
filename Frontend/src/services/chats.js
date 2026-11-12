/** Room chats API for the messenger features (Backend/app/api/v1/drops.py) and the call log
 * (drop_calls.py). Every call returns the parsed body or throws an Error with the server's reason. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

async function request(path, method = 'GET', body) {
  const token = await AsyncStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
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
    const err = new Error(typeof d === 'string' ? d : d?.message || 'Something went wrong. Try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

const msg = (cid, mid, action) => `/drops/connections/${cid}/messages/${mid}/${action}`;

export const chatsApi = {
  list: () => request('/drops/connections'),
  /** { pinned?, archived?, mute?: '8h' | '1w' | 'always' | 'off' } — mine only. */
  prefs: (cid, body) => request(`/drops/connections/${cid}/prefs`, 'POST', body),
  clear: (cid) => request(`/drops/connections/${cid}/clear`, 'POST'),
  star: (cid, mid, starred) => request(msg(cid, mid, 'star'), 'POST', { starred }),
  forward: (cid, mid, to) => request(msg(cid, mid, 'forward'), 'POST', { to }),
  starred: (cid) => request(`/drops/connections/starred${cid ? `?connection_id=${cid}` : ''}`),
  /** kind: 'media' | 'voice' | 'links' */
  media: (cid, kind) => request(`/drops/connections/${cid}/media?kind=${kind}`),
  callHistory: () => request('/drop-calls/history'),
  clearCalls: () => request('/drop-calls/history/clear', 'POST'),
};

export const MUTE_OPTIONS = [['8h', '8 hours'], ['1w', '1 week'], ['always', 'Always']];
export const MAX_FORWARD = 5;
