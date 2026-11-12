import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import LoginScreen from '../screens/auth/LoginScreen'
import SignUpScreen from '../screens/auth/SignUpScreen'
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen'
import { withBackdrop } from '../components/common/CoralBackdrop';

const Stack = createStackNavigator()

export default function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#161b26' },
      }}
    >
      <Stack.Screen name='Login'          component={withBackdrop(LoginScreen, { brand: false })} />
      <Stack.Screen name='SignUp'         component={withBackdrop(SignUpScreen, { brand: false })} />
      <Stack.Screen name='ForgotPassword' component={withBackdrop(ForgotPasswordScreen, { brand: false })} />
    </Stack.Navigator>
  )
}
