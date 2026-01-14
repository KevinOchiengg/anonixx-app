import * as ImagePicker from 'expo-image-picker'
import { Audio } from 'expo-av'
import AsyncStorage from '@react-native-async-storage/async-storage'

const API_URL = 'http://192.168.100.22:8000/api/v1'

// Image Picker
export const pickImage = async () => {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (status !== 'granted') {
      alert('Sorry, we need camera roll permissions to upload images!')
      return null
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    })

    if (!result.canceled && result.assets && result.assets.length > 0) {
      return {
        uri: result.assets[0].uri,
        type: 'image',
      }
    }

    return null
  } catch (error) {
    console.error('❌ Image picker error:', error)
    return null
  }
}

// Video Picker
export const pickVideo = async () => {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (status !== 'granted') {
      alert('Sorry, we need camera roll permissions to upload videos!')
      return null
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 0.3,
      videoMaxDuration: 30,
    })

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0]

      return {
        uri: asset.uri,
        type: 'video',
        duration: asset.duration,
      }
    }

    return null
  } catch (error) {
    console.error('❌ Video picker error:', error)
    alert('Failed to pick video. Please try again.')
    return null
  }
}

// Audio Recording
let recording = null

export const startRecording = async () => {
  try {
    console.log('🎤 Requesting permissions...')
    const { status } = await Audio.requestPermissionsAsync()

    if (status !== 'granted') {
      alert('Sorry, we need microphone permissions to record audio!')
      return null
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    })

    console.log('🎤 Starting recording...')
    const { recording: newRecording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    )

    recording = newRecording
    console.log('✅ Recording started')
    return recording
  } catch (error) {
    console.error('❌ Failed to start recording:', error)
    alert('Failed to start recording')
    return null
  }
}

export const stopRecording = async () => {
  try {
    if (!recording) {
      console.log('⚠️ No recording in progress')
      return null
    }

    console.log('🛑 Stopping recording...')
    await recording.stopAndUnloadAsync()
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    })

    const uri = recording.getURI()
    recording = null

    console.log('✅ Recording stopped:', uri)
    return {
      uri,
      type: 'audio',
    }
  } catch (error) {
    console.error('❌ Failed to stop recording:', error)
    return null
  }
}

export const playAudio = async (uri) => {
  try {
    console.log('▶️ Playing audio:', uri)
    const { sound } = await Audio.Sound.createAsync({ uri })
    await sound.playAsync()
    return sound
  } catch (error) {
    console.error('❌ Failed to play audio:', error)
  }
}

// Upload Functions
export const uploadToCloudinary = async (uri, type = 'image', onProgress) => {
  try {
    console.log(`📤 Uploading ${type} via backend...`)

    const token = await AsyncStorage.getItem('token')

    if (!token) {
      throw new Error('Not authenticated. Please log in again.')
    }

    console.log('🔑 Token exists:', token.substring(0, 20) + '...')

    // ✅ Convert URI to Blob for web compatibility
    const response = await fetch(uri)
    const blob = await response.blob()

    // Create FormData
    const formData = new FormData()

    // Determine file extension
    let fileName = 'upload.jpg'

    if (type === 'video') {
      fileName = 'upload.mp4'
    } else if (type === 'audio') {
      fileName = 'upload.m4a'
    }

    // ✅ Append blob directly (works on web and mobile)
    formData.append('file', blob, fileName)

    const endpoint =
      type === 'image' ? 'image' : type === 'video' ? 'video' : 'audio'
    const uploadUrl = `${API_URL}/upload/${endpoint}`

    console.log('📡 Uploading to:', uploadUrl)

    // Upload with XMLHttpRequest to track progress
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = (event.loaded / event.total) * 100
          console.log(`📊 Upload progress: ${Math.round(progress)}%`)
          onProgress(progress)
        }
      })

      xhr.addEventListener('load', () => {
        console.log('📥 Response status:', xhr.status)

        if (xhr.status === 200) {
          try {
            const data = JSON.parse(xhr.responseText)
            console.log(`✅ ${type} upload successful:`, data.url)
            resolve(data.url)
          } catch (e) {
            console.error('❌ Failed to parse response:', xhr.responseText)
            reject(new Error('Failed to parse response'))
          }
        } else {
          console.error('❌ Upload failed with status:', xhr.status)
          console.error('❌ Response:', xhr.responseText)
          reject(new Error(`Upload failed with status ${xhr.status}`))
        }
      })

      xhr.addEventListener('error', (e) => {
        console.error('❌ Network error:', e)
        reject(
          new Error('Network request failed. Please check your connection.')
        )
      })

      xhr.addEventListener('timeout', () => {
        console.error('❌ Upload timeout - file too large')
        reject(
          new Error(
            'Upload timeout. Please try a shorter or lower quality video.'
          )
        )
      })

      xhr.open('POST', uploadUrl)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.timeout = 300000 // 5 minutes timeout

      console.log('🚀 Sending upload request...')
      xhr.send(formData)
    })
  } catch (error) {
    console.error(`❌ ${type} upload error:`, error)
    throw error
  }
}
