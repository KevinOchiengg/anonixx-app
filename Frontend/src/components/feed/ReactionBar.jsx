import React from 'react'
import { View, TouchableOpacity, Text, ScrollView } from 'react-native'

const reactions = [
  { emoji: '🔥', name: 'fire' },
  { emoji: '❤️', name: 'heart' },
  { emoji: '😂', name: 'laugh' },
  { emoji: '😮', name: 'wow' },
  { emoji: '😢', name: 'sad' },
  { emoji: '😡', name: 'angry' },
  { emoji: '👏', name: 'clap' },
  { emoji: '🎉', name: 'celebrate' },
]

export default function ReactionBar({ onReact }) {
  return (
    <View className='mt-3 pt-3 border-t border-gray-700'>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className='flex-row'>
          {reactions.map((reaction) => (
            <TouchableOpacity
              key={reaction.name}
              onPress={() => onReact(reaction.name)}
              className='bg-echo-navy px-4 py-2 rounded-full mr-2'
              activeOpacity={0.7}
            >
              <Text className='text-2xl'>{reaction.emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}
