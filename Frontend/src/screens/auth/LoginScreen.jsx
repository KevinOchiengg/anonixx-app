import React, { useState } from 'react'
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
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useDispatch } from 'react-redux'
import { login } from '../../store/slices/authSlice'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'

export default function LoginScreen({ navigation }) {
  const dispatch = useDispatch()
  const { theme } = useTheme()
  const { login: authContextLogin } = useAuth() // ✅ Get login from context
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

 const handleLogin = async () => {
   if (!email || !password) {
     Alert.alert('Error', 'Please fill in all fields')
     return
   }

   setLoading(true)
   try {
     const result = await dispatch(login({ email, password })).unwrap()

     // ✅ DEBUG: What did we get from backend?
     console.log('🔍 Login result:', result)
     console.log('🔍 result.access_token:', result.access_token)
     console.log('🔍 result.user:', result.user)
     console.log('🔍 Type of access_token:', typeof result.access_token)

     // Check if token exists
     if (!result.access_token) {
       Alert.alert('Error', 'Login failed: No token received')
       setLoading(false)
       return
     }

     // ✅ Update AuthContext
     await authContextLogin(result.access_token, result.user)

     // ✅ Verify it was saved
     const savedToken = await AsyncStorage.getItem('token')
     console.log('🔍 Saved token:', savedToken?.substring(0, 30))

     console.log('✅ AuthContext updated, navigating to Main')

     navigation.reset({
       index: 0,
       routes: [{ name: 'Main' }],
     })
   } catch (error) {
     console.error('❌ Login error:', error)
     Alert.alert('Login Failed', error.detail || 'Invalid email or password')
   } finally {
     setLoading(false)
   }
 }

  const styles = createStyles(theme)

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>
            Welcome Back
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Sign in to continue to Anonixx
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder='Enter your email'
              placeholderTextColor={theme.placeholder}
              keyboardType='email-address'
              autoCapitalize='none'
              autoComplete='email'
              style={[
                styles.input,
                {
                  backgroundColor: theme.input,
                  borderColor: theme.inputBorder,
                  color: theme.text,
                },
              ]}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder='Enter your password'
              placeholderTextColor={theme.placeholder}
              secureTextEntry
              autoCapitalize='none'
              autoComplete='password'
              style={[
                styles.input,
                {
                  backgroundColor: theme.input,
                  borderColor: theme.inputBorder,
                  color: theme.text,
                },
              ]}
            />
          </View>

          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            style={[styles.loginButton, { backgroundColor: theme.primary }]}
          >
            {loading ? (
              <ActivityIndicator color='#ffffff' />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('SignUp')}
            style={styles.signupLink}
          >
            <Text style={[styles.signupText, { color: theme.textSecondary }]}>
              Don't have an account?{' '}
              <Text style={[styles.signupTextBold, { color: theme.primary }]}>
                Sign Up
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      flex: 1,
      paddingHorizontal: 24,
      justifyContent: 'center',
    },
    header: {
      marginBottom: 40,
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      lineHeight: 24,
    },
    form: {
      width: '100%',
    },
    inputGroup: {
      marginBottom: 20,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 8,
    },
    input: {
      height: 56,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 16,
      fontSize: 16,
    },
    loginButton: {
      height: 56,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    loginButtonText: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: '700',
    },
    signupLink: {
      marginTop: 24,
      alignItems: 'center',
    },
    signupText: {
      fontSize: 16,
    },
    signupTextBold: {
      fontWeight: '700',
    },
  })
