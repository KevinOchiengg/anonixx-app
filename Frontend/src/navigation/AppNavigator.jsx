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
import MarketScreen from '../screens/market/MarketScreen';
import MarketItemScreen from '../screens/market/MarketItemScreen';
import VibeScoreScreen from '../screens/drops/VibeScoreScreen';
import PostUnlockScreen from '../screens/drops/PostUnlockScreen';
import UnlockWaitingScreen from '../screens/drops/UnlockWaitingScreen';
import UnlockRequestsScreen from '../screens/drops/UnlockRequestsScreen';
import RoomScreen from '../screens/drops/RoomScreen';
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
          ? <Stack.Screen name="Splash" component={Loading} />
          : <Stack.Screen name="Main" component={TabNavigator} />
        }
        {/* Keep accessible for deep links */}
        <Stack.Screen name="AuthNav" component={AuthNavigator} />
        <Stack.Screen name="Premium" component={PremiumScreen} />
        <Stack.Screen name="DropChat" component={DropChatScreen} />
        <Stack.Screen name="DropsCompose" component={DropsComposeScreen} />
        <Stack.Screen name="DropsRecord" component={DropsRecordScreen} />
        <Stack.Screen name="DropsPublish" component={DropsPublishScreen} />
        <Stack.Screen name="DropsPoll" component={DropsPollScreen} />
        <Stack.Screen name="WhatsAppSend" component={WhatsAppSendScreen} />
        <Stack.Screen name="VibeScore" component={VibeScoreScreen} />
        <Stack.Screen name="PostUnlock" component={PostUnlockScreen} />
        <Stack.Screen name="UnlockWaitingScreen" component={UnlockWaitingScreen} />
        <Stack.Screen name="UnlockRequestsScreen" component={UnlockRequestsScreen} />
        <Stack.Screen name="Room" component={RoomScreen} />
        <Stack.Screen name="AdminDashboard"  component={AdminDashboardScreen} />
        <Stack.Screen name="AdminUsers"      component={AdminUsersScreen} />
        <Stack.Screen name="AdminModeration" component={AdminModerationScreen} />
        <Stack.Screen name="AdminDeceptionReports" component={AdminDeceptionReportsScreen} />
        <Stack.Screen name="AdminAds"        component={AdminAdsScreen} />
        <Stack.Screen name="AdminPosts"      component={AdminPostsScreen} />
        <Stack.Screen name="AdminRefunds"    component={AdminRefundsScreen} />
        <Stack.Screen name="AdminSupport"    component={AdminSupportScreen} />
        <Stack.Screen name="SupportChat"     component={SupportChatScreen} />
        <Stack.Screen name="CreateAd"        component={CreateAdScreen} />
        {/* Accessible from HamburgerMenu across all tabs */}
        <Stack.Screen name="Settings"       component={SettingsScreen} />
        <Stack.Screen name="EditProfile"    component={EditProfileScreen} />
        <Stack.Screen name="Dashboard"      component={DashboardScreen} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
        <Stack.Screen name="DeleteAccount"  component={DeleteAccountScreen} />
        <Stack.Screen name="SavedDrops"     component={SavedPostsScreen} />
        <Stack.Screen name="Coins"          component={CoinsScreen} />
        <Stack.Screen name="Referral"       component={ReferralScreen} />
        <Stack.Screen name="Legal"          component={LegalScreen} />
        <Stack.Screen name="BlockList"          component={BlockListScreen} />
        <Stack.Screen name="ModerationHistory"  component={ModerationHistoryScreen} />
        <Stack.Screen name="FeedLocation"       component={FeedLocationScreen} />
        <Stack.Screen name="Market"         component={MarketScreen} />
        <Stack.Screen name="MarketItem"     component={MarketItemScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
