import React from 'react'
import { View, Text, Image, Dimensions } from 'react-native'
import { MapPin, Info } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'

const { width } = Dimensions.get('window')

export default function SwipeCard({ profile }) {
  return (
    <View
      className='rounded-3xl overflow-hidden'
      style={{ width: width - 40, height: 600 }}
    >
      <Image
        source={{ uri: profile.photos[0] }}
        style={{ width: '100%', height: '100%' }}
        resizeMode='cover'
      />

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        className='absolute bottom-0 left-0 right-0 p-6'
      >
        <View className='flex-row items-center justify-between mb-2'>
          <View>
            <Text className='text-white text-3xl font-bold'>
              {profile.isRevealed ? profile.name : 'Anonymous'}
            </Text>
            <Text className='text-white text-xl'>{profile.age}</Text>
          </View>
          {!profile.isRevealed && (
            <View className='bg-echo-purple/80 px-3 py-2 rounded-full'>
              <Text className='text-white text-xs font-semibold'>Hidden</Text>
            </View>
          )}
        </View>

        <Text className='text-gray-300 text-base mb-3'>{profile.bio}</Text>

        <View className='flex-row items-center mb-2'>
          <MapPin size={16} color='#14b8a6' />
          <Text className='text-echo-teal text-sm ml-1'>
            {profile.distance}
          </Text>
        </View>

        <View className='flex-row flex-wrap'>
          {profile.interests?.slice(0, 3).map((interest, index) => (
            <View
              key={index}
              className='bg-echo-card px-3 py-1 rounded-full mr-2 mb-2 border border-echo-purple/30'
            >
              <Text className='text-white text-xs'>{interest}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>
    </View>
  )
}
