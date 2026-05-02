/**
 * marketSlice.js — Anonixx Mini Market state.
 *
 * State:
 *   items         { [id]: marketItem }   normalised cache
 *   feed          string[]               item IDs in feed order (for MarketScreen)
 *   myUnlocks     string[]               item IDs the current user has unlocked
 *   loading       boolean
 *   unlocking     string | null          item id currently being unlocked
 *   error         string | null
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../config/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const authHeaders = async () => {
  const token = await AsyncStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// ─── Thunks ───────────────────────────────────────────────────────────────────

export const fetchMarketItems = createAsyncThunk(
  'market/fetchMarketItems',
  async ({ category, limit = 20, offset = 0 } = {}, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const params  = new URLSearchParams({ limit, offset });
      if (category) params.append('category', category);
      const res  = await fetch(`${API_BASE_URL}/api/v1/market/items?${params}`, { headers });
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;  // { items, limit, offset }
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

export const fetchMarketItem = createAsyncThunk(
  'market/fetchMarketItem',
  async (itemId, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(`${API_BASE_URL}/api/v1/market/items/${itemId}`, { headers });
      const data    = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

export const unlockMarketItem = createAsyncThunk(
  'market/unlockMarketItem',
  async (itemId, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(
        `${API_BASE_URL}/api/v1/market/items/${itemId}/unlock`,
        { method: 'POST', headers }
      );
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;  // { already_unlocked, spent, new_balance, item }
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

export const fetchMyUnlocks = createAsyncThunk(
  'market/fetchMyUnlocks',
  async (_, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(`${API_BASE_URL}/api/v1/market/my-unlocks`, { headers });
      const data    = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

// ─── Slice ────────────────────────────────────────────────────────────────────

const marketSlice = createSlice({
  name: 'market',
  initialState: {
    items:     {},     // { [id]: item }
    feed:      [],     // ordered item IDs for MarketScreen
    myUnlocks: [],     // ordered item IDs of unlocked items
    loading:   false,
    unlocking: null,   // id of item currently being unlocked
    error:     null,
  },
  reducers: {
    clearMarketError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      // fetchMarketItems
      .addCase(fetchMarketItems.pending,  (state) => { state.loading = true;  state.error = null; })
      .addCase(fetchMarketItems.rejected, (state, action) => {
        state.loading = false;
        state.error   = action.payload?.detail ?? 'Failed to load market.';
      })
      .addCase(fetchMarketItems.fulfilled, (state, action) => {
        state.loading = false;
        const { items, offset } = action.payload;
        items.forEach((it) => { state.items[it.id] = it; });
        const ids = items.map((it) => it.id);
        state.feed = offset === 0 ? ids : [...state.feed, ...ids];
      })

      // fetchMarketItem
      .addCase(fetchMarketItem.fulfilled, (state, action) => {
        const it = action.payload;
        state.items[it.id] = { ...state.items[it.id], ...it };
      })

      // unlockMarketItem
      .addCase(unlockMarketItem.pending,  (state, action) => { state.unlocking = action.meta.arg; })
      .addCase(unlockMarketItem.rejected, (state, action) => {
        state.unlocking = null;
        state.error     = action.payload?.detail ?? 'Could not unlock.';
      })
      .addCase(unlockMarketItem.fulfilled, (state, action) => {
        state.unlocking = null;
        const it = action.payload.item;
        if (it) {
          state.items[it.id] = it;
          if (!state.myUnlocks.includes(it.id)) {
            state.myUnlocks.unshift(it.id);
          }
        }
      })

      // fetchMyUnlocks
      .addCase(fetchMyUnlocks.fulfilled, (state, action) => {
        const ids = action.payload.items.map((it) => it.id);
        action.payload.items.forEach((it) => { state.items[it.id] = it; });
        state.myUnlocks = ids;
      });
  },
});

export const { clearMarketError } = marketSlice.actions;

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectMarketFeed = (state) =>
  state.market.feed.map((id) => state.market.items[id]).filter(Boolean);

export const selectMarketItem = (id) => (state) => state.market.items[id] ?? null;

export const selectIsUnlocking = (id) => (state) => state.market.unlocking === id;

export default marketSlice.reducer;
