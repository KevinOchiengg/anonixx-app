import React, { useState } from 'react'
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
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useDispatch, useSelector } from 'react-redux'
import { signup } from '../../store/slices/authSlice'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'

export default function SignUpScreen({ navigation }) {
  const dispatch = useDispatch()
  const { theme } = useTheme() // ✅ Get theme
  const { login: authContextLogin } = useAuth()
  const { loading, error } = useSelector((state) => state.auth)
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState({})

  const validate = () => {
    const newErrors = {}

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

const handleSignUp = async () => {
  if (!validate()) return

  try {
    const result = await dispatch(signup(formData)).unwrap()
    console.log('✅ Signup successful:', result)
    console.log('🔍 Token from signup:', result.token) // ✅ Changed
    
    // ✅ Update AuthContext
    await authContextLogin(result.token, result.user) // ✅ Changed
    
    // ✅ VERIFY token was saved
    const savedToken = await AsyncStorage.getItem('token')
    console.log('🔍 Token saved to AsyncStorage:', savedToken?.substring(0, 30))
    
    if (!savedToken) {
      throw new Error('Token was not saved properly')
    }

    console.log('✅ AuthContext updated')
    console.log('✅ Navigating to InterestSelection...')
    
    navigation.reset({
      index: 0,
      routes: [{ name: 'InterestSelection' }],
    })
  } catch (err) {
    console.error('❌ Signup failed:', err)
    Alert.alert('Signup Failed', err.detail || 'Something went wrong')
  }
}


  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }))
    }
  }

  const styles = createStyles(theme)

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>
            Create Account
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Join Anonixx and start connecting
          </Text>
        </View>

        {/* Username Input */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>Username</Text>
          <TextInput
            value={formData.username}
            onChangeText={(val) => updateField('username', val)}
            placeholder='Choose a username'
            placeholderTextColor={theme.placeholder}
            autoCapitalize='none'
            style={[
              styles.input,
              {
                backgroundColor: theme.input,
                borderColor: errors.username ? '#ef4444' : theme.inputBorder,
                color: theme.text,
              },
            ]}
          />
          {errors.username && (
            <Text style={styles.errorText}>{errors.username}</Text>
          )}
        </View>

        {/* Email Input */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>Email</Text>
          <TextInput
            value={formData.email}
            onChangeText={(val) => updateField('email', val)}
            placeholder='Enter your email'
            placeholderTextColor={theme.placeholder}
            keyboardType='email-address'
            autoCapitalize='none'
            style={[
              styles.input,
              {
                backgroundColor: theme.input,
                borderColor: errors.email ? '#ef4444' : theme.inputBorder,
                color: theme.text,
              },
            ]}
          />
          {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
        </View>

        {/* Password Input */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>Password</Text>
          <TextInput
            value={formData.password}
            onChangeText={(val) => updateField('password', val)}
            placeholder='Create a password'
            placeholderTextColor={theme.placeholder}
            secureTextEntry
            style={[
              styles.input,
              {
                backgroundColor: theme.input,
                borderColor: errors.password ? '#ef4444' : theme.inputBorder,
                color: theme.text,
              },
            ]}
          />
          {errors.password && (
            <Text style={styles.errorText}>{errors.password}</Text>
          )}
        </View>

        {/* Confirm Password Input */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.text }]}>
            Confirm Password
          </Text>
          <TextInput
            value={formData.confirmPassword}
            onChangeText={(val) => updateField('confirmPassword', val)}
            placeholder='Confirm your password'
            placeholderTextColor={theme.placeholder}
            secureTextEntry
            style={[
              styles.input,
              {
                backgroundColor: theme.input,
                borderColor: errors.confirmPassword
                  ? '#ef4444'
                  : theme.inputBorder,
                color: theme.text,
              },
            ]}
          />
          {errors.confirmPassword && (
            <Text style={styles.errorText}>{errors.confirmPassword}</Text>
          )}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Sign Up Button */}
        <TouchableOpacity
          onPress={handleSignUp}
          disabled={loading}
          style={[styles.signupButton, { backgroundColor: theme.primary }]}
        >
          {loading ? (
            <ActivityIndicator color='#ffffff' />
          ) : (
            <Text style={styles.signupButtonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        {/* Login Link */}
        <View style={styles.loginLink}>
          <Text style={[styles.loginText, { color: theme.textSecondary }]}>
            Already have an account?{' '}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={[styles.loginTextBold, { color: theme.primary }]}>
              Sign In
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.termsText, { color: theme.textSecondary }]}>
          By signing up, you agree to our Terms of Service and Privacy Policy
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
      paddingHorizontal: 24,
    },
    header: {
      marginTop: 48,
      marginBottom: 32,
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
    errorText: {
      color: '#ef4444',
      fontSize: 12,
      marginTop: 4,
    },
    signupButton: {
      height: 56,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      marginBottom: 16,
    },
    signupButtonText: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: '700',
    },
    loginLink: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
    },
    loginText: {
      fontSize: 16,
    },
    loginTextBold: {
      fontSize: 16,
      fontWeight: '700',
    },
    termsText: {
      fontSize: 12,
      textAlign: 'center',
      marginBottom: 32,
    },
  })
