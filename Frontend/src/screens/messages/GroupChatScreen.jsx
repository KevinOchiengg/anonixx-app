import React, { useEffect, useState, useRef } from 'react'
import { View, Text, FlatList, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useDispatch, useSelector } from 'react-redux'
import { Users, Info } from 'lucide-react-native'
import { useSocket } from '../../hooks/useSocket'
import {
  fetchMessages,
  sendMessage,
  addMessage,
} from '../../store/slices/chatSlice'
import ChatBubble from '../../components/chat/ChatBubble'
import MessageInput from '../../components/chat/MessageInput'
import Avatar from '../../components/common/Avatar'
import TypingIndicator from '../../components/chat/TypingIndicator'

export default function GroupChatScreen({ route, navigation }) {
  const { chatId, groupName, members } = route.params
  const dispatch = useDispatch()
  const { socketService } = useSocket()
  const { user } = useSelector((state) => state.auth)
  const messages = useSelector((state) => state.chat.messages[chatId] || [])
  const typingUsers = useSelector(
    (state) => state.chat.typingUsers[chatId] || []
  )
  const flatListRef = useRef(null)

  useEffect(() => {
    dispatch(fetchMessages({ chatId }))
    socketService.joinChat(chatId)

    const handleNewMessage = (message) => {
      if (message.chatId === chatId) {
        dispatch(addMessage({ chatId, message }))
      }
    }

    socketService.onMessage(handleNewMessage)

    return () => {
      socketService.leaveChat(chatId)
      socketService.off('message', handleNewMessage)
    }
  }, [chatId])

  const handleSend = async (content) => {
    const tempMessage = {
      id: Date.now().toString(),
      chatId,
      senderId: user.id,
      senderName: user.username,
      senderAvatar: user.avatar,
      content,
      type: 'text',
      createdAt: new Date().toISOString(),
      isRead: false,
    }

    dispatch(addMessage({ chatId, message: tempMessage }))

    try {
      await dispatch(
        sendMessage({ chatId, message: { content, type: 'text' } })
      ).unwrap()
    } catch (error) {
      console.error('Send message failed:', error)
    }
  }

  const handleVoicePress = () => {
    console.log('Voice recording...')
  }

  const handleImagePress = () => {
    console.log('Image picker...')
  }

  return (
    <SafeAreaView className='flex-1 bg-echo-dark'>
      {/* Group Header */}
      <View className='flex-row items-center justify-between px-4 py-3 border-b border-gray-800'>
        <View className='flex-row items-center flex-1'>
          <View className='bg-echo-purple/20 rounded-full w-10 h-10 items-center justify-center mr-3'>
            <Users size={20} color='#a855f7' />
          </View>
          <View className='flex-1'>
            <Text className='text-white font-semibold text-lg'>
              {groupName}
            </Text>
            <Text className='text-gray-400 text-xs'>
              {members?.length || 0} members
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('GroupInfo', { chatId, members })}
        >
          <Info size={24} color='#6b7280' />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View className='mb-2'>
            {item.senderId !== user.id && (
              <View className='flex-row items-center mb-1 px-4'>
                <Avatar uri={item.senderAvatar} size={20} />
                <Text className='text-gray-400 text-xs ml-2'>
                  {item.senderName}
                </Text>
              </View>
            )}
            <ChatBubble message={item} isOwn={item.senderId === user.id} />
          </View>
        )}
        contentContainerStyle={{ padding: 16 }}
        ListFooterComponent={
          typingUsers.length > 0 ? (
            <View className='px-4'>
              <Text className='text-gray-400 text-xs mb-2'>
                {typingUsers.length}{' '}
                {typingUsers.length === 1 ? 'person is' : 'people are'}{' '}
                typing...
              </Text>
              <TypingIndicator />
            </View>
          ) : null
        }
        inverted={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />

      <MessageInput
        onSend={handleSend}
        onVoicePress={handleVoicePress}
        onImagePress={handleImagePress}
      />
    </SafeAreaView>
  )
}
