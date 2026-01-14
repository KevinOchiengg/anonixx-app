import React, { useState } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Send, Mic, Image as ImageIcon, Smile } from 'lucide-react-native'

export default function MessageInput({ onSend, onVoicePress, onImagePress }) {
  const [message, setMessage] = useState('')

  const handleSend = () => {
    if (message.trim()) {
      onSend(message.trim())
      setMessage('')
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View className='bg-echo-navy border-t border-gray-800 px-4 py-3'>
        <View className='flex-row items-center'>
          <TouchableOpacity onPress={onImagePress} className='mr-2'>
            <ImageIcon size={24} color='#6b7280' />
          </TouchableOpacity>

          <View className='flex-1 bg-echo-card rounded-full px-4 py-2 flex-row items-center'>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder='Type a message...'
              placeholderTextColor='#6b7280'
              className='flex-1 text-white text-base'
              multiline
              maxLength={500}
            />
            <TouchableOpacity className='ml-2'>
              <Smile size={20} color='#6b7280' />
            </TouchableOpacity>
          </View>

          {message.trim() ? (
            <TouchableOpacity
              onPress={handleSend}
              className='ml-2 bg-echo-purple rounded-full w-10 h-10 items-center justify-center'
            >
              <Send size={18} color='#ffffff' />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={onVoicePress}
              className='ml-2 bg-echo-teal rounded-full w-10 h-10 items-center justify-center'
            >
              <Mic size={18} color='#ffffff' />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
