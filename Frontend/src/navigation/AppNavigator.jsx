import { useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';
import AppLoadingScreen from '../components/common/AppLoadingScreen';

// One loading screen until both fonts and the session check finish.
function Loading() {
  return <AppLoadingScreen />;
}

import ChangePasswordScreen from '../screens/profile/ChangePasswordScreen';
import DeleteAccountScreen from '../screens/settings/DeleteAccountScreen';
import CoinsScreen from '../screens/profile/CoinsScreen';
import ReferralScreen from '../screens/profile/ReferralScreen';
import LegalScreen from '../screens/settings/LegalScreen';
import BlockListScreen from '../screens/settings/BlockListScreen';
import ModerationHistoryScreen from '../screens/settings/ModerationHistoryScreen';
import FeedLocationScreen from '../screens/settings/FeedLocationScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import DashboardScreen from '../screens/profile/DashboardScreen';
import PremiumScreen from '../screens/profile/PremiumScreen';
import SavedPostsScreen from '../screens/feed/SavedPostsScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import DropChatScreen from '../screens/drops/DropChatScreen';
import ChatInfoScreen from '../screens/rooms/ChatInfoScreen';
import ArchivedChatsScreen from '../screens/rooms/ArchivedChatsScreen';
import ChatMediaScreen from '../screens/rooms/ChatMediaScreen';
import MarketScreen from '../screens/market/MarketScreen';
import MarketItemScreen from '../screens/market/MarketItemScreen';
import VibeScoreScreen from '../screens/drops/VibeScoreScreen';
import PostUnlockScreen from '../screens/drops/PostUnlockScreen';
import UnlockWaitingScreen from '../screens/drops/UnlockWaitingScreen';
import UnlockRequestsScreen from '../screens/drops/UnlockRequestsScreen';
import RoomScreen from '../screens/drops/RoomScreen';
import DropCallScreen from '../screens/drops/DropCallScreen';
import IncomingCallOverlay from '../components/calls/IncomingCallOverlay';
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminModerationScreen from '../screens/admin/AdminModerationScreen';
import AdminDeceptionReportsScreen from '../screens/admin/AdminDeceptionReportsScreen';
import AdminAdsScreen from '../screens/admin/AdminAdsScreen';
import AdminPostsScreen from '../screens/admin/AdminPostsScreen';
import AdminRefundsScreen from '../screens/admin/AdminRefundsScreen';
import AdminSupportScreen from '../screens/admin/AdminSupportScreen';
import SupportChatScreen from '../screens/support/SupportChatScreen';
import CreateAdScreen from '../screens/feed/CreateAdScreen';
import DropsComposeScreen from '../screens/drops/DropsComposeScreen';
import DropsRecordScreen from '../screens/drops/DropsRecordScreen';
import DropsPublishScreen from '../screens/drops/DropsPublishScreen';
import DropsPollScreen from '../screens/drops/DropsPollScreen';
import WhatsAppSendScreen from '../screens/drops/WhatsAppSendScreen';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import { withBackdrop } from '../components/common/CoralBackdrop';

const Stack = createStackNavigator();

// ─── Deep links ─────────────────────────────────────────────────
//   anonixx://drops/new → DropsCompose     anonixx://drops/voice → DropsRecord
//   anonixx://drops/publish → DropsPublish anonixx://drops/poll → DropsPoll
const linking = {
  prefixes: [
    'anonixx://',
    'https://anonixx.com',
    'https://www.anonixx.com',
  ],
  config: {
    screens: {
      Main: { screens: { Feed: { screens: { FeedSwipe: 'drop/:dropId' } } } },
      DropChat:              'drop-chat/:connectionId',
      UnlockRequestsScreen:  'unlock-requests',
      Room:                  'room/:userId',
      VibeScore:             'vibe',
      Market:                'market',
      MarketItem:            'market/:itemId',
      DropsCompose:          'drops/new',
      DropsRecord:           'drops/voice',
      DropsPublish:          'drops/publish',
      DropsPoll:             'drops/poll',
      // PayPal redirect deep links (used by InternationalPaymentSheet WebBrowser flow)
      // These are caught by WebBrowser.openAuthSessionAsync and don't need screen handlers
    },
  },
};

let Notifications = null;
try { Notifications = require('expo-notifications'); } catch { /* not available */ }

const navigationRef = createNavigationContainerRef();
const navigateRoot = (name, params) => { if (navigationRef.isReady()) navigationRef.navigate(name, params); };

// Push taps: Accept on a link up accepts and opens the chat; a Knock opens requests; a Let In
// opens their Room; mutual opens the chat.
async function handleNotificationResponse(response) {
  const data = response?.notification?.request?.content?.data || {};
  const go = (name, params) => { if (navigationRef.isReady()) navigationRef.navigate(name, params); };
  if (response.actionIdentifier === 'accept' && data.request_id) {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/unlock-requests/${data.request_id}/accept`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.connection_id) return go('DropChat', { connectionId: body.connection_id });
    } catch { /* fall through to the inbox */ }
    return go('UnlockRequestsScreen');
  }
  const chat = typeof data.url === 'string' && data.url.match(/^\/chat\/([^/?#]+)/);
  if (chat) return go('DropChat', { connectionId: chat[1] });
  // Let In: the owner's Room, which plays the "You're inside" entrance.
  const room = typeof data.url === 'string' && data.url.match(/^\/room\/([^/?#]+)/);
  if (room) return go('Room', { userId: room[1] });
  if (data.type === 'linkup_request') return go('UnlockRequestsScreen');
  return undefined;
}

export default function AppNavigator({ fontsReady }) {
  const { loading: authLoading } = useAuth();
  const loading = authLoading || !fontsReady;

  useEffect(() => {
    if (!Notifications) return undefined;
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => sub.remove();
  }, []);

  // Cold start from a notification: handle it once the stack is mounted.
  const onReady = () => {
    Notifications?.getLastNotificationResponseAsync?.()
      .then((r) => { if (r) handleNotificationResponse(r); })
      .catch(() => {});
  };

  return (
    <NavigationContainer linking={linking} ref={navigationRef} onReady={onReady}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* No login gate: everyone lands on the feed; auth screens are under "AuthNav". */}
        {loading
          ? <Stack.Screen name="Splash" component={withBackdrop(Loading, { brand: false })} />
          : <Stack.Screen name="Main" component={TabNavigator} />
        }
        {/* Keep accessible for deep links */}
        <Stack.Screen name="AuthNav" component={AuthNavigator} />
        <Stack.Screen name="Premium" component={withBackdrop(PremiumScreen)} />
        <Stack.Screen name="DropChat" component={withBackdrop(DropChatScreen, { brand: false })} />
        <Stack.Screen name="ChatInfo" component={withBackdrop(ChatInfoScreen)} />
        <Stack.Screen name="ArchivedChats" component={withBackdrop(ArchivedChatsScreen)} />
        <Stack.Screen name="ChatMedia" component={withBackdrop(ChatMediaScreen)} />
        <Stack.Screen name="DropsCompose" component={withBackdrop(DropsComposeScreen)} />
        <Stack.Screen name="DropsRecord" component={withBackdrop(DropsRecordScreen, { brand: false })} />
        <Stack.Screen name="DropsPublish" component={withBackdrop(DropsPublishScreen)} />
        <Stack.Screen name="DropsPoll" component={withBackdrop(DropsPollScreen)} />
        <Stack.Screen name="WhatsAppSend" component={withBackdrop(WhatsAppSendScreen)} />
        <Stack.Screen name="VibeScore" component={withBackdrop(VibeScoreScreen)} />
        <Stack.Screen name="PostUnlock" component={withBackdrop(PostUnlockScreen)} />
        <Stack.Screen name="UnlockWaitingScreen" component={withBackdrop(UnlockWaitingScreen)} />
        <Stack.Screen name="UnlockRequestsScreen" component={withBackdrop(UnlockRequestsScreen)} />
        <Stack.Screen name="Room" component={withBackdrop(RoomScreen, { brand: false })} />
        {/* Calls open from anywhere (the incoming call screen, the Live tab). */}
        <Stack.Screen name="DropCall" component={withBackdrop(DropCallScreen, { brand: false })} options={{ gestureEnabled: false }} />
        <Stack.Screen name="AdminDashboard"  component={withBackdrop(AdminDashboardScreen)} />
        <Stack.Screen name="AdminUsers"      component={withBackdrop(AdminUsersScreen)} />
        <Stack.Screen name="AdminModeration" component={withBackdrop(AdminModerationScreen)} />
        <Stack.Screen name="AdminDeceptionReports" component={withBackdrop(AdminDeceptionReportsScreen)} />
        <Stack.Screen name="AdminAds"        component={withBackdrop(AdminAdsScreen)} />
        <Stack.Screen name="AdminPosts"      component={withBackdrop(AdminPostsScreen)} />
        <Stack.Screen name="AdminRefunds"    component={withBackdrop(AdminRefundsScreen)} />
        <Stack.Screen name="AdminSupport"    component={withBackdrop(AdminSupportScreen)} />
        <Stack.Screen name="SupportChat"     component={withBackdrop(SupportChatScreen, { brand: false })} />
        <Stack.Screen name="CreateAd"        component={withBackdrop(CreateAdScreen)} />
        {/* Accessible from HamburgerMenu across all tabs */}
        <Stack.Screen name="Settings"       component={withBackdrop(SettingsScreen)} />
        <Stack.Screen name="EditProfile"    component={withBackdrop(EditProfileScreen)} />
        <Stack.Screen name="Dashboard"      component={withBackdrop(DashboardScreen)} />
        <Stack.Screen name="ChangePassword" component={withBackdrop(ChangePasswordScreen)} />
        <Stack.Screen name="DeleteAccount"  component={withBackdrop(DeleteAccountScreen)} />
        <Stack.Screen name="SavedDrops"     component={withBackdrop(SavedPostsScreen)} />
        <Stack.Screen name="Coins"          component={withBackdrop(CoinsScreen)} />
        <Stack.Screen name="Referral"       component={withBackdrop(ReferralScreen)} />
        <Stack.Screen name="Legal"          component={withBackdrop(LegalScreen)} />
        <Stack.Screen name="BlockList"          component={withBackdrop(BlockListScreen)} />
        <Stack.Screen name="ModerationHistory"  component={withBackdrop(ModerationHistoryScreen)} />
        <Stack.Screen name="FeedLocation"       component={withBackdrop(FeedLocationScreen)} />
        <Stack.Screen name="Market"         component={withBackdrop(MarketScreen)} />
        <Stack.Screen name="MarketItem"     component={withBackdrop(MarketItemScreen)} />
      </Stack.Navigator>
      {!loading && <IncomingCallOverlay navigate={navigateRoot} />}
    </NavigationContainer>
  );
}
