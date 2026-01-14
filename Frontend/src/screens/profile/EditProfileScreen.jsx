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
import { useSelector, useDispatch } from 'react-redux'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ArrowLeft, Save, User, Mail, AtSign } from 'lucide-react-native'
import { updateUser } from '../../store/slices/authSlice'

export default function EditProfileScreen({ navigation }) {
  const dispatch = useDispatch()
  const user = useSelector((state) => state.auth.user)

  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Username cannot be empty')
      return
    }

    if (!email.trim()) {
      Alert.alert('Error', 'Email cannot be empty')
      return
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address')
      return
    }

    setLoading(true)
    try {
      const token = await AsyncStorage.getItem('token')

      const response = await fetch(
        'http://192.168.100.22:8000/api/v1/auth/update-profile',
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            username: username.trim(),
            email: email.trim(),
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to update profile')
      }

      // Update Redux state
      dispatch(
        updateUser({
          username: data.username,
          email: data.email,
        })
      )

      Alert.alert('Success', 'Profile updated successfully!', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ])
    } catch (error) {
      console.error('❌ Update profile error:', error)
      Alert.alert('Error', error.message || 'Failed to update profile')
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
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {username?.charAt(0).toUpperCase() || '👤'}
            </Text>
          </View>
          <TouchableOpacity style={styles.changeAvatarButton}>
            <Text style={styles.changeAvatarText}>Change Avatar</Text>
            <Text style={styles.changeAvatarSubtext}>Coming Soon</Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Username */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <View style={styles.inputContainer}>
              <View style={styles.inputIcon}>
                <AtSign size={20} color='#6b7280' />
              </View>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder='Enter username'
                placeholderTextColor='#6b7280'
                style={styles.input}
                autoCapitalize='none'
              />
            </View>
            <Text style={styles.hint}>This is how others will see you</Text>
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputContainer}>
              <View style={styles.inputIcon}>
                <Mail size={20} color='#6b7280' />
              </View>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder='Enter email'
                placeholderTextColor='#6b7280'
                style={styles.input}
                keyboardType='email-address'
                autoCapitalize='none'
              />
            </View>
            <Text style={styles.hint}>We'll never share your email</Text>
          </View>

          {/* Anonymous Name (Read-only) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Anonymous Name</Text>
            <View style={[styles.inputContainer, styles.disabledInput]}>
              <View style={styles.inputIcon}>
                <User size={20} color='#6b7280' />
              </View>
              <TextInput
                value={user?.anonymous_name || 'Not set'}
                editable={false}
                style={[styles.input, styles.disabledText]}
              />
            </View>
            <Text style={styles.hint}>Used when posting anonymously</Text>
          </View>

          {/* Coins Display */}
          <View style={styles.coinsSection}>
            <View style={styles.coinsIcon}>
              <Text style={styles.coinEmoji}>💰</Text>
            </View>
            <View style={styles.coinsInfo}>
              <Text style={styles.coinsLabel}>Your Coins</Text>
              <Text style={styles.coinsValue}>
                {user?.coin_balance || 0} coins
              </Text>
            </View>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={loading}
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
        >
          {loading ? (
            <ActivityIndicator size='small' color='#ffffff' />
          ) : (
            <>
              <Save size={20} color='#ffffff' />
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 Your username and email can be changed anytime. Your anonymous
            name is generated automatically and cannot be changed.
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
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#a855f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  changeAvatarButton: {
    alignItems: 'center',
  },
  changeAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#a855f7',
  },
  changeAvatarSubtext: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  form: {
    paddingHorizontal: 16,
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
    paddingRight: 16,
  },
  disabledInput: {
    backgroundColor: '#0f1729',
  },
  disabledText: {
    color: '#6b7280',
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    marginLeft: 4,
  },
  coinsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a855f7',
    marginTop: 8,
  },
  coinsIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  coinEmoji: {
    fontSize: 24,
  },
  coinsInfo: {
    flex: 1,
  },
  coinsLabel: {
    fontSize: 14,
    color: '#a855f7',
    fontWeight: '600',
  },
  coinsValue: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: 'bold',
    marginTop: 2,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14b8a6',
    marginHorizontal: 16,
    marginTop: 32,
    padding: 16,
    borderRadius: 12,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 8,
  },
  infoBox: {
    backgroundColor: '#16213e',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 32,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  infoText: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 20,
  },
})
