/** Video drops via Cloudflare Stream: one-request upload, then the backend clips, watermarks
 * and publishes. Off until Stream is configured or for files over 200 MB (R2 is used instead). */
import { File, UploadType } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

export const STREAM_DIRECT_MAX_BYTES = 200 * 1024 * 1024;

async function authHeaders(json = false) {
  const token = await AsyncStorage.getItem('token');
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

let enabled = null;
export function streamEnabled() {
  if (!enabled) {
    enabled = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/upload/stream/status`, { headers: await authHeaders() });
        return res.ok ? !!(await res.json()).enabled : false;
      } catch {
        return false;
      }
    })();
  }
  return enabled;
}

// Uploads a local video straight to Stream and returns its uid.
export async function uploadToStream(uri) {
  const res = await fetch(`${API_BASE_URL}/api/v1/upload/stream/direct`, {
    method: 'POST',
    headers: await authHeaders(true),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `Couldn't start the video upload (${res.status})`);
  }
  const { upload_url, uid } = await res.json();
  const result = await new File(uri).upload(upload_url, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName:  'file',
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`The video upload didn't go through (${result.status}). Try again on a steadier connection.`);
  }
  return uid;
}

// Queues an admin drop in the scheduled queue: a Stream video (publishes when
// the clip is ready, or at publishAt) or any drop scheduled for later.
export async function queueDrop(drop, { publishAt = null, stream = null } = {}) {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/scheduled`, {
    method:  'POST',
    headers: await authHeaders(true),
    body:    JSON.stringify({ publish_at: publishAt, drop, ...(stream ? { stream } : {}) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `Couldn't queue it (${res.status})`);
  }
  return res.json();
}
