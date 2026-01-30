import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

const API_URL = `${API_BASE_URL}/api/v1`

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    console.log('🔵 API Request:', config.method.toUpperCase(), config.url)
    return config
  },
  (error) => {
    console.error('❌ Request Error:', error)
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => {
    console.log('✅ API Response:', response.status, response.config.url)
    return response
  },
  (error) => {
    console.error(
      '❌ API Response Error:',
      error.response?.status,
      error.message
    )
    if (error.response?.status === 401) {
      AsyncStorage.removeItem('token')
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  register: async (data) => {
    const response = await api.post('/auth/register', data) 
    if (response.data.access_token) {
      await AsyncStorage.setItem('token', response.data.access_token)
    }
    return response
  },

  login: async (data) => {
    const response = await api.post('/auth/login', data)
    if (response.data.access_token) {
      await AsyncStorage.setItem('token', response.data.access_token)
      console.log('✅ Token saved')
    }
    return response
  },

  logout: async () => {
    await AsyncStorage.removeItem('token')
  },

  getCurrentUser: () => api.get('/auth/me'),
}

export const postsAPI = {
  getFeed: async (page = 1) => {
    const response = await api.get('/posts/feed', { params: { page } })
    return response.data
  },

  createPost: async (data) => {
    const response = await api.post('/posts', data)
    return response.data
  },

  likePost: async (postId) => {
    const response = await api.post(`/posts/${postId}/like`)
    return response.data
  },

  commentOnPost: async (postId, content) => {
    const response = await api.post(`/posts/${postId}/comments`, { content })
    return response.data
  },

  getComments: async (postId) => {
    const response = await api.get(`/posts/${postId}/comments`)
    return response.data
  },
}

export const feedAPI = {
  getFeed: async (page = 1) => {
    const response = await api.get('/posts/feed', { params: { page } })
    return response.data
  },

  getTrending: async () => {
    const response = await api.get('/posts/trending')
    return response.data
  },

  createPost: async (data) => {
    const response = await api.post('/posts', data)
    return response.data
  },

  reactToPost: async (postId, reaction) => {
    const response = await api.post(`/posts/${postId}/react`, { reaction })
    return response.data
  },

  replyToPost: async (postId, content) => {
    const response = await api.post(`/posts/${postId}/reply`, { content })
    return response.data
  },

  deletePost: async (postId) => {
    const response = await api.delete(`/posts/${postId}`)
    return response.data
  },

  getPostReplies: async (postId) => {
    const response = await api.get(`/posts/${postId}/replies`)
    return response.data
  },
}

export const groupsAPI = {
  getGroups: async (page = 1, category = null) => {
    const params = { page }
    if (category) params.category = category
    const response = await api.get('/groups', { params })
    return response.data
  },

  createGroup: async (data) => {
    const response = await api.post('/groups', data)
    return response.data
  },

  getGroupDetail: async (groupId) => {
    const response = await api.get(`/groups/${groupId}`)
    return response.data
  },

  joinGroup: async (groupId) => {
    const response = await api.post(`/groups/${groupId}/join`)
    return response.data
  },

  leaveGroup: async (groupId) => {
    const response = await api.post(`/groups/${groupId}/leave`)
    return response.data
  },

  postInGroup: async (groupId, data) => {
    
    const response = await api.post(`/groups/${groupId}/posts`, data)
    return response.data
  },

  getGroupMembers: async (groupId) => {
    const response = await api.get(`/groups/${groupId}/members`)
    return response.data
  },
}

export const datingAPI = {
  getProfiles: async (filters) => {
    const response = await api.get('/dating/profiles', { params: filters })
    return response.data
  },

  swipe: async (profileId, direction) => {
    const response = await api.post('/dating/swipe', {
      profile_id: profileId,
      direction,
    })
    return response.data
  },

  getMatches: async () => {
    const response = await api.get('/dating/matches')
    return response.data
  },

  revealIdentity: async (matchId) => {
    const response = await api.post('/dating/reveal', { matchId })
    return response.data
  },

  sendIcebreaker: async (matchId, question) => {
    const response = await api.post('/dating/icebreaker', { matchId, question })
    return response.data
  },
}

export const messagesAPI = {
  getConversations: async () => {
    const response = await api.get('/messages/conversations')
    return response.data
  },

  getMessages: async (conversationId) => {
    const response = await api.get(`/messages/conversations/${conversationId}`)
    return response.data
  },

  sendMessage: async (conversationId, content) => {
    const response = await api.post(
      `/messages/conversations/${conversationId}`,
      { content }
    )
    return response.data
  },

  markAsRead: async (chatId, messageId) => {
    const response = await api.post(
      `/chats/${chatId}/messages/${messageId}/read`
    )
    return response.data
  },

  reactToMessage: async (chatId, messageId, reaction) => {
    const response = await api.post(
      `/chats/${chatId}/messages/${messageId}/react`,
      { reaction }
    )
    return response.data
  },
}

export const userAPI = {
  getProfile: async () => {
    const response = await api.get('/users/me')
    return response.data
  },

  updateProfile: async (data) => {
    const response = await api.put('/users/me', data)
    return response.data
  },

  getCoinBalance: async () => {
    const response = await api.get('/coins/balance')
    return response.data
  },

  purchaseCoins: async (amount) => {
    const response = await api.post('/coins/purchase', { amount })
    return response.data
  },
}

export const coinsAPI = {
  getBalance: async () => {
    const response = await api.get('/coins/balance')
    return response.data
  },

  earnCoins: async (action, amount) => {
    const response = await api.post('/coins/earn', { action, amount })
    return response.data
  },

  spendCoins: async (item, amount) => {
    const response = await api.post('/coins/spend', { item, amount })
    return response.data
  },

  getTransactions: async () => {
    const response = await api.get('/coins/transactions')
    return response.data
  },
}

export const premiumAPI = {
  getStatus: async () => {
    const response = await api.get('/premium/status')
    return response.data
  },

  subscribe: async (planId) => {
    const response = await api.post('/premium/subscribe', { planId })
    return response.data
  },

  purchaseCoins: async (bundleId) => {
    const response = await api.post('/premium/coins', { bundleId })
    return response.data
  },

  cancelSubscription: async () => {
    const response = await api.post('/premium/cancel')
    return response.data
  },
}

export const moderationAPI = {
  checkContent: async (content) => {
    const response = await api.post('/moderation/check', { content })
    return response.data
  },

  reportContent: async (contentId, reason) => {
    const response = await api.post('/report', { contentId, reason })
    return response.data
  },

  blockUser: async (userId) => {
    const response = await api.post('/block', { userId })
    return response.data
  },

  unblockUser: async (userId) => {
    const response = await api.delete(`/block/${userId}`)
    return response.data
  },
}

export default api
