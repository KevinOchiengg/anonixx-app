import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import ChatScreen from '../screens/connect/ChatScreen';
import UnlockPremiumScreen from '../screens/connect/UnlockPremiumScreen';
import ChangePasswordScreen from '../screens/profile/ChangePasswordScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import SavedPostsScreen from '../screens/feed/SavedPostsScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import ConfessionMarketPlaceScreen from '../screens/drops/ConfessionMarketPlaceScreen';
import DropChatScreen from '../screens/drops/DropChatScreen';
import DropLandingScreen from '../screens/drops/DropLandingScreen';
import DropsInboxScreen from '../screens/drops/DropsInboxScreen';
import ShareCardScreen from '../screens/drops/ShareCardScreen';
import VibeScoreScreen from '../screens/drops/VibeScoreScreen';
import MediaFeedScreen from '../screens/feed/MediaFeedScreen';
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

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#0A0A12',
        }}
      >
        <ActivityIndicator size="large" color="#6B7FFF" />
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={TabNavigator} />
        <Stack.Screen name="Auth" component={AuthNavigator} />
        <Stack.Screen
          name="InterestSelection"
          component={InterestSelectionScreen}
        />
        <Stack.Screen name="UnlockPremium" component={UnlockPremiumScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen
          name="MediaFeed"
          component={MediaFeedScreen}
          options={{ animation: 'fade' }}
        />
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
