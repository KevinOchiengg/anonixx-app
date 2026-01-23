import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Alert,
  Dimensions,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import FullScreenPostCard from '../../components/feed/FullScreenPostCard'
import { useTheme } from '../../context/ThemeContext'

const { height } = Dimensions.get('window')

export default function FullScreenFeedScreen({ navigation }) {
  const { theme } = useTheme()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const flatListRef = useRef(null)

  // ✅ Load feed when page changes
  useEffect(() => {
    loadFeed()
  }, [page])

  const loadFeed = async () => {
    if (loading) return // ✅ Prevent duplicate requests

    setLoading(true)
    try {
      console.log('🔵 Loading personalized feed page:', page)
      const token = await AsyncStorage.getItem('token')

      const response = await fetch(
        `https://ulysses-apronlike-alethia.ngrok-free.dev/api/v1/posts/personalized-feed?page=${page}&limit=10`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      )

      const data = await response.json()

      if (response.ok) {
        console.log('✅ Feed loaded:', data.posts.length, 'posts')

        // ✅ Avoid duplicates by checking IDs
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id))
          const newPosts = data.posts.filter((p) => !existingIds.has(p.id))
          return [...prev, ...newPosts]
        })

        setHasMore(data.has_more)
      } else {
        console.error('❌ Failed to load feed:', data)
      }
    } catch (error) {
      console.error('❌ Load feed error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMore = () => {
    if (!loading && hasMore) {
      console.log('🔵 Loading more posts...')
      setPage((prev) => prev + 1)
    }
  }

  const handleReact = async (postId) => {
    try {
      const token = await AsyncStorage.getItem('token')
      const response = await fetch(
        `https://ulysses-apronlike-alethia.ngrok-free.dev/api/v1/posts/${postId}/react`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      )

      const data = await response.json()

      if (response.ok) {
        // Update local state
        setPosts((prev) =>
          prev.map((post) =>
            post.id === postId
              ? {
                  ...post,
                  user_reaction: data.reacted ? 'support' : null,
                  reactions_count: data.reacted
                    ? post.reactions_count + 1
                    : post.reactions_count - 1,
                }
              : post
          )
        )
      }
    } catch (error) {
      console.error('❌ React error:', error)
    }
  }

  const handleComment = (postId) => {
    Alert.alert('Comments', 'Comment feature coming soon!')
  }

  if (loading && posts.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <StatusBar barStyle='light-content' />
        <ActivityIndicator size='large' color={theme.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle='light-content' />
      <FlatList
        ref={flatListRef}
        data={posts}
        keyExtractor={(item, index) => `${item.id}-${index}`} // ✅ Unique key
        renderItem={({ item }) => (
          <FullScreenPostCard
            post={item}
            onReact={handleReact}
            onComment={handleComment}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToAlignment='start'
        snapToInterval={height}
        decelerationRate='fast'
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading && hasMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
