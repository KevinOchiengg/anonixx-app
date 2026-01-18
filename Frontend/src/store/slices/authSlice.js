import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { authAPI } from '../../services/api'

// ==========================================
// Authentication Thunks
// ==========================================

export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      console.log('🔵 Attempting login with:', email)

      const response = await authAPI.login({ email, password })
      console.log('✅ Login successful:', response.data)

      // Save token to AsyncStorage
      await AsyncStorage.setItem('token', response.data.access_token)
      await AsyncStorage.setItem('authToken', response.data.access_token)

      return {
        user: response.data.user,
        token: response.data.access_token,
      }
    } catch (error) {
      console.error('❌ Login error:', error.response?.data || error.message)
      return rejectWithValue(error.response?.data || { detail: 'Login failed' })
    }
  }
)

export const signup = createAsyncThunk(
  'auth/signup',
  async (userData, { rejectWithValue }) => {
    try {
      console.log('🔵 Attempting signup')

      const response = await authAPI.register(userData)
      console.log('✅ Signup successful:', response.data)

      // Save token to AsyncStorage
      await AsyncStorage.setItem('token', response.data.access_token)
      await AsyncStorage.setItem('authToken', response.data.access_token)

      // ✅ CLEAR interests flag for new users
      await AsyncStorage.removeItem('hasInterests')
      console.log('✅ Cleared hasInterests flag for new user')

      return {
        user: response.data.user,
        token: response.data.access_token,
      }
    } catch (error) {
      console.error('❌ Signup error:', error.response?.data || error.message)
      return rejectWithValue(
        error.response?.data || { detail: 'Signup failed' }
      )
    }
  }
)

export const fetchProfile = createAsyncThunk(
  'auth/fetchProfile',
  async (_, { rejectWithValue }) => {
    try {
      console.log('🔵 Fetching user profile')
      const response = await authAPI.getCurrentUser()
      console.log('✅ Profile fetched:', response.data)
      return response.data
    } catch (error) {
      console.error(
        '❌ Fetch profile error:',
        error.response?.data || error.message
      )
      return rejectWithValue(
        error.response?.data || { detail: 'Failed to fetch profile' }
      )
    }
  }
)

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (profileData, { rejectWithValue }) => {
    try {
      console.log('🔵 Updating profile:', profileData)
      const token = await AsyncStorage.getItem('token')

      const response = await fetch(
        'http://localhost:8000/api/v1/auth/update-profile',
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(profileData),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to update profile')
      }

      console.log('✅ Profile updated:', data)
      return data
    } catch (error) {
      console.error('❌ Update profile error:', error)
      return rejectWithValue({ detail: error.message })
    }
  }
)

// ==========================================
// Auth Slice
// ==========================================

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    token: null,
    isAuthenticated: false,
    loading: false,
    error: null,
  },
  reducers: {
    // Clear error
    clearError: (state) => {
      state.error = null
      console.log('✅ Error cleared')
    },

    // Update user (for real-time updates)
    updateUser: (state, action) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload }
        console.log('✅ User updated in Redux:', state.user)
      }
    },

    // Set credentials (for restoring session)
    setCredentials: (state, action) => {
      state.user = action.payload.user
      state.token = action.payload.token
      state.isAuthenticated = true
      console.log('✅ Credentials set:', action.payload.user?.username)
    },

    // Logout
    logout: (state) => {
      console.log('🔵 Logging out user...')

      // Clear state
      state.user = null
      state.token = null
      state.isAuthenticated = false
      state.loading = false
      state.error = null

      // Clear AsyncStorage (async, but fire and forget)
      AsyncStorage.multiRemove([
        'token',
        'authToken',
        'refreshToken',
        'hasInterests',
      ])
        .then(() =>
          console.log('✅ All tokens and flags cleared from AsyncStorage')
        )
        .catch((error) => console.error('❌ Error clearing storage:', error))

      console.log('✅ User logged out from Redux')
    },
  },
  extraReducers: (builder) => {
    builder
      // ==========================================
      // Login
      // ==========================================
      .addCase(login.pending, (state) => {
        state.loading = true
        state.error = null
        console.log('🔵 Login pending...')
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false
        state.isAuthenticated = true
        state.user = action.payload.user
        state.token = action.payload.token
        state.error = null
        console.log('✅ User logged in:', action.payload.user?.username)
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false
        state.isAuthenticated = false
        state.user = null
        state.token = null
        state.error =
          action.payload?.detail || action.payload?.message || 'Login failed'
        console.error('❌ Login rejected:', state.error)
      })

      // ==========================================
      // Signup
      // ==========================================
      .addCase(signup.pending, (state) => {
        state.loading = true
        state.error = null
        console.log('🔵 Signup pending...')
      })
      .addCase(signup.fulfilled, (state, action) => {
        state.loading = false
        state.isAuthenticated = true
        state.user = action.payload.user
        state.token = action.payload.token
        state.error = null
        console.log('✅ User signed up:', action.payload.user?.username)
      })
      .addCase(signup.rejected, (state, action) => {
        state.loading = false
        state.isAuthenticated = false
        state.user = null
        state.token = null
        state.error =
          action.payload?.detail || action.payload?.message || 'Signup failed'
        console.error('❌ Signup rejected:', state.error)
      })

      // ==========================================
      // Fetch Profile
      // ==========================================
      .addCase(fetchProfile.pending, (state) => {
        state.loading = true
        console.log('🔵 Fetching profile...')
      })
      .addCase(fetchProfile.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload
        state.isAuthenticated = true
        console.log('✅ Profile loaded:', action.payload?.username)
      })
      .addCase(fetchProfile.rejected, (state, action) => {
        state.loading = false
        state.isAuthenticated = false
        state.user = null
        state.token = null
        console.error('❌ Profile fetch failed:', action.payload)
      })

      // ==========================================
      // Update Profile
      // ==========================================
      .addCase(updateProfile.pending, (state) => {
        state.loading = true
        state.error = null
        console.log('🔵 Updating profile...')
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.loading = false
        if (state.user) {
          // Merge updated fields into user
          state.user = {
            ...state.user,
            username: action.payload.username || state.user.username,
            email: action.payload.email || state.user.email,
            anonymous_name:
              action.payload.anonymous_name || state.user.anonymous_name,
            coin_balance:
              action.payload.coin_balance ?? state.user.coin_balance,
          }
        }
        state.error = null
        console.log('✅ Profile updated:', state.user?.username)
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload?.detail || 'Failed to update profile'
        console.error('❌ Profile update failed:', state.error)
      })
  },
})

export const { clearError, updateUser, setCredentials, logout } =
  authSlice.actions
export default authSlice.reducer
