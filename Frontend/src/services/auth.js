import Storage from './storage' // ← Change this
import { authAPI } from './api'

export const saveAuthToken = async (token) => {
  try {
    await Storage.setItem('authToken', token)
  } catch (error) {
    console.error('Failed to save auth token:', error)
  }
}

export const getAuthToken = async () => {
  try {
    return await Storage.getItem('authToken')
  } catch (error) {
    console.error('Failed to get auth token:', error)
    return null
  }
}

export const removeAuthToken = async () => {
  try {
    await Storage.removeItem('authToken')
  } catch (error) {
    console.error('Failed to remove auth token:', error)
  }
}

export const refreshAuthToken = async () => {
  try {
    const response = await authAPI.refreshToken()
    if (response.data.token) {
      await saveAuthToken(response.data.token)
      return response.data.token
    }
    return null
  } catch (error) {
    console.error('Failed to refresh token:', error)
    return null
  }
}

export const isTokenValid = async () => {
  const token = await getAuthToken()
  if (!token) return false

  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    const expiration = payload.exp * 1000
    return Date.now() < expiration
  } catch (error) {
    return false
  }
}

export const loginWithCredentials = async (email, password) => {
  try {
    const response = await authAPI.login({ email, password })
    if (response.data.token) {
      await saveAuthToken(response.data.token)
    }
    return response.data
  } catch (error) {
    throw error
  }
}

export const signupWithCredentials = async (userData) => {
  try {
    const response = await authAPI.signup(userData)
    if (response.data.token) {
      await saveAuthToken(response.data.token)
    }
    return response.data
  } catch (error) {
    throw error
  }
}

export const logoutUser = async () => {
  try {
    await authAPI.logout()
    await removeAuthToken()
  } catch (error) {
    console.error('Logout failed:', error)
  }
}
