import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, Animated } from 'react-native'
import { Mic, X, Send } from 'lucide-react-native'
import { Audio } from 'expo-av'

export default function VoiceRecorder({ onSend, onCancel }) {
  const [recording, setRecording] = useState(null)
  const [duration, setDuration] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const pulseAnim = useState(new Animated.Value(1))[0]

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start()

      const interval = setInterval(() => {
        setDuration((prev) => prev + 1)
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [isRecording])

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync()
      if (status !== 'granted') {
        alert('Permission to access microphone is required!')
        return
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      })

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      )

      setRecording(newRecording)
      setIsRecording(true)
    } catch (err) {
      console.error('Failed to start recording', err)
    }
  }

  const stopRecording = async (shouldSend = false) => {
    if (!recording) return

    setIsRecording(false)
    await recording.stopAndUnloadAsync()
    const uri = recording.getURI()

    if (shouldSend && uri) {
      onSend(uri, duration)
    }

    setRecording(null)
    setDuration(0)
    onCancel()
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  useEffect(() => {
    startRecording()
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync()
      }
    }
  }, [])

  return (
    <View className='bg-echo-navy border-t border-gray-800 px-4 py-4 flex-row items-center justify-between'>
      <TouchableOpacity
        onPress={() => stopRecording(false)}
        className='bg-red-500/20 rounded-full p-3 border-2 border-red-500'
      >
        <X size={24} color='#ef4444' />
      </TouchableOpacity>

      <View className='flex-1 items-center'>
        <Animated.View
          style={{ transform: [{ scale: pulseAnim }] }}
          className='bg-red-500 rounded-full w-12 h-12 items-center justify-center mb-2'
        >
          <Mic size={24} color='#ffffff' />
        </Animated.View>
        <Text className='text-white font-bold text-lg'>
          {formatDuration(duration)}
        </Text>
        <Text className='text-gray-400 text-xs'>Recording...</Text>
      </View>

      <TouchableOpacity
        onPress={() => stopRecording(true)}
        className='bg-echo-teal rounded-full p-3'
      >
        <Send size={24} color='#ffffff' />
      </TouchableOpacity>
    </View>
  )
}
