import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createStackNavigator } from '@react-navigation/stack'
import {
  Home,
  Users,
  Settings,
  PlusCircle,
  MessageCircle,
} from 'lucide-react-native' 
import CalmFeedScreen from '../screens/feed/CalmFeedScreen'
import SavedPostsScreen from '../screens/feed/SavedPostsScreen'
import ThreadViewScreen from '../screens/feed/ThreadViewScreen'
import PostDetailScreen from '../screens/posts/PostDetailScreen'
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
import ConnectFeedScreen from '../screens/connect/ConnectFeedScreen'
import CreateBroadcastScreen from '../screens/connect/CreateBroadcastScreen'
import SendOpenerScreen from '../screens/connect/SendOpenerScreen'
import PendingOpenersScreen from '../screens/connect/PendingOpenersScreen'
import ConnectionsListScreen from '../screens/connect/ConnectionsListScreen'
import ConnectChatScreen from '../screens/connect/ChatScreen'
import RevealInitiateScreen from '../screens/connect/RevealInitiateScreen'
import RevealPendingScreen from '../screens/connect/RevealPendingScreen'
import RevealMomentScreen from '../screens/connect/RevealMomentScreen'

const Tab = createBottomTabNavigator()
const Stack = createStackNavigator()

// Feed Stack
function FeedStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name='FeedMain' component={CalmFeedScreen} />
      <Stack.Screen name='PostDetail' component={PostDetailScreen} />
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

// ✅ NEW: Connect Stack
function ConnectStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name='ConnectFeed' component={ConnectFeedScreen} />
      <Stack.Screen name='CreateBroadcast' component={CreateBroadcastScreen} />
      <Stack.Screen name='SendOpener' component={SendOpenerScreen} />
      <Stack.Screen name='PendingOpeners' component={PendingOpenersScreen} />
      <Stack.Screen name='ConnectionsList' component={ConnectionsListScreen} />
      <Stack.Screen name='ConnectChat' component={ConnectChatScreen} />
      <Stack.Screen name='RevealInitiate' component={RevealInitiateScreen} />
      <Stack.Screen name='RevealPending' component={RevealPendingScreen} />
      <Stack.Screen name='RevealMoment' component={RevealMomentScreen} />
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
          } else if (route.name === 'Connect') {
            return <MessageCircle size={size} color={color} />
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
        name='Connect'
        component={ConnectStack}
        options={{ tabBarLabel: 'Connect' }}
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
