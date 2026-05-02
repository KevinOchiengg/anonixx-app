/**
 * locationSlice.js
 *
 * Stores the user's detected country and derived payment region.
 * Dispatched once on app boot via AppNavigator.
 *
 * State shape:
 *   countryCode   — ISO 3166-1 alpha-2, e.g. 'KE', 'US'
 *   country       — Human-readable, e.g. 'Kenya'
 *   region        — 'kenya' | 'international'
 *   currency      — 'KES' | 'USD'
 *   supportsMpesa — true only for KE (until other integrations are added)
 *   detected      — false until first detection completes (success or failure)
 *   loading       — true while detection is in flight
 */

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { detectPaymentRegion } from '../../utils/geolocation';

// ─── Thunk ────────────────────────────────────────────────────────────────────

export const detectLocation = createAsyncThunk(
  'location/detect',
  async (_, { rejectWithValue }) => {
    try {
      return await detectPaymentRegion();
    } catch (e) {
      // Should never throw (geolocation catches internally), but guard anyway
      return rejectWithValue({
        countryCode:   'US',
        country:       'Unknown',
        supportsMpesa: false,
        currency:      'USD',
        region:        'international',
      });
    }
  }
);

// ─── Slice ────────────────────────────────────────────────────────────────────

const INTERNATIONAL_DEFAULTS = {
  countryCode:   null,
  country:       null,
  supportsMpesa: false,
  currency:      'USD',
  region:        'international',
};

const locationSlice = createSlice({
  name: 'location',
  initialState: {
    ...INTERNATIONAL_DEFAULTS,
    detected: false,
    loading:  false,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(detectLocation.pending, (state) => {
        state.loading = true;
      })
      .addCase(detectLocation.fulfilled, (state, action) => {
        const { countryCode, country, supportsMpesa, currency, region } = action.payload;
        state.countryCode   = countryCode;
        state.country       = country;
        state.supportsMpesa = supportsMpesa;
        state.currency      = currency;
        state.region        = region;
        state.detected      = true;
        state.loading       = false;
      })
      .addCase(detectLocation.rejected, (state, action) => {
        // Apply fallback values from rejectWithValue payload
        const fb = action.payload ?? INTERNATIONAL_DEFAULTS;
        state.countryCode   = fb.countryCode;
        state.country       = fb.country;
        state.supportsMpesa = fb.supportsMpesa;
        state.currency      = fb.currency;
        state.region        = fb.region;
        state.detected      = true;
        state.loading       = false;
      });
  },
});

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectRegion        = (state) => state.location.region;
export const selectCurrency      = (state) => state.location.currency;
export const selectSupportsMpesa = (state) => state.location.supportsMpesa;
export const selectLocationReady = (state) => state.location.detected;

export default locationSlice.reducer;
