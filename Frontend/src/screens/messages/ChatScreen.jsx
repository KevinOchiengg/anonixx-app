import React, { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Image,
  StyleSheet,
} from 'react-native'
import { Send, Mic, Image as ImageIcon, ArrowLeft } from 'lucide-react-native'
import { useDispatch, useSelector } from 'react-redux'
import { fetchMessages, sendMessage } from '../../store/slices/chatSlice'

export default function ChatScreen({ route, navigation }) {
  const { chatId, recipientName } = route.params
  const dispatch = useDispatch()
  const { user } = useSelector((state) => state.auth)
  const messages = useSelector((state) => state.chat.messages[chatId] || [])
  const [messageText, setMessageText] = useState('')
  const flatListRef = useRef(null)

  useEffect(() => {
    dispatch(fetchMessages({ chatId }))
  }, [chatId])

  const handleSend = () => {
    if (!messageText.trim()) return

    dispatch(
      sendMessage({
        chatId,
        message: {
          content: messageText.trim(),
          type: 'text',
        },
      })
    )

    setMessageText('')
  }

  const renderMessage = ({ item }) => {
    const isOwn = item.senderId === user?.id

    return (
      <View
        style={[
          styles.messageContainer,
          isOwn ? styles.ownMessage : styles.theirMessage,
        ]}
      >
        {!isOwn && (
          <Image
            source={{ uri: item.senderAvatar }}
            style={styles.messageAvatar}
          />
        )}
        <View
          style={[
            styles.messageBubble,
            isOwn ? styles.ownBubble : styles.theirBubble,
          ]}
        >
          {!isOwn && <Text style={styles.senderName}>{item.senderName}</Text>}
          <Text style={styles.messageText}>{item.content}</Text>
          <Text style={styles.messageTime}>{item.createdAt}</Text>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color='#ffffff' />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{recipientName}</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        inverted
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputContainer}
      >
        <TouchableOpacity style={styles.attachButton}>
          <ImageIcon size={24} color='#9ca3af' />
        </TouchableOpacity>

        <TextInput
          value={messageText}
          onChangeText={setMessageText}
          placeholder='Type a message...'
          placeholderTextColor='#6b7280'
          style={styles.input}
          multiline
          maxLength={1000}
        />

        {messageText.trim() ? (
          <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
            <Send size={24} color='#ffffff' />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.voiceButton}>
            <Mic size={24} color='#9ca3af' />
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  backButton: { padding: 4 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
    textAlign: 'center',
  },
  messagesList: { padding: 16 },
  messageContainer: { flexDirection: 'row', marginBottom: 16, maxWidth: '80%' },
  ownMessage: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  theirMessage: { alignSelf: 'flex-start' },
  messageAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 8 },
  messageBubble: { borderRadius: 16, padding: 12, maxWidth: '100%' },
  ownBubble: { backgroundColor: '#a855f7' },
  theirBubble: { backgroundColor: '#16213e' },
  senderName: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  messageText: { color: '#ffffff', fontSize: 15, lineHeight: 20 },
  messageTime: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 4 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    backgroundColor: '#0a0a1a',
  },
  attachButton: { padding: 8, marginRight: 8 },
  input: {
    flex: 1,
    backgroundColor: '#16213e',
    color: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#a855f7',
    borderRadius: 24,
    padding: 10,
    marginLeft: 8,
  },
  voiceButton: { padding: 10, marginLeft: 8 },
})
