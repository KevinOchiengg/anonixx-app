import React, { createContext, useState, useContext, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const ThemeContext = createContext()

export const lightTheme = {
  // Background colors
  background: '#ffffff',
  backgroundSecondary: '#f3f4f6',
  backgroundTertiary: '#e5e7eb',

  // Card colors
  card: '#ffffff',
  cardBorder: '#e5e7eb',

  // Text colors
  text: '#111827',
  textSecondary: '#6b7280',
  textTertiary: '#9ca3af',

  // Primary colors
  primary: '#a855f7',
  primaryLight: 'rgba(168, 85, 247, 0.1)',

  // Accent colors
  accent: '#14b8a6',
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',

  // Border colors
  border: '#e5e7eb',
  borderLight: '#f3f4f6',

  // Input colors
  input: '#f9fafb',
  inputBorder: '#d1d5db',
  placeholder: '#9ca3af',

  // Status bar
  statusBar: 'dark-content',
}

export const darkTheme = {
  // Background colors
  background: '#0a0a1a',
  backgroundSecondary: '#16213e',
  backgroundTertiary: '#1e293b',

  // Card colors
  card: '#16213e',
  cardBorder: '#374151',

  // Text colors
  text: '#ffffff',
  textSecondary: '#9ca3af',
  textTertiary: '#6b7280',

  // Primary colors
  primary: '#a855f7',
  primaryLight: 'rgba(168, 85, 247, 0.1)',

  // Accent colors
  accent: '#14b8a6',
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',

  // Border colors
  border: '#374151',
  borderLight: '#1f2937',

  // Input colors
  input: '#16213e',
  inputBorder: '#374151',
  placeholder: '#6b7280',

  // Status bar
  statusBar: 'light-content',
}

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false) // Default to dark
  const [isLoading, setIsLoading] = useState(true)

  // Load theme preference on mount
  useEffect(() => {
    loadTheme()
  }, [])

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('theme')
      if (savedTheme !== null) {
        setIsDarkMode(savedTheme === 'dark')
      }
    } catch (error) {
      console.error('Error loading theme:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleTheme = async () => {
    try {
      const newTheme = !isDarkMode
      setIsDarkMode(newTheme)
      await AsyncStorage.setItem('theme', newTheme ? 'dark' : 'light')
    } catch (error) {
      console.error('Error saving theme:', error)
    }
  }

  const theme = isDarkMode ? darkTheme : lightTheme

  return (
    <ThemeContext.Provider
      value={{ theme, isDarkMode, toggleTheme, isLoading }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
