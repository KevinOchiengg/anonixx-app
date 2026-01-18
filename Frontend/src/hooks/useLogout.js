import { useCallback } from 'react'
import { useDispatch } from 'react-redux'
import { Alert, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '../context/AuthContext'
import { logout as logoutAction } from '../store/slices/authSlice'

export const useLogout = (navigation) => {
  const dispatch = useDispatch()
  const { logout: authContextLogout } = useAuth()

  const logout = useCallback(async () => {
    console.log('🔴 LOGOUT STARTED')

    try {
      // 1. Get token (optional - for backend call)
      const token = await AsyncStorage.getItem('token')

      // 2. Call backend logout endpoint (optional)
      if (token) {
        try {
          await fetch('http://localhost:8000/api/v1/auth/logout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          })
          console.log('✅ Backend logout successful')
        } catch (error) {
          console.log('⚠️ Backend logout failed, continuing anyway')
        }
      }

      // 3. Clear Redux state
      await dispatch(logoutAction())
      console.log('✅ Redux state cleared')

      // 4. Clear AuthContext state
      await authContextLogout()
      console.log('✅ AuthContext cleared')

      // 5. Clear AsyncStorage
      await AsyncStorage.multiRemove(['token', 'user'])
      console.log('✅ AsyncStorage cleared')

      // 6. Navigate to Auth screen
      if (navigation) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Auth', params: { screen: 'Login' } }],
        })
        console.log('✅ Navigated to Login screen')
      }

      console.log('🔴 LOGOUT COMPLETE')
    } catch (error) {
      console.error('❌ Logout error:', error)

      // Web-compatible alert
      if (Platform.OS === 'web') {
        alert('Failed to logout. Please try again.')
      } else {
        Alert.alert('Error', 'Failed to logout. Please try again.')
      }
    }
  }, [navigation, dispatch, authContextLogout])

  const confirmLogout = useCallback(() => {
    console.log('🔴 confirmLogout called')

    // ✅ Web-compatible confirmation
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to sign out?')
      console.log('🔴 User response:', confirmed ? 'confirmed' : 'cancelled')

      if (confirmed) {
        logout()
      }
    } else {
      // Native Alert for mobile
      Alert.alert(
        'Sign Out',
        'Are you sure you want to sign out?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Sign Out',
            style: 'destructive',
            onPress: logout,
          },
        ],
        { cancelable: true },
      )
    }
  }, [logout])

  return { logout, confirmLogout }
}
