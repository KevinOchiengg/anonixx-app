import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createStackNavigator } from '@react-navigation/stack'
import { Home, Users, PlusCircle, Settings } from 'lucide-react-native'

// Screens
import FeedScreen from '../screens/home/FeedScreen'
import PostDetailScreen from '../screens/home/PostDetailScreen'
import CreatePostScreen from '../screens/home/CreatePostScreen'
import GroupsScreen from '../screens/groups/GroupsScreen'
import GroupDetailScreen from '../screens/groups/GroupDetailScreen'
import CreateGroupScreen from '../screens/groups/CreateGroupScreen'
import SettingsScreen from '../screens/profile/SettingsScreen'
import EditProfileScreen from '../screens/profile/EditProfileScreen'
import ChangePasswordScreen from '../screens/profile/ChangePasswordScreen'

const Tab = createBottomTabNavigator()
const Stack = createStackNavigator()

// Home Stack
function HomeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0a0a1a' },
      }}
    >
      <Stack.Screen name='Feed' component={FeedScreen} />
      <Stack.Screen name='PostDetail' component={PostDetailScreen} />
      <Stack.Screen name='CreatePost' component={CreatePostScreen} />
    </Stack.Navigator>
  )
}

// Groups Stack
function GroupsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0a0a1a' },
      }}
    >
      <Stack.Screen name='GroupsList' component={GroupsScreen} />
      <Stack.Screen name='GroupDetail' component={GroupDetailScreen} />
      <Stack.Screen name='CreateGroup' component={CreateGroupScreen} />
    </Stack.Navigator>
  )
}

// Settings Stack
function SettingsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0a0a1a' },
      }}
    >
      <Stack.Screen name='SettingsMain' component={SettingsScreen} />
      <Stack.Screen name='EditProfile' component={EditProfileScreen} />
      <Stack.Screen name='ChangePassword' component={ChangePasswordScreen} />
    </Stack.Navigator>
  )
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#16213e',
          borderTopColor: '#374151',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#a855f7',
        tabBarInactiveTintColor: '#6b7280',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name='Home'
        component={HomeStack}
        options={{
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name='Groups'
        component={GroupsStack}
        options={{
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name='Create'
        component={CreatePostScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <PlusCircle size={size} color={color} />
          ),
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              style={[
                props.style,
                {
                  top: -10,
                  justifyContent: 'center',
                  alignItems: 'center',
                },
              ]}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: '#a855f7',
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: '#a855f7',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 8,
                }}
              >
                <PlusCircle size={28} color='#ffffff' />
              </View>
            </TouchableOpacity>
          ),
        }}
      />
      <Tab.Screen
        name='Settings'
        component={SettingsStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Settings size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  )
}

// Add TouchableOpacity and View imports
import { TouchableOpacity, View } from 'react-native'
