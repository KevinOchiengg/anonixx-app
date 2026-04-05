import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';

// Inline splash — shown as a screen inside the navigator while auth hydrates.
// Keeping NavigationContainer always mounted means deep-link URLs are never dropped.
function SplashScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b0f18' }}>
      <ActivityIndicator size="large" color="#FF634A" />
    </View>
  );
}
import ChatScreen from '../screens/connect/ChatScreen';
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

const linking = {
  prefixes: ['anonixx://'],
  config: {
    screens: {
      DropLanding: 'drop/:dropId',
    },
  },
};

export default function AppNavigator() {
  const { loading } = useAuth();

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* Splash is the initial screen while auth state is loading from storage.
            NavigationContainer is always mounted so deep-link initial URLs are
            captured immediately — before the auth check completes. */}
        {loading
          ? <Stack.Screen name="Splash" component={SplashScreen} />
          : <Stack.Screen name="Main" component={TabNavigator} />
        }
        <Stack.Screen name="Auth" component={AuthNavigator} />
        <Stack.Screen
          name="InterestSelection"
          component={InterestSelectionScreen}
        />
        <Stack.Screen name="UnlockPremium" component={UnlockPremiumScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
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
