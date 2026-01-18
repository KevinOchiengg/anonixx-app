import './global.css'
import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { Provider } from 'react-redux'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import store from './src/store'
import AppNavigator from './src/navigation/AppNavigator'
import { SocketProvider } from './src/context/SocketContext'
import { ThemeProvider } from '@react-navigation/native'
import { ThemeProvider as CustomThemeProvider } from './src/context/ThemeContext'
import { AuthProvider } from './src/context/AuthContext' // ✅ NEW: Auth context

export default function App() {
  // console.log('App.js rendering...')
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Provider store={store}>
          <CustomThemeProvider>
            <AuthProvider>
              <SocketProvider>
                <StatusBar style='light' />
                <AppNavigator />
              </SocketProvider>
            </AuthProvider>
          </CustomThemeProvider>
        </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
