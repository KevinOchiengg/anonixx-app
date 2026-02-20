import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  StatusBar,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch, useSelector } from 'react-redux';
import { signup } from '../../store/slices/authSlice';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { User, Mail, Lock, Check } from 'lucide-react-native';

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

export default function SignUpScreen({ navigation }) {
  const dispatch = useDispatch();
  const { theme } = useTheme();
  const { login: authContextLogin } = useAuth();
  const { loading, error } = useSelector((state) => state.auth);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignUp = async () => {
    if (!validate()) return;

    try {
      const result = await dispatch(signup(formData)).unwrap();
      console.log('✅ Signup successful:', result);
      console.log('🔍 Token from signup:', result.token);

      await authContextLogin(result.token, result.user);

      const savedToken = await AsyncStorage.getItem('token');
      console.log(
        '🔍 Token saved to AsyncStorage:',
        savedToken?.substring(0, 30)
      );

      if (!savedToken) {
        throw new Error('Token was not saved properly');
      }

      console.log('✅ AuthContext updated');
      console.log('✅ Navigating to InterestSelection...');

      navigation.reset({
        index: 0,
        routes: [{ name: 'InterestSelection' }],
      });
    } catch (err) {
      console.error('❌ Signup failed:', err);
      Alert.alert('Signup Failed', err.detail || 'Something went wrong');
    }
  };

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join Anonixx and start connecting</Text>
        </View>

        {/* Username Input */}
        <View style={styles.inputCardWrapper}>
          <View
            style={[
              styles.inputAccentBar,
              errors.username && styles.inputAccentBarError,
            ]}
          />
          <View style={styles.inputCard}>
            <Text style={styles.label}>Username</Text>
            <View
              style={[
                styles.inputContainer,
                errors.username && styles.inputContainerError,
              ]}
            >
              <View style={styles.inputIcon}>
                <User size={20} color={THEME.textSecondary} />
              </View>
              <TextInput
                value={formData.username}
                onChangeText={(val) => updateField('username', val)}
                placeholder="Choose a username"
                placeholderTextColor={THEME.textSecondary}
                autoCapitalize="none"
                style={styles.input}
              />
            </View>
            {errors.username && (
              <Text style={styles.errorText}>{errors.username}</Text>
            )}
          </View>
        </View>

        {/* Email Input */}
        <View style={styles.inputCardWrapper}>
          <View
            style={[
              styles.inputAccentBar,
              errors.email && styles.inputAccentBarError,
            ]}
          />
          <View style={styles.inputCard}>
            <Text style={styles.label}>Email</Text>
            <View
              style={[
                styles.inputContainer,
                errors.email && styles.inputContainerError,
              ]}
            >
              <View style={styles.inputIcon}>
                <Mail size={20} color={THEME.textSecondary} />
              </View>
              <TextInput
                value={formData.email}
                onChangeText={(val) => updateField('email', val)}
                placeholder="Enter your email"
                placeholderTextColor={THEME.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />
            </View>
            {errors.email && (
              <Text style={styles.errorText}>{errors.email}</Text>
            )}
          </View>
        </View>

        {/* Password Input */}
        <View style={styles.inputCardWrapper}>
          <View
            style={[
              styles.inputAccentBar,
              errors.password && styles.inputAccentBarError,
            ]}
          />
          <View style={styles.inputCard}>
            <Text style={styles.label}>Password</Text>
            <View
              style={[
                styles.inputContainer,
                errors.password && styles.inputContainerError,
              ]}
            >
              <View style={styles.inputIcon}>
                <Lock size={20} color={THEME.textSecondary} />
              </View>
              <TextInput
                value={formData.password}
                onChangeText={(val) => updateField('password', val)}
                placeholder="Create a password"
                placeholderTextColor={THEME.textSecondary}
                secureTextEntry
                style={styles.input}
              />
            </View>
            {errors.password && (
              <Text style={styles.errorText}>{errors.password}</Text>
            )}
          </View>
        </View>

        {/* Confirm Password Input */}
        <View style={styles.inputCardWrapper}>
          <View
            style={[
              styles.inputAccentBar,
              errors.confirmPassword && styles.inputAccentBarError,
            ]}
          />
          <View style={styles.inputCard}>
            <Text style={styles.label}>Confirm Password</Text>
            <View
              style={[
                styles.inputContainer,
                errors.confirmPassword && styles.inputContainerError,
              ]}
            >
              <View style={styles.inputIcon}>
                <Check size={20} color={THEME.textSecondary} />
              </View>
              <TextInput
                value={formData.confirmPassword}
                onChangeText={(val) => updateField('confirmPassword', val)}
                placeholder="Confirm your password"
                placeholderTextColor={THEME.textSecondary}
                secureTextEntry
                style={styles.input}
              />
            </View>
            {errors.confirmPassword && (
              <Text style={styles.errorText}>{errors.confirmPassword}</Text>
            )}
          </View>
        </View>

        {/* Global Error */}
        {error && (
          <View style={styles.globalErrorWrapper}>
            <View style={styles.globalErrorAccentBar} />
            <View style={styles.globalError}>
              <Text style={styles.globalErrorText}>{error}</Text>
            </View>
          </View>
        )}

        {/* Sign Up Button */}
        <View style={styles.signupButtonWrapper}>
          <View style={styles.signupAccentBar} />
          <TouchableOpacity
            onPress={handleSignUp}
            disabled={loading}
            style={[
              styles.signupButton,
              loading && styles.signupButtonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.signupButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Login Link */}
        <View style={styles.loginLink}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginTextBold}>Sign In</Text>
          </TouchableOpacity>
        </View>

        {/* Terms */}
        <Text style={styles.termsText}>
          By signing up, you agree to our Terms of Service and Privacy Policy
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    marginTop: 48,
    marginBottom: 32,
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
  inputAccentBarError: {
    backgroundColor: THEME.error,
    opacity: 0.8,
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
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputContainerError: {
    borderColor: THEME.error,
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
  errorText: {
    color: THEME.error,
    fontSize: 12,
    marginTop: 8,
    marginLeft: 4,
    fontWeight: '500',
  },
  // Global Error
  globalErrorWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  globalErrorAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.error,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  globalError: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 16,
    paddingLeft: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  globalErrorText: {
    color: THEME.error,
    fontSize: 14,
    fontWeight: '500',
  },
  // Sign Up Button
  signupButtonWrapper: {
    position: 'relative',
    marginTop: 8,
    marginBottom: 24,
  },
  signupAccentBar: {
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
  signupButton: {
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
  signupButtonDisabled: {
    opacity: 0.6,
  },
  signupButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  // Login Link
  loginLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  loginText: {
    fontSize: 15,
    color: THEME.textSecondary,
  },
  loginTextBold: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.primary,
  },
  termsText: {
    fontSize: 12,
    textAlign: 'center',
    color: THEME.textSecondary,
    lineHeight: 18,
    opacity: 0.7,
  },
});
