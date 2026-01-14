import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { Play, Pause } from 'lucide-react-native'
import { Audio } from 'expo-av'
import Slider from '@react-native-community/slider'

export default function VoiceNote({ uri, duration = 30 }) {
  const [sound, setSound] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [playbackDuration, setPlaybackDuration] = useState(duration * 1000)

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync()
        }
      : undefined
  }, [sound])

  const playPauseSound = async () => {
    if (!sound) {
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      )
      setSound(newSound)
      setIsPlaying(true)
    } else {
      if (isPlaying) {
        await sound.pauseAsync()
        setIsPlaying(false)
      } else {
        await sound.playAsync()
        setIsPlaying(true)
      }
    }
  }

  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis)
      setPlaybackDuration(status.durationMillis || duration * 1000)

      if (status.didJustFinish) {
        setIsPlaying(false)
        setPosition(0)
      }
    }
  }

  const formatTime = (millis) => {
    const seconds = Math.floor(millis / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <View className='bg-echo-purple/10 rounded-xl p-4 mb-3 border border-echo-purple/30'>
      <View className='flex-row items-center'>
        <TouchableOpacity
          onPress={playPauseSound}
          className='bg-echo-purple rounded-full w-10 h-10 items-center justify-center mr-3'
        >
          {isPlaying ? (
            <Pause size={20} color='#ffffff' fill='#ffffff' />
          ) : (
            <Play size={20} color='#ffffff' fill='#ffffff' />
          )}
        </TouchableOpacity>

        <View className='flex-1'>
          <Slider
            value={position}
            minimumValue={0}
            maximumValue={playbackDuration}
            minimumTrackTintColor='#a855f7'
            maximumTrackTintColor='#4b5563'
            thumbTintColor='#a855f7'
            onSlidingComplete={async (value) => {
              if (sound) {
                await sound.setPositionAsync(value)
              }
            }}
          />
          <View className='flex-row justify-between'>
            <Text className='text-gray-400 text-xs'>
              {formatTime(position)}
            </Text>
            <Text className='text-gray-400 text-xs'>
              {formatTime(playbackDuration)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}
