import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch } from 'react-redux';
import { login } from '../../store/slices/authSlice';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Mail, Lock } from 'lucide-react-native';

const { height, width } = Dimensions.get('window');

// NEW Cinematic Coral Theme
const THEME = {
  background: '#0b0f18',
  backgroundDark: '#06080f',
  surface: '#151924',
  surfaceDark: '#10131c',
  primary: '#FF634A',
  primaryDark: '#ff3b2f',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
  input: 'rgba(30, 35, 45, 0.7)',
  error: '#ef4444',
};

// Starry Background Component
const StarryBackground = () => {
  const stars = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      top: Math.random() * height,
      left: Math.random() * width,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.6 + 0.2,
    }));
  }, []);

  return (
    <>
      {stars.map((star) => (
        <View
          key={star.id}
          style={{
            position: 'absolute',
            backgroundColor: THEME.primary,
            borderRadius: 50,
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
          }}
        />
      ))}
    </>
  );
};

export default function LoginScreen({ navigation }) {
  const dispatch = useDispatch();
  const { theme } = useTheme();
  const { login: authContextLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const result = await dispatch(login({ email, password })).unwrap();

      console.log('🔍 Login result:', result);
      console.log('🔍 result.access_token:', result.access_token);
      console.log('🔍 result.user:', result.user);
      console.log('🔍 Type of access_token:', typeof result.access_token);

      if (!result.access_token) {
        Alert.alert('Error', 'Login failed: No token received');
        setLoading(false);
        return;
      }

      await authContextLogin(result.access_token, result.user);

      const savedToken = await AsyncStorage.getItem('token');
      console.log('🔍 Saved token:', savedToken?.substring(0, 30));

      console.log('✅ AuthContext updated, navigating to Main');

      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    } catch (error) {
      console.error('❌ Login error:', error);
      Alert.alert('Login Failed', error.detail || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue to Anonixx</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Email Input */}
          <View style={styles.inputCardWrapper}>
            <View style={styles.inputAccentBar} />
            <View style={styles.inputCard}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <Mail size={20} color={THEME.textSecondary} />
                </View>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email"
                  placeholderTextColor={THEME.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  style={styles.input}
                />
              </View>
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputCardWrapper}>
            <View style={styles.inputAccentBar} />
            <View style={styles.inputCard}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <Lock size={20} color={THEME.textSecondary} />
                </View>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor={THEME.textSecondary}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password"
                  style={styles.input}
                />
              </View>
            </View>
          </View>

          {/* Login Button */}
          <View style={styles.loginButtonWrapper}>
            <View style={styles.loginAccentBar} />
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              style={[
                styles.loginButton,
                loading && styles.loginButtonDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.loginButtonText}>Login</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Sign Up Link */}
          <TouchableOpacity
            onPress={() => navigation.navigate('SignUp')}
            style={styles.signupLink}
          >
            <Text style={styles.signupText}>
              Don't have an account?{' '}
              <Text style={styles.signupTextBold}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 8,
    color: THEME.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: THEME.textSecondary,
  },
  form: {
    width: '100%',
  },
  // Input Cards
  inputCardWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  inputAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.6,
  },
  inputCard: {
    backgroundColor: THEME.surface,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.input,
    borderRadius: 12,
  },
  inputIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: THEME.text,
    paddingRight: 16,
  },
  // Login Button
  loginButtonWrapper: {
    position: 'relative',
    marginTop: 8,
    marginBottom: 24,
  },
  loginAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.8,
  },
  loginButton: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.primary,
    paddingLeft: 4,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  // Sign Up Link
  signupLink: {
    alignItems: 'center',
  },
  signupText: {
    fontSize: 15,
    color: THEME.textSecondary,
  },
  signupTextBold: {
    fontWeight: '700',
    color: THEME.primary,
  },
});
