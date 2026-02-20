import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import SearchScreen from '../screens/feed/SearchScreen';
import {
  Home,
  Users,
  Settings,
  PlusCircle,
  MessageCircle,
  Plus,
} from 'lucide-react-native';
import CalmFeedScreen from '../screens/feed/CalmFeedScreen';
import SavedPostsScreen from '../screens/feed/SavedPostsScreen';
import ThreadViewScreen from '../screens/feed/ThreadViewScreen';
import PostDetailScreen from '../screens/posts/PostDetailScreen';
import GroupsScreen from '../screens/groups/GroupsScreen';
import GroupDetailScreen from '../screens/groups/GroupDetailScreen';
import CreateGroupScreen from '../screens/groups/CreateGroupScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import ChangePasswordScreen from '../screens/profile/ChangePasswordScreen';
import CreatePostScreen from '../screens/posts/CreatePostScreen';
import ImpactDashboardScreen from '../screens/impact/ImpactDashboardScreen';
import ConnectionsScreen from '../screens/connections/ConnectionsScreen';
import ChatScreen from '../screens/connections/ChatScreen';
import SundayReflectionScreen from '../screens/rituals/SundayReflectionScreen';
import CrisisResourcesScreen from '../screens/resources/CrisisResourcesScreen';
import ConnectFeedScreen from '../screens/connect/ConnectFeedScreen';
import CreateBroadcastScreen from '../screens/connect/CreateBroadcastScreen';
import SendOpenerScreen from '../screens/connect/SendOpenerScreen';
import PendingOpenersScreen from '../screens/connect/PendingOpenersScreen';
import ConnectionsListScreen from '../screens/connect/ConnectionsListScreen';
import ConnectChatScreen from '../screens/connect/ChatScreen';
import RevealInitiateScreen from '../screens/connect/RevealInitiateScreen';
import RevealPendingScreen from '../screens/connect/RevealPendingScreen';
import RevealMomentScreen from '../screens/connect/RevealMomentScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// NEW Cinematic Coral Theme
const THEME = {
  background: '#0b0f18',
  backgroundDark: '#06080f',
  surface: '#151924',
  surfaceDark: '#10131c',
  primary: '#FF634A',
  primaryDark: '#ff3b2f',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
  inactive: '#5a5f70',
};

// Custom Tab Bar Icon with Glow Effect
const TabBarIcon = ({ route, focused, color, size }) => {
  let IconComponent;

  if (route.name === 'Feed') {
    IconComponent = Home;
  } else if (route.name === 'Connect') {
    IconComponent = MessageCircle;
  } else if (route.name === 'Groups') {
    IconComponent = Users;
  } else if (route.name === 'Settings') {
    IconComponent = Settings;
  }

  return (
    <View style={styles.iconContainer}>
      {/* Glow effect for active tab */}
      {focused && <View style={styles.glowEffect} />}

      {/* Icon */}
      <IconComponent
        size={size}
        color={color}
        strokeWidth={focused ? 2.5 : 2}
      />

      {/* Active indicator dot */}
      {focused && <View style={styles.activeDot} />}
    </View>
  );
};

// Custom Center Button Component
const CustomTabBarButton = ({ children, onPress }) => (
  <TouchableOpacity
    style={styles.centerButtonContainer}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <View style={styles.centerButtonGlow} />
    <View style={styles.centerButton}>
      <Plus size={28} color="#fff" strokeWidth={2.5} />
    </View>
  </TouchableOpacity>
);

// Feed Stack
function FeedStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FeedMain" component={CalmFeedScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} />
      <Stack.Screen name="SavedPosts" component={SavedPostsScreen} />
      <Stack.Screen name="ThreadView" component={ThreadViewScreen} />
      <Stack.Screen name="ImpactDashboard" component={ImpactDashboardScreen} />
      <Stack.Screen name="Connections" component={ConnectionsScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen
        name="SundayReflection"
        component={SundayReflectionScreen}
      />
      <Stack.Screen name="CrisisResources" component={CrisisResourcesScreen} />
    </Stack.Navigator>
  );
}

// Connect Stack
function ConnectStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ConnectFeed" component={ConnectFeedScreen} />
      <Stack.Screen name="CreateBroadcast" component={CreateBroadcastScreen} />
      <Stack.Screen name="SendOpener" component={SendOpenerScreen} />
      <Stack.Screen name="PendingOpeners" component={PendingOpenersScreen} />
      <Stack.Screen name="ConnectionsList" component={ConnectionsListScreen} />
      <Stack.Screen name="ConnectChat" component={ConnectChatScreen} />
      <Stack.Screen name="RevealInitiate" component={RevealInitiateScreen} />
      <Stack.Screen name="RevealPending" component={RevealPendingScreen} />
      <Stack.Screen name="RevealMoment" component={RevealMomentScreen} />
    </Stack.Navigator>
  );
}

// Groups Stack
function GroupsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GroupsMain" component={GroupsScreen} />
      <Stack.Screen name="GroupDetail" component={GroupDetailScreen} />
      <Stack.Screen name="CreateGroup" component={CreateGroupScreen} />
    </Stack.Navigator>
  );
}

// Settings Stack
function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="SavedPosts" component={SavedPostsScreen} />
      <Stack.Screen name="ImpactDashboard" component={ImpactDashboardScreen} />
      <Stack.Screen name="Connections" component={ConnectionsScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen
        name="SundayReflection"
        component={SundayReflectionScreen}
      />
      <Stack.Screen name="CrisisResources" component={CrisisResourcesScreen} />
    </Stack.Navigator>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: THEME.primary,
        tabBarInactiveTintColor: THEME.inactive,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        tabBarIcon: ({ focused, color, size }) => {
          // Hide icon for Create tab (handled by custom button)
          if (route.name === 'Create') {
            return null;
          }
          return (
            <TabBarIcon
              route={route}
              focused={focused}
              color={color}
              size={24}
            />
          );
        },
      })}
    >
      <Tab.Screen
        name="Feed"
        component={FeedStack}
        options={{ tabBarLabel: 'Thoughts' }}
      />

      <Tab.Screen
        name="Connect"
        component={ConnectStack}
        options={{ tabBarLabel: 'Connect' }}
      />

      <Tab.Screen
        name="Create"
        component={CreatePostScreen}
        options={{
          tabBarLabel: '',
          tabBarButton: (props) => <CustomTabBarButton {...props} />,
        }}
      />

      <Tab.Screen
        name="Groups"
        component={GroupsStack}
        options={{ tabBarLabel: 'Groups' }}
      />

      <Tab.Screen
        name="Settings"
        component={SettingsStack}
        options={{ tabBarLabel: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: THEME.surface,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    height: Platform.OS === 'ios' ? 88 : 68,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 20,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  tabBarItem: {
    paddingVertical: 4,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glowEffect: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: THEME.primary,
    opacity: 0.15,
    top: -13,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: THEME.primary,
    marginTop: 4,
  },
  // Center Button Styles
  centerButtonContainer: {
    top: -20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerButtonGlow: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: THEME.primary,
    opacity: 0.2,
  },
  centerButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: THEME.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 4,
    borderColor: THEME.surface,
  },
});
