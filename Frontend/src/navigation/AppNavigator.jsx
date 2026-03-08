import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import UnlockPremiumScreen from '../screens/connect/UnlockPremiumScreen';
import InterestSelectionScreen from '../screens/onboarding/InterestSelectionScreen';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import ChatScreen from '../screens/connect/ChatScreen';

const Stack = createStackNavigator();

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
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={TabNavigator} />
        <Stack.Screen name="Auth" component={AuthNavigator} />
        <Stack.Screen
          name="InterestSelection"
          component={InterestSelectionScreen}
        />
        <Stack.Screen name="UnlockPremium" component={UnlockPremiumScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
