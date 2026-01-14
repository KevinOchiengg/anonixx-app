import React from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { Users, Settings, Share2 } from 'lucide-react-native'

export default function GroupHeader({ group, onSettingsPress, onSharePress }) {
  return (
    <View className='bg-echo-card px-4 py-6 border-b border-gray-800'>
      <View className='flex-row items-center justify-between mb-4'>
        <View className='flex-row items-center flex-1'>
          <View className='bg-echo-purple/20 rounded-2xl w-20 h-20 items-center justify-center mr-4'>
            <Text className='text-4xl'>{group.icon || '👥'}</Text>
          </View>

          <View className='flex-1'>
            <Text className='text-white font-bold text-2xl'>{group.name}</Text>
            <View className='flex-row items-center mt-1'>
              <Users size={14} color='#6b7280' />
              <Text className='text-gray-400 text-sm ml-1'>
                {group.memberCount?.toLocaleString()} members
              </Text>
            </View>
          </View>
        </View>

        <View className='flex-row'>
          {onSharePress && (
            <TouchableOpacity onPress={onSharePress} className='p-2 mr-2'>
              <Share2 size={22} color='#6b7280' />
            </TouchableOpacity>
          )}
          {onSettingsPress && (
            <TouchableOpacity onPress={onSettingsPress} className='p-2'>
              <Settings size={22} color='#6b7280' />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {group.description && (
        <Text className='text-gray-400 mb-3'>{group.description}</Text>
      )}

      {group.category && (
        <View className='bg-echo-navy px-3 py-1 rounded-full self-start'>
          <Text className='text-echo-purple text-xs font-semibold'>
            {group.category}
          </Text>
        </View>
      )}
    </View>
  )
}
