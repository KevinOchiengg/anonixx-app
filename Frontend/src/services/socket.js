import io from 'socket.io-client'
import Storage from './storage' // ← Change this

const WS_URL = __DEV__ ? 'ws://localhost:3000' : 'wss://ws.echo.app'

class SocketService {
  constructor() {
    this.socket = null
    this.listeners = new Map()
  }

  async connect() {
    const token = await Storage.getItem('authToken') // ← Use Storage

    this.socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    })

    this.socket.on('connect', () => {
      console.log('Socket connected')
    })

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason)
    })

    this.socket.on('error', (error) => {
      console.error('Socket error:', error)
    })

    return this.socket
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data)
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback)

      if (!this.listeners.has(event)) {
        this.listeners.set(event, [])
      }
      this.listeners.get(event).push(callback)
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback)

      const callbacks = this.listeners.get(event)
      if (callbacks) {
        const index = callbacks.indexOf(callback)
        if (index > -1) {
          callbacks.splice(index, 1)
        }
      }
    }
  }

  joinChat(chatId) {
    this.emit('join_chat', { chatId })
  }

  leaveChat(chatId) {
    this.emit('leave_chat', { chatId })
  }

  sendMessage(chatId, message) {
    this.emit('send_message', { chatId, message })
  }

  typing(chatId, isTyping) {
    this.emit('typing', { chatId, isTyping })
  }

  readMessage(chatId, messageId) {
    this.emit('read_message', { chatId, messageId })
  }

  reactToMessage(chatId, messageId, reaction) {
    this.emit('react_message', { chatId, messageId, reaction })
  }

  onMessage(callback) {
    this.on('message', callback)
  }

  onTyping(callback) {
    this.on('typing', callback)
  }

  onMessageRead(callback) {
    this.on('message_read', callback)
  }

  onReaction(callback) {
    this.on('reaction', callback)
  }

  onMatch(callback) {
    this.on('match', callback)
  }

  onNotification(callback) {
    this.on('notification', callback)
  }
}

export default new SocketService()
