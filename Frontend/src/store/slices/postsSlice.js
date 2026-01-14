import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { feedAPI } from '../../services/api'

// Initial State
const initialState = {
  feed: [], // ✅ CRITICAL: Initialize as empty array
  selectedPost: null,
  loading: false,
  error: null,
}

// Async Thunks
export const fetchFeed = createAsyncThunk(
  'posts/fetchFeed',
  async (page = 1, { rejectWithValue }) => {
    try {
      console.log('🔵 Fetching feed...', { page })
      const response = await feedAPI.getFeed(page)
      console.log('✅ Feed fetched:', response.length, 'posts')
      return response
    } catch (error) {
      console.error('❌ Error fetching feed:', error)
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const createPost = createAsyncThunk(
  'posts/create',
  async (postData, { rejectWithValue }) => {
    try {
      console.log('🔵 Creating post...', postData)
      const response = await feedAPI.createPost(postData)
      console.log('✅ Post created:', response)
      return response
    } catch (error) {
      console.error('❌ Error creating post:', error)
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const reactToPost = createAsyncThunk(
  'posts/react',
  async ({ postId, reaction }, { rejectWithValue }) => {
    try {
      const response = await feedAPI.reactToPost(postId, reaction)
      return { postId, reaction }
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

export const deletePost = createAsyncThunk(
  'posts/delete',
  async (postId, { rejectWithValue }) => {
    try {
      await feedAPI.deletePost(postId)
      return postId
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message)
    }
  }
)

// Slice
const postsSlice = createSlice({
  name: 'posts',
  initialState,
  reducers: {
    clearFeed: (state) => {
      state.feed = []
    },
    setSelectedPost: (state, action) => {
      state.selectedPost = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Feed
      .addCase(fetchFeed.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchFeed.fulfilled, (state, action) => {
        state.loading = false
        // ✅ FIXED: Ensure feed is always an array
        if (Array.isArray(action.payload)) {
          state.feed = action.payload
        } else {
          state.feed = action.payload.posts || []
        }
      })
      .addCase(fetchFeed.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
        state.feed = [] // ✅ FIXED: Set to empty array on error
      })

      // Create Post
      .addCase(createPost.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createPost.fulfilled, (state, action) => {
        state.loading = false
        // ✅ FIXED: Initialize feed if undefined, then add new post
        if (!Array.isArray(state.feed)) {
          state.feed = []
        }
        state.feed.unshift(action.payload)
      })
      .addCase(createPost.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

      // React to Post
      .addCase(reactToPost.fulfilled, (state, action) => {
        const { postId, reaction } = action.payload
        const post = state.feed?.find((p) => p.id === postId)
        if (post) {
          if (!post.reactions) post.reactions = {}
          post.reactions.user = reaction
          post.reactions_count = Object.keys(post.reactions).length
        }
      })

      // Delete Post
      .addCase(deletePost.fulfilled, (state, action) => {
        if (Array.isArray(state.feed)) {
          state.feed = state.feed.filter((post) => post.id !== action.payload)
        }
      })
  },
})

export const { clearFeed, setSelectedPost } = postsSlice.actions
export default postsSlice.reducer
