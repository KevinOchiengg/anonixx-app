import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useDispatch } from 'react-redux';
import { useAuth } from '../context/AuthContext';
import DynamicSplash from '../components/common/DynamicSplash';
import { detectLocation } from '../store/slices/locationSlice';

import ChatScreen from '../screens/connect/ChatScreen';
import CallScreen from '../screens/connect/CallScreen';
import UnlockPremiumScreen from '../screens/connect/UnlockPremiumScreen';
import ChangePasswordScreen from '../screens/profile/ChangePasswordScreen';
import CoinsScreen from '../screens/profile/CoinsScreen';
import ReferralScreen from '../screens/profile/ReferralScreen';
import LegalScreen from '../screens/settings/LegalScreen';
import BlockListScreen from '../screens/settings/BlockListScreen';
import ModerationHistoryScreen from '../screens/settings/ModerationHistoryScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import PremiumScreen from '../screens/profile/PremiumScreen';
import SavedPostsScreen from '../screens/feed/SavedPostsScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import ConfessionMarketPlaceScreen from '../screens/drops/ConfessionMarketPlaceScreen';
import DropChatScreen from '../screens/drops/DropChatScreen';
import DropLandingScreen from '../screens/drops/DropLandingScreen';
import MarketScreen from '../screens/market/MarketScreen';
import MarketItemScreen from '../screens/market/MarketItemScreen';
import DropsInboxScreen from '../screens/drops/DropsInboxScreen';
import ShareCardScreen from '../screens/drops/ShareCardScreen';
import VibeScoreScreen from '../screens/drops/VibeScoreScreen';
import PostUnlockScreen from '../screens/drops/PostUnlockScreen';
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminModerationScreen from '../screens/admin/AdminModerationScreen';
import AdminAdsScreen from '../screens/admin/AdminAdsScreen';
import CreateAdScreen from '../screens/feed/CreateAdScreen';
import DropsComposeScreen from '../screens/drops/DropsComposeScreen';
import DropsRecordScreen from '../screens/drops/DropsRecordScreen';
import DropsPublishScreen from '../screens/drops/DropsPublishScreen';
import DropsPollScreen from '../screens/drops/DropsPollScreen';
import InterestSelectionScreen from '../screens/onboarding/InterestSelectionScreen';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';

const Stack = createStackNavigator();

// ─── Deep-link routing (spec section 17) ────────────────────────
// Schemes:
//   anonixx://drop/:dropId        → DropLandingScreen
//   anonixx://confession          → ConfessionMarketplace
//   anonixx://drops/inbox         → DropsInbox
//   anonixx://drops/new           → DropsCompose
//   anonixx://drops/voice         → DropsRecord
//   anonixx://drops/publish       → DropsPublish
//   anonixx://drops/poll          → DropsPoll
//   https://anonixx.app/drop/:id  → DropLandingScreen  (tappable share link)
const linking = {
  prefixes: [
    'anonixx://',
    'https://anonixx.app',
    'https://www.anonixx.app',
  ],
  config: {
    screens: {
      DropLanding:           'drop/:dropId',
      ConfessionMarketplace: 'confession',
      DropsInbox:            'drops/inbox',
      DropChat:              'drop-chat/:connectionId',
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

export default function AppNavigator() {
  const { loading } = useAuth();
  const dispatch = useDispatch();

  // Detect payment region once on app boot (cached for 24h in AsyncStorage)
  useEffect(() => {
    dispatch(detectLocation());
  }, []);

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* No login/signup gate — guests (and new users) land straight on the
            main feed. Auth screens stay reachable via "AuthNav" below for
            whoever opts in later (e.g. Settings > Log In). */}
        {loading
          ? <Stack.Screen name="Splash" component={DynamicSplash} />
          : <Stack.Screen name="Main" component={TabNavigator} />
        }
        {/* Keep these accessible for deep links + post-auth navigation */}
        <Stack.Screen name="AuthNav" component={AuthNavigator} />
        <Stack.Screen
          name="InterestSelection"
          component={InterestSelectionScreen}
        />
        <Stack.Screen name="UnlockPremium" component={UnlockPremiumScreen} />
        <Stack.Screen name="Premium" component={PremiumScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Call" component={CallScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="ShareCard" component={ShareCardScreen} />
        <Stack.Screen name="DropLanding" component={DropLandingScreen} />
        <Stack.Screen name="DropsInbox" component={DropsInboxScreen} />
        <Stack.Screen name="DropChat" component={DropChatScreen} />
        <Stack.Screen name="DropsCompose" component={DropsComposeScreen} />
        <Stack.Screen name="DropsRecord" component={DropsRecordScreen} />
        <Stack.Screen name="DropsPublish" component={DropsPublishScreen} />
        <Stack.Screen name="DropsPoll" component={DropsPollScreen} />
        <Stack.Screen
          name="ConfessionMarketplace"
          component={ConfessionMarketPlaceScreen}
        />
        <Stack.Screen name="VibeScore" component={VibeScoreScreen} />
        <Stack.Screen name="PostUnlock" component={PostUnlockScreen} />
        <Stack.Screen name="AdminDashboard"  component={AdminDashboardScreen} />
        <Stack.Screen name="AdminUsers"      component={AdminUsersScreen} />
        <Stack.Screen name="AdminModeration" component={AdminModerationScreen} />
        <Stack.Screen name="AdminAds"        component={AdminAdsScreen} />
        <Stack.Screen name="CreateAd"        component={CreateAdScreen} />
        {/* Accessible from HamburgerMenu across all tabs */}
        <Stack.Screen name="Settings"       component={SettingsScreen} />
        <Stack.Screen name="EditProfile"    component={EditProfileScreen} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
        <Stack.Screen name="SavedPosts"     component={SavedPostsScreen} />
        <Stack.Screen name="Coins"          component={CoinsScreen} />
        <Stack.Screen name="Referral"       component={ReferralScreen} />
        <Stack.Screen name="Legal"          component={LegalScreen} />
        <Stack.Screen name="BlockList"          component={BlockListScreen} />
        <Stack.Screen name="ModerationHistory"  component={ModerationHistoryScreen} />
        <Stack.Screen name="Market"         component={MarketScreen} />
        <Stack.Screen name="MarketItem"     component={MarketItemScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
