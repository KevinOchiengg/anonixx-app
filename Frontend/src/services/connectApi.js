import AsyncStorage from '@react-native-async-storage/async-storage'
import { API_BASE_URL } from '../config/api'

// Helper function
const getHeaders = async () => {
  const token = await AsyncStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  }
}

// ==================== BROADCASTS ====================

export const createBroadcast = async (data) => {
  const response = await fetch(`${API_BASE_URL}/api/v1/connect/broadcasts`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to create broadcast')
  }

  return response.json()
}

export const getBroadcasts = async (skip = 0, limit = 20, vibeTags = null) => {
  let url = `${API_BASE_URL}/api/v1/connect/broadcasts?skip=${skip}&limit=${limit}`
  if (vibeTags) {
    url += `&vibe_tags=${vibeTags}`
  }

  const response = await fetch(url, {
    headers: await getHeaders(),
  })

  return response.json()
}

export const getMyActiveBroadcast = async () => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/broadcasts/my-active`,
    {
      headers: await getHeaders(),
    },
  )

  return response.json()
}

export const deactivateBroadcast = async (broadcastId) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/broadcasts/${broadcastId}`,
    {
      method: 'DELETE',
      headers: await getHeaders(),
    },
  )

  return response.json()
}

// ==================== OPENERS ====================

export const sendOpener = async (broadcastId, message) => {
  const response = await fetch(`${API_BASE_URL}/api/v1/connect/openers`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({
      broadcast_id: broadcastId,
      message,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to send opener')
  }

  return response.json()
}

export const getPendingOpeners = async () => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/connections/pending`,
    {
      headers: await getHeaders(),
    },
  )

  return response.json()
}

export const acceptOpener = async (connectionId) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/connections/${connectionId}/accept`,
    {
      method: 'POST',
      headers: await getHeaders(),
    },
  )

  return response.json()
}

export const declineOpener = async (connectionId) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/connections/${connectionId}/decline`,
    {
      method: 'POST',
      headers: await getHeaders(),
    },
  )

  return response.json()
}

// ==================== CONNECTIONS ====================

export const getConnections = async () => {
  const response = await fetch(`${API_BASE_URL}/api/v1/connect/connections`, {
    headers: await getHeaders(),
  })

  return response.json()
}

export const getConnectionDetails = async (connectionId) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/connections/${connectionId}`,
    {
      headers: await getHeaders(),
    },
  )

  return response.json()
}

// ==================== MESSAGES ====================

export const sendMessage = async (connectionId, content) => {
  const response = await fetch(`${API_BASE_URL}/api/v1/connect/messages`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({
      connection_id: connectionId,
      content,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to send message')
  }

  return response.json()
}

export const getMessages = async (connectionId, skip = 0, limit = 50) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/connections/${connectionId}/messages?skip=${skip}&limit=${limit}`,
    {
      headers: await getHeaders(),
    },
  )

  return response.json()
}

// ==================== REVEAL ====================

export const initiateReveal = async (connectionId) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/reveal/initiate`,
    {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ connection_id: connectionId }),
    },
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to initiate reveal')
  }

  return response.json()
}

export const cancelReveal = async (revealId) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/reveal/cancel/${revealId}`,
    {
      method: 'POST',
      headers: await getHeaders(),
    },
  )

  return response.json()
}

export const getPendingReveals = async () => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/reveal/pending`,
    {
      headers: await getHeaders(),
    },
  )

  return response.json()
}

export const respondToReveal = async (revealId, accept) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/reveal/respond`,
    {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({
        reveal_id: revealId,
        accept,
      }),
    },
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to respond to reveal')
  }

  return response.json()
}

// ==================== BLOCKING ====================

export const blockUser = async (connectionId, reason = null) => {
  const response = await fetch(`${API_BASE_URL}/api/v1/connect/block`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({
      connection_id: connectionId,
      reason,
    }),
  })

  return response.json()
}
