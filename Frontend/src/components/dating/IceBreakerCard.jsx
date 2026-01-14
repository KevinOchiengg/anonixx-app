import React from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { MessageCircle } from 'lucide-react-native'

const icebreakers = [
  "What's your favorite way to spend a weekend?",
  'If you could travel anywhere right now, where would you go?',
  "What's the best concert or show you've ever been to?",
  'Coffee or tea? ☕',
  "What's your hidden talent?",
  'Beach vacation or mountain adventure?',
  "What's the last book you read?",
  'Favorite type of music?',
]

export default function IcebreakerCard({ onSelect }) {
  const randomIcebreakers = icebreakers
    .sort(() => 0.5 - Math.random())
    .slice(0, 3)

  return (
    <View className='bg-echo-card rounded-2xl p-4 mb-4'>
      <View className='flex-row items-center mb-3'>
        <MessageCircle size={20} color='#a855f7' />
        <Text className='text-white font-bold text-lg ml-2'>Break the ice</Text>
      </View>
      <Text className='text-gray-400 text-sm mb-3'>
        Start the conversation with a fun question
      </Text>
      {randomIcebreakers.map((question, index) => (
        <TouchableOpacity
          key={index}
          onPress={() => onSelect(question)}
          className='bg-echo-navy rounded-xl p-3 mb-2'
        >
          <Text className='text-white'>{question}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}
