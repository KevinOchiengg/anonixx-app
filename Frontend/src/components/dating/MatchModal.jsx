import React from 'react'
import { View, Text, Modal, TouchableOpacity, Image } from 'react-native'
import { X, MessageCircle, Sparkles } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Button from '../common/Button'

export default function MatchModal({ visible, match, onClose, onMessage }) {
  if (!match) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      onRequestClose={onClose}
    >
      <View className='flex-1 bg-black/80 items-center justify-center px-4'>
        <View className='bg-echo-card rounded-3xl p-6 w-full max-w-md'>
          <TouchableOpacity
            onPress={onClose}
            className='absolute top-4 right-4 z-10 bg-echo-navy rounded-full p-2'
          >
            <X size={20} color='#ffffff' />
          </TouchableOpacity>

          <View className='items-center mb-6'>
            <View className='bg-echo-purple/20 rounded-full p-4 mb-4'>
              <Sparkles size={48} color='#a855f7' />
            </View>
            <Text className='text-white text-3xl font-bold mb-2'>
              It's a Match!
            </Text>
            <Text className='text-gray-400 text-center'>
              You and {match.profile.name} liked each other
            </Text>
          </View>

          <View className='flex-row justify-center items-center mb-6'>
            <Image
              source={{ uri: match.profile.photos[0] }}
              className='w-28 h-28 rounded-full border-4 border-echo-purple'
            />
            <View className='w-12 h-12 bg-echo-purple rounded-full items-center justify-center mx-2'>
              <Text className='text-2xl'>❤️</Text>
            </View>
            <Image
              source={{ uri: 'https://i.pravatar.cc/150?img=1' }}
              className='w-28 h-28 rounded-full border-4 border-echo-teal'
            />
          </View>

          <LinearGradient
            colors={['#a855f7', '#14b8a6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className='rounded-xl mb-3'
          >
            <Button
              title='Send Message'
              onPress={onMessage}
              icon={<MessageCircle size={20} color='#ffffff' />}
              style={{ backgroundColor: 'transparent' }}
            />
          </LinearGradient>

          <Button title='Keep Swiping' onPress={onClose} variant='ghost' />
        </View>
      </View>
    </Modal>
  )
}
