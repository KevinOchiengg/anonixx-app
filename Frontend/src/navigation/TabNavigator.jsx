import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import {
  Home,
  MessageCircle,
  Plus,
  Radio,
  Settings,
} from 'lucide-react-native';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Feed
import CalmFeedScreen from '../screens/feed/CalmFeedScreen';
import SavedPostsScreen from '../screens/feed/SavedPostsScreen';
import SearchScreen from '../screens/feed/SearchScreen';
import ThreadViewScreen from '../screens/feed/ThreadViewScreen';
import ImpactDashboardScreen from '../screens/impact/ImpactDashboardScreen';
import PostDetailScreen from '../screens/posts/PostDetailScreen';
import CrisisResourcesScreen from '../screens/resources/CrisisResourcesScreen';
import SundayReflectionScreen from '../screens/rituals/SundayReflectionScreen';

// Connect
import ChatScreen from '../screens/connect/ChatScreen';
import ConnectScreen from '../screens/connect/ConnectScreen';

// Drops
import ConfessionMarketplaceScreen from '../screens/drops/ConfessionMarketPlaceScreen';
import DropChatScreen from '../screens/drops/DropChatScreen';
import DropLandingScreen from '../screens/drops/DropLandingScreen';
import DropsInboxScreen from '../screens/drops/DropsInboxScreen';
import ShareCardScreen from '../screens/drops/ShareCardScreen';
import VibeScoreScreen from '../screens/drops/VibeScoreScreen';

// Circles
import CirclesScreen from '../screens/circles/CirclesScreen';
import CircleProfileScreen from '../screens/circles/CircleProfileScreen';
import CreateCircleScreen from '../screens/circles/CreateCircleScreen';
import ScheduleEventScreen from '../screens/circles/ScheduleEventScreen';
import WaitingRoomScreen from '../screens/circles/WaitingRoomScreen';
import CircleLiveScreen from '../screens/circles/CircleLiveScreen';
import CircleAudioRoomScreen from '../screens/circles/CircleAudioRoomScreen';
import CircleDashboardScreen from '../screens/circles/CircleDashboardScreen';

// Settings
import ChangePasswordScreen from '../screens/profile/ChangePasswordScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';

// Create
import CreatePostScreen from '../screens/posts/CreatePostScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
  inactive: '#5a5f70',
};

// ─── TAB BAR ICON ─────────────────────────────────────────────
const TabBarIcon = ({ route, focused, color, size }) => {
  const icons = {
    Feed: Home,
    Connect: MessageCircle,
    Circles: Radio,
    Settings: Settings,
  };
  const IconComponent = icons[route.name];
  if (!IconComponent) return null;

  return (
    <View style={styles.iconContainer}>
      {focused && <View style={styles.glowEffect} />}
      <IconComponent
        size={size}
        color={color}
        strokeWidth={focused ? 2.5 : 2}
      />
      {focused && <View style={styles.activeDot} />}
    </View>
  );
};

// ─── CENTER CREATE BUTTON ─────────────────────────────────────
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

// ─── FEED STACK ───────────────────────────────────────────────
function FeedStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FeedMain" component={CalmFeedScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} />
      <Stack.Screen name="SavedPosts" component={SavedPostsScreen} />
      <Stack.Screen name="ThreadView" component={ThreadViewScreen} />
      <Stack.Screen name="ImpactDashboard" component={ImpactDashboardScreen} />
      <Stack.Screen
        name="SundayReflection"
        component={SundayReflectionScreen}
      />
      <Stack.Screen name="CrisisResources" component={CrisisResourcesScreen} />
    </Stack.Navigator>
  );
}

// ─── CONNECT STACK ────────────────────────────────────────────
function ConnectStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ConnectMain" component={ConnectScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="ShareCard" component={ShareCardScreen} />
      <Stack.Screen name="DropLanding" component={DropLandingScreen} />
      <Stack.Screen name="DropsInbox" component={DropsInboxScreen} />
      <Stack.Screen name="DropChat" component={DropChatScreen} />
      <Stack.Screen
        name="ConfessionMarketplace"
        component={ConfessionMarketplaceScreen}
      />
      <Stack.Screen name="VibeScore" component={VibeScoreScreen} />
    </Stack.Navigator>
  );
}

// ─── CIRCLES STACK ────────────────────────────────────────────
function CirclesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CirclesMain" component={CirclesScreen} />
      <Stack.Screen name="CircleProfile" component={CircleProfileScreen} />
      <Stack.Screen name="CreateCircle" component={CreateCircleScreen} />
      <Stack.Screen name="ScheduleEvent" component={ScheduleEventScreen} />
      <Stack.Screen name="WaitingRoom" component={WaitingRoomScreen} />
      <Stack.Screen name="CircleLive" component={CircleLiveScreen} />
      <Stack.Screen name="CircleAudioRoom" component={CircleAudioRoomScreen} />
      <Stack.Screen name="CircleDashboard" component={CircleDashboardScreen} />
    </Stack.Navigator>
  );
}

// ─── SETTINGS STACK ───────────────────────────────────────────
function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="SavedPosts" component={SavedPostsScreen} />
      <Stack.Screen name="ImpactDashboard" component={ImpactDashboardScreen} />
      <Stack.Screen
        name="SundayReflection"
        component={SundayReflectionScreen}
      />
      <Stack.Screen name="CrisisResources" component={CrisisResourcesScreen} />
    </Stack.Navigator>
  );
}

// ─── TAB NAVIGATOR ────────────────────────────────────────────
export default function TabNavigator() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          ...styles.tabBar,
          height: 60 + bottomPad,
          paddingBottom: bottomPad,
        },
        tabBarActiveTintColor: THEME.primary,
        tabBarInactiveTintColor: THEME.inactive,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        tabBarIcon: ({ focused, color, size }) => {
          if (route.name === 'Create') return null;
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
        name="Circles"
        component={CirclesStack}
        options={{ tabBarLabel: 'Circles' }}
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
