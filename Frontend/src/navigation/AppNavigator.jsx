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
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import SavedPostsScreen from '../screens/feed/SavedPostsScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import ConfessionMarketPlaceScreen from '../screens/drops/ConfessionMarketPlaceScreen';
import DropChatScreen from '../screens/drops/DropChatScreen';
import DropLandingScreen from '../screens/drops/DropLandingScreen';
import DropsInboxScreen from '../screens/drops/DropsInboxScreen';
import ShareCardScreen from '../screens/drops/ShareCardScreen';
import VibeScoreScreen from '../screens/drops/VibeScoreScreen';
import InterestSelectionScreen from '../screens/onboarding/InterestSelectionScreen';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';

const Stack = createStackNavigator();

// ─── Deep-link routing (spec section 17) ────────────────────────
// Schemes:
//   anonixx://drop/:dropId        → DropLandingScreen
//   anonixx://confession          → ConfessionMarketplace
//   anonixx://drops/inbox         → DropsInbox
//   anonixx://drops/new           → Connect › DropsCompose
//   anonixx://drops/voice         → Connect › DropsRecord
//   anonixx://drops/publish       → Connect › DropsPublish
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
      // PayPal redirect deep links (used by InternationalPaymentSheet WebBrowser flow)
      // These are caught by WebBrowser.openAuthSessionAsync and don't need screen handlers
      // Nested routes live inside TabNavigator › Connect stack
      Main: {
        screens: {
          Connect: {
            screens: {
              DropsCompose: 'drops/new',
              DropsRecord:  'drops/voice',
              DropsPublish: 'drops/publish',
            },
          },
        },
      },
    },
  },
};

export default function AppNavigator() {
  const { loading, isAuthenticated } = useAuth();
  const dispatch = useDispatch();

  // Detect payment region once on app boot (cached for 24h in AsyncStorage)
  useEffect(() => {
    dispatch(detectLocation());
  }, []);

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {loading
          ? <Stack.Screen name="Splash" component={DynamicSplash} />
          : isAuthenticated
            ? <Stack.Screen name="Main" component={TabNavigator} />
            : <Stack.Screen name="Auth" component={AuthNavigator} />
        }
        {/* Keep these accessible for deep links + post-auth navigation */}
        <Stack.Screen name="AuthNav" component={AuthNavigator} />
        <Stack.Screen
          name="InterestSelection"
          component={InterestSelectionScreen}
        />
        <Stack.Screen name="UnlockPremium" component={UnlockPremiumScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Call" component={CallScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="ShareCard" component={ShareCardScreen} />
        <Stack.Screen name="DropLanding" component={DropLandingScreen} />
        <Stack.Screen name="DropsInbox" component={DropsInboxScreen} />
        <Stack.Screen name="DropChat" component={DropChatScreen} />
        <Stack.Screen
          name="ConfessionMarketplace"
          component={ConfessionMarketPlaceScreen}
        />
        <Stack.Screen name="VibeScore" component={VibeScoreScreen} />
        {/* Accessible from HamburgerMenu across all tabs */}
        <Stack.Screen name="Settings"       component={SettingsScreen} />
        <Stack.Screen name="EditProfile"    component={EditProfileScreen} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
        <Stack.Screen name="SavedPosts"     component={SavedPostsScreen} />
        <Stack.Screen name="Coins"          component={CoinsScreen} />
        <Stack.Screen name="Referral"       component={ReferralScreen} />
        <Stack.Screen name="Legal"          component={LegalScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
