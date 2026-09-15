/**
 * upload.js
 *
 * Single shared "upload this local file" helper — every screen that
 * attaches a photo/video/voice note used to hand-roll its own signed-
 * Cloudinary-upload boilerplate (request a signature, build FormData,
 * POST to a cloud_name/resource_type URL). Cloudflare R2's presigned-PUT
 * flow is simpler — sign, then PUT the raw file — so this consolidates it
 * into one place instead of the half-dozen near-identical copies that had
 * drifted apart across DropsComposeScreen, DropChatScreen,
 * CommentBottomSheet, DropsRecordScreen, DropsPollScreen, PostUnlockScreen,
 * and CircleContentScreen.
 *
 * Direct-to-storage only (matches the old /upload/sign path) — the file
 * goes straight from the device to R2, never through our server. For the
 * handful of screens that instead post the file *to our backend* (which
 * then forwards it to R2 itself — CommentBottomSheet, ChatProfileSetup,
 * VoiceNoteRecorder), see `uploadViaBackend` below instead.
 */
import { File, UploadType } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

// Same fixed map the backend uses (Backend/app/utils/r2_storage.py) —
// kept here too only for naming the file we attach for backend-proxy
// uploads; the direct-to-R2 path never needs a filename, just a
// content-type header.
const EXT_BY_CONTENT_TYPE = {
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'video/mp4':        'mp4',
  'video/quicktime':  'mov',
  'audio/m4a':        'm4a',
};

async function authHeaders(json = false) {
  const token = await AsyncStorage.getItem('token');
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Uploads a local file (by uri) straight to R2 and returns its public URL.
 *
 * @param {string} uri          Local file uri (from ImagePicker/recorder/etc).
 * @param {string} resourceType 'image' | 'video' | 'audio' | 'raw' — only
 *                              affects which folder it's stored under.
 * @param {string} contentType MIME type, e.g. 'image/jpeg'.
 */
export async function uploadToR2(uri, resourceType, contentType) {
  const signRes = await fetch(`${API_BASE_URL}/api/v1/upload/sign`, {
    method:  'POST',
    headers: await authHeaders(true),
    body:    JSON.stringify({ resource_type: resourceType, content_type: contentType }),
  });
  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({}));
    throw new Error(err?.detail || `Upload sign failed (${signRes.status})`);
  }
  const { upload_url, public_url } = await signRes.json();

  const file = new File(uri);
  const result = await file.upload(upload_url, {
    httpMethod:  'PUT',
    uploadType:  UploadType.BINARY_CONTENT,
    headers:     { 'Content-Type': contentType },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Upload failed (${result.status})`);
  }
  return public_url;
}

/**
 * Posts a local file to one of our own backend proxy endpoints
 * (/upload/image, /upload/audio, /upload/video), which forwards it to R2
 * server-side. Used where the backend needs to see the file itself rather
 * than just handing out a presigned URL.
 */
export async function uploadViaBackend(uri, resourceType, contentType) {
  const ext = EXT_BY_CONTENT_TYPE[contentType] || 'bin';
  const form = new FormData();
  form.append('file', { uri, name: `upload.${ext}`, type: contentType });

  const res = await fetch(`${API_BASE_URL}/api/v1/upload/${resourceType}`, {
    method:  'POST',
    headers: await authHeaders(false),
    body:    form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || `Upload failed (${res.status})`);
  }
  const data = await res.json();
  return data.url;
}
