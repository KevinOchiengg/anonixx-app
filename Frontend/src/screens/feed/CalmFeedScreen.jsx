import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Alert,
  Dimensions,
  Text,
  TouchableOpacity,
} from 'react-native'
import { LogIn, LogOut } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { useLogout } from '../../hooks/useLogout'
import CalmPostCard from '../../components/feed/CalmPostCard'
import FeedDivider from '../../components/feed/FeedDivider'
import MoodBalancer from '../../components/feed/MoodBalancer'
import AuthPromptModal from '../../components/modals/AuthPromptModal'

const { height } = Dimensions.get('window')

export default function CalmFeedScreen({ navigation }) {
  const { theme } = useTheme()
  const { isAuthenticated, user, checkAuth } = useAuth()
  const { confirmLogout } = useLogout(navigation)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [sessionPosts, setSessionPosts] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [sessionLimitReached, setSessionLimitReached] = useState(false)
  const [authModalVisible, setAuthModalVisible] = useState(false)
  const [authModalAction, setAuthModalAction] = useState('default')
  const flatListRef = useRef(null)

  console.log(
    '🔍 Feed mounted - isAuthenticated:',
    isAuthenticated,
    'confirmLogout exists:',
    !!confirmLogout,
  )

  // ✅ MOVED STYLES TO TOP - Before any conditional returns
  const styles = createStyles(theme)

  useEffect(() => {
    loadFeed()

  }, [])

  // Re-check auth when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      checkAuth()
      console.log(
        '🔍 Checking auth - isAuthenticated:',
        isAuthenticated,
        'user:',
        user?.username,
      )
    }, []),
  )

  const loadFeed = async () => {
    if (loading && posts.length > 0) return

    setLoading(true)
    try {
      console.log('🔵 Loading calm feed...')

      const token = await AsyncStorage.getItem('token')
      const headers = {}

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(
        `http://localhost:8000/api/v1/posts/calm-feed?session_posts=${sessionPosts}`,
        { headers },
      )

      const data = await response.json()

      if (response.ok) {
        if (data.message === 'session_limit') {
          setSessionLimitReached(true)
          setHasMore(data.has_more)
        } else {
          console.log('✅ Feed loaded:', data.posts.length, 'items')
          setPosts((prev) => [...prev, ...data.posts])
          setSessionPosts(data.session_posts)
          setHasMore(data.has_more)
        }
      }
    } catch (error) {
      console.error('❌ Load feed error:', error)
    } finally {
      setLoading(false)
    }
  }

  const showAuthPrompt = (action) => {
    setAuthModalAction(action)
    setAuthModalVisible(true)
  }

  const handleResponse = async (postId, responseType) => {
    if (!isAuthenticated) {
      showAuthPrompt('respond')
      return
    }

    try {
      const token = await AsyncStorage.getItem('token')
      const response = await fetch(
        `http://localhost:8000/api/v1/posts/${postId}/respond`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ type: responseType }),
        },
      )

      const data = await response.json()

      if (response.ok) {
        setPosts((prev) =>
          prev.map((item) =>
            item.type === 'post' && item.id === postId
              ? { ...item, user_response: responseType }
              : item,
          ),
        )
      }
    } catch (error) {
      console.error('❌ Response error:', error)
    }
  }

  const handleSave = async (postId) => {
    if (!isAuthenticated) {
      showAuthPrompt('save')
      return
    }

    try {
      const token = await AsyncStorage.getItem('token')
      const response = await fetch(
        `http://localhost:8000/api/v1/posts/${postId}/save`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      )

      const data = await response.json()

      if (response.ok) {
        setPosts((prev) =>
          prev.map((item) =>
            item.type === 'post' && item.id === postId
              ? { ...item, is_saved: data.saved }
              : item,
          ),
        )

        if (data.saved) {
          Alert.alert('Saved', 'Added to your collection')
        }
      }
    } catch (error) {
      console.error('❌ Save error:', error)
    }
  }

const handleViewThread = async (postId) => {
  // ✅ No auth required to VIEW threads - anyone can read
  try {
    const token = await AsyncStorage.getItem('token')

    // Send view request to backend (optional auth)
    await fetch(`http://localhost:8000/api/v1/posts/${postId}/view`, {
      method: 'POST',
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {},
    }).catch((err) => console.log('View tracking failed:', err))

    // Navigate to thread
    const post = posts.find((p) => p.type === 'post' && p.id === postId)
    if (post) {
      navigation.navigate('ThreadView', {
        postId: postId,
        postContent: post.content,
      })
    }
  } catch (error) {
    console.error('❌ View thread error:', error)
  }
}

  const handleContinue = () => {
    setSessionLimitReached(false)
    loadFeed()
  }

  const handleAuthModalSignUp = () => {
    setAuthModalVisible(false)
    navigation.navigate('Auth', { screen: 'Register' })
  }

  const handleAuthModalLogin = () => {
    setAuthModalVisible(false)
    navigation.navigate('Auth', { screen: 'Login' })
  }

