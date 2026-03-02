import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

// Helper function
const getHeaders = async () => {
  const token = await AsyncStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

// ==================== BROADCASTS ====================

export const createBroadcast = async (data) => {
  const response = await fetch(`${API_BASE_URL}/api/v1/connect/broadcasts`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create broadcast');
  }

  return response.json();
};

export const getBroadcasts = async (skip = 0, limit = 20, vibeTags = null) => {
  let url = `${API_BASE_URL}/api/v1/connect/broadcasts?skip=${skip}&limit=${limit}`;
  if (vibeTags) {
    url += `&vibe_tags=${vibeTags}`;
  }

  const response = await fetch(url, {
    headers: await getHeaders(),
  });

  return response.json();
};

export const getMyActiveBroadcast = async () => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/broadcasts/my-active`,
    {
      headers: await getHeaders(),
    }
  );

  return response.json();
};

export const deactivateBroadcast = async (broadcastId) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/broadcasts/${broadcastId}`,
    {
      method: 'DELETE',
      headers: await getHeaders(),
    }
  );

  return response.json();
};

// ==================== OPENERS ====================

export const sendOpener = async (broadcastId, message) => {
  const response = await fetch(`${API_BASE_URL}/api/v1/connect/openers`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({
      broadcast_id: broadcastId,
      message,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to send opener');
  }

  return response.json();
};

export const getPendingOpeners = async () => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/connections/pending`,
    {
      headers: await getHeaders(),
    }
  );

  return response.json();
};

export const acceptOpener = async (connectionId) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/connections/${connectionId}/accept`,
    {
      method: 'POST',
      headers: await getHeaders(),
    }
  );

  return response.json();
};

export const declineOpener = async (connectionId) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/connections/${connectionId}/decline`,
    {
      method: 'POST',
      headers: await getHeaders(),
    }
  );

  return response.json();
};

// ==================== CONNECTIONS ====================

export const getConnections = async () => {
  const response = await fetch(`${API_BASE_URL}/api/v1/connect/connections`, {
    headers: await getHeaders(),
  });

  return response.json();
};

export const getConnectionDetails = async (connectionId) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/connections/${connectionId}`,
    {
      headers: await getHeaders(),
    }
  );

  return response.json();
};

// ==================== MESSAGES ====================

export const sendMessage = async (connectionId, content) => {
  const response = await fetch(`${API_BASE_URL}/api/v1/connect/messages`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({
      connection_id: connectionId,
      content,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to send message');
  }

  return response.json();
};

export const getMessages = async (connectionId, skip = 0, limit = 50) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/connections/${connectionId}/messages?skip=${skip}&limit=${limit}`,
    {
      headers: await getHeaders(),
    }
  );

  return response.json();
};

// ==================== DAILY TOKENS ====================

export const getDailyTokens = async () => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/tokens/remaining`,
    {
      headers: await getHeaders(),
    }
  );

  if (!response.ok) {
    return { remaining: 5 }; // safe fallback
  }

  return response.json();
};

// ==================== PAYMENTS ====================

export const unlockConnectionMpesa = async (connectionId, phoneNumber) => {
  const response = await fetch(`${API_BASE_URL}/api/v1/payments/unlock/mpesa`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({
      connection_id: connectionId,
      phone_number: phoneNumber,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to initiate M-Pesa payment');
  }

  return response.json(); // { checkout_request_id, message }
};

export const unlockConnectionStripe = async (connectionId, paymentMethodId) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/payments/unlock/stripe`,
    {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({
        connection_id: connectionId,
        payment_method_id: paymentMethodId,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to process card payment');
  }

  return response.json(); // { status, payment_ref, message }
};

export const checkMpesaPaymentStatus = async (checkoutRequestId) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/payments/mpesa/status/${checkoutRequestId}`,
    {
      headers: await getHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to check payment status');
  }

  return response.json(); // { status: 'pending' | 'completed' | 'failed', connection_id }
};

// ==================== REVEAL ====================

export const initiateReveal = async (connectionId) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/reveal/initiate`,
    {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ connection_id: connectionId }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to initiate reveal');
  }

  return response.json();
};

export const cancelReveal = async (revealId) => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/reveal/cancel/${revealId}`,
    {
      method: 'POST',
      headers: await getHeaders(),
    }
  );

  return response.json();
};

export const getPendingReveals = async () => {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/connect/reveal/pending`,
    {
      headers: await getHeaders(),
    }
  );

  return response.json();
};

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
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to respond to reveal');
  }

  return response.json();
};

// ==================== BLOCKING ====================

export const blockUser = async (connectionId, reason = null) => {
  const response = await fetch(`${API_BASE_URL}/api/v1/connect/block`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({
      connection_id: connectionId,
      reason,
    }),
  });

  return response.json();
};
