import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { useSelector } from 'react-redux'
import AuthNavigator from './AuthNavigator'
import TabNavigator from './TabNavigator'

export default function AppNavigator() {
  const { isAuthenticated } = useSelector((state) => state.auth)

  return (
    <NavigationContainer>
      {isAuthenticated ? <TabNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  )
}
