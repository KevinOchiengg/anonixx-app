import './global.css';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
// @stripe/stripe-react-native — install: npx expo install @stripe/stripe-react-native
import { StripeProvider } from '@stripe/stripe-react-native';
import store from './src/store';
import AppNavigator from './src/navigation/AppNavigator';
import { SocketProvider } from './src/context/SocketContext';
import { ThemeProvider as CustomThemeProvider } from './src/context/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import { ToastProvider } from './src/components/ui/Toast';
import { UnreadProvider } from './src/context/UnreadContext';
import { STRIPE_PUBLISHABLE_KEY } from './src/config/api';
import { FONT_MAP } from './src/config/fonts';
import AppLoadingScreen from './src/components/common/AppLoadingScreen';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  componentDidCatch(error, info) {
    this.setState({ hasError: true, error, info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>💥 Runtime Error</Text>
          <ScrollView>
            <Text style={styles.errorMsg}>{this.state.error?.toString()}</Text>
            <Text style={styles.errorStack}>
              {this.state.info?.componentStack}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorWrap:  { flex: 1, backgroundColor: '#0b0f18', padding: 20, paddingTop: 60 },
  errorTitle: { color: '#FF634A', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  errorMsg:   { color: '#EAEAF0', fontSize: 13, marginBottom: 12 },
  errorStack: { color: '#9A9AA3', fontSize: 11, lineHeight: 18 },
});

export default function App() {
  const [fontsLoaded, fontError] = useFonts(FONT_MAP);

  // The native splash (app.json's `splash` config) hands off to this the
  // instant JS takes over — custom fonts aren't ready yet, so this briefly
  // renders in the system font before Fraunces/DM Sans finish loading.
  if (!fontsLoaded && !fontError) {
    return <AppLoadingScreen />;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.com.anonixx">
            <Provider store={store}>
              <CustomThemeProvider>
                <AuthProvider>
                  <SocketProvider>
                    <ToastProvider>
                      <UnreadProvider>
                        <StatusBar style="light" />
                        <AppNavigator />
                      </UnreadProvider>
                    </ToastProvider>
                  </SocketProvider>
                </AuthProvider>
              </CustomThemeProvider>
            </Provider>
          </StripeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
