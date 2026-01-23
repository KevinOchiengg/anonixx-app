import React, { useState } from 'react'
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
} from 'react-native'
import {
  X,
  Image as ImageIcon,
  Video as VideoIcon,
  Trash2,
} from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'

// ✅ Cloudinary config from .env
const CLOUDINARY_CLOUD_NAME = 'dojbdm2e1'
const CLOUDINARY_UPLOAD_PRESET = 'anonix'

export default function CreatePostScreen({ navigation }) {
  const { theme } = useTheme()
  const { isAuthenticated } = useAuth()
  const [content, setContent] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('') // ✅ NEW: Show upload status
  const [images, setImages] = useState([])
  const [videoUri, setVideoUri] = useState(null)

  // ✅ NEW: Upload to Cloudinary
  const uploadToCloudinary = async (uri, resourceType = 'image') => {
    try {
      console.log(`📤 Uploading ${resourceType} to Cloudinary...`)

      // Create form data
      const formData = new FormData()

      // Get file extension
      const uriParts = uri.split('.')
      const fileType = uriParts[uriParts.length - 1]

      formData.append('file', {
        uri,
        type:
          resourceType === 'video' ? `video/${fileType}` : `image/${fileType}`,
        name: `upload.${fileType}`,
      })
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)

      // Upload to Cloudinary
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
        {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error?.message || 'Upload failed')
      }

      console.log(`✅ ${resourceType} uploaded:`, data.secure_url)
      return data.secure_url // Return permanent URL
    } catch (error) {
      console.error(`❌ Cloudinary upload error:`, error)
      throw error
    }
  }

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      aspect: [4, 3],
    })

    if (!result.canceled) {
      if (images.length + result.assets.length > 5) {
        Alert.alert('Limit Reached', 'You can add up to 5 images')
        return
      }

      const newImages = result.assets.map((asset) => asset.uri)
      setImages([...images, ...newImages])
    }
  }

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your videos')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    })

    if (!result.canceled) {
      setVideoUri(result.assets[0].uri)
      setImages([]) // Clear images if video is selected
    }
  }

  const removeImage = (index) => {
    setImages(images.filter((_, i) => i !== index))
  }

  const removeVideo = () => {
    setVideoUri(null)
  }

  const handlePost = async () => {
    // ✅ Check auth first
    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to post', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign In',
          onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
        },
      ])
      return
    }

    if (!content.trim()) {
      Alert.alert('Error', 'Please write something')
      return
    }

    setLoading(true)
    setUploadProgress('Preparing post...')

    try {
      const token = await AsyncStorage.getItem('token')

      if (!token) {
        Alert.alert(
          'Error',
          'Authentication token not found. Please log in again.',
        )
        setLoading(false)
        setUploadProgress('')
        return
      }

      // Prepare post data
      const postData = {
        content: content.trim(),
        topics: [],
        is_anonymous: isAnonymous,
      }

      // ✅ Upload images to Cloudinary
      if (images.length > 0) {
        setUploadProgress(`Uploading ${images.length} image(s)...`)
        const uploadedImageUrls = []

        for (let i = 0; i < images.length; i++) {
          setUploadProgress(`Uploading image ${i + 1}/${images.length}...`)
          const url = await uploadToCloudinary(images[i], 'image')
          uploadedImageUrls.push(url)
        }

        postData.images = uploadedImageUrls
        console.log('✅ All images uploaded:', uploadedImageUrls)
      }

      // ✅ Upload video to Cloudinary
      if (videoUri) {
        setUploadProgress('Uploading video...')
        const uploadedVideoUrl = await uploadToCloudinary(videoUri, 'video')
        postData.video_url = uploadedVideoUrl
        console.log('✅ Video uploaded:', uploadedVideoUrl)
      }

      // ✅ Create post with permanent URLs
      setUploadProgress('Posting...')
      const response = await fetch(
        'https://ulysses-apronlike-alethia.ngrok-free.dev/api/v1/posts',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(postData),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || `Server error: ${response.status}`)
      }

      console.log('✅ Post created successfully!')

      Alert.alert(
        'Posted!',
        data.message || 'Your confession has been shared',
        [
          {
            text: 'OK',
            onPress: () => {
              // Reset form
              setContent('')
              setImages([])
              setVideoUri(null)
              setUploadProgress('')

              // Navigate back to feed
              navigation.navigate('Feed')
            },
          },
        ],
      )
    } catch (error) {
      console.error('❌ Create post error:', error)

      Alert.alert(
        'Post Failed',
        error.message || 'Failed to create post. Please try again.',
        [{ text: 'OK' }],
      )
    } finally {
      setLoading(false)
      setUploadProgress('')
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
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <X size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Share Your Story
        </Text>
        <TouchableOpacity
          onPress={handlePost}
          disabled={loading || !content.trim()}
          style={[
            styles.postButton,
            {
              backgroundColor:
                loading || !content.trim() ? theme.border : theme.primary,
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator size='small' color='#ffffff' />
          ) : (
            <Text style={styles.postButtonText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ✅ Upload Progress Indicator */}
      {uploadProgress && (
        <View style={[styles.uploadProgress, { backgroundColor: theme.card }]}>
          <ActivityIndicator size='small' color={theme.primary} />
          <Text style={[styles.uploadProgressText, { color: theme.text }]}>
            {uploadProgress}
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Content Input */}
        <View style={styles.section}>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Share what's on your mind..."
            placeholderTextColor={theme.placeholder}
            multiline
            autoFocus
            style={[styles.textInput, { color: theme.text }]}
            maxLength={1000}
          />
          <Text style={[styles.charCount, { color: theme.textSecondary }]}>
            {content.length}/1000
          </Text>
        </View>

        {/* Media Buttons */}
        <View style={styles.section}>
          <View style={styles.mediaButtons}>
            <TouchableOpacity
              onPress={pickImage}
              disabled={videoUri !== null || loading}
              style={[
                styles.mediaButton,
                { backgroundColor: theme.card, borderColor: theme.border },
                (videoUri || loading) && styles.mediaButtonDisabled,
              ]}
            >
              <ImageIcon
                size={20}
                color={videoUri || loading ? theme.textTertiary : theme.primary}
              />
              <Text
                style={[
                  styles.mediaButtonText,
                  {
                    color:
                      videoUri || loading ? theme.textTertiary : theme.text,
                  },
                ]}
              >
                Add Images
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={pickVideo}
              disabled={images.length > 0 || loading}
              style={[
                styles.mediaButton,
                { backgroundColor: theme.card, borderColor: theme.border },
                (images.length > 0 || loading) && styles.mediaButtonDisabled,
              ]}
            >
              <VideoIcon
                size={20}
                color={
                  images.length > 0 || loading
                    ? theme.textTertiary
                    : theme.primary
                }
              />
              <Text
                style={[
                  styles.mediaButtonText,
                  {
                    color:
                      images.length > 0 || loading
                        ? theme.textTertiary
                        : theme.text,
                  },
                ]}
              >
                Add Video
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selected Images */}
        {images.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Images ({images.length}/5)
            </Text>
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
                      <Trash2 size={16} color='#ffffff' />
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
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Video
            </Text>
            <View style={styles.videoPreview}>
              <Image source={{ uri: videoUri }} style={styles.previewVideo} />
              <TouchableOpacity
                onPress={removeVideo}
                style={styles.removeButton}
                disabled={loading}
              >
                <Trash2 size={20} color='#ffffff' />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Anonymous Toggle */}
        <View style={styles.section}>
          <TouchableOpacity
            onPress={() => setIsAnonymous(!isAnonymous)}
            disabled={loading}
            style={[
              styles.toggleButton,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <View>
              <Text style={[styles.toggleText, { color: theme.text }]}>
                Post Anonymously
              </Text>
              <Text
                style={[styles.toggleSubtext, { color: theme.textSecondary }]}
              >
                {isAnonymous
                  ? 'Your identity is hidden'
                  : 'Posting with your username'}
              </Text>
            </View>
            <View
              style={[
                styles.toggle,
                {
                  backgroundColor: isAnonymous ? theme.primary : theme.border,
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
        <View style={styles.section}>
          <Text style={[styles.helperText, { color: theme.textSecondary }]}>
            Your post will appear in feeds based on relevance. Be authentic, be
            kind.
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
    headerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    postButton: {
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 20,
      minWidth: 70,
      alignItems: 'center',
    },
    postButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    // ✅ NEW: Upload progress styles
    uploadProgress: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      marginHorizontal: 16,
      marginTop: 8,
      borderRadius: 8,
    },
    uploadProgressText: {
      fontSize: 14,
      fontWeight: '500',
    },
    scrollView: {
      flex: 1,
    },
    section: {
      padding: 16,
    },
    textInput: {
      fontSize: 18,
      lineHeight: 28,
      minHeight: 200,
      textAlignVertical: 'top',
    },
    charCount: {
      fontSize: 12,
      marginTop: 8,
      textAlign: 'right',
    },
    mediaButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    mediaButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
    },
    mediaButtonDisabled: {
      opacity: 0.5,
    },
    mediaButtonText: {
      fontSize: 14,
      fontWeight: '600',
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
    toggleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
    },
    toggleText: {
      fontSize: 16,
      fontWeight: '600',
    },
    toggleSubtext: {
      fontSize: 12,
      marginTop: 4,
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
    },
    toggleDotActive: {
      alignSelf: 'flex-end',
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 16,
    },
    helperText: {
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
  })
