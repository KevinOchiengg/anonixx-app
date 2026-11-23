/** Rings the phone for a call even when the app is closed: the server sends a silent push,
 * and this task (run by Android in the background) shows the full-screen incoming call. */
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';
import { nativeCalls } from '../native/calls';

export const CALL_PUSH_TASK = 'anonixx-call-push';

function parse(v) {
  if (typeof v !== 'string') return v && typeof v === 'object' ? v : null;
  try { return JSON.parse(v); } catch { return null; }
}

// Expo wraps the data differently by platform and version; find the object that has our key.
function callPayload(raw) {
  const seen = [raw, raw?.data, raw?.notification?.data, raw?.notification?.request?.content?.data];
  for (const c of seen) {
    const o = parse(c);
    if (!o) continue;
    if (o.anx_call) return o;
    for (const key of ['body', 'dataString', 'data']) {
      const inner = parse(o[key]);
      if (inner?.anx_call) return inner;
    }
  }
  return null;
}

TaskManager.defineTask(CALL_PUSH_TASK, async ({ data, error }) => {
  if (error) return;
  const p = callPayload(data);
  if (!p) return;
  if (p.anx_call === 'incoming') {
    const token = (await AsyncStorage.getItem('token')) || '';
    nativeCalls.showIncomingCall({
      callId: String(p.call_id),
      callerName: p.caller_name || 'Someone',
      video: p.video === true || p.video === 'true',
      ringSeconds: Number(p.ring_seconds) || 45,
      token,
      apiBase: `${API_BASE_URL}/api/v1`,
    });
  } else if (p.anx_call === 'ended') {
    nativeCalls.cancelIncomingCall(String(p.call_id));
  }
});

export async function registerCallPushTask() {
  if (!nativeCalls.available) return false;
  try {
    await Notifications.registerTaskAsync(CALL_PUSH_TASK);
    return true;
  } catch {
    return false;
  }
}
