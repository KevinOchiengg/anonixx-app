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

  // ── Emit helpers ──────────────────────────────────────────────────────────

  joinChat(chatId) {
    this.socket?.emit('join_chat', { chatId });
  }

  leaveChat(chatId) {
    this.socket?.emit('leave_chat', { chatId });
  }

  markRead(chatId) {
    this.socket?.emit('messages_read', { chatId });
  }

  // ── Listener helpers ──────────────────────────────────────────────────────

  on(event, cb) {
    this.socket?.on(event, cb);
  }

  off(event, cb) {
    this.socket?.off(event, cb);
  }

  sendTyping(chatId, recipientId) {
    this.socket?.emit('user_typing', { chatId, recipientId });
  }

  onNewMessage(cb)          { this.on('new_message',        cb); }
  onMessagesDelivered(cb)   { this.on('messages_delivered', cb); }
  onMessagesRead(cb)        { this.on('messages_read',      cb); }

  offNewMessage(cb)         { this.off('new_message',        cb); }
  offMessagesDelivered(cb)  { this.off('messages_delivered', cb); }
  offMessagesRead(cb)       { this.off('messages_read',      cb); }

  // ── Call signaling ─────────────────────────────────────────────────────────
  onCallOffer(cb)    { this.on('call_offer',    cb); }
  onCallAccepted(cb) { this.on('call_accepted', cb); }
  onCallRejected(cb) { this.on('call_rejected', cb); }
  onCallEnded(cb)    { this.on('call_ended',    cb); }

  offCallOffer(cb)    { this.off('call_offer',    cb); }
  offCallAccepted(cb) { this.off('call_accepted', cb); }
  offCallRejected(cb) { this.off('call_rejected', cb); }
  offCallEnded(cb)    { this.off('call_ended',    cb); }
}

export default new SocketService();
