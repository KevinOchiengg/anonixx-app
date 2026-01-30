import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  SafeAreaView,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { ArrowLeft, Send, Sparkles, MoreVertical } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import {
  getMessages,
  sendMessage,
  getConnectionDetails,
} from '../../services/connectApi'

export default function ChatScreen({ route, navigation }) {
  const { connectionId } = route.params
  const { theme } = useTheme()
  const flatListRef = useRef(null)

  const [messages, setMessages] = useState([])
  const [connection, setConnection] = useState(null)
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [messagesData, connectionData] = await Promise.all([
        getMessages(connectionId),
        getConnectionDetails(connectionId),
      ])

      setMessages(messagesData.messages || [])
      setConnection(connectionData)
    } catch (error) {
      console.error('❌ Load chat error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!inputText.trim()) return

    const messageText = inputText.trim()
    setInputText('')
    setSending(true)

    try {
      const result = await sendMessage(connectionId, messageText)

      // Add message to list
      setMessages([
        ...messages,
        {
          id: result.message.id || Date.now().toString(),
          content: messageText,
          is_mine: true,
          created_at: new Date().toISOString(),
          time_ago: 'just now',
        },
      ])

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)

      // Check if reveal eligible now
      if (result.reveal_eligible && !connection.reveal_eligible) {
        Alert.alert(
          '✨ Milestone Reached',
          "You've built something meaningful here. You can now reveal your identity when ready.",
          [{ text: 'OK' }],
        )
        setConnection({ ...connection, reveal_eligible: true })
      }
    } catch (error) {
      console.error('❌ Send message error:', error)
      Alert.alert('Error', 'Failed to send message')
      setInputText(messageText) // Restore message
    } finally {
      setSending(false)
    }
  }

  const handleReveal = () => {
    navigation.navigate('RevealInitiate', { connectionId })
  }

  const renderMessage = ({ item }) => (
    <View
      style={[
        styles.messageBubble,
        item.is_mine ? styles.myMessage : styles.theirMessage,
        {
          backgroundColor: item.is_mine ? theme.primary : theme.card,
        },
      ]}
    >
      <Text
        style={[
          styles.messageText,
          {
            color: item.is_mine ? '#ffffff' : theme.text,
          },
        ]}
      >
        {item.content}
      </Text>
      <Text
        style={[
          styles.messageTime,
          {
            color: item.is_mine ? 'rgba(255,255,255,0.7)' : theme.textTertiary,
          },
        ]}
      >
        {item.time_ago}
      </Text>
    </View>
  )

  const styles = createStyles(theme)

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: theme.background },
        ]}
      >
        <ActivityIndicator size='large' color={theme.primary} />
      </View>
    )
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {connection?.anonymous_name || 'Anonymous'}
          </Text>
          {connection?.message_count > 0 && (
            <Text
              style={[styles.headerSubtitle, { color: theme.textSecondary }]}
            >
              {connection.message_count} messages • {connection.days_active}{' '}
              days
            </Text>
          )}
        </View>

        <TouchableOpacity style={styles.menuButton}>
          <MoreVertical size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Reveal Banner */}
      {connection?.reveal_eligible && !connection?.is_revealed && (
        <TouchableOpacity
          onPress={handleReveal}
          style={[styles.revealBanner, { backgroundColor: theme.primaryLight }]}
        >
          <Sparkles size={20} color={theme.primary} />
          <Text style={[styles.revealBannerText, { color: theme.primary }]}>
            You've built something meaningful. Ready to reveal?
          </Text>
        </TouchableOpacity>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
      />

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View
          style={[
            styles.inputContainer,
            { backgroundColor: theme.card, borderTopColor: theme.border },
          ]}
        >
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder='Type a message...'
            placeholderTextColor={theme.placeholder}
            style={[
              styles.input,
              {
                backgroundColor: theme.input,
                color: theme.text,
              },
            ]}
            multiline
            maxLength={1000}
          />

          <TouchableOpacity
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            style={[
              styles.sendButton,
              { backgroundColor: theme.primary },
              (!inputText.trim() || sending) && styles.sendButtonDisabled,
            ]}
          >
            {sending ? (
              <ActivityIndicator size='small' color='#ffffff' />
            ) : (
              <Send size={20} color='#ffffff' />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    center: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    backButton: {
      padding: 8,
    },
    headerCenter: {
      flex: 1,
      marginLeft: 12,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '700',
    },
    headerSubtitle: {
      fontSize: 12,
      marginTop: 2,
    },
    menuButton: {
      padding: 8,
    },
    revealBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 12,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 12,
    },
    revealBannerText: {
      fontSize: 14,
      fontWeight: '600',
    },
    messagesList: {
      padding: 16,
    },
    messageBubble: {
      maxWidth: '75%',
      padding: 12,
      borderRadius: 16,
      marginBottom: 8,
    },
    myMessage: {
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
      fontSize: 11,
      marginTop: 4,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: 12,
      gap: 12,
      borderTopWidth: 1,
    },
    input: {
      flex: 1,
      maxHeight: 100,
      padding: 12,
      borderRadius: 20,
      fontSize: 15,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
  })
