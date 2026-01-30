import React, { useState, useEffect } from 'react'
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
import { ArrowLeft, Send } from 'lucide-react-native'
import { API_BASE_URL } from '../../config/api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'

export default function ThreadViewScreen({ route, navigation }) {
  const { theme } = useTheme()
  const { isAuthenticated } = useAuth() // ✅ Add auth check
  const { postId, postContent } = route.params
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [isClosed, setIsClosed] = useState(false)

  useEffect(() => {
    loadThreads()
  }, [])

  const loadThreads = async () => {
    try {
      const token = await AsyncStorage.getItem('token')

      // ✅ Debug token
      console.log('🔍 Thread - Token exists:', !!token)
      console.log('🔍 Thread - Token type:', typeof token)
      console.log('🔍 Thread - Token preview:', token?.substring(0, 30))

      // Optional auth - guests can view
      const headers = {}
      if (token && typeof token === 'string' && token.length > 10) {
        headers['Authorization'] = `Bearer ${token}`
      } else if (isAuthenticated) {
        // User thinks they're authenticated but token is bad
        console.error('❌ Invalid token despite isAuthenticated=true')
        Alert.alert('Session Expired', 'Please log in again to continue', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
          },
        ])
        setLoading(false)
        return
      }

      const response = await fetch(
        `${API_BASE_URL}/api/v1/posts/${postId}/thread`,
        { headers },
      )

      console.log('🔍 Thread response status:', response.status)

      const data = await response.json()

      if (response.ok) {
        setThreads(data.threads)
        setIsClosed(data.is_closed)
      } else if (response.status === 401) {
        console.error('❌ Thread 401:', data)
        Alert.alert('Session Expired', 'Please log in again', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
          },
        ])
      } else {
        console.error('❌ Thread load failed:', data)
      }
    } catch (error) {
      console.error('❌ Load threads error:', error)
    } finally {
      setLoading(false)
    }
  }

 const handleSendReply = async () => {
   // Auth check first
   if (!isAuthenticated) {
     Alert.alert('Sign in Required', 'Please sign in to reply to posts', [
       { text: 'Cancel', style: 'cancel' },
       {
         text: 'Sign In',
         onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
       },
     ])
     return
   }

   if (!replyText.trim()) {
     Alert.alert('Error', 'Please write something')
     return
   }

   if (isClosed) {
     Alert.alert('Thread Closed', 'This thread has reached its 2-reply limit')
     return
   }

   setSending(true)
   try {
     const token = await AsyncStorage.getItem('token')

     // ✅ Debug token
     console.log('🔍 Reply - Token exists:', !!token)
     console.log('🔍 Reply - Token type:', typeof token)

     if (!token || typeof token !== 'string' || token.length < 10) {
       Alert.alert('Session Expired', 'Please log in again', [
         {
           text: 'OK',
           onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
         },
       ])
       setSending(false)
       return
     }

     const response = await fetch(
       `${API_BASE_URL}/api/v1/posts/${postId}/thread`,
       {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           Authorization: `Bearer ${token}`,
         },
         body: JSON.stringify({
           content: replyText.trim(),
         }),
       },
     )

     console.log('🔍 Reply response status:', response.status)

     const data = await response.json()

     if (response.ok) {
       Alert.alert('Success', data.message)
       setReplyText('')
       loadThreads()

       if (data.thread_closed) {
         setIsClosed(true)
       }
     } else if (response.status === 401) {
       Alert.alert('Session Expired', 'Please log in again', [
         {
           text: 'OK',
           onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
         },
       ])
     } else {
       Alert.alert('Error', data.detail || 'Failed to post reply')
     }
   } catch (error) {
     console.error('❌ Send reply error:', error)
     Alert.alert('Error', 'Failed to post reply')
   } finally {
     setSending(false)
   }
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
        <Text style={[styles.headerTitle, { color: theme.text }]}>Thread</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size='large' color={theme.primary} />
          </View>
        ) : (
          <>
            <ScrollView style={styles.scrollView}>
              {/* Original Post */}
              <View
                style={[styles.originalPost, { backgroundColor: theme.card }]}
              >
                <Text
                  style={[styles.originalLabel, { color: theme.textSecondary }]}
                >
                  Original Post
                </Text>
                <Text style={[styles.originalContent, { color: theme.text }]}>
                  {postContent}
                </Text>
              </View>

              {/* Thread Replies */}
              {threads.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text
                    style={[styles.emptyText, { color: theme.textSecondary }]}
                  >
                    {isAuthenticated
                      ? 'No replies yet. Be the first to respond.'
                      : 'No replies yet. Sign in to start a conversation.'}
                  </Text>
                </View>
              ) : (
                <View style={styles.threadsContainer}>
                  {threads.map((thread, index) => (
                    <View
                      key={thread.id}
                      style={[
                        styles.threadCard,
                        {
                          backgroundColor: thread.is_own_reply
                            ? theme.primaryLight
                            : theme.card,
                          marginLeft: thread.depth * 20,
                        },
                      ]}
                    >
                      <View style={styles.threadHeader}>
                        <Text
                          style={[
                            styles.threadAuthor,
                            {
                              color: thread.is_own_reply
                                ? theme.primary
                                : theme.text,
                            },
                          ]}
                        >
                          {thread.is_own_reply ? 'You' : thread.anonymous_name}
                        </Text>
                        <Text
                          style={[
                            styles.threadTime,
                            { color: theme.textTertiary },
                          ]}
                        >
                          {thread.time_ago}
                        </Text>
                      </View>
                      <Text
                        style={[styles.threadContent, { color: theme.text }]}
                      >
                        {thread.content}
                      </Text>
                    </View>
                  ))}

                  {isClosed && (
                    <View
                      style={[
                        styles.closedBanner,
                        { backgroundColor: theme.surface },
                      ]}
                    >
                      <Text
                        style={[
                          styles.closedText,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Thread closed - Preserved for reading
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Reply Input - Show for everyone, but require auth on submit */}
            {!isClosed && (
              <View
                style={[
                  styles.replyContainer,
                  {
                    backgroundColor: theme.surface,
                    borderTopColor: theme.border,
                  },
                ]}
              >
                <TextInput
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder={
                    isAuthenticated
                      ? 'Write your reply...'
                      : 'Sign in to reply...'
                  }
                  placeholderTextColor={theme.placeholder}
                  multiline
                  editable={isAuthenticated} // ✅ Disable input for guests
                  style={[
                    styles.replyInput,
                    {
                      color: theme.text,
                      backgroundColor: theme.input,
                      opacity: isAuthenticated ? 1 : 0.6,
                    },
                  ]}
                  maxLength={500}
                />
                <TouchableOpacity
                  onPress={handleSendReply}
                  disabled={sending || !replyText.trim()}
                  style={[
                    styles.sendButton,
                    {
                      backgroundColor: replyText.trim()
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
      fontSize: 18,
      fontWeight: 'bold',
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollView: {
      flex: 1,
    },
    originalPost: {
      margin: 16,
      padding: 16,
      borderRadius: 12,
    },
    originalLabel: {
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    originalContent: {
      fontSize: 16,
      lineHeight: 24,
    },
    emptyState: {
      padding: 40,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 15,
      textAlign: 'center',
    },
    threadsContainer: {
      padding: 16,
      gap: 12,
    },
    threadCard: {
      padding: 16,
      borderRadius: 12,
    },
    threadHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    threadAuthor: {
      fontSize: 14,
      fontWeight: '600',
    },
    threadTime: {
      fontSize: 12,
    },
    threadContent: {
      fontSize: 15,
      lineHeight: 22,
    },
    closedBanner: {
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 8,
    },
    closedText: {
      fontSize: 14,
      fontWeight: '500',
      fontStyle: 'italic',
    },
    replyContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: 16,
      gap: 12,
      borderTopWidth: 1,
    },
    replyInput: {
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
