import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { groupsAPI } from '../../services/api'

// Fetch all groups
export const fetchGroups = createAsyncThunk(
  'groups/fetchGroups',
  async (_, { rejectWithValue }) => {
    try {
      console.log('🔵 Fetching groups...')
      const data = await groupsAPI.getGroups() // ✅ Returns data directly
      console.log('✅ Groups fetched:', data)
      return data
    } catch (error) {
      console.error('❌ Fetch groups error:', error)
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

// Fetch group detail
export const fetchGroupDetail = createAsyncThunk(
  'groups/fetchGroupDetail',
  async (groupId, { rejectWithValue }) => {
    try {
      console.log('🔵 Fetching group detail:', groupId)
      const data = await groupsAPI.getGroupDetail(groupId) // ✅ Fixed method name
      console.log('✅ Group detail fetched:', data)
      return data
    } catch (error) {
      console.error('❌ Fetch group detail error:', error)
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

// Create group
export const createGroup = createAsyncThunk(
  'groups/createGroup',
  async (groupData, { rejectWithValue }) => {
    try {
      console.log('🔵 Creating group:', groupData)
      const data = await groupsAPI.createGroup(groupData) // ✅ Returns data directly
      console.log('✅ Group created:', data)
      return data
    } catch (error) {
      console.error('❌ Create group error:', error)
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

const groupsSlice = createSlice({
  name: 'groups',
  initialState: {
    groups: [],
    currentGroup: null,
    loading: false,
    error: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch groups
      .addCase(fetchGroups.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchGroups.fulfilled, (state, action) => {
        state.loading = false
        state.groups = action.payload
        console.log('✅ Groups stored in Redux:', state.groups.length)
      })
      .addCase(fetchGroups.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
        console.log('❌ Fetch groups rejected:', action.payload)
      })

      // Fetch group detail
      .addCase(fetchGroupDetail.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchGroupDetail.fulfilled, (state, action) => {
        state.loading = false
        state.currentGroup = action.payload
      })
      .addCase(fetchGroupDetail.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

      // Create group
      .addCase(createGroup.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createGroup.fulfilled, (state, action) => {
        state.loading = false
        state.groups = [action.payload, ...state.groups]
      })
      .addCase(createGroup.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  },
})

export const { clearError } = groupsSlice.actions
export default groupsSlice.reducer
