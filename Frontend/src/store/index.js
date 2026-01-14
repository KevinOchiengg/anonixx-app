import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import postsReducer from './slices/postsSlice'
import groupsReducer from './slices/groupsSlice'
import datingReducer from './slices/datingSlice'
import coinsReducer from './slices/coinsSlice'
import chatReducer from './slices/chatSlice'

const store = configureStore({
  reducer: {
    auth: authReducer,
    posts: postsReducer,
    groups: groupsReducer,
    dating: datingReducer,
    coins: coinsReducer,
    chat: chatReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
})

export default store
