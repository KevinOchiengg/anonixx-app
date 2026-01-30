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
  StatusBar,
  Image,
} from 'react-native'
import { API_BASE_URL } from '../../config/api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ImagePicker from 'expo-image-picker'
import {
  ArrowLeft,
  Save,
  User,
  Mail,
  AtSign,
  Camera,
} from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'

// ✅ Cloudinary config
const CLOUDINARY_CLOUD_NAME = 'dojbdm2e1'
const CLOUDINARY_UPLOAD_PRESET = 'anonix'

export default function EditProfileScreen({ navigation }) {
  const { theme } = useTheme()
  const { user, updateUserProfile } = useAuth()

  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [avatarUri, setAvatarUri] = useState(user?.avatar_url || null)
  const [loading, setLoading] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // ✅ Upload to Cloudinary
  const uploadToCloudinary = async (uri) => {
    try {
      const formData = new FormData()

      const uriParts = uri.split('.')
      const fileType = uriParts[uriParts.length - 1]

      formData.append('file', {
        uri,
        type: `image/${fileType}`,
        name: `avatar.${fileType}`,
      })
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
      formData.append('folder', 'avatars') // Organize in avatars folder

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: 'POST',
          body: formData,
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error?.message || 'Upload failed')
      }

      return data.secure_url
    } catch (error) {
      console.error('❌ Cloudinary upload error:', error)
      throw error
    }
  }

  // ✅ Pick Avatar
  const pickAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()

      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your photos')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Square crop
        quality: 0.8,
      })

      if (!result.canceled) {
        setUploadingAvatar(true)

        try {
          // Upload to Cloudinary
          const cloudinaryUrl = await uploadToCloudinary(result.assets[0].uri)
          setAvatarUri(cloudinaryUrl)

          Alert.alert(
            'Success',
            'Avatar uploaded! Click Save to update your profile.',
          )
        } catch (error) {
          Alert.alert(
            'Upload Failed',
            'Could not upload avatar. You can still use it locally or try again.',
          )
          // Use local URI as fallback
          setAvatarUri(result.assets[0].uri)
        } finally {
          setUploadingAvatar(false)
        }
      }
    } catch (error) {
      console.error('❌ Pick avatar error:', error)
      Alert.alert('Error', 'Failed to pick avatar')
      setUploadingAvatar(false)
    }
  }

  const handleSave = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Username cannot be empty')
      return
    }

    if (!email.trim()) {
      Alert.alert('Error', 'Email cannot be empty')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address')
      return
    }

    setLoading(true)
    try {
      const token = await AsyncStorage.getItem('token')

      const updateData = {
        username: username.trim(),
        email: email.trim(),
      }

      // ✅ Include avatar if changed
      if (avatarUri && avatarUri !== user?.avatar_url) {
        updateData.avatar_url = avatarUri
      }

      const response = await fetch(
        `${API_BASE_URL}/api/v1/auth/update-profile`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updateData),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to update profile')
      }

      // Update auth context
      if (updateUserProfile) {
        updateUserProfile({
          username: data.username,
          email: data.email,
          avatar_url: data.avatar_url,
        })
      }

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

  const styles = createStyles(theme)

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Edit Profile
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          {/* Avatar Display */}
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>
                {username?.charAt(0).toUpperCase() || '👤'}
              </Text>
            )}

            {/* Upload Indicator */}
            {uploadingAvatar && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size='large' color='#ffffff' />
              </View>
            )}
          </View>

          {/* Change Avatar Button */}
          <TouchableOpacity
            style={[
              styles.changeAvatarButton,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
            onPress={pickAvatar}
            disabled={uploadingAvatar}
          >
            <Camera size={18} color={theme.primary} />
            <Text style={[styles.changeAvatarText, { color: theme.primary }]}>
              {uploadingAvatar ? 'Uploading...' : 'Change Avatar'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Username */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>Username</Text>
            <View
              style={[
                styles.inputContainer,
                {
                  backgroundColor: theme.input,
                  borderColor: theme.inputBorder,
                },
              ]}
            >
              <View style={styles.inputIcon}>
                <AtSign size={20} color={theme.textSecondary} />
              </View>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder='Enter username'
                placeholderTextColor={theme.placeholder}
                style={[styles.input, { color: theme.text }]}
                autoCapitalize='none'
              />
            </View>
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              This is how others will see you
            </Text>
          </View>

          {/* Email */}
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
              <View style={styles.inputIcon}>
                <Mail size={20} color={theme.textSecondary} />
              </View>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder='Enter email'
                placeholderTextColor={theme.placeholder}
                style={[styles.input, { color: theme.text }]}
                keyboardType='email-address'
                autoCapitalize='none'
              />
            </View>
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              We'll never share your email
            </Text>
          </View>

          {/* Anonymous Name (Read-only) */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>
              Anonymous Name
            </Text>
            <View
              style={[
                styles.inputContainer,
                styles.disabledInput,
                {
                  backgroundColor: theme.backgroundSecondary,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.inputIcon}>
                <User size={20} color={theme.textSecondary} />
              </View>
              <TextInput
                value={user?.anonymous_name || 'Not set'}
                editable={false}
                style={[
                  styles.input,
                  styles.disabledText,
                  { color: theme.textSecondary },
                ]}
              />
            </View>
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              Used when posting anonymously
            </Text>
          </View>

          {/* Coins Display */}
          <View
            style={[
              styles.coinsSection,
              {
                backgroundColor: theme.primaryLight,
                borderColor: theme.primary,
              },
            ]}
          >
            <View
              style={[
                styles.coinsIcon,
                { backgroundColor: theme.primary + '40' },
              ]}
            >
              <Text style={styles.coinEmoji}>💰</Text>
            </View>
            <View style={styles.coinsInfo}>
              <Text style={[styles.coinsLabel, { color: theme.primary }]}>
                Your Coins
              </Text>
              <Text style={[styles.coinsValue, { color: theme.text }]}>
                {user?.coin_balance || 0} coins
              </Text>
            </View>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={loading || uploadingAvatar}
          style={[
            styles.saveButton,
            { backgroundColor: theme.accent },
            (loading || uploadingAvatar) && styles.saveButtonDisabled,
          ]}
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
        <View
          style={[
            styles.infoBox,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            💡 Your username and email can be changed anytime. Your anonymous
            name is generated automatically and cannot be changed.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    scrollView: {
      flex: 1,
    },
    avatarSection: {
      alignItems: 'center',
      paddingVertical: 32,
    },
    avatar: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      overflow: 'hidden',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarText: {
      fontSize: 48,
      fontWeight: 'bold',
      color: '#ffffff',
    },
    uploadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    changeAvatarButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
    },
    changeAvatarText: {
      fontSize: 14,
      fontWeight: '600',
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
      marginBottom: 8,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      borderWidth: 1,
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
      paddingRight: 16,
    },
    disabledInput: {
      opacity: 0.6,
    },
    disabledText: {
      fontStyle: 'italic',
    },
    hint: {
      fontSize: 12,
      marginTop: 4,
      marginLeft: 4,
    },
    coinsSection: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      marginTop: 8,
    },
    coinsIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
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
      fontWeight: '600',
    },
    coinsValue: {
      fontSize: 20,
      fontWeight: 'bold',
      marginTop: 2,
    },
    saveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
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
      marginHorizontal: 16,
      marginTop: 24,
      marginBottom: 32,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
    },
    infoText: {
      fontSize: 13,
      lineHeight: 20,
    },
  })
