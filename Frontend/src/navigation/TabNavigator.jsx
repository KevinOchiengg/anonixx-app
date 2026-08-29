import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import {
  Home,
  MessageCircle,
  Plus,
  Radio,
  User,
} from 'lucide-react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnread } from '../context/UnreadContext';
import { useAuth } from '../context/AuthContext';
import { rf } from '../utils/responsive';

// Feed
import CalmFeedScreen from '../screens/feed/CalmFeedScreen';
import MediaFeedScreen from '../screens/feed/MediaFeedScreen';
import SavedPostsScreen from '../screens/feed/SavedPostsScreen';
import SearchScreen from '../screens/feed/SearchScreen';
import ThreadViewScreen from '../screens/feed/ThreadViewScreen';
import PostDetailScreen from '../screens/posts/PostDetailScreen';
import InspirationThreadScreen from '../screens/drops/InspirationThreadScreen';

// Connect chat screen — still used by Messages tab. ConnectScreen itself
// (the standalone Connect tab) was removed as dead code — this is only
// the chat surface, unrelated to that screen.
import ChatScreen from '../screens/connect/ChatScreen';

// Drops — DropsCompose now lives at the root AppNavigator stack (reachable
// from anywhere, incl. the Create tab button below); DropChat stays here
// since Messages needs it directly.
import DropChatScreen from '../screens/drops/DropChatScreen';
import DropCallScreen from '../screens/drops/DropCallScreen';
import DemoChatScreen from '../screens/drops/DemoChatScreen';
import DropsComposeScreen from '../screens/drops/DropsComposeScreen';
import ChatProfileSetupScreen from '../screens/drops/ChatProfileSetupScreen';

// Circles
import CirclesScreen from '../screens/circles/CirclesScreen';
import CircleProfileScreen from '../screens/circles/CircleProfileScreen';
import CreateCircleScreen from '../screens/circles/CreateCircleScreen';
import ScheduleEventScreen from '../screens/circles/ScheduleEventScreen';
import WaitingRoomScreen from '../screens/circles/WaitingRoomScreen';
import CircleLiveScreen from '../screens/circles/CircleLiveScreen';
import CircleAudioRoomScreen from '../screens/circles/CircleAudioRoomScreen';
import CircleDashboardScreen from '../screens/circles/CircleDashboardScreen';
import CircleContentScreen from '../screens/circles/CircleContentScreen';

// Messages
import MessagesScreen from '../screens/connect/MessagesScreen';

// Profile
import ProfileScreen from '../screens/profile/ProfileScreen';

// Create
import CreatePostScreen from '../screens/posts/CreatePostScreen';
import { THEME } from '../utils/theme';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// ─── TAB BAR ICON ─────────────────────────────────────────────
const TabBarIcon = ({ route, focused, unreadCount }) => {
  const icons = {
    Feed:     Home,
    Circles:  Radio,
    Messages: MessageCircle,
    Profile:  User,
  };
  const IconComponent = icons[route.name];
  if (!IconComponent) return null;

  const showBadge = route.name === 'Messages' && unreadCount > 0;
  const color = focused ? THEME.primary : THEME.inactive;

  return (
    <View style={styles.iconContainer}>
      <IconComponent
        size={22}
        color={color}
        strokeWidth={focused ? 2.5 : 1.8}
      />

      {showBadge && (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </View>
  );
};

// ─── CENTER CREATE BUTTON ─────────────────────────────────────
const CustomTabBarButton = ({ children, onPress }) => (
  <TouchableOpacity
    style={styles.centerButtonContainer}
    onPress={onPress}
    activeOpacity={0.85}
  >
    {/* Outer glow ring */}
    <View style={styles.centerButtonGlow} />
    <View style={styles.centerButton}>
      <Plus size={26} color="#fff" strokeWidth={2.5} />
    </View>
  </TouchableOpacity>
);

// ─── FEED STACK ───────────────────────────────────────────────
function FeedStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FeedMain" component={CalmFeedScreen} />
      <Stack.Screen name="MediaFeed" component={MediaFeedScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} />
      <Stack.Screen name="CreatePost" component={CreatePostScreen} />
      <Stack.Screen name="SavedPosts" component={SavedPostsScreen} />
      <Stack.Screen name="ThreadView" component={ThreadViewScreen} />
      {/* InspirationThread reachable from the feed drop-count badge */}
      <Stack.Screen name="InspirationThread" component={InspirationThreadScreen} />
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
      <Stack.Screen name="CircleContent" component={CircleContentScreen} />
    </Stack.Navigator>
  );
}

// ─── MESSAGES STACK ───────────────────────────────────────────
function MessagesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MessagesMain" component={MessagesScreen} />
      <Stack.Screen name="Chat"         component={ChatScreen} />
      <Stack.Screen name="DropChat"     component={DropChatScreen} />
      <Stack.Screen name="DropCall"     component={DropCallScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="DemoChat"     component={DemoChatScreen} />
      <Stack.Screen name="ChatProfileSetup" component={ChatProfileSetupScreen} />
    </Stack.Navigator>
  );
}

// ─── PROFILE STACK ────────────────────────────────────────────
function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

// ─── TAB NAVIGATOR ────────────────────────────────────────────
export default function TabNavigator() {
  const insets      = useSafeAreaInsets();
  const { unreadCount } = useUnread();
  const { isAuthenticated } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneContainerStyle: { backgroundColor: THEME.background },
        tabBarStyle: {
          ...styles.tabBar,
          height: 72 + insets.bottom,
          paddingBottom: insets.bottom + 16,
          paddingTop: 8,
        },
        tabBarActiveTintColor: THEME.primary,
        tabBarInactiveTintColor: THEME.inactive,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        tabBarIcon: ({ focused }) => {
          if (route.name === 'Create') return null;
          return (
            <TabBarIcon
              route={route}
              focused={focused}
              unreadCount={unreadCount}
            />
          );
        },
      })}
    >
      <Tab.Screen
        name="Feed"
        component={FeedStack}
        options={{ tabBarLabel: 'Desires' }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesStack}
        options={{ tabBarLabel: 'Chats' }}
      />
      <Tab.Screen
        name="Create"
        component={DropsComposeScreen}
        options={{
          tabBarLabel: '',
          tabBarButton: (props) => <CustomTabBarButton {...props} />,
        }}
        listeners={({ navigation }) => ({
          // Guests get sent to Login the instant they tap Create, instead
          // of the tab switching and DropsComposeScreen's own focus-effect
          // guard bouncing them a beat later — same destination, no flash.
          tabPress: (e) => {
            if (!isAuthenticated) {
              e.preventDefault();
              navigation.navigate('AuthNav', { screen: 'Login' });
            }
          },
        })}
      />
      <Tab.Screen
        name="Circles"
        component={CirclesStack}
        options={{ tabBarLabel: 'Circles' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ tabBarLabel: 'You' }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: THEME.surface,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 24,
  },
  tabBarLabel: {
    fontSize: rf(10),
    fontWeight: '600',
    letterSpacing: 0.2,
    marginTop: 3,
  },
  tabBarItem: {
    paddingVertical: 2,
  },

  // Icon + pill
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 32,
  },
  // Unread badge
  tabBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: THEME.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: THEME.surface,
  },
  tabBadgeText: {
    fontSize: rf(9),
    fontWeight: '800',
    color: '#fff',
  },

  // Centre create button
  centerButtonContainer: {
    top: -18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerButtonGlow: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: THEME.primary,
    opacity: 0.18,
  },
  centerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: THEME.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 12,
    borderWidth: 3,
    borderColor: THEME.surface,
  },
});
