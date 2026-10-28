import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

// Device time zone, so admins can see the user's local time.
const deviceTz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
};

class SocketService {
  constructor() {
    this.socket = null;
  }

  async connect() {
    if (this.socket?.connected) return this.socket;

    const token = await AsyncStorage.getItem('token');

    this.socket = io(API_BASE_URL, {
      auth:                { token, tz: deviceTz() },
      transports:          ['websocket'],
      reconnection:        true,
      reconnectionDelay:   1500,
      reconnectionAttempts: 8,
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // ── Generic on/off listeners (presence, knock events).

  on(event, cb) {
    this.socket?.on(event, cb);
  }

  off(event, cb) {
    this.socket?.off(event, cb);
  }

  // Client → server events (e.g. join_drop_thread/leave_drop_thread for
  // live comments). No-op while disconnected — callers don't need to guard.
  emit(event, payload) {
    this.socket?.emit(event, payload);
  }
}

export default new SocketService();
