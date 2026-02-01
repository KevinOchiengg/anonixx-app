import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { ArrowLeft, Save, Lock, Eye, EyeOff } from 'lucide-react-native'
import { API_BASE_URL } from '../../config/api'


export default function ChangePasswordScreen({ navigation }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleChangePassword = async () => {
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'All fields are required')
      return
    }

    if (newPassword.length < 8) {
      Alert.alert('Error', 'New password must be at least 8 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match')
      return
    }

    if (currentPassword === newPassword) {
      Alert.alert(
        'Error',
        'New password must be different from current password'
      )
      return
    }

    setLoading(true)
    try {
      const token = await AsyncStorage.getItem('token')

      const response = await fetch(
        `${API_BASE_URL}/api/v1/auth/change-password`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
          }),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to change password')
      }

      Alert.alert('Success', 'Password changed successfully!', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ])
    } catch (error) {
      console.error('❌ Change password error:', error)
      Alert.alert('Error', error.message || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color='#ffffff' />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Info Box */}
        <View style={styles.infoBox}>
          <Lock size={20} color='#a855f7' />
          <Text style={styles.infoText}>
            Choose a strong password with at least 8 characters
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Current Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Current Password</Text>
            <View style={styles.inputContainer}>
              <View style={styles.inputIcon}>
                <Lock size={20} color='#6b7280' />
              </View>
              <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder='Enter current password'
                placeholderTextColor='#6b7280'
                style={styles.input}
                secureTextEntry={!showCurrent}
                autoCapitalize='none'
              />
              <TouchableOpacity
                onPress={() => setShowCurrent(!showCurrent)}
                style={styles.eyeButton}
              >
                {showCurrent ? (
                  <EyeOff size={20} color='#6b7280' />
                ) : (
                  <Eye size={20} color='#6b7280' />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* New Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputContainer}>
              <View style={styles.inputIcon}>
                <Lock size={20} color='#6b7280' />
              </View>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder='Enter new password'
                placeholderTextColor='#6b7280'
                style={styles.input}
                secureTextEntry={!showNew}
                autoCapitalize='none'
              />
              <TouchableOpacity
                onPress={() => setShowNew(!showNew)}
                style={styles.eyeButton}
              >
                {showNew ? (
                  <EyeOff size={20} color='#6b7280' />
                ) : (
                  <Eye size={20} color='#6b7280' />
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>Minimum 8 characters</Text>
          </View>

          {/* Confirm Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm New Password</Text>
            <View style={styles.inputContainer}>
              <View style={styles.inputIcon}>
                <Lock size={20} color='#6b7280' />
              </View>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder='Confirm new password'
                placeholderTextColor='#6b7280'
                style={styles.input}
                secureTextEntry={!showConfirm}
                autoCapitalize='none'
              />
              <TouchableOpacity
                onPress={() => setShowConfirm(!showConfirm)}
                style={styles.eyeButton}
              >
                {showConfirm ? (
                  <EyeOff size={20} color='#6b7280' />
                ) : (
                  <Eye size={20} color='#6b7280' />
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>Must match new password</Text>
          </View>
        </View>

        {/* Change Password Button */}
        <TouchableOpacity
          onPress={handleChangePassword}
          disabled={loading}
          style={[styles.changeButton, loading && styles.changeButtonDisabled]}
        >
          {loading ? (
            <ActivityIndicator size='small' color='#ffffff' />
          ) : (
            <>
              <Save size={20} color='#ffffff' />
              <Text style={styles.changeButtonText}>Change Password</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Security Tips */}
        <View style={styles.tipsBox}>
          <Text style={styles.tipsTitle}>Password Security Tips:</Text>
          <Text style={styles.tipText}>• Use at least 8 characters</Text>
          <Text style={styles.tipText}>
            • Mix uppercase and lowercase letters
          </Text>
          <Text style={styles.tipText}>• Include numbers and symbols</Text>
          <Text style={styles.tipText}>• Avoid common words or patterns</Text>
          <Text style={styles.tipText}>
            • Don't reuse passwords from other sites
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a855f7',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#a855f7',
    marginLeft: 12,
    lineHeight: 20,
  },
  form: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
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
    color: '#ffffff',
    fontSize: 16,
  },
  eyeButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    marginLeft: 4,
  },
  changeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14b8a6',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
  },
  changeButtonDisabled: {
    opacity: 0.5,
  },
  changeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 8,
  },
  tipsBox: {
    backgroundColor: '#16213e',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 32,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
  },
  tipText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
    lineHeight: 20,
  },
})
