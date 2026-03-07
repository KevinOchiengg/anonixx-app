import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  StatusBar,
  Image,
  Dimensions,
} from 'react-native';

import {
  X,
  Image as ImageIcon,
  Video as VideoIcon,
  Trash2,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

export default function CreatePostScreen({ navigation }) {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [images, setImages] = useState([]);
  const [videoUri, setVideoUri] = useState(null);

  const uploadToCloudinary = async (uri, resourceType = 'image') => {
    try {
      console.log(`📤 Uploading ${resourceType} to Cloudinary...`);

      const formData = new FormData();
      const uriParts = uri.split('.');
      const fileType = uriParts[uriParts.length - 1];

      formData.append('file', {
        uri,
        type:
          resourceType === 'video' ? `video/${fileType}` : `image/${fileType}`,
        name: `upload.${fileType}`,
      });
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
        {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Upload failed');
      }

      console.log(`✅ ${resourceType} uploaded:`, data.secure_url);
      return data.secure_url;
    } catch (error) {
      console.error(`❌ Cloudinary upload error:`, error);
      throw error;
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      aspect: [4, 3],
    });

    if (!result.canceled) {
      if (images.length + result.assets.length > 5) {
        Alert.alert('Limit Reached', 'You can add up to 5 images');
        return;
      }

      const newImages = result.assets.map((asset) => asset.uri);
      setImages([...images, ...newImages]);
    }
  };

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your videos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    });

    if (!result.canceled) {
      setVideoUri(result.assets[0].uri);
      setImages([]);
    }
  };

  const removeImage = (index) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const removeVideo = () => {
    setVideoUri(null);
  };

  const handlePost = async () => {
    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to post', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign In',
          onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
        },
      ]);
      return;
    }

    if (!content.trim()) {
      Alert.alert('Error', 'Please write something');
      return;
    }

    setLoading(true);
    setUploadProgress('Preparing post...');

    try {
      const token = await AsyncStorage.getItem('token');

      if (!token) {
        Alert.alert(
          'Error',
          'Authentication token not found. Please log in again.'
        );
        setLoading(false);
        setUploadProgress('');
        return;
      }

      const postData = {
        content: content.trim(),
        topics: [],
        is_anonymous: isAnonymous,
      };

      if (images.length > 0) {
        setUploadProgress(`Uploading ${images.length} image(s)...`);
        const uploadedImageUrls = [];

        for (let i = 0; i < images.length; i++) {
          setUploadProgress(`Uploading image ${i + 1}/${images.length}...`);
          const url = await uploadToCloudinary(images[i], 'image');
          uploadedImageUrls.push(url);
        }

        postData.images = uploadedImageUrls;
        console.log('✅ All images uploaded:', uploadedImageUrls);
      }

      if (videoUri) {
        setUploadProgress('Uploading video...');
        const uploadedVideoUrl = await uploadToCloudinary(videoUri, 'video');
        postData.video_url = uploadedVideoUrl;
        console.log('✅ Video uploaded:', uploadedVideoUrl);
      }

      setUploadProgress('Posting...');
      const response = await fetch(`${API_BASE_URL}/api/v1/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(postData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || `Server error: ${response.status}`);
      }

      console.log('✅ Post created successfully!');

      Alert.alert(
        'Posted!',
        data.message || 'Your confession has been shared',
        [
          {
            text: 'OK',
            onPress: () => {
              setContent('');
              setImages([]);
              setVideoUri(null);
              setUploadProgress('');
              navigation.navigate('Feed');
            },
          },
        ]
      );
    } catch (error) {
      console.error('❌ Create post error:', error);

      Alert.alert(
        'Post Failed',
        error.message || 'Failed to create post. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <X size={24} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confess</Text>
        <TouchableOpacity
          onPress={handlePost}
          disabled={loading || !content.trim()}
          style={[
            styles.postButton,
            (loading || !content.trim()) && styles.postButtonDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.postButtonText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Upload Progress */}
      {uploadProgress && (
        <View style={styles.uploadProgressWrapper}>
          <View style={styles.uploadProgressAccentBar} />
          <View style={styles.uploadProgress}>
            <ActivityIndicator size="small" color={THEME.primary} />
            <Text style={styles.uploadProgressText}>{uploadProgress}</Text>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Content Input */}
        <View style={styles.textInputWrapper}>
          <View style={styles.textInputAccentBar} />
          <View style={styles.textInputCard}>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="Say the unsayable..."
              placeholderTextColor={THEME.textSecondary}
              multiline
              autoFocus
              style={styles.textInput}
              maxLength={1000}
            />
            <View style={styles.divider} />
            <Text style={styles.charCount}>{content.length}/1000</Text>
          </View>
        </View>

        {/* Media Buttons */}
        <View style={styles.section}>
          <View style={styles.mediaButtons}>
            <View style={styles.mediaButtonWrapper}>
              <View
                style={[
                  styles.mediaButtonAccentBar,
                  (videoUri || loading) && styles.mediaButtonAccentBarDisabled,
                ]}
              />
              <TouchableOpacity
                onPress={pickImage}
                disabled={videoUri !== null || loading}
                style={[
                  styles.mediaButton,
                  (videoUri || loading) && styles.mediaButtonDisabled,
                ]}
              >
                <ImageIcon
                  size={20}
                  color={
                    videoUri || loading ? THEME.textSecondary : THEME.primary
                  }
                />
                <Text
                  style={[
                    styles.mediaButtonText,
                    (videoUri || loading) && styles.mediaButtonTextDisabled,
                  ]}
                >
                  Add Images
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.mediaButtonWrapper}>
              <View
                style={[
                  styles.mediaButtonAccentBar,
                  (images.length > 0 || loading) &&
                    styles.mediaButtonAccentBarDisabled,
                ]}
              />
              <TouchableOpacity
                onPress={pickVideo}
                disabled={images.length > 0 || loading}
                style={[
                  styles.mediaButton,
                  (images.length > 0 || loading) && styles.mediaButtonDisabled,
                ]}
              >
                <VideoIcon
                  size={20}
                  color={
                    images.length > 0 || loading
                      ? THEME.textSecondary
                      : THEME.primary
                  }
                />
                <Text
                  style={[
                    styles.mediaButtonText,
                    (images.length > 0 || loading) &&
                      styles.mediaButtonTextDisabled,
                  ]}
                >
                  Add Video
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Selected Images */}
        {images.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Images ({images.length}/5)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.imagesContainer}>
                {images.map((uri, index) => (
                  <View key={index} style={styles.imagePreview}>
                    <Image source={{ uri }} style={styles.previewImage} />
                    <TouchableOpacity
                      onPress={() => removeImage(index)}
                      style={styles.removeButton}
                      disabled={loading}
                    >
                      <Trash2 size={16} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Selected Video */}
        {videoUri && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Video</Text>
            <View style={styles.videoPreview}>
              <Image source={{ uri: videoUri }} style={styles.previewVideo} />
              <TouchableOpacity
                onPress={removeVideo}
                style={styles.removeButton}
                disabled={loading}
              >
                <Trash2 size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Anonymous Toggle */}
        <View style={styles.toggleWrapper}>
          <View style={styles.toggleAccentBar} />
          <TouchableOpacity
            onPress={() => setIsAnonymous(!isAnonymous)}
            disabled={loading}
            style={styles.toggleButton}
          >
            <View style={styles.toggleTextContainer}>
              <Text style={styles.toggleText}>Post Anonymously</Text>
              <Text style={styles.toggleSubtext}>
                {isAnonymous
                  ? "Nobody knows it's you"
                  : 'Posting with your username'}
              </Text>
            </View>
            <View
              style={[
                styles.toggle,
                {
                  backgroundColor: isAnonymous ? THEME.primary : THEME.border,
                },
              ]}
            >
              <View
                style={[
                  styles.toggleDot,
                  isAnonymous && styles.toggleDotActive,
                ]}
              />
            </View>
          </TouchableOpacity>
        </View>

        {/* Helper Text */}
        <View style={styles.helperWrapper}>
          <View style={styles.helperAccentBar} />
          <View style={styles.helperBox}>
            <Text style={styles.helperText}>
              No filters. No judgment. Just the raw truth.
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
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME.text,
  },
  postButton: {
    backgroundColor: THEME.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 70,
    alignItems: 'center',
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  postButtonDisabled: {
    backgroundColor: THEME.textSecondary,
    opacity: 0.5,
  },
  postButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Upload Progress
  uploadProgressWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginTop: 8,
  },
  uploadProgressAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    opacity: 0.6,
  },
  uploadProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: THEME.surface,
    padding: 14,
    paddingLeft: 18,
    borderRadius: 12,
  },
  uploadProgressText: {
    fontSize: 14,
    fontWeight: '500',
    color: THEME.text,
  },
  scrollView: {
    flex: 1,
  },
  // Text Input
  textInputWrapper: {
    position: 'relative',
    margin: 16,
    marginBottom: 8,
  },
  textInputAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    opacity: 0.6,
  },
  textInputCard: {
    backgroundColor: THEME.surface,
    padding: 20,
    paddingLeft: 24,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  textInput: {
    fontSize: 18,
    lineHeight: 28,
    minHeight: 200,
    textAlignVertical: 'top',
    color: THEME.text,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.border,
    marginTop: 16,
    marginBottom: 12,
  },
  charCount: {
    fontSize: 12,
    color: THEME.textSecondary,
    textAlign: 'right',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  // Media Buttons
  mediaButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  mediaButtonWrapper: {
    flex: 1,
    position: 'relative',
  },
  mediaButtonAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    opacity: 0.6,
    zIndex: 1,
  },
  mediaButtonAccentBarDisabled: {
    opacity: 0.2,
  },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: THEME.surface,
    padding: 16,
    paddingLeft: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  mediaButtonDisabled: {
    opacity: 0.5,
  },
  mediaButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.text,
  },
  mediaButtonTextDisabled: {
    color: THEME.textSecondary,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  imagesContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  imagePreview: {
    position: 'relative',
  },
  previewImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
  },
  videoPreview: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewVideo: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
    borderRadius: 20,
  },
  // Toggle
  toggleWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  toggleAccentBar: {
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
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  toggleTextContainer: {
    flex: 1,
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME.text,
    marginBottom: 4,
  },
  toggleSubtext: {
    fontSize: 12,
    color: THEME.textSecondary,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  toggleDot: {
    width: 24,
    height: 24,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleDotActive: {
    alignSelf: 'flex-end',
  },
  // Helper Text
  helperWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginBottom: 32,
  },
  helperAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    opacity: 0.4,
  },
  helperBox: {
    backgroundColor: THEME.surface,
    padding: 16,
    paddingLeft: 20,
    borderRadius: 12,
  },
  helperText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: THEME.textSecondary,
  },
});
