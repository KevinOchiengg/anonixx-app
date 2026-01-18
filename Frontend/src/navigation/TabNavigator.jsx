import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createStackNavigator } from '@react-navigation/stack'
import { Home, Users, Settings, PlusCircle } from 'lucide-react-native'

import CalmFeedScreen from '../screens/feed/CalmFeedScreen'
import SavedPostsScreen from '../screens/feed/SavedPostsScreen'
import ThreadViewScreen from '../screens/feed/ThreadViewScreen'
import GroupsScreen from '../screens/groups/GroupsScreen'
import GroupDetailScreen from '../screens/groups/GroupDetailScreen'
import CreateGroupScreen from '../screens/groups/CreateGroupScreen'
import SettingsScreen from '../screens/settings/SettingsScreen'
import EditProfileScreen from '../screens/profile/EditProfileScreen'
import ChangePasswordScreen from '../screens/profile/ChangePasswordScreen'
import CreatePostScreen from '../screens/posts/CreatePostScreen'
import ImpactDashboardScreen from '../screens/impact/ImpactDashboardScreen'
import ConnectionsScreen from '../screens/connections/ConnectionsScreen'
import ChatScreen from '../screens/connections/ChatScreen'
import SundayReflectionScreen from '../screens/rituals/SundayReflectionScreen'
import CrisisResourcesScreen from '../screens/resources/CrisisResourcesScreen'

const Tab = createBottomTabNavigator()
const Stack = createStackNavigator()

// Feed Stack
function FeedStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name='FeedMain' component={CalmFeedScreen} />
      <Stack.Screen name='SavedPosts' component={SavedPostsScreen} />
      <Stack.Screen name='ThreadView' component={ThreadViewScreen} />
      <Stack.Screen name='ImpactDashboard' component={ImpactDashboardScreen} />
      <Stack.Screen name='Connections' component={ConnectionsScreen} />
      <Stack.Screen name='Chat' component={ChatScreen} />
      <Stack.Screen
        name='SundayReflection'
        component={SundayReflectionScreen}
      />
      <Stack.Screen name='CrisisResources' component={CrisisResourcesScreen} />
    </Stack.Navigator>
  )
}

// Groups Stack
function GroupsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name='GroupsMain' component={GroupsScreen} />
      <Stack.Screen name='GroupDetail' component={GroupDetailScreen} />
      <Stack.Screen name='CreateGroup' component={CreateGroupScreen} />
    </Stack.Navigator>
  )
}

// Settings Stack
function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name='SettingsMain' component={SettingsScreen} />
      <Stack.Screen name='EditProfile' component={EditProfileScreen} />
      <Stack.Screen name='ChangePassword' component={ChangePasswordScreen} />
      <Stack.Screen name='SavedPosts' component={SavedPostsScreen} />
      <Stack.Screen name='ImpactDashboard' component={ImpactDashboardScreen} />
      <Stack.Screen name='Connections' component={ConnectionsScreen} />
      <Stack.Screen name='Chat' component={ChatScreen} />
      <Stack.Screen
        name='SundayReflection'
        component={SundayReflectionScreen}
      />
      <Stack.Screen name='CrisisResources' component={CrisisResourcesScreen} />
    </Stack.Navigator>
  )
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0A0A12',
          borderTopColor: '#2D2D44',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#6B7FFF',
        tabBarInactiveTintColor: '#6B6B7E',
        tabBarIcon: ({ color, size }) => {
          if (route.name === 'Feed') {
            return <Home size={size} color={color} />
          } else if (route.name === 'Groups') {
            return <Users size={size} color={color} />
          } else if (route.name === 'Create') {
            return <PlusCircle size={size} color={color} />
          } else if (route.name === 'Settings') {
            return <Settings size={size} color={color} />
          }
        },
      })}
    >
      <Tab.Screen
        name='Feed'
        component={FeedStack}
        options={{ tabBarLabel: 'Thoughts' }}
      />
      <Tab.Screen
        name='Groups'
        component={GroupsStack}
        options={{ tabBarLabel: 'Groups' }}
      />
      <Tab.Screen
        name='Create'
        component={CreatePostScreen}
        options={{ tabBarLabel: 'Share' }}
      />
      <Tab.Screen
        name='Settings'
        component={SettingsStack}
        options={{ tabBarLabel: 'Settings' }}
      />
    </Tab.Navigator>
  )
}
