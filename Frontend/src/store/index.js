import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import coinsReducer from './slices/coinsSlice';
import marketReducer from './slices/marketSlice';

const store = configureStore({
  reducer: {
    auth:     authReducer,
    coins:    coinsReducer,
    market:   marketReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export default store;
