import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

class SocketService {
  constructor() {
    this.socket = null;
  }

  async connect() {
    if (this.socket?.connected) return this.socket;

    const token = await AsyncStorage.getItem('token');

    this.socket = io(API_BASE_URL, {
      auth:                { token },
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

  // ── Listener helpers ──────────────────────────────────────────────────────
  // Generic on/off — used directly for presence + unlock-request events
  // (see MessagesScreen). Named chat/call wrappers were removed along with
  // the old Connect chat system; Link Up doesn't use realtime sockets for
  // messaging or calls.

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