const handleHeaderAuthAction = () => {
  console.log('🔴 Header button pressed')
  console.log('🔴 isAuthenticated:', isAuthenticated)

  if (isAuthenticated) {
    console.log('🔴 Calling confirmLogout from header')
    confirmLogout()
  } else {
    console.log('🔴 Navigating to login')
    navigation.navigate('Auth', { screen: 'Login' })
  }
}

  const renderItem = ({ item }) => {
    if (item.type === 'divider') {
      return <FeedDivider text={item.text} />
    }

    if (item.type === 'mood_balancer') {
      return <MoodBalancer text={item.text} />
    }

    if (item.type === 'post') {
      return (
        <CalmPostCard
          post={item}
          onResponse={handleResponse}
          onSave={handleSave}
          onViewThread={handleViewThread}
          navigation={navigation}
        />
      )
    }

    return null
  }

  if (loading && posts.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <StatusBar barStyle='light-content' />
        <View style={styles.loadingContent}>
          <View style={styles.loadingLine} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Finding thoughts you need to hear...
          </Text>
          <View style={styles.loadingLine} />
        </View>
      </View>
    )
  }

  if (sessionLimitReached) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <StatusBar barStyle='light-content' />
        <View style={styles.limitContent}>
          <Text style={[styles.limitTitle, { color: theme.text }]}>
            You've read enough for now.
          </Text>

          <View style={styles.dividerContainer}>
            <View
              style={[styles.dividerLine, { backgroundColor: theme.border }]}
            />
          </View>

          <Text style={[styles.limitSubtitle, { color: theme.textSecondary }]}>
            Sometimes the best thing is to sit with what you've already felt.
          </Text>

          <Text style={[styles.limitMessage, { color: theme.textSecondary }]}>
            Come back when you're ready.
          </Text>

          <View style={styles.limitButtons}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.limitButton, { backgroundColor: theme.surface }]}
            >
              <Text style={[styles.limitButtonText, { color: theme.text }]}>
                Close
              </Text>
            </TouchableOpacity>

            {hasMore && (
              <TouchableOpacity
                onPress={handleContinue}
                style={[styles.limitButton, { backgroundColor: theme.primary }]}
              >
                <Text style={[styles.limitButtonText, { color: '#fff' }]}>
                  5 more posts
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle='light-content' />

      {/* Header with Dynamic Login/Logout Button */}
      <View
        style={[
          styles.header,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: theme.text }]}>Anonixx</Text>

        {/* Dynamic Auth Button */}
        <TouchableOpacity
          onPress={handleHeaderAuthAction}
          style={[styles.headerAuthButton, { borderColor: theme.border }]}
        >
          {isAuthenticated ? (
            <>
              <LogOut size={16} color={theme.textSecondary} />
              <Text
                style={[styles.headerAuthText, { color: theme.textSecondary }]}
              >
                Logout
              </Text>
            </>
          ) : (
            <>
              <LogIn size={16} color={theme.textSecondary} />
              <Text
                style={[styles.headerAuthText, { color: theme.textSecondary }]}
              >
                Login
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={posts}
        keyExtractor={(item, index) => `${item.id || item.type}-${index}`}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (hasMore && !loading) {
            loadFeed()
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading && hasMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : null
        }
      />

      {/* Auth Prompt Modal */}
      <AuthPromptModal
        visible={authModalVisible}
        onClose={() => setAuthModalVisible(false)}
        onSignUp={handleAuthModalSignUp}
        onLogin={handleAuthModalLogin}
        action={authModalAction}
      />
    </View>
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
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: 'bold',
    },
    headerAuthButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
    },
    headerAuthText: {
      fontSize: 13,
      fontWeight: '600',
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
    },
    loadingContent: {
      alignItems: 'center',
      gap: 16,
    },
    loadingLine: {
      width: 80,
      height: 2,
      backgroundColor: '#6B7FFF',
      opacity: 0.3,
    },
    loadingText: {
      fontSize: 15,
      textAlign: 'center',
      fontStyle: 'italic',
    },
    limitContent: {
      alignItems: 'center',
      width: '100%',
    },
    limitTitle: {
      fontSize: 24,
      fontWeight: '600',
      textAlign: 'center',
      marginBottom: 24,
    },
    dividerContainer: {
      width: '100%',
      alignItems: 'center',
      marginVertical: 24,
    },
    dividerLine: {
      width: 120,
      height: 1,
    },
    limitSubtitle: {
      fontSize: 16,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 16,
    },
    limitMessage: {
      fontSize: 15,
      textAlign: 'center',
      marginBottom: 40,
    },
    limitButtons: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
    },
    limitButton: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    limitButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
    footer: {
      height: 100,
      justifyContent: 'center',
      alignItems: 'center',
    },
  })
