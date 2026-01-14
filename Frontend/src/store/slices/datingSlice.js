import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { datingAPI } from '../../services/api'

export const fetchProfiles = createAsyncThunk(
  'dating/fetchProfiles',
  async (filters, { rejectWithValue }) => {
    try {
      const response = await datingAPI.getProfiles(filters)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response.data)
    }
  }
)

export const swipeProfile = createAsyncThunk(
  'dating/swipe',
  async ({ profileId, direction }, { rejectWithValue }) => {
    try {
      const response = await datingAPI.swipe(profileId, direction)
      return { profileId, direction, match: response.data.match }
    } catch (error) {
      return rejectWithValue(error.response.data)
    }
  }
)

export const fetchMatches = createAsyncThunk(
  'dating/fetchMatches',
  async (_, { rejectWithValue }) => {
    try {
      const response = await datingAPI.getMatches()
      return response.data
    } catch (error) {
      return rejectWithValue(error.response.data)
    }
  }
)

const datingSlice = createSlice({
  name: 'dating',
  initialState: {
    profiles: [],
    currentIndex: 0,
    matches: [],
    recentMatch: null,
    loading: false,
    error: null,
  },
  reducers: {
    nextProfile: (state) => {
      if (state.currentIndex < state.profiles.length - 1) {
        state.currentIndex += 1
      }
    },
    clearRecentMatch: (state) => {
      state.recentMatch = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProfiles.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchProfiles.fulfilled, (state, action) => {
        state.loading = false
        state.profiles = action.payload.profiles
        state.currentIndex = 0
      })
      .addCase(fetchProfiles.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload?.message
      })
      .addCase(swipeProfile.fulfilled, (state, action) => {
        if (action.payload.match) {
          state.recentMatch = action.payload.match
          state.matches.unshift(action.payload.match)
        }
        state.currentIndex += 1
      })
      .addCase(fetchMatches.fulfilled, (state, action) => {
        state.matches = action.payload.matches
      })
  },
})

export const { nextProfile, clearRecentMatch } = datingSlice.actions
export default datingSlice.reducer
