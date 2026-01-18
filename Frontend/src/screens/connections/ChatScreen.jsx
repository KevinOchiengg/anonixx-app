import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { ArrowLeft, Send, Clock, Info } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../../context/ThemeContext'

export default function ChatScreen({ route, navigation }) {
  const { theme } = useTheme()
  const { connectionId } = route.params
  const [messages, setMessages] = useState([])
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [expiresAt, setExpiresAt] = useState(null)
  const [isExpired, setIsExpired] = useState(false)
  const scrollViewRef = useRef(null)

  useEffect(() => {
    loadMessages()
    const interval = setInterval(loadMessages, 5000) // Poll every 5 seconds
    return () => clearInterval(interval)
  }, [])

  const loadMessages = async () => {
    try {
      const token = await AsyncStorage.getItem('token')
      const response = await fetch(
        `http://localhost:8000/api/v1/connections/connections/${connectionId}/messages`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const data = await response.json()

      if (response.ok) {
        setMessages(data.messages)
        setExpiresAt(data.expires_at)
        setIsExpired(data.is_expired)
      }
    } catch (error) {
      console.error('❌ Load messages error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!messageText.trim() || isExpired) return

    setSending(true)
    try {
      const token = await AsyncStorage.getItem('token')
      const response = await fetch(
        `http://localhost:8000/api/v1/connections/connections/${connectionId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: messageText.trim(),
          }),
        }
      )

      if (response.ok) {
        setMessageText('')
        loadMessages()
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }, 100)
      } else {
        const data = await response.json()
        Alert.alert('Error', data.detail || 'Failed to send message')
      }
    } catch (error) {
      console.error('❌ Send message error:', error)
      Alert.alert('Error', 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const getTimeRemaining = () => {
    if (!expiresAt) return ''
    const now = new Date()
    const expires = new Date(expiresAt)
    const diff = expires - now
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ${hours % 24}h left`
    if (hours > 0) return `${hours}h left`
    return 'Expires soon'
  }

  const styles = createStyles(theme)

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Anonymous Chat
          </Text>
          {expiresAt && (
            <View style={styles.headerSubtitle}>
              <Clock size={12} color={theme.textTertiary} />
              <Text style={[styles.headerTime, { color: theme.textTertiary }]}>
                {getTimeRemaining()}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={() =>
            Alert.alert(
              'Anonymous Chat',
              'This is a 3-day private conversation. After 3 days, the connection closes. Your identity remains anonymous.'
            )
          }
        >
          <Info size={24} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size='large' color={theme.primary} />
          </View>
        ) : (
          <>
            <ScrollView
              ref={scrollViewRef}
              style={styles.messagesContainer}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() =>
                scrollViewRef.current?.scrollToEnd({ animated: true })
              }
            >
              {messages.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text
                    style={[styles.emptyText, { color: theme.textSecondary }]}
                  >
                    Start the conversation...
                  </Text>
                </View>
              ) : (
                messages.map((msg) => (
                  <View
                    key={msg.id}
                    style={[
                      styles.messageBubble,
                      msg.is_own ? styles.ownMessage : styles.theirMessage,
                      {
                        backgroundColor: msg.is_own
                          ? theme.primary
                          : theme.card,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        { color: msg.is_own ? '#ffffff' : theme.text },
                      ]}
                    >
                      {msg.content}
                    </Text>
                    <Text
                      style={[
                        styles.messageTime,
                        {
                          color: msg.is_own
                            ? 'rgba(255,255,255,0.7)'
                            : theme.textTertiary,
                        },
                      ]}
                    >
                      {new Date(msg.created_at).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                ))
              )}

              {isExpired && (
                <View
                  style={[
                    styles.expiredBanner,
                    { backgroundColor: theme.surface },
                  ]}
                >
                  <Text
                    style={[styles.expiredText, { color: theme.textSecondary }]}
                  >
                    This connection has expired. Thank you for the meaningful
                    conversation.
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Input */}
            {!isExpired && (
              <View
                style={[
                  styles.inputContainer,
                  { backgroundColor: theme.surface },
                ]}
              >
                <TextInput
                  value={messageText}
                  onChangeText={setMessageText}
                  placeholder='Type a message...'
                  placeholderTextColor={theme.placeholder}
                  multiline
                  style={[
                    styles.input,
                    { color: theme.text, backgroundColor: theme.input },
                  ]}
                  maxLength={1000}
                />
                <TouchableOpacity
                  onPress={handleSend}
                  disabled={sending || !messageText.trim()}
                  style={[
                    styles.sendButton,
                    {
                      backgroundColor: messageText.trim()
                        ? theme.primary
                        : theme.border,
                    },
                  ]}
                >
                  {sending ? (
                    <ActivityIndicator size='small' color='#ffffff' />
                  ) : (
                    <Send size={20} color='#ffffff' />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    headerSubtitle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    headerTime: {
      fontSize: 11,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    messagesContainer: {
      flex: 1,
    },
    messagesContent: {
      padding: 16,
      gap: 12,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyText: {
      fontSize: 15,
      fontStyle: 'italic',
    },
    messageBubble: {
      maxWidth: '75%',
      padding: 12,
      borderRadius: 16,
    },
    ownMessage: {
      alignSelf: 'flex-end',
      borderBottomRightRadius: 4,
    },
    theirMessage: {
      alignSelf: 'flex-start',
      borderBottomLeftRadius: 4,
    },
    messageText: {
      fontSize: 15,
      lineHeight: 20,
    },
    messageTime: {
      fontSize: 10,
      marginTop: 4,
    },
    expiredBanner: {
      padding: 16,
      borderRadius: 12,
      marginTop: 20,
    },
    expiredText: {
      fontSize: 14,
      textAlign: 'center',
      fontStyle: 'italic',
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: 16,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: '#2D2D44',
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 100,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 15,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
