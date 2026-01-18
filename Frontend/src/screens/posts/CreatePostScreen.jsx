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

const TOPICS = [
  { id: 'relationships', emoji: '💔', name: 'Relationships' },
  { id: 'anxiety', emoji: '😰', name: 'Anxiety' },
  { id: 'depression', emoji: '😢', name: 'Depression' },
  { id: 'self_growth', emoji: '💪', name: 'Self-Growth' },
  { id: 'school_career', emoji: '🎓', name: 'School/Career' },
  { id: 'family', emoji: '👨‍👩‍👧‍👦', name: 'Family' },
  { id: 'lgbtq', emoji: '🏳️‍🌈', name: 'LGBTQ+' },
  { id: 'addiction', emoji: '💊', name: 'Addiction' },
  { id: 'sleep', emoji: '😴', name: 'Sleep' },
  { id: 'identity', emoji: '🎭', name: 'Identity' },
  { id: 'wins', emoji: '🎉', name: 'Wins' },
  { id: 'friendship', emoji: '🤝', name: 'Friendship' },
  { id: 'financial', emoji: '💰', name: 'Financial' },
  { id: 'health', emoji: '🏥', name: 'Health' },
  { id: 'general', emoji: '🌟', name: 'General' },
]

export default function CreatePostScreen({ navigation }) {
  const { theme } = useTheme()
  const [content, setContent] = useState('')
  const [selectedTopics, setSelectedTopics] = useState([])
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [loading, setLoading] = useState(false)
  const [images, setImages] = useState([])
  const [videoUri, setVideoUri] = useState(null)

  const toggleTopic = (topicId) => {
    if (selectedTopics.includes(topicId)) {
      setSelectedTopics(selectedTopics.filter((id) => id !== topicId))
    } else {
      if (selectedTopics.length < 3) {
        setSelectedTopics([...selectedTopics, topicId])
      } else {
        Alert.alert('Limit Reached', 'You can select up to 3 topics')
      }
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

  const uploadMedia = async (uri) => {
    // For web testing, return the URI as-is
    // In production, you'd upload to a service like Cloudinary, S3, etc.
    return uri
  }

  const handlePost = async () => {
    if (!content.trim()) {
      Alert.alert('Error', 'Please write something')
      return
    }

    if (selectedTopics.length === 0) {
      Alert.alert('Error', 'Please select at least one topic')
      return
    }

    setLoading(true)
    try {
      const token = await AsyncStorage.getItem('token')

      // Upload media (in production, upload to cloud storage)
      let uploadedImages = []
      let uploadedVideo = null

      if (images.length > 0) {
        uploadedImages = await Promise.all(images.map(uploadMedia))
      }

      if (videoUri) {
        uploadedVideo = await uploadMedia(videoUri)
      }

      const response = await fetch('http://localhost:8000/api/v1/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: content.trim(),
          topics: selectedTopics,
          is_anonymous: isAnonymous,
          images: uploadedImages,
          video_url: uploadedVideo,
          audio_url: null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to create post')
      }

      const data = await response.json()

      Alert.alert('Posted', data.message, [
        {
          text: 'OK',
          onPress: () => {
            setContent('')
            setSelectedTopics([])
            setImages([])
            setVideoUri(null)
            navigation.navigate('Feed')
          },
        },
      ])
    } catch (error) {
      console.error('❌ Create post error:', error)
      Alert.alert('Error', error.message || 'Failed to create post')
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
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <X size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          New Confession
        </Text>
        <TouchableOpacity
          onPress={handlePost}
          disabled={loading}
          style={[styles.postButton, { backgroundColor: theme.primary }]}
        >
          {loading ? (
            <ActivityIndicator size='small' color='#ffffff' />
          ) : (
            <Text style={styles.postButtonText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Content Input */}
        <View style={styles.section}>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder='Share your thoughts anonymously...'
            placeholderTextColor={theme.placeholder}
            multiline
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
              disabled={videoUri !== null}
              style={[
                styles.mediaButton,
                { backgroundColor: theme.card, borderColor: theme.border },
                videoUri && styles.mediaButtonDisabled,
              ]}
            >
              <ImageIcon
                size={20}
                color={videoUri ? theme.textTertiary : theme.primary}
              />
              <Text
                style={[
                  styles.mediaButtonText,
                  { color: videoUri ? theme.textTertiary : theme.text },
                ]}
              >
                Add Images
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={pickVideo}
              disabled={images.length > 0}
              style={[
                styles.mediaButton,
                { backgroundColor: theme.card, borderColor: theme.border },
                images.length > 0 && styles.mediaButtonDisabled,
              ]}
            >
              <VideoIcon
                size={20}
                color={images.length > 0 ? theme.textTertiary : theme.primary}
              />
              <Text
                style={[
                  styles.mediaButtonText,
                  {
                    color: images.length > 0 ? theme.textTertiary : theme.text,
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
            style={[
              styles.toggleButton,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.toggleText, { color: theme.text }]}>
              Post Anonymously
            </Text>
            <View
              style={[
                styles.toggle,
                { backgroundColor: isAnonymous ? theme.accent : theme.border },
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

        {/* Topics */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Select Topics (up to 3)
          </Text>
          <View style={styles.topicsGrid}>
            {TOPICS.map((topic) => {
              const isSelected = selectedTopics.includes(topic.id)
              return (
                <TouchableOpacity
                  key={topic.id}
                  onPress={() => toggleTopic(topic.id)}
                  style={[
                    styles.topicCard,
                    {
                      backgroundColor: isSelected
                        ? theme.primaryLight
                        : theme.card,
                      borderColor: isSelected ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text style={styles.topicEmoji}>{topic.emoji}</Text>
                  <Text
                    style={[
                      styles.topicName,
                      { color: isSelected ? theme.primary : theme.text },
                    ]}
                  >
                    {topic.name}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
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
    scrollView: {
      flex: 1,
    },
    section: {
      padding: 16,
    },
    textInput: {
      fontSize: 18,
      lineHeight: 28,
      minHeight: 150,
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
    topicsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    topicCard: {
      width: '30%',
      padding: 12,
      borderRadius: 12,
      borderWidth: 2,
      alignItems: 'center',
    },
    topicEmoji: {
      fontSize: 28,
      marginBottom: 4,
    },
    topicName: {
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
  })
