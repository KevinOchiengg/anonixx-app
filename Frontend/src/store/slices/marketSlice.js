/** Mini Market state: items (by id), feed (ids in order), loading, unlocking (id), error. */

import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
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

// ─── Slice ────────────────────────────────────────────────────────────────────

const marketSlice = createSlice({
  name: 'market',
  initialState: {
    items:     {},     // { [id]: item }
    feed:      [],     // ordered item IDs for MarketScreen
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
        if (it) state.items[it.id] = it;
      });
  },
});

export const { clearMarketError } = marketSlice.actions;

// ─── Selectors ────────────────────────────────────────────────────────────────

// Memoized so useSelector doesn't re-render on unrelated store changes.
export const selectMarketFeed = createSelector(
  [(state) => state.market.feed, (state) => state.market.items],
  (feed, items) => feed.map((id) => items[id]).filter(Boolean),
);

export const selectMarketItem = (id) => (state) => state.market.items[id] ?? null;

export const selectIsUnlocking = (id) => (state) => state.market.unlocking === id;

export default marketSlice.reducer;
