import React from 'react'
import { View, Text, Image, TouchableOpacity } from 'react-native'
import { Check, CheckCheck } from 'lucide-react-native'
import VoiceNote from '../feed/VoiceNote'

export default function ChatBubble({ message, isOwn }) {
  const formatTime = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <View className={`mb-3 ${isOwn ? 'items-end' : 'items-start'}`}>
      <View
        className={`max-w-[75%] rounded-2xl p-3 ${
          isOwn ? 'bg-echo-purple' : 'bg-echo-card'
        }`}
      >
        {message.type === 'text' && (
          <Text className='text-white text-base'>{message.content}</Text>
        )}

        {message.type === 'image' && (
          <Image
            source={{ uri: message.mediaUrl }}
            className='w-56 h-56 rounded-xl'
            resizeMode='cover'
          />
        )}

        {message.type === 'voice' && (
          <View className='w-64'>
            <VoiceNote uri={message.mediaUrl} duration={message.duration} />
          </View>
        )}

        <View className='flex-row items-center justify-between mt-1'>
          <Text
            className={`text-xs ${isOwn ? 'text-purple-200' : 'text-gray-400'}`}
          >
            {formatTime(message.createdAt)}
          </Text>
          {isOwn && (
            <View className='ml-2'>
              {message.isRead ? (
                <CheckCheck size={14} color='#c084fc' />
              ) : (
                <Check size={14} color='#c084fc' />
              )}
            </View>
          )}
        </View>
      </View>

      {/* Reactions */}
      {message.reactions?.length > 0 && (
        <View className='flex-row mt-1'>
          {message.reactions.map((reaction, index) => (
            <View
              key={index}
              className='bg-echo-navy px-2 py-1 rounded-full mr-1'
            >
              <Text className='text-xs'>{reaction}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
