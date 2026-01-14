import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { coinsAPI } from '../../services/api'

export const fetchBalance = createAsyncThunk(
  'coins/fetchBalance',
  async (_, { rejectWithValue }) => {
    try {
      const response = await coinsAPI.getBalance()
      return response.data
    } catch (error) {
      return rejectWithValue(error.response.data)
    }
  }
)

export const earnCoins = createAsyncThunk(
  'coins/earn',
  async ({ action, amount }, { rejectWithValue }) => {
    try {
      const response = await coinsAPI.earnCoins(action, amount)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response.data)
    }
  }
)

export const spendCoins = createAsyncThunk(
  'coins/spend',
  async ({ item, amount }, { rejectWithValue }) => {
    try {
      const response = await coinsAPI.spendCoins(item, amount)
      return response.data
    } catch (error) {
      return rejectWithValue(error.response.data)
    }
  }
)

const coinsSlice = createSlice({
  name: 'coins',
  initialState: {
    balance: 0,
    transactions: [],
    streakDays: 0,
    lastEarned: null,
    loading: false,
  },
  reducers: {
    addCoinsOptimistic: (state, action) => {
      state.balance += action.payload
    },
    subtractCoinsOptimistic: (state, action) => {
      state.balance -= action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBalance.fulfilled, (state, action) => {
        state.balance = action.payload.balance
        state.streakDays = action.payload.streakDays
      })
      .addCase(earnCoins.fulfilled, (state, action) => {
        state.balance = action.payload.balance
        state.lastEarned = action.payload.earned
      })
      .addCase(spendCoins.fulfilled, (state, action) => {
        state.balance = action.payload.balance
      })
  },
})

export const { addCoinsOptimistic, subtractCoinsOptimistic } =
  coinsSlice.actions
export default coinsSlice.reducer
