import React from 'react'
import { View, Image, TouchableOpacity } from 'react-native'
import { Play, Volume2 } from 'lucide-react-native'

export default function MediaPreview({ type, uri, onPress }) {
  if (type === 'image') {
    return (
      <TouchableOpacity onPress={onPress}>
        <Image
          source={{ uri }}
          className='w-full h-64 rounded-xl'
          resizeMode='cover'
        />
      </TouchableOpacity>
    )
  }

  if (type === 'video') {
    return (
      <TouchableOpacity
        onPress={onPress}
        className='w-full h-64 rounded-xl bg-echo-navy items-center justify-center'
      >
        <Image
          source={{ uri }}
          className='w-full h-64 rounded-xl absolute'
          resizeMode='cover'
        />
        <View className='bg-black/50 rounded-full p-4'>
          <Play size={48} color='#ffffff' fill='#ffffff' />
        </View>
      </TouchableOpacity>
    )
  }

  if (type === 'voice') {
    return (
      <TouchableOpacity
        onPress={onPress}
        className='bg-echo-purple/20 rounded-xl p-4 flex-row items-center'
      >
        <View className='bg-echo-purple rounded-full p-3 mr-3'>
          <Volume2 size={24} color='#ffffff' />
        </View>
        <View className='flex-1'>
          <View className='bg-gray-700 h-2 rounded-full' />
        </View>
      </TouchableOpacity>
    )
  }

  return null
}
