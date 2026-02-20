import React, { useState, useMemo } from 'react';
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
  Dimensions,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Save,
  User,
  Mail,
  AtSign,
  Camera,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

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
  avatarBg: '#3a3f50',
  avatarIcon: '#5a5f70',
  input: 'rgba(30, 35, 45, 0.7)',
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

// Cloudinary config
const CLOUDINARY_CLOUD_NAME = 'dojbdm2e1';
const CLOUDINARY_UPLOAD_PRESET = 'anonix';

export default function EditProfileScreen({ navigation }) {
  const { theme } = useTheme();
  const { user, updateUserProfile } = useAuth();

  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatarUri, setAvatarUri] = useState(user?.avatar_url || null);
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Upload to Cloudinary
  const uploadToCloudinary = async (uri) => {
    try {
      const formData = new FormData();

      const uriParts = uri.split('.');
      const fileType = uriParts[uriParts.length - 1];

      formData.append('file', {
        uri,
        type: `image/${fileType}`,
        name: `avatar.${fileType}`,
      });
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      formData.append('folder', 'avatars');

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Upload failed');
      }

      return data.secure_url;
    } catch (error) {
      console.error('❌ Cloudinary upload error:', error);
      throw error;
    }
  };

  // Pick Avatar
  const pickAvatar = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled) {
        setUploadingAvatar(true);

        try {
          const cloudinaryUrl = await uploadToCloudinary(result.assets[0].uri);
          setAvatarUri(cloudinaryUrl);

          Alert.alert(
            'Success',
            'Avatar uploaded! Click Save to update your profile.'
          );
        } catch (error) {
          Alert.alert(
            'Upload Failed',
            'Could not upload avatar. You can still use it locally or try again.'
          );
          setAvatarUri(result.assets[0].uri);
        } finally {
          setUploadingAvatar(false);
        }
      }
    } catch (error) {
      console.error('❌ Pick avatar error:', error);
      Alert.alert('Error', 'Failed to pick avatar');
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Username cannot be empty');
      return;
    }

    if (!email.trim()) {
      Alert.alert('Error', 'Email cannot be empty');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');

      const updateData = {
        username: username.trim(),
        email: email.trim(),
      };

      if (avatarUri && avatarUri !== user?.avatar_url) {
        updateData.avatar_url = avatarUri;
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
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to update profile');
      }

      if (updateUserProfile) {
        updateUserProfile({
          username: data.username,
          email: data.email,
          avatar_url: data.avatar_url,
        });
      }

      Alert.alert('Success', 'Profile updated successfully!', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('❌ Update profile error:', error);
      Alert.alert('Error', error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={THEME.text} />
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
          <View style={styles.avatarContainer}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <User size={48} color={THEME.avatarIcon} />
              </View>
            )}

            {uploadingAvatar && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="large" color={THEME.primary} />
              </View>
            )}

            {/* Camera Button */}
            <TouchableOpacity
              style={styles.cameraButton}
              onPress={pickAvatar}
              disabled={uploadingAvatar}
            >
              <Camera size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <Text style={styles.avatarHint}>
            {uploadingAvatar ? 'Uploading...' : 'Tap camera to change avatar'}
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Username Card */}
          <View style={styles.inputCardWrapper}>
            <View style={styles.inputAccentBar} />
            <View style={styles.inputCard}>
              <Text style={styles.label}>Username</Text>
              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <AtSign size={20} color={THEME.textSecondary} />
                </View>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Enter username"
                  placeholderTextColor={THEME.textSecondary}
                  style={styles.input}
                  autoCapitalize="none"
                />
              </View>
              <Text style={styles.hint}>This is how others will see you</Text>
            </View>
          </View>

          {/* Email Card */}
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
                  placeholder="Enter email"
                  placeholderTextColor={THEME.textSecondary}
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <Text style={styles.hint}>We'll never share your email</Text>
            </View>
          </View>

          {/* Anonymous Name Card (Read-only) */}
          <View style={styles.inputCardWrapper}>
            <View style={[styles.inputAccentBar, { opacity: 0.4 }]} />
            <View style={[styles.inputCard, { opacity: 0.7 }]}>
              <Text style={styles.label}>Anonymous Name</Text>
              <View style={[styles.inputContainer, styles.disabledInput]}>
                <View style={styles.inputIcon}>
                  <User size={20} color={THEME.textSecondary} />
                </View>
                <TextInput
                  value={user?.anonymous_name || 'Not set'}
                  editable={false}
                  style={[styles.input, styles.disabledText]}
                />
              </View>
              <Text style={styles.hint}>Used when posting anonymously</Text>
            </View>
          </View>

          {/* Coins Display */}
          <View style={styles.coinsWrapper}>
            <View style={styles.coinsAccentBar} />
            <View style={styles.coinsCard}>
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
        </View>

        {/* Save Button */}
        <View style={styles.saveButtonWrapper}>
          <View style={styles.saveAccentBar} />
          <TouchableOpacity
            onPress={handleSave}
            disabled={loading || uploadingAvatar}
            style={[
              styles.saveButton,
              (loading || uploadingAvatar) && styles.saveButtonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Save size={20} color="#ffffff" />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Info Box */}
        <View style={styles.infoBoxWrapper}>
          <View style={styles.infoAccentBar} />
          <View style={styles.infoBox}>
            <Text style={styles.infoIcon}>💡</Text>
            <Text style={styles.infoText}>
              Your username and email can be changed anytime. Your anonymous
              name is generated automatically and cannot be changed.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME.text,
  },
  scrollView: {
    flex: 1,
  },
  // Avatar Section
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingBottom: 24,
  },
  avatarContainer: {
    position: 'relative',
    width: 120,
    height: 120,
    marginBottom: 12,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
    backgroundColor: THEME.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: THEME.primary,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: THEME.background,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  avatarHint: {
    fontSize: 13,
    color: THEME.textSecondary,
    fontStyle: 'italic',
  },
  // Form
  form: {
    paddingHorizontal: 16,
  },
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
    marginBottom: 8,
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
  disabledInput: {
    opacity: 0.6,
  },
  disabledText: {
    fontStyle: 'italic',
    color: THEME.textSecondary,
  },
  hint: {
    fontSize: 12,
    color: THEME.textSecondary,
    marginLeft: 4,
  },
  // Coins Card
  coinsWrapper: {
    position: 'relative',
    marginTop: 8,
    marginBottom: 24,
  },
  coinsAccentBar: {
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
  coinsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.surface,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 99, 74, 0.2)',
  },
  coinsIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 99, 74, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  coinEmoji: {
    fontSize: 28,
  },
  coinsInfo: {
    flex: 1,
  },
  coinsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.primary,
    marginBottom: 2,
  },
  coinsValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: THEME.text,
  },
  // Save Button
  saveButtonWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginTop: 8,
  },
  saveAccentBar: {
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
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.primary,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
    gap: 10,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  // Info Box
  infoBoxWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 32,
  },
  infoAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.4,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: THEME.surface,
    padding: 16,
    paddingLeft: 20,
    borderRadius: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  infoIcon: {
    fontSize: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: THEME.textSecondary,
  },
});
