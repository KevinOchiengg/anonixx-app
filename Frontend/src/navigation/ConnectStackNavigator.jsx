import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'

import ConnectFeedScreen from '../screens/connect/ConnectFeedScreen'
import CreateBroadcastScreen from '../screens/connect/CreateBroadcastScreen'
import PendingOpenersScreen from '../screens/connect/PendingOpenersScreen'
import ConnectionsListScreen from '../screens/connect/ConnectionsListScreen'
import ChatScreen from '../screens/connect/ChatScreen'
import CallScreen from '../screens/connect/CallScreen'
import RevealInitiateScreen from '../screens/connect/RevealInitiateScreen'
import RevealPendingScreen from '../screens/connect/RevealPendingScreen'
import RevealMomentScreen from '../screens/connect/RevealMomentScreen'

const Stack = createStackNavigator()

export default function ConnectStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name='ConnectFeed' component={ConnectFeedScreen} />
      <Stack.Screen name='CreateBroadcast' component={CreateBroadcastScreen} />
      <Stack.Screen name='PendingOpeners' component={PendingOpenersScreen} />
      <Stack.Screen name='ConnectionsList' component={ConnectionsListScreen} />
      <Stack.Screen name='Chat' component={ChatScreen} />
      <Stack.Screen name='Call' component={CallScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name='RevealInitiate' component={RevealInitiateScreen} />
      <Stack.Screen name='RevealPending' component={RevealPendingScreen} />
      <Stack.Screen name='RevealMoment' component={RevealMomentScreen} />
    </Stack.Navigator>
  )
}
