import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { chatAPI } from '../../services/api'

export const fetchChats = createAsyncThunk(
  'chat/fetchChats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await chatAPI.getChats()
      return response.data
    } catch (error) {
      return rejectWithValue(error.response.data)
    }
  }
)

export const fetchMessages = createAsyncThunk(
  'chat/fetchMessages',
  async ({ chatId, page = 1 }, { rejectWithValue }) => {
    try {
      const response = await chatAPI.getMessages(chatId, page)
      return { chatId, ...response.data }
    } catch (error) {
      return rejectWithValue(error.response.data)
    }
  }
)

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async ({ chatId, message }, { rejectWithValue }) => {
    try {
      const response = await chatAPI.sendMessage(chatId, message)
      return { chatId, message: response.data }
    } catch (error) {
      return rejectWithValue(error.response.data)
    }
  }
)

const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    chats: [],
    messages: {}, // { chatId: [messages] }
    activeChat: null,
    typingUsers: {}, // { chatId: [userId] }
    loading: false,
  },
  reducers: {
    setActiveChat: (state, action) => {
      state.activeChat = action.payload
    },
    addMessage: (state, action) => {
      const { chatId, message } = action.payload
      if (!state.messages[chatId]) {
        state.messages[chatId] = []
      }
      state.messages[chatId].push(message)
    },
    setTyping: (state, action) => {
      const { chatId, userId, isTyping } = action.payload
      if (!state.typingUsers[chatId]) {
        state.typingUsers[chatId] = []
      }
      if (isTyping) {
        if (!state.typingUsers[chatId].includes(userId)) {
          state.typingUsers[chatId].push(userId)
        }
      } else {
        state.typingUsers[chatId] = state.typingUsers[chatId].filter(
          (id) => id !== userId
        )
      }
    },
    markAsRead: (state, action) => {
      const { chatId, messageId } = action.payload
      const messages = state.messages[chatId]
      if (messages) {
        const message = messages.find((m) => m.id === messageId)
        if (message) {
          message.isRead = true
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchChats.fulfilled, (state, action) => {
        state.chats = action.payload.chats
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.messages[action.payload.chatId] = action.payload.messages
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        const { chatId, message } = action.payload
        if (!state.messages[chatId]) {
          state.messages[chatId] = []
        }
        state.messages[chatId].push(message)
      })
  },
})

export const { setActiveChat, addMessage, setTyping, markAsRead } =
  chatSlice.actions
export default chatSlice.reducer
