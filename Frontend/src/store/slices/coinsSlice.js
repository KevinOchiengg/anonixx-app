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

export const fetchBalance = createAsyncThunk(
  'coins/fetchBalance',
  async (_, { rejectWithValue }) => {
    try {
      const headers  = await authHeaders();
      const res      = await fetch(`${API_BASE_URL}/api/v1/coins/balance`, { headers });
      const data     = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;  // { balance }
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

export const fetchTransactions = createAsyncThunk(
  'coins/fetchTransactions',
  async (_, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(`${API_BASE_URL}/api/v1/coins/transactions`, { headers });
      const data    = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;  // array of transactions
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

export const fetchStreak = createAsyncThunk(
  'coins/fetchStreak',
  async (_, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(`${API_BASE_URL}/api/v1/rewards/streak`, { headers });
      const data    = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

export const claimDailyReward = createAsyncThunk(
  'coins/claimDailyReward',
  async (deviceId, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(`${API_BASE_URL}/api/v1/rewards/claim`, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ device_id: deviceId || null }),
      });
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;  // { coins_earned, streak, new_balance, milestone_bonus, message }
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

export const buyCoinsWithMpesa = createAsyncThunk(
  'coins/buyCoinsWithMpesa',
  async ({ packageId, phoneNumber }, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(`${API_BASE_URL}/api/v1/coins/buy/mpesa`, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ package_id: packageId, phone_number: phoneNumber }),
      });
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;  // { checkout_request_id, message, package }
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

export const checkPaymentStatus = createAsyncThunk(
  'coins/checkPaymentStatus',
  async (checkoutRequestId, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(
        `${API_BASE_URL}/api/v1/coins/buy/status/${checkoutRequestId}`,
        { headers }
      );
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;  // { status, coins, package }
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

export const fetchReferralStats = createAsyncThunk(
  'coins/fetchReferralStats',
  async (_, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(`${API_BASE_URL}/api/v1/referrals/stats`, { headers });
      const data    = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

// ─── International payment thunks ─────────────────────────────────────────────

/**
 * Stripe coin purchase.
 * Sends { package_id, payment_method_id } to the backend.
 * Backend creates + confirms a Stripe PaymentIntent and credits coins on success.
 *
 * TODO: Before going live, integrate @stripe/stripe-react-native:
 *   1. npm install @stripe/stripe-react-native
 *   2. Wrap App in <StripeProvider publishableKey={STRIPE_PK} />
 *   3. In InternationalPaymentSheet, replace card TextInputs with <CardField />
 *      and use useStripe().createPaymentMethod() to get a real payment_method_id.
 */
export const buyCoinsWithStripe = createAsyncThunk(
  'coins/buyCoinsWithStripe',
  async ({ packageId, paymentMethodId }, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(`${API_BASE_URL}/api/v1/coins/buy/stripe`, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ package_id: packageId, payment_method_id: paymentMethodId }),
      });
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data; // { status, coins, new_balance }
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

/**
 * PayPal coin purchase — step 1: create order.
 * Returns { order_id, approval_url } from backend.
 * Frontend opens approval_url in WebBrowser, then calls capturePayPalPayment.
 */
export const buyCoinsWithPayPal = createAsyncThunk(
  'coins/buyCoinsWithPayPal',
  async ({ packageId }, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(`${API_BASE_URL}/api/v1/coins/buy/paypal`, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ package_id: packageId }),
      });
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data; // { order_id, approval_url }
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

/**
 * PayPal coin purchase — step 2: capture order after user approval.
 * Called with the orderId + payerId extracted from the redirect URL.
 */
export const capturePayPalPayment = createAsyncThunk(
  'coins/capturePayPalPayment',
  async ({ orderId, payerId }, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(`${API_BASE_URL}/api/v1/coins/capture/paypal`, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ order_id: orderId, payer_id: payerId }),
      });
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data; // { status, coins, new_balance }
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

export const spendCoins = createAsyncThunk(
  'coins/spendCoins',
  async ({ reason, description }, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(`${API_BASE_URL}/api/v1/coins/spend`, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ reason, description }),
      });
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;  // { new_balance, spent, reason }
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

// Fire-and-forget: awards one-time milestone coins. Server is idempotent — safe to call multiple times.
export const awardMilestone = createAsyncThunk(
  'coins/awardMilestone',
  async (milestoneKey, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(`${API_BASE_URL}/api/v1/rewards/milestone`, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ milestone_key: milestoneKey }),
      });
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;  // { already_claimed, coins, message }
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

export const fetchReferralCode = createAsyncThunk(
  'coins/fetchReferralCode',
  async (_, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(`${API_BASE_URL}/api/v1/referrals/my-code`, { headers });
      const data    = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

// ─── Geo pricing thunks ───────────────────────────────────────────────────────

/**
 * Fetches geo-aware payment config (country, tier, show_mpesa, packages).
 * Call on CoinsScreen mount. Result is cached in Redux state.
 */
export const fetchGeoConfig = createAsyncThunk(
  'coins/fetchGeoConfig',
  async (_, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(`${API_BASE_URL}/api/v1/geo/config`, { headers });
      const data    = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;  // { country_code, tier, show_mpesa, show_stripe, packages }
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

/**
 * Creates a Stripe PaymentIntent and returns the client_secret for
 * @stripe/stripe-react-native's PaymentSheet.
 * The backend derives the correct PPP price from the user's IP.
 */
export const buyCoinsStripeIntent = createAsyncThunk(
  'coins/buyCoinsStripeIntent',
  async ({ packageId }, { rejectWithValue }) => {
    try {
      const headers = await authHeaders();
      const res     = await fetch(
        `${API_BASE_URL}/api/v1/coins/buy/stripe/create-intent`,
        {
          method:  'POST',
          headers,
          body:    JSON.stringify({ package_id: packageId }),
        }
      );
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data);
      return data;  // { client_secret, payment_intent_id, amount, currency, coins }
    } catch (e) {
      return rejectWithValue({ detail: 'Network error' });
    }
  }
);

// ─── Slice ────────────────────────────────────────────────────────────────────

const coinsSlice = createSlice({
  name: 'coins',
  initialState: {
    balance:            0,
    transactions:       [],
    // Streak
    streak:             0,
    canClaimToday:      false,
    streakInDanger:     false,
    hoursUntilNext:     0,
    nextMilestone:      null,
    nextMilestoneBonus: 0,
    monthlyClaims:      0,
    // Payment
    paymentStatus:      null,   // null | 'pending' | 'completed' | 'failed'
    pendingCheckoutId:  null,
    // Geo / PPP
    geoConfig:          null,   // { country_code, tier, show_mpesa, show_stripe, packages }
    geoLoading:         false,
    // Referral
    referralCode:       null,
    shareLink:          null,
    totalReferred:      0,
    referralCoinsEarned: 0,
    // Loading
    loading:            false,
    claimLoading:       false,
    paymentLoading:     false,
    error:              null,
  },
  reducers: {
    // Optimistic updates for instant UI response
    addCoinsOptimistic: (state, action) => {
      state.balance += action.payload;
    },
    subtractCoinsOptimistic: (state, action) => {
      state.balance = Math.max(0, state.balance - action.payload);
    },
    clearPaymentState: (state) => {
      state.paymentStatus     = null;
      state.pendingCheckoutId = null;
      state.paymentLoading    = false;
    },
    setBalance: (state, action) => {
      state.balance = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchBalance
      .addCase(fetchBalance.fulfilled, (state, action) => {
        state.balance = action.payload.balance;
        state.loading = false;
      })
      .addCase(fetchBalance.pending, (state) => { state.loading = true; })
      .addCase(fetchBalance.rejected, (state) => { state.loading = false; })

      // fetchTransactions
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.transactions = action.payload;
      })

      // fetchStreak
      .addCase(fetchStreak.fulfilled, (state, action) => {
        const d = action.payload;
        state.streak             = d.streak;
        state.canClaimToday      = d.can_claim;
        state.streakInDanger     = d.streak_in_danger;
        state.hoursUntilNext     = d.hours_until_next;
        state.nextMilestone      = d.next_milestone;
        state.nextMilestoneBonus = d.next_milestone_bonus;
        state.monthlyClaims      = d.monthly_claims;
        state.balance            = d.coin_balance;
      })

      // claimDailyReward
      .addCase(claimDailyReward.pending,  (state) => { state.claimLoading = true; })
      .addCase(claimDailyReward.rejected, (state) => { state.claimLoading = false; })
      .addCase(claimDailyReward.fulfilled, (state, action) => {
        state.claimLoading  = false;
        state.balance       = action.payload.new_balance;
        state.streak        = action.payload.streak;
        state.canClaimToday = false;
      })

      // buyCoinsWithMpesa
      .addCase(buyCoinsWithMpesa.pending, (state) => { state.paymentLoading = true; })
      .addCase(buyCoinsWithMpesa.rejected, (state) => { state.paymentLoading = false; })
      .addCase(buyCoinsWithMpesa.fulfilled, (state, action) => {
        state.paymentLoading    = false;
        state.paymentStatus     = 'pending';
        state.pendingCheckoutId = action.payload.checkout_request_id;
      })

      // checkPaymentStatus
      .addCase(checkPaymentStatus.fulfilled, (state, action) => {
        state.paymentStatus = action.payload.status;
        if (action.payload.status === 'completed') {
          state.pendingCheckoutId = null;
        }
      })

      // fetchReferralStats
      .addCase(fetchReferralStats.fulfilled, (state, action) => {
        state.totalReferred      = action.payload.total_referred;
        state.referralCoinsEarned = action.payload.coins_earned;
      })

      // fetchReferralCode
      .addCase(fetchReferralCode.fulfilled, (state, action) => {
        state.referralCode = action.payload.code;
        state.shareLink    = action.payload.share_link;
      })

      // spendCoins
      .addCase(spendCoins.fulfilled, (state, action) => {
        state.balance = action.payload.new_balance;
      })

      // awardMilestone — update balance only if coins were actually awarded
      .addCase(awardMilestone.fulfilled, (state, action) => {
        if (!action.payload.already_claimed && action.payload.new_balance != null) {
          state.balance = action.payload.new_balance;
        }
      })

      // fetchGeoConfig
      .addCase(fetchGeoConfig.pending,  (state) => { state.geoLoading = true; })
      .addCase(fetchGeoConfig.rejected, (state) => { state.geoLoading = false; })
      .addCase(fetchGeoConfig.fulfilled, (state, action) => {
        state.geoLoading = false;
        state.geoConfig  = action.payload;
      })

      // buyCoinsStripeIntent (creates PaymentIntent — no balance change yet)
      .addCase(buyCoinsStripeIntent.pending,  (state) => { state.paymentLoading = true; })
      .addCase(buyCoinsStripeIntent.rejected, (state) => { state.paymentLoading = false; })
      .addCase(buyCoinsStripeIntent.fulfilled, (state) => { state.paymentLoading = false; })

      // buyCoinsWithStripe (legacy direct-confirm flow — kept for backward compat)
      .addCase(buyCoinsWithStripe.pending,  (state) => { state.paymentLoading = true; })
      .addCase(buyCoinsWithStripe.rejected, (state) => { state.paymentLoading = false; })
      .addCase(buyCoinsWithStripe.fulfilled, (state, action) => {
        state.paymentLoading = false;
        state.paymentStatus  = 'completed';
        if (action.payload.new_balance != null) {
          state.balance = action.payload.new_balance;
        }
      })

      // buyCoinsWithPayPal (create order — no balance change yet)
      .addCase(buyCoinsWithPayPal.pending,  (state) => { state.paymentLoading = true; })
      .addCase(buyCoinsWithPayPal.rejected, (state) => { state.paymentLoading = false; })
      .addCase(buyCoinsWithPayPal.fulfilled, (state) => {
        state.paymentLoading = false;
        // Order created — wait for capture before marking complete
      })

      // capturePayPalPayment
      .addCase(capturePayPalPayment.pending,  (state) => { state.paymentLoading = true; })
      .addCase(capturePayPalPayment.rejected, (state) => { state.paymentLoading = false; })
      .addCase(capturePayPalPayment.fulfilled, (state, action) => {
        state.paymentLoading = false;
        state.paymentStatus  = 'completed';
        if (action.payload.new_balance != null) {
          state.balance = action.payload.new_balance;
        }
      });
  },
});

export const {
  addCoinsOptimistic,
  subtractCoinsOptimistic,
  clearPaymentState,
  setBalance,
} = coinsSlice.actions;


export default coinsSlice.reducer;
