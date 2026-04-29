import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import {
  Home,
  MessageCircle,
  Plus,
  Radio,
  Users,
} from 'lucide-react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnread } from '../context/UnreadContext';

// Feed
import CalmFeedScreen from '../screens/feed/CalmFeedScreen';
import MediaFeedScreen from '../screens/feed/MediaFeedScreen';
import SavedPostsScreen from '../screens/feed/SavedPostsScreen';
import SearchScreen from '../screens/feed/SearchScreen';
import ThreadViewScreen from '../screens/feed/ThreadViewScreen';
import PostDetailScreen from '../screens/posts/PostDetailScreen';

// Connect
import ChatScreen from '../screens/connect/ChatScreen';
import ConnectScreen from '../screens/connect/ConnectScreen';

// Drops
import ConfessionMarketplaceScreen from '../screens/drops/ConfessionMarketPlaceScreen';
import DropChatScreen from '../screens/drops/DropChatScreen';
import DropLandingScreen from '../screens/drops/DropLandingScreen';
import DropsComposeScreen from '../screens/drops/DropsComposeScreen';
import DropsInboxScreen from '../screens/drops/DropsInboxScreen';
import DropsRecordScreen from '../screens/drops/DropsRecordScreen';
import DropsPublishScreen from '../screens/drops/DropsPublishScreen';
import InspirationThreadScreen from '../screens/drops/InspirationThreadScreen';
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

// Messages
import MessagesScreen from '../screens/connect/MessagesScreen';

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
const TabBarIcon = ({ route, focused, unreadCount }) => {
  const icons = {
    Feed:     Home,
    Connect:  Users,
    Circles:  Radio,
    Messages: MessageCircle,
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

// ─── CONNECT STACK ────────────────────────────────────────────
function ConnectStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ConnectMain" component={ConnectScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="ShareCard" component={ShareCardScreen} />
      <Stack.Screen name="DropsCompose" component={DropsComposeScreen} />
      <Stack.Screen name="DropsRecord" component={DropsRecordScreen} />
      <Stack.Screen name="DropsPublish" component={DropsPublishScreen} />
      <Stack.Screen name="DropLanding" component={DropLandingScreen} />
      <Stack.Screen name="DropsInbox" component={DropsInboxScreen} />
      <Stack.Screen name="DropChat" component={DropChatScreen} />
      <Stack.Screen
        name="ConfessionMarketplace"
        component={ConfessionMarketplaceScreen}
      />
      <Stack.Screen name="VibeScore" component={VibeScoreScreen} />
      {/* InspirationThread reachable from the marketplace "inspired by" chip */}
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
    </Stack.Navigator>
  );
}

// ─── TAB NAVIGATOR ────────────────────────────────────────────
export default function TabNavigator() {
  const insets      = useSafeAreaInsets();
  const { unreadCount } = useUnread();


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
        name="Messages"
        component={MessagesStack}
        options={{ tabBarLabel: 'Messages' }}
      />
      <Tab.Screen
        name="Circles"
        component={CirclesStack}
        options={{ tabBarLabel: 'Circles' }}
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
    fontSize: 10,
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
    fontSize: 9,
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
