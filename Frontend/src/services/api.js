import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { API_BASE_URL } from '../config/api'
import { getDeviceId } from '../utils/deviceId'

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
    const deviceId = await getDeviceId()
    if (deviceId) {
      config.headers['X-Device-Id'] = deviceId
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  (error) => {
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
}
