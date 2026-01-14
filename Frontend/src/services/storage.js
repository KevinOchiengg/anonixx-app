import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

// Web storage fallback
const webStorage = {
  getItem: async (key) => {
    try {
      return localStorage.getItem(key)
    } catch (e) {
      return null
    }
  },
  setItem: async (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch (e) {
      console.error('Storage error:', e)
    }
  },
  removeItem: async (key) => {
    try {
      localStorage.removeItem(key)
    } catch (e) {
      console.error('Storage error:', e)
    }
  },
  clear: async () => {
    try {
      localStorage.clear()
    } catch (e) {
      console.error('Storage error:', e)
    }
  },
}

// Use appropriate storage based on platform
const Storage = Platform.OS === 'web' ? webStorage : AsyncStorage

export default Storage
