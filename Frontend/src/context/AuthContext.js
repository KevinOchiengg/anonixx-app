import React, { createContext, useContext, useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('token')
      const userData = await AsyncStorage.getItem('user')

      if (token && userData) {
        setIsAuthenticated(true)
        setUser(JSON.parse(userData))
        console.log(
          '✅ User authenticated from storage:',
          JSON.parse(userData).username,
        )
      } else {
        setIsAuthenticated(false)
        setUser(null)
        console.log('❌ No auth found in storage')
      }
    } catch (error) {
      console.error('Auth check error:', error)
      setIsAuthenticated(false)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const login = async (token, userData) => {
    await AsyncStorage.setItem('token', token)
    await AsyncStorage.setItem('user', JSON.stringify(userData))
    setIsAuthenticated(true)
    setUser(userData)
    console.log('✅ User authenticated in context:', userData.username)
  }

  const logout = async () => {
    await AsyncStorage.multiRemove(['token', 'user'])
    setIsAuthenticated(false)
    setUser(null)
    console.log('✅ User logged out from context')
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        loading,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
