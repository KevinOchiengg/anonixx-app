import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import AuthNavigator from './AuthNavigator'
import TabNavigator from './TabNavigator'
import InterestSelectionScreen from '../screens/onboarding/InterestSelectionScreen' // ✅ Add this

const Stack = createStackNavigator()

export default function AppNavigator() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#0A0A12',
        }}
      >
        <ActivityIndicator size='large' color='#6B7FFF' />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* ALWAYS show Main (Feed) first - auth is optional now */}
        <Stack.Screen name='Main' component={TabNavigator} />
        <Stack.Screen name='Auth' component={AuthNavigator} />
        {/* ✅ Add InterestSelection screen */}
        <Stack.Screen
          name='InterestSelection'
          component={InterestSelectionScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
