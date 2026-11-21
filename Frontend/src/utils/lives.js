import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

export const PROMO_OPTIONS = [
  { hours: 1, coins: 3, label: '1 hour' },
  { hours: 6, coins: 10, label: '6 hours' },
  { hours: 24, coins: 25, label: '24 hours' },
];

export function money(amount, currency) {
  const digits = currency === 'KES' ? 0 : 2;
  return `${currency} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export const GIFT_EMOJI = { rose: '🌹', heart: '💖', fire: '🔥', diamond: '💎', crown: '👑' };

export class LiveApiError extends Error {
  constructor(status, message, code, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

async function call(path, { method, body } = {}) {
  const token = await AsyncStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    method: method || (body !== undefined ? 'POST' : 'GET'),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.detail;
    const message = typeof detail === 'string' ? detail : detail?.message || 'Something went wrong. Try again.';
    throw new LiveApiError(res.status, message, typeof detail === 'object' ? detail?.code : undefined, detail);
  }
  return data;
}

export const livesApi = {
  browse: (tab) => call(`/lives?tab=${tab}&platform=app`),
  promoted: () => call('/lives/promoted'),
  detail: (id) => call(`/lives/${id}?platform=app`),
  create: (body) => call('/lives', { body }),
  start: (id) => call(`/lives/${id}/start`, { method: 'POST' }),
  end: (id) => call(`/lives/${id}/end`, { method: 'POST' }),
  watch: (id) => call(`/lives/${id}/watch`, { method: 'POST' }),
  join: (id) => call(`/lives/${id}/join`, { method: 'POST' }),
  renew: (id) => call(`/lives/${id}/renew`, { method: 'POST' }),
  heartbeat: (id) => call(`/lives/${id}/heartbeat`, { method: 'POST' }),
  messages: (id, after) => call(`/lives/${id}/messages${after ? `?after=${after}` : ''}`),
  send: (id, text) => call(`/lives/${id}/messages`, { body: { text } }),
  gift: (id, gift) => call(`/lives/${id}/gifts`, { body: { gift } }),
  gifts: () => call('/lives/gifts'),
  promote: (id, hours) => call(`/lives/${id}/promote`, { body: { hours } }),
  remind: (id) => call(`/lives/${id}/remind`, { method: 'POST' }),
  follow: (hostId) => call(`/lives/hosts/${hostId}/follow`, { method: 'POST' }),
  report: (id, reason) => call(`/lives/${id}/report`, { body: { reason } }),
  earnings: () => call('/lives/earnings'),
  payoutProfile: () => call('/lives/payout-profile'),
  savePayoutProfile: (body) => call('/lives/payout-profile', { method: 'PUT', body }),
};

export function startsLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `Today, ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}
