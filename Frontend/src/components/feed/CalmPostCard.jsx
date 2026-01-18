import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native'
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreHorizontal,
} from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'

const { width } = Dimensions.get('window')

const RESPONSE_LABELS = {
  felt_this: 'I felt this',
  not_alone: "You're not alone",
  hear_you: 'I hear you',
  holding_with_you: 'Holding this with you',
  sending_strength: 'Sending strength',
  this_matters: 'This matters',
}

export default function CalmPostCard({
  post,
  onResponse,
  onSave,
  onViewThread,
  navigation,
}) {
  const { theme } = useTheme()
  const { isAuthenticated } = useAuth()
  const [selectedResponse, setSelectedResponse] = useState(post.user_response)

  useEffect(() => {
    // Only track views for authenticated users
    if (isAuthenticated && post.id) {
      trackView()
    }
  }, [post.id, isAuthenticated])

  const trackView = async () => {
    try {
      const token = await AsyncStorage.getItem('token')

      if (!token) return

      await fetch(`http://localhost:8000/api/v1/posts/${post.id}/view`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    } catch (error) {
      // Silently fail for guests
      console.log('View tracking skipped (guest user)')
    }
  }

  const handleResponse = (type) => {
    setSelectedResponse(type === selectedResponse ? null : type)
    onResponse(post.id, type)
  }

  const handleSave = () => {
    onSave(post.id)
  }

  const handleViewThread = () => {
    onViewThread(post.id)
  }

  const styles = createStyles(theme)

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.authorInfo}>
          <View
            style={[styles.avatar, { backgroundColor: theme.primary + '20' }]}
          >
            <Text style={[styles.avatarText, { color: theme.primary }]}>
              {post.anonymous_name?.[0] || 'A'}
            </Text>
          </View>
          <View>
            <Text style={[styles.authorName, { color: theme.text }]}>
              {post.anonymous_name || 'Anonymous'}
            </Text>
            <Text style={[styles.timestamp, { color: theme.textTertiary }]}>
              {post.time_ago}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.moreButton}>
          <MoreHorizontal size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <Text style={[styles.content, { color: theme.text }]}>
        {post.content}
      </Text>

      {/* Topics */}
      {post.topics && post.topics.length > 0 && (
        <View style={styles.topics}>
          {post.topics.slice(0, 3).map((topic, index) => (
            <View
              key={index}
              style={[styles.topic, { backgroundColor: theme.card }]}
            >
              <Text style={[styles.topicText, { color: theme.textSecondary }]}>
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
                  selectedResponse === option ? theme.primary : theme.border,
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
      <View style={styles.actions}>
        <TouchableOpacity onPress={handleViewThread} style={styles.action}>
          <MessageCircle size={18} color={theme.textSecondary} />
          <Text style={[styles.actionText, { color: theme.textSecondary }]}>
            {post.thread_count || 0}
          </Text>
        </TouchableOpacity>

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
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    card: {
      padding: 16,
      marginBottom: 12,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    authorInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    authorName: {
      fontSize: 14,
      fontWeight: '600',
    },
    timestamp: {
      fontSize: 12,
    },
    moreButton: {
      padding: 8,
    },
    content: {
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 12,
    },
    topics: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    topic: {
      paddingHorizontal: 12,
      paddingVertical: 4,
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
      marginBottom: 12,
    },
    responseButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
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
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.border,
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
  })
