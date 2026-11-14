/** Confirm-then-act helpers shared by the chat and its contact info: block, report, remove,
 * clear chat, mute. Each shows the native confirm and calls onDone(message) when it worked. */
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';
import { chatsApi, MUTE_OPTIONS } from './chats';

async function post(path, body) {
  const token = await AsyncStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data?.detail;
    throw new Error(typeof d === 'string' ? d : d?.message || 'Something went wrong. Try again.');
  }
  return data;
}

export function confirmBlock(userId, onDone, onError) {
  Alert.alert(
    'Block this person?',
    "They can't knock, message or call you. Your chat closes and their posts disappear.",
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => post(`/users/${userId}/block`).then(() => onDone('Blocked.')).catch((e) => onError(e.message)) },
    ],
  );
}

export const REPORT_REASONS = [
  ['abuse', 'Abuse or harassment'], ['spam', 'Spam'], ['explicit', 'Unwanted explicit content'],
  ['self-harm-concern', "I'm worried about them"], ['other', 'Other'],
];
const REASONS = REPORT_REASONS;

export const sendReport = (userId, reason) => post(`/users/${userId}/report`, { reason });
/** Guest only: the confession that got them to pay was fake. An admin reviews it. */
export const sendFakeReport = (connectionId) => post('/deception-reports', { connection_id: connectionId });

export function confirmReport(userId, onDone, onError) {
  Alert.alert('Report this person', "What's the issue?", [
    ...REASONS.map(([id, text]) => ({
      text,
      onPress: () => post(`/users/${userId}/report`, { reason: id }).then(() => onDone('Report received. Thank you.')).catch((e) => onError(e.message)),
    })),
    { text: 'Cancel', style: 'cancel' },
  ]);
}

/** Owner only, and only 3 days after letting them in (the server enforces it too). */
export function confirmRemove(connection, onDone, onError, onBlockInstead) {
  const when = connection?.removable_at ? new Date(connection.removable_at) : null;
  if (when && when > new Date()) {
    Alert.alert(
      'Not yet',
      `You can end this chat from ${when.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}. Something wrong? Block them now.`,
      [{ text: 'OK', style: 'cancel' }, { text: 'Block', style: 'destructive', onPress: onBlockInstead }],
    );
    return;
  }
  Alert.alert(
    'End this chat?',
    `It closes for you and ${connection?.other_anonymous_name || 'them'}. They'd have to knock again.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End chat', style: 'destructive', onPress: () => post(`/drops/connections/${connection.id}/remove`).then(() => onDone('Chat ended.')).catch((e) => onError(e.message)) },
    ],
  );
}

export function confirmClear(connectionId, onDone, onError) {
  Alert.alert('Clear this chat?', 'Messages disappear for you only. They keep their copy.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear chat', style: 'destructive', onPress: () => chatsApi.clear(connectionId).then(() => onDone('Chat cleared.')).catch((e) => onError(e.message)) },
  ]);
}

/** Mute picker, or unmute straight away. onDone receives the new prefs. */
export function pickMute(connectionId, mutedUntil, onDone, onError) {
  if (mutedUntil) {
    chatsApi.prefs(connectionId, { mute: 'off' }).then(onDone).catch((e) => onError(e.message));
    return;
  }
  Alert.alert('Mute notifications', 'Messages still arrive, silently.', [
    ...MUTE_OPTIONS.map(([v, text]) => ({ text, onPress: () => chatsApi.prefs(connectionId, { mute: v }).then(onDone).catch((e) => onError(e.message)) })),
    { text: 'Cancel', style: 'cancel' },
  ]);
}

export function mutedLabel(iso) {
  if (!iso) return 'Off';
  const d = new Date(iso);
  if (d.getFullYear() > 9000) return 'Always';
  return `Until ${d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
}
