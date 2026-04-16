import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { Play, Pause } from 'lucide-react-native'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import Slider from '@react-native-community/slider'

export default function VoiceNote({ uri, duration = 30 }) {
  const player = useAudioPlayer(null)
  const status = useAudioPlayerStatus(player)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => () => player.remove(), [])

  const playPauseSound = async () => {
    if (!loaded) {
      player.replace({ uri })
      player.play()
      setLoaded(true)
    } else if (status.didJustFinish) {
      player.seekTo(0)
      player.play()
    } else if (status.playing) {
      player.pause()
    } else {
      player.play()
    }
  }

  // expo-audio uses seconds; fallback to prop (seconds) before loaded
  const currentSec = status.currentTime || 0
  const totalSec   = status.duration   || duration

  const formatTime = (secs) => {
    const s = Math.floor(secs)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <View className='bg-echo-purple/10 rounded-xl p-4 mb-3 border border-echo-purple/30'>
      <View className='flex-row items-center'>
        <TouchableOpacity
          onPress={playPauseSound}
          className='bg-echo-purple rounded-full w-10 h-10 items-center justify-center mr-3'
        >
          {status.playing ? (
            <Pause size={20} color='#ffffff' fill='#ffffff' />
          ) : (
            <Play size={20} color='#ffffff' fill='#ffffff' />
          )}
        </TouchableOpacity>

        <View className='flex-1'>
          <Slider
            value={currentSec}
            minimumValue={0}
            maximumValue={totalSec}
            minimumTrackTintColor='#a855f7'
            maximumTrackTintColor='#4b5563'
            thumbTintColor='#a855f7'
            onSlidingComplete={(value) => {
              if (loaded) player.seekTo(value)
            }}
          />
          <View className='flex-row justify-between'>
            <Text className='text-gray-400 text-xs'>{formatTime(currentSec)}</Text>
            <Text className='text-gray-400 text-xs'>{formatTime(totalSec)}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
