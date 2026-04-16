import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import chatReducer from './slices/chatSlice';
import coinsReducer from './slices/coinsSlice';
import postsReducer from './slices/postsSlice';

const store = configureStore({
  reducer: {
    auth: authReducer,
    posts: postsReducer,
    coins: coinsReducer,
    chat: chatReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export default store;
