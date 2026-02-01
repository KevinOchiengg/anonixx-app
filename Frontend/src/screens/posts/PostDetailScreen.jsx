import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  Image,
  StyleSheet,
  Alert,
  StatusBar,
  Dimensions,
} from 'react-native'

import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ArrowLeft,
  Send,
  Play,
  Bookmark,
  Share2,
  MoreHorizontal,
} from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { API_BASE_URL } from '../../config/api'


const { width } = Dimensions.get('window')

const RESPONSE_LABELS = {
  felt_this: 'I felt this',
  not_alone: "You're not alone",
  hear_you: 'I hear you',
  holding_with_you: 'Holding this with you',
  sending_strength: 'Sending strength',
  this_matters: 'This matters',
}

export default function PostDetailScreen({ route, navigation }) {
  const { post: initialPost } = route.params
  const { theme } = useTheme()
  const { isAuthenticated } = useAuth()

  const [post, setPost] = useState(initialPost)
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [selectedResponse, setSelectedResponse] = useState(
    initialPost.user_response,
  )

  useEffect(() => {
    loadThreads()
  }, [])

  const loadThreads = async () => {
    try {
      const token = await AsyncStorage.getItem('token')
      const headers = {}

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(
        `${API_BASE_URL}/api/v1/posts/${post.id}/thread`,
        { headers },
      )

      const data = await response.json()

      if (response.ok) {
        setThreads(data.threads || [])
      }
    } catch (error) {
      console.error('❌ Error loading threads:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleResponse = async (type) => {
    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to respond', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign In',
          onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
        },
      ])
      return
    }

    try {
      const token = await AsyncStorage.getItem('token')
      const newResponse = type === selectedResponse ? null : type

      const response = await fetch(
        `${API_BASE_URL}/api/v1/posts/${post.id}/respond`,
        {
          method: newResponse ? 'POST' : 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: newResponse ? JSON.stringify({ type: newResponse }) : undefined,
        },
      )

      if (response.ok) {
        setSelectedResponse(newResponse)
      }
    } catch (error) {
      console.error('❌ Error responding:', error)
    }
  }

  const handleSave = async () => {
    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to save posts', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign In',
          onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
        },
      ])
      return
    }

    try {
      const token = await AsyncStorage.getItem('token')
      const response = await fetch(
        `${API_BASE_URL}/api/v1/posts/${post.id}/save`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      )

      const data = await response.json()

      if (response.ok) {
        setPost({ ...post, is_saved: data.saved })
        Alert.alert(
          data.saved ? 'Saved' : 'Removed',
          data.saved
            ? 'Added to your collection'
            : 'Removed from your collection',
        )
      }
    } catch (error) {
      console.error('❌ Error saving:', error)
    }
  }

  const handleAddReply = async () => {
    if (!replyText.trim()) return

    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to reply', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign In',
          onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
        },
      ])
      return
    }

    if (threads.length >= 2) {
      Alert.alert(
        'Thread Closed',
        'This conversation has reached its limit (maximum 2 replies)',
      )
      return
    }

    setSubmitting(true)
    try {
      const token = await AsyncStorage.getItem('token')
      const response = await fetch(
        `${API_BASE_URL}/api/v1/posts/${post.id}/thread`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: replyText }),
        },
      )

      const data = await response.json()

      if (response.ok) {
        setReplyText('')
        loadThreads()
        Alert.alert('Posted', 'Your reply has been added')
      } else {
        Alert.alert('Error', data.detail || 'Failed to post reply')
      }
    } catch (error) {
      console.error('❌ Error adding reply:', error)
      Alert.alert('Error', 'Failed to post reply')
    } finally {
      setSubmitting(false)
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
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Post</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Post */}
        <View
          style={[styles.postContainer, { backgroundColor: theme.surface }]}
        >
          {/* Author */}
          <View style={styles.postHeader}>
            <View
              style={[styles.avatar, { backgroundColor: theme.primary + '20' }]}
            >
              <Text style={[styles.avatarText, { color: theme.primary }]}>
                {post.anonymous_name?.[0] || 'A'}
              </Text>
            </View>
            <View style={styles.postHeaderInfo}>
              <Text style={[styles.username, { color: theme.text }]}>
                {post.anonymous_name || 'Anonymous'}
              </Text>
              <Text style={[styles.timestamp, { color: theme.textTertiary }]}>
                {post.time_ago}
              </Text>
            </View>
          </View>

          {/* Content */}
          <Text style={[styles.content, { color: theme.text }]}>
            {post.content}
          </Text>

          {/* Images */}
          {post.images && post.images.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.imagesContainer}
            >
              {post.images.map((imageUri, index) => (
                <Image
                  key={index}
                  source={{ uri: imageUri }}
                  style={styles.image}
                  resizeMode='cover'
                />
              ))}
            </ScrollView>
          )}

          {/* Video */}
          {post.video_url && (
            <View style={styles.videoContainer}>
              <Image
                source={{ uri: post.video_url }}
                style={styles.videoThumbnail}
                resizeMode='cover'
              />
              <View style={styles.playButton}>
                <Play size={40} color='#ffffff' fill='#ffffff' />
              </View>
              <View style={styles.videoBadge}>
                <Text style={styles.videoBadgeText}>VIDEO</Text>
              </View>
            </View>
          )}

          {/* Topics */}
          {post.topics && post.topics.length > 0 && (
            <View style={styles.topics}>
              {post.topics.map((topic, index) => (
                <View
                  key={index}
                  style={[styles.topic, { backgroundColor: theme.card }]}
                >
                  <Text
                    style={[styles.topicText, { color: theme.textSecondary }]}
                  >
                    {topic}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Response Options */}
          <View style={styles.responseOptions}>
            {post.response_options?.map((option) => (
              <TouchableOpacity
                key={option}
                onPress={() => handleResponse(option)}
                style={[
                  styles.responseButton,
                  {
                    backgroundColor:
                      selectedResponse === option
                        ? theme.primary + '20'
                        : theme.card,
                    borderColor:
                      selectedResponse === option
                        ? theme.primary
                        : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.responseText,
                    {
                      color:
                        selectedResponse === option
                          ? theme.primary
                          : theme.textSecondary,
                    },
                  ]}
                >
                  {RESPONSE_LABELS[option]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Actions */}
          <View style={[styles.actions, { borderTopColor: theme.border }]}>
            <View style={styles.action}>
              <Text style={[styles.actionText, { color: theme.textSecondary }]}>
                {threads.length} {threads.length === 1 ? 'reply' : 'replies'}
              </Text>
            </View>

            <TouchableOpacity onPress={handleSave} style={styles.action}>
              <Bookmark
                size={18}
                color={post.is_saved ? theme.primary : theme.textSecondary}
                fill={post.is_saved ? theme.primary : 'none'}
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.action}>
              <Share2 size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Threads Section */}
        <View style={styles.threadsSection}>
          <Text style={[styles.threadsTitle, { color: theme.text }]}>
            Replies ({threads.length}/2)
          </Text>

          {loading ? (
            <ActivityIndicator
              color={theme.primary}
              style={{ marginTop: 20 }}
            />
          ) : threads.length > 0 ? (
            threads.map((thread) => (
              <View
                key={thread.id}
                style={[styles.thread, { backgroundColor: theme.surface }]}
              >
                <View
                  style={[
                    styles.threadAvatar,
                    { backgroundColor: theme.primary + '20' },
                  ]}
                >
                  <Text
                    style={[styles.threadAvatarText, { color: theme.primary }]}
                  >
                    {thread.anonymous_name?.[0] || 'A'}
                  </Text>
                </View>
                <View style={styles.threadContent}>
                  <Text style={[styles.threadUsername, { color: theme.text }]}>
                    {thread.anonymous_name || 'Anonymous'}
                  </Text>
                  <Text style={[styles.threadText, { color: theme.text }]}>
                    {thread.content}
                  </Text>
                  <Text
                    style={[styles.threadTime, { color: theme.textTertiary }]}
                  >
                    {thread.time_ago}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.noThreads, { color: theme.textSecondary }]}>
              No replies yet. Be the first to respond.
            </Text>
          )}

          {threads.length >= 2 && (
            <View
              style={[styles.threadClosed, { backgroundColor: theme.card }]}
            >
              <Text
                style={[
                  styles.threadClosedText,
                  { color: theme.textSecondary },
                ]}
              >
                This conversation has closed (2/2 replies)
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Reply Input */}
      {threads.length < 2 && (
        <View
          style={[
            styles.replyInputContainer,
            { backgroundColor: theme.surface, borderTopColor: theme.border },
          ]}
        >
          <TextInput
            value={replyText}
            onChangeText={setReplyText}
            placeholder='Add a thoughtful reply...'
            placeholderTextColor={theme.placeholder}
            style={[
              styles.replyInput,
              {
                backgroundColor: theme.input,
                color: theme.text,
                borderColor: theme.inputBorder,
              },
            ]}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            onPress={handleAddReply}
            disabled={!replyText.trim() || submitting}
            style={[
              styles.sendButton,
              { backgroundColor: theme.primary },
              (!replyText.trim() || submitting) && styles.sendButtonDisabled,
            ]}
          >
            {submitting ? (
              <ActivityIndicator size='small' color='#ffffff' />
            ) : (
              <Send size={20} color='#ffffff' />
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    backButton: { padding: 8 },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    scrollView: { flex: 1 },
    postContainer: {
      padding: 16,
      marginTop: 16,
      marginHorizontal: 16,
      borderRadius: 16,
    },
    postHeader: { flexDirection: 'row', marginBottom: 16 },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    avatarText: { fontSize: 20, fontWeight: 'bold' },
    postHeaderInfo: { flex: 1 },
    username: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 4,
    },
    timestamp: { fontSize: 12 },
    content: { fontSize: 16, lineHeight: 24, marginBottom: 16 },
    imagesContainer: { marginBottom: 16 },
    image: {
      width: width - 64,
      height: 250,
      borderRadius: 12,
      marginRight: 8,
    },
    videoContainer: {
      position: 'relative',
      marginBottom: 16,
      borderRadius: 12,
      overflow: 'hidden',
    },
    videoThumbnail: {
      width: '100%',
      height: 250,
      backgroundColor: '#000',
    },
    playButton: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      marginLeft: -30,
      marginTop: -30,
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    videoBadge: {
      position: 'absolute',
      top: 12,
      right: 12,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
    },
    videoBadgeText: {
      color: '#ffffff',
      fontSize: 10,
      fontWeight: 'bold',
    },
    topics: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    topic: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
    },
    topicText: {
      fontSize: 12,
      fontWeight: '500',
    },
    responseOptions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    responseButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 16,
      borderWidth: 1,
    },
    responseText: {
      fontSize: 13,
      fontWeight: '500',
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 20,
      paddingTop: 16,
      borderTopWidth: 1,
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    actionText: {
      fontSize: 13,
      fontWeight: '500',
    },
    threadsSection: { padding: 16, paddingTop: 24 },
    threadsTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 16,
    },
    thread: {
      flexDirection: 'row',
      marginBottom: 16,
      padding: 12,
      borderRadius: 12,
    },
    threadAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    threadAvatarText: { fontSize: 16, fontWeight: 'bold' },
    threadContent: { flex: 1 },
    threadUsername: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 6,
    },
    threadText: {
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 6,
    },
    threadTime: { fontSize: 11 },
    noThreads: {
      textAlign: 'center',
      fontSize: 14,
      marginTop: 32,
      fontStyle: 'italic',
    },
    threadClosed: {
      padding: 16,
      borderRadius: 12,
      marginTop: 16,
    },
    threadClosedText: {
      textAlign: 'center',
      fontSize: 13,
      fontStyle: 'italic',
    },
    replyInputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: 16,
      borderTopWidth: 1,
    },
    replyInput: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 24,
      borderWidth: 1,
      marginRight: 12,
      maxHeight: 100,
      fontSize: 15,
    },
    sendButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: { opacity: 0.5 },
  })
