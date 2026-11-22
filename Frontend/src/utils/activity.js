import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

export const ACTIVITY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'mentions', label: 'Mentions' },
  { key: 'linkups', label: 'Link Ups' },
  { key: 'coins', label: 'Coins' },
  { key: 'lives', label: 'Lives' },
  { key: 'system', label: 'From Anonixx' },
];

async function request(path, options = {}) {
  const token = await AsyncStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}/api/v1/notifications${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || 'Something went wrong.');
  return body;
}

export const activityApi = {
  list: (category, before) => {
    const q = `category=${encodeURIComponent(category)}${before ? `&before=${encodeURIComponent(before)}` : ''}`;
    return request(`/activity?${q}`);
  },
  markRead: (category) => request('/activity/read', { method: 'POST', body: JSON.stringify({ category }) }),
};

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function sectionOf(item) {
  if (!item.read) return 'New';
  const s = (Date.now() - new Date(item.at).getTime()) / 1000;
  if (s < 86400) return 'Today';
  if (s < 604800) return 'This week';
  return 'Earlier';
}

/** Maps an activity url to a navigation call. */
export function openActivity(navigation, url) {
  if (!url) return;
  const m = (re) => url.match(re)?.[1];
  const drop = m(/^\/drop\/([^/?#]+)/);
  if (drop) {
    navigation.navigate('Main', { screen: 'Feed', params: { screen: 'FeedSwipe', params: { dropId: drop } } });
    return;
  }
  const chat = m(/^\/chat\/([^/?#]+)/);
  if (chat) { navigation.navigate('DropChat', { connectionId: chat }); return; }
  const room = m(/^\/room\/([^/?#]+)/);
  if (room) { navigation.navigate('Room', { userId: room }); return; }
  if (url.startsWith('/lives/earnings')) { navigation.navigate('LiveEarnings'); return; }
  const live = m(/^\/lives\/([^/?#]+)/);
  if (live) { navigation.navigate('LiveRoom', { liveId: live }); return; }
  if (url.startsWith('/coins')) navigation.navigate('Coins');
}
