import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../../services/api';
import { API_BASE_URL } from '../../config/api';

// ─── Safe JSON parse ──────────────────────────────────────────
// Prevents crash when server returns HTML error page or plain text
async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { detail: `Server error (${response.status})` };
  }
}

// ─── Thunks ───────────────────────────────────────────────────
export const login = createAsyncThunk(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(credentials),
      });

      const data = await safeJson(response);

      if (!response.ok) {
        return rejectWithValue(data);
      }

      if (!data.access_token) {
        return rejectWithValue({ detail: 'No token received. Try again.' });
      }

      await AsyncStorage.setItem('token', data.access_token);
      await AsyncStorage.setItem('user', JSON.stringify(data.user));

      return data;
    } catch (error) {
      return rejectWithValue({ detail: error.message });
    }
  },
);

export const signup = createAsyncThunk(
  'auth/signup',
  async (userData, { rejectWithValue }) => {
    try {
      const response = await authAPI.register(userData);

      await AsyncStorage.setItem('token', response.data.access_token);
      await AsyncStorage.setItem('authToken', response.data.access_token);
      await AsyncStorage.removeItem('hasInterests');

      return {
        user:  response.data.user,
        token: response.data.access_token,
      };
    } catch (error) {
      return rejectWithValue(
        error.response?.data || { detail: 'Signup failed' }
      );
    }
  },
);

export const fetchProfile = createAsyncThunk(
  'auth/fetchProfile',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authAPI.getCurrentUser();
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data || { detail: 'Failed to fetch profile' }
      );
    }
  },
);

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (profileData, { rejectWithValue }) => {
    try {
      const token    = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/update-profile`, {
        method:  'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify(profileData),
      });

      const data = await safeJson(response);

      if (!response.ok) {
        return rejectWithValue({ detail: data.detail || 'Failed to update profile' });
      }

      return data;
    } catch (error) {
      return rejectWithValue({ detail: error.message });
    }
  },
);

// ─── Slice ────────────────────────────────────────────────────
const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user:            null,
    token:           null,
    isAuthenticated: false,
    loading:         false,
    error:           null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    updateUser: (state, action) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
      }
    },
    setCredentials: (state, action) => {
      state.user            = action.payload.user;
      state.token           = action.payload.token;
      state.isAuthenticated = true;
    },
    logout: (state) => {
      state.user            = null;
      state.token           = null;
      state.isAuthenticated = false;
      state.loading         = false;
      state.error           = null;
      AsyncStorage.multiRemove([
        'token', 'authToken', 'refreshToken', 'hasInterests',
      ]).catch(() => {});
    },
  },
  extraReducers: (builder) => {
    builder
      // ── Login ────────────────────────────────────────────────
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error   = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading         = false;
        state.isAuthenticated = true;
        state.user            = action.payload.user;
        state.token           = action.payload.token;
        state.error           = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading         = false;
        state.isAuthenticated = false;
        state.user            = null;
        state.token           = null;
        state.error =
          action.payload?.detail ||
          action.payload?.message ||
          'Login failed';
      })

      // ── Signup ───────────────────────────────────────────────
      .addCase(signup.pending, (state) => {
        state.loading = true;
        state.error   = null;
      })
      .addCase(signup.fulfilled, (state, action) => {
        state.loading         = false;
        state.isAuthenticated = true;
        state.user            = action.payload.user;
        state.token           = action.payload.token;
        state.error           = null;
      })
      .addCase(signup.rejected, (state, action) => {
        state.loading         = false;
        state.isAuthenticated = false;
        state.user            = null;
        state.token           = null;
        state.error =
          action.payload?.detail ||
          action.payload?.message ||
          'Signup failed';
      })

      // ── Fetch Profile ────────────────────────────────────────
      .addCase(fetchProfile.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchProfile.fulfilled, (state, action) => {
        state.loading         = false;
        state.user            = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(fetchProfile.rejected, (state) => {
        state.loading         = false;
        state.isAuthenticated = false;
        state.user            = null;
        state.token           = null;
      })

      // ── Update Profile ───────────────────────────────────────
      .addCase(updateProfile.pending, (state) => {
        state.loading = true;
        state.error   = null;
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.loading = false;
        if (state.user) {
          state.user = {
            ...state.user,
            username:       action.payload.username       || state.user.username,
            email:          action.payload.email          || state.user.email,
            anonymous_name: action.payload.anonymous_name || state.user.anonymous_name,
            coin_balance:   action.payload.coin_balance   ?? state.user.coin_balance,
          };
        }
        state.error = null;
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.loading = false;
        state.error   = action.payload?.detail || 'Failed to update profile';
      });
  },
});

export const { clearError, updateUser, setCredentials, logout } = authSlice.actions;
export default authSlice.reducer;
