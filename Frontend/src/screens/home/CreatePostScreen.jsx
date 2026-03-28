import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { useDispatch } from 'react-redux'
import {
  Camera,
  X,
  Send,
  Mic,
  Video as VideoIcon,
  Square,
} from 'lucide-react-native'
import { Video } from 'expo-av'
import {
  pickImage,
  pickVideo,
  uploadToCloudinary,
  startRecording,
  stopRecording,
} from '../../services/upload'
import { createPost } from '../../store/slices/postsSlice'
import StarryBackground from '../../components/common/StarryBackground';

export default function CreatePostScreen({ navigation }) {
  const dispatch = useDispatch()
  const [content, setContent] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [mediaUri, setMediaUri] = useState(null)
  const [mediaType, setMediaType] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingObject, setRecordingObject] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  const handlePickImage = async () => {
    try {
      const image = await pickImage()
      if (image) {
        setMediaUri(image.uri)
        setMediaType('image')
      }
    } catch (error) {
      console.error('❌ Image pick error:', error)
      Alert.alert('Error', 'Failed to pick image')
    }
  }

  const handlePickVideo = async () => {
    try {
      const video = await pickVideo()
      if (video) {
        setMediaUri(video.uri)
        setMediaType('video')
      }
    } catch (error) {
      console.error('❌ Video pick error:', error)
      Alert.alert('Error', 'Failed to pick video')
    }
  }

  const handleStartRecording = async () => {
    try {
      const rec = await startRecording()
      if (rec) {
        setRecording(true)
        setRecordingObject(rec)
      }
    } catch (error) {
      console.error('❌ Recording start error:', error)
      Alert.alert('Error', 'Failed to start recording')
    }
  }

  const handleStopRecording = async () => {
    try {
      const audio = await stopRecording()
      if (audio) {
        setMediaUri(audio.uri)
        setMediaType('audio')
        setRecording(false)
        setRecordingObject(null)
      }
    } catch (error) {
      console.error('❌ Recording stop error:', error)
      Alert.alert('Error', 'Failed to stop recording')
    }
  }

  const handleRemoveMedia = () => {
    setMediaUri(null)
    setMediaType(null)
  }

  const handlePost = async () => {
    if (!content.trim() && !mediaUri) {
      Alert.alert('Error', 'Please add some content or media')
      return
    }

    setPosting(true)
    try {
      let uploadedMediaUrl = null

      // Upload media if present
      if (mediaUri) {
        setUploading(true)
        console.log(`📤 Uploading ${mediaType}...`)

        uploadedMediaUrl = await uploadToCloudinary(
          mediaUri,
          mediaType,
          (progress) => {
            setUploadProgress(Math.round(progress))
          }
        )

        console.log(`✅ ${mediaType} uploaded:`, uploadedMediaUrl)
        setUploading(false)
        setUploadProgress(0)
      }

      // Create post data
      const postData = {
        content: content.trim(),
        post_type: mediaType || 'text',
        images:
          mediaType === 'image' && uploadedMediaUrl ? [uploadedMediaUrl] : [],
        audio_url: mediaType === 'audio' ? uploadedMediaUrl : null,
        video_url: mediaType === 'video' ? uploadedMediaUrl : null,
        is_anonymous: isAnonymous,
      }

      console.log('🔵 Creating post...', postData)
      await dispatch(createPost(postData)).unwrap()
      console.log('✅ Post created successfully')

      Alert.alert('Success', 'Post created successfully!', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ])
    } catch (error) {
      console.error('❌ Post creation failed:', error)
      Alert.alert('Error', error.message || 'Failed to create post')
    } finally {
      setPosting(false)
      setUploading(false)
      setUploadProgress(0)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StarryBackground />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
        >
          <X size={24} color='#ffffff' />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Post</Text>
        <TouchableOpacity
          onPress={handlePost}
          disabled={
            (!content.trim() && !mediaUri) || posting || uploading || recording
          }
          style={[
            styles.headerButton,
            styles.postButton,
            ((!content.trim() && !mediaUri) ||
              posting ||
              uploading ||
              recording) &&
              styles.postButtonDisabled,
          ]}
        >
          {posting || uploading ? (
            <ActivityIndicator size='small' color='#ffffff' />
          ) : (
            <Send size={20} color='#ffffff' />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Anonymous Toggle */}
        <TouchableOpacity
          onPress={() => setIsAnonymous(!isAnonymous)}
          style={styles.anonymousToggle}
        >
          <View style={styles.anonymousToggleLeft}>
            <Text style={styles.anonymousIcon}>🎭</Text>
            <Text style={styles.anonymousText}>Post Anonymously</Text>
          </View>
          <View
            style={[
              styles.toggleSwitch,
              isAnonymous && styles.toggleSwitchActive,
            ]}
          >
            <View
              style={[styles.toggleDot, isAnonymous && styles.toggleDotActive]}
            />
          </View>
        </TouchableOpacity>

        {/* Content Input */}
        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="What's on your mind?"
          placeholderTextColor='#6b7280'
          multiline
          style={styles.textInput}
          maxLength={1000}
        />

        <Text style={styles.charCount}>{content.length}/1000</Text>

        {/* Media Preview */}
        {mediaUri && (
          <View style={styles.mediaPreview}>
            {mediaType === 'image' && (
              <Image
                source={{ uri: mediaUri }}
                style={styles.mediaImage}
                resizeMode='cover'
              />
            )}
            {mediaType === 'video' && (
              <Video
                source={{ uri: mediaUri }}
                style={styles.mediaImage}
                useNativeControls
                resizeMode='contain'
              />
            )}
            {mediaType === 'audio' && (
              <View style={styles.audioPreview}>
                <Mic size={48} color='#a855f7' />
                <Text style={styles.audioText}>Audio Recording</Text>
                <Text style={styles.audioSubtext}>Ready to post</Text>
              </View>
            )}

            {!uploading && (
              <TouchableOpacity
                onPress={handleRemoveMedia}
                style={styles.removeMediaButton}
              >
                <X size={20} color='#ffffff' />
              </TouchableOpacity>
            )}

            {uploading && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size='large' color='#ffffff' />
                <Text style={styles.uploadingText}>
                  Uploading {mediaType}... {uploadProgress}%
                </Text>
                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      { width: `${uploadProgress}%` },
                    ]}
                  />
                </View>
              </View>
            )}
          </View>
        )}

        {/* Recording Indicator */}
        {recording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>Recording...</Text>
          </View>
        )}

        {/* Media Type Selection */}
        <View style={styles.mediaTypeContainer}>
          <TouchableOpacity
            onPress={handlePickImage}
            style={styles.mediaButton}
            disabled={recording}
          >
            <Camera size={24} color={recording ? '#4b5563' : '#a855f7'} />
            <Text
              style={[
                styles.mediaButtonText,
                recording && { color: '#4b5563' },
              ]}
            >
              Photo
            </Text>
          </TouchableOpacity>

          {recording ? (
            <TouchableOpacity
              onPress={handleStopRecording}
              style={[styles.mediaButton, styles.recordingButton]}
            >
              <Square size={24} color='#ef4444' />
              <Text style={[styles.mediaButtonText, { color: '#ef4444' }]}>
                Stop
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleStartRecording}
              style={styles.mediaButton}
            >
              <Mic size={24} color='#a855f7' />
              <Text style={styles.mediaButtonText}>Audio</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handlePickVideo}
            style={styles.mediaButton}
            disabled={recording}
          >
            <VideoIcon size={24} color={recording ? '#4b5563' : '#a855f7'} />
            <Text
              style={[
                styles.mediaButtonText,
                recording && { color: '#4b5563' },
              ]}
            >
              Video
            </Text>
          </TouchableOpacity>
        </View>

        {/* Info Text */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>📷 Images up to 5MB</Text>
          <Text style={styles.infoText}>🎤 Audio up to 10MB</Text>
          <Text style={styles.infoText}>🎬 Videos up to 50MB, max 60s</Text>
          <Text style={styles.infoText}>
            💰 Earn 10 coins for creating a post
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
  postButton: {
    backgroundColor: '#14b8a6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  postButtonDisabled: { opacity: 0.5 },
  scrollView: { flex: 1, padding: 16 },
  anonymousToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  anonymousToggleLeft: { flexDirection: 'row', alignItems: 'center' },
  anonymousIcon: { fontSize: 24, marginRight: 12 },
  anonymousText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  toggleSwitch: {
    width: 50,
    height: 28,
    backgroundColor: '#374151',
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: { backgroundColor: '#14b8a6' },
  toggleDot: {
    width: 24,
    height: 24,
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  toggleDotActive: { alignSelf: 'flex-end' },
  textInput: {
    backgroundColor: '#16213e',
    color: '#ffffff',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    minHeight: 150,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#374151',
  },
  charCount: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 8,
    marginBottom: 16,
  },
  mediaPreview: {
    position: 'relative',
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#16213e',
  },
  mediaImage: {
    width: '100%',
    height: 300,
  },
  audioPreview: {
    width: '100%',
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#16213e',
  },
  audioText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  audioSubtext: {
    color: '#6b7280',
    fontSize: 14,
    marginTop: 4,
  },
  removeMediaButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
  uploadingText: {
    color: '#ffffff',
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  progressBarContainer: {
    width: '80%',
    height: 8,
    backgroundColor: '#374151',
    borderRadius: 4,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#14b8a6',
    borderRadius: 4,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
    marginRight: 12,
  },
  recordingText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
  mediaTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  mediaButton: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#16213e',
    borderRadius: 12,
    flex: 1,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#374151',
  },
  recordingButton: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  mediaButtonText: {
    color: '#a855f7',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '600',
  },
  infoContainer: {
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  infoText: {
    color: '#6b7280',
    fontSize: 13,
    marginBottom: 8,
    lineHeight: 20,
  },
})
