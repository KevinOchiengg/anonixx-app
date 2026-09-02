import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import chatReducer from './slices/chatSlice';
import coinsReducer from './slices/coinsSlice';
import locationReducer from './slices/locationSlice';
import marketReducer from './slices/marketSlice';

const store = configureStore({
  reducer: {
    auth:     authReducer,
    coins:    coinsReducer,
    chat:     chatReducer,
    location: locationReducer,
    market:   marketReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export default store;
