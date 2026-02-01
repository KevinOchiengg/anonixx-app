import React, { useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native'

import { Heart, MessageCircle, Share2, Eye } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { API_BASE_URL } from '../../config/api'

const { width, height } = Dimensions.get('window')

export default function FullScreenPostCard({ post, onReact, onComment }) {
  const { theme } = useTheme()

  useEffect(() => {
    recordView()
  }, [])

  const recordView = async () => {
    try {
      const token = await AsyncStorage.getItem('token')
      await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/view`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    } catch (error) {
      console.error('Failed to record view:', error)
    }
  }

  // ✅ Fixed: Added fallback for null values
  const displayName = post.is_anonymous
    ? post.anonymous_name || 'Anonymous User'
    : post.user?.username || 'Anonymous User'

  const topicEmojis = {
    relationships: '💔',
    anxiety: '😰',
    depression: '😢',
    self_growth: '💪',
    school_career: '🎓',
    family: '👨‍👩‍👧‍👦',
    lgbtq: '🏳️‍🌈',
    addiction: '💊',
    sleep: '😴',
    identity: '🎭',
    wins: '🎉',
    friendship: '🤝',
    financial: '💰',
    health: '🏥',
    general: '🌟',
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Background Gradient */}
      <View
        style={[styles.gradient, { backgroundColor: theme.primaryLight }]}
      />

      {/* Content */}
      <View style={styles.content}>
        {/* Topics */}
        {post.topics && post.topics.length > 0 && (
          <View style={styles.topicsContainer}>
            {post.topics.map((topic) => (
              <View
                key={topic}
                style={[styles.topicBadge, { backgroundColor: theme.primary }]}
              >
                <Text style={styles.topicEmoji}>
                  {topicEmojis[topic] || '🌟'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Post Content */}
        <View style={styles.textContainer}>
          <Text style={[styles.contentText, { color: theme.text }]}>
            {post.content || 'No content'}
          </Text>
        </View>

        {/* Author Info */}
        <View style={styles.authorContainer}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            <Text style={styles.avatarText}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.authorName, { color: theme.text }]}>
            {displayName}
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        {/* React Button */}
        <TouchableOpacity
          onPress={() => onReact(post.id)}
          style={styles.actionButton}
        >
          <Heart
            size={32}
            color={post.user_reaction ? theme.error : '#ffffff'}
            fill={post.user_reaction ? theme.error : 'transparent'}
          />
          <Text style={styles.actionText}>{post.reactions_count || 0}</Text>
        </TouchableOpacity>

        {/* Comment Button */}
        <TouchableOpacity
          onPress={() => onComment(post.id)}
          style={styles.actionButton}
        >
          <MessageCircle size={32} color='#ffffff' />
          <Text style={styles.actionText}>{post.comments_count || 0}</Text>
        </TouchableOpacity>

        {/* Share Button */}
        <TouchableOpacity style={styles.actionButton}>
          <Share2 size={32} color='#ffffff' />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>

        {/* Views */}
        <View style={styles.actionButton}>
          <Eye size={24} color='#ffffff' opacity={0.7} />
          <Text style={[styles.actionText, { opacity: 0.7 }]}>
            {post.views_count || 0}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width,
    height,
    position: 'relative',
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.1,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  topicsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  topicBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicEmoji: {
    fontSize: 24,
  },
  textContainer: {
    marginBottom: 40,
  },
  contentText: {
    fontSize: 24,
    lineHeight: 36,
    fontWeight: '500',
    textAlign: 'center',
  },
  authorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  authorName: {
    fontSize: 18,
    fontWeight: '600',
  },
  actions: {
    position: 'absolute',
    right: 16,
    bottom: 100,
    gap: 24,
  },
  actionButton: {
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
})
