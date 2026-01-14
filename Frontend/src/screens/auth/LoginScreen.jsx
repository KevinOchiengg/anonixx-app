import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native'
import { useDispatch } from 'react-redux'
import { login } from '../../store/slices/authSlice'
import { Lock, Mail } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'

export default function LoginScreen({ navigation }) {
  const dispatch = useDispatch()
  const { theme } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields')
      return
    }

    console.log('🔵 LoginScreen: Attempting login...')
    console.log('📧 Email:', email)
    console.log('🔑 Password length:', password.length)

    setLoading(true)
    try {
      await dispatch(login({ email, password })).unwrap()
      console.log('✅ LoginScreen: Login successful!')
    } catch (error) {
      console.log('❌ LoginScreen: Login failed:', error)
      Alert.alert(
        'Login Failed',
        error.detail || error.message || 'Invalid credentials'
      )
    } finally {
      setLoading(false)
    }
  }

  const styles = createStyles(theme)

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps='handled'
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.logo, { color: theme.text }]}>Echo</Text>
          <Text style={[styles.tagline, { color: theme.textSecondary }]}>
            Your safe space for mental health
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={[styles.title, { color: theme.text }]}>
            Welcome Back
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Sign in to continue
          </Text>

          {/* Email Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Email</Text>
            <View
              style={[
                styles.inputContainer,
                {
                  backgroundColor: theme.input,
                  borderColor: theme.inputBorder,
                },
              ]}
            >
              <Mail
                size={20}
                color={theme.textSecondary}
                style={styles.inputIcon}
              />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder='Enter your email'
                placeholderTextColor={theme.placeholder}
                style={[styles.input, { color: theme.text }]}
                keyboardType='email-address'
                autoCapitalize='none'
                editable={!loading}
              />
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Password</Text>
            <View
              style={[
                styles.inputContainer,
                {
                  backgroundColor: theme.input,
                  borderColor: theme.inputBorder,
                },
              ]}
            >
              <Lock
                size={20}
                color={theme.textSecondary}
                style={styles.inputIcon}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder='Enter your password'
                placeholderTextColor={theme.placeholder}
                style={[styles.input, { color: theme.text }]}
                secureTextEntry
                editable={!loading}
              />
            </View>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            style={[
              styles.loginButton,
              { backgroundColor: theme.primary },
              loading && styles.loginButtonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color='#ffffff' />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Sign Up Link */}
          <View style={styles.signupContainer}>
            <Text style={[styles.signupText, { color: theme.textSecondary }]}>
              Don't have an account?{' '}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Signup')}
              disabled={loading}
            >
              <Text style={[styles.signupLink, { color: theme.primary }]}>
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: 24,
    },
    header: {
      alignItems: 'center',
      marginBottom: 48,
    },
    logo: {
      fontSize: 48,
      fontWeight: 'bold',
      marginBottom: 8,
    },
    tagline: {
      fontSize: 16,
    },
    form: {
      width: '100%',
      maxWidth: 400,
      alignSelf: 'center',
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      marginBottom: 32,
    },
    inputGroup: {
      marginBottom: 20,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 8,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 16,
    },
    inputIcon: {
      marginRight: 12,
    },
    input: {
      flex: 1,
      height: 50,
      fontSize: 16,
    },
    loginButton: {
      height: 50,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    loginButtonDisabled: {
      opacity: 0.6,
    },
    loginButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    signupContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 24,
    },
    signupText: {
      fontSize: 14,
    },
    signupLink: {
      fontSize: 14,
      fontWeight: '600',
    },
  })
