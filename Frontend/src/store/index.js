import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import chatReducer from './slices/chatSlice';
import coinsReducer from './slices/coinsSlice';
import marketReducer from './slices/marketSlice';

const store = configureStore({
  reducer: {
    auth:     authReducer,
    coins:    coinsReducer,
    chat:     chatReducer,
    market:   marketReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export default store;
