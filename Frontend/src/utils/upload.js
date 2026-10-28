/** File uploads. uploadFile() sends straight to R2 with a presigned URL; uploadViaBackend()
 * sends through our server. */
import { File, UploadType } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

// Content type to extension (same as the backend), for named backend uploads.
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

/** Upload a local file to R2; returns its public URL. resourceType picks the folder. */
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

/** Upload a local file through our backend (/upload/image | audio | video). */
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
