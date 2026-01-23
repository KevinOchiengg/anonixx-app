import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Modal,
  Share,
  Alert,
  Clipboard,
  Image,
  ScrollView,
} from 'react-native'
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreHorizontal,
  Flag,
  UserX,
  Link,
  EyeOff,
  X,
  Play,
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
  onPress, // ✅ NEW: For making card clickable
  navigation,
}) {
  const { theme } = useTheme()
  const { isAuthenticated } = useAuth()
  const [selectedResponse, setSelectedResponse] = useState(post.user_response)
  const [menuVisible, setMenuVisible] = useState(false)

  useEffect(() => {
    // Track views (optional auth)
    if (post.id) {
      trackView()
    }
  }, [post.id])

  const trackView = async () => {
    try {
      const token = await AsyncStorage.getItem('token')
      const headers = {}

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      await fetch(
        `https://ulysses-apronlike-alethia.ngrok-free.dev/api/v1/posts/${post.id}/view`,
        {
          method: 'POST',
          headers,
        },
      )
    } catch (error) {
      // Silently fail
      console.log('View tracking failed:', error)
    }
  }

  const handleResponse = (type) => {
    const newResponse = type === selectedResponse ? null : type
    setSelectedResponse(newResponse)
    onResponse(post.id, type)
  }

  const handleSave = () => {
    onSave(post.id)
  }

  const handleViewThread = () => {
    onViewThread(post.id)
  }

  const handleShare = async () => {
    try {
      const message = `Check out this post on Anonixx:\n\n"${post.content.substring(0, 100)}${post.content.length > 100 ? '...' : ''}"`

      await Share.share({
        message,
        title: 'Share from Anonixx',
      })
    } catch (error) {
      console.log('Share error:', error)
    }
  }

  const handleCopyLink = () => {
    const link = `anonixx://post/${post.id}`
    Clipboard.setString(link)
    setMenuVisible(false)
    Alert.alert('Link Copied', 'Post link copied to clipboard')
  }

  const handleReport = () => {
    setMenuVisible(false)

    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to report posts', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign In',
          onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
        },
      ])
      return
    }

    Alert.alert('Report Post', 'Why are you reporting this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Harmful Content',
        onPress: () => submitReport('harmful'),
      },
      {
        text: 'Spam',
        onPress: () => submitReport('spam'),
      },
      {
        text: 'Inappropriate',
        onPress: () => submitReport('inappropriate'),
      },
    ])
  }

  const submitReport = async (reason) => {
    try {
      const token = await AsyncStorage.getItem('token')

      const response = await fetch(
        `https://ulysses-apronlike-alethia.ngrok-free.dev/api/v1/posts/${post.id}/report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reason }),
        },
      )

      if (response.ok) {
        Alert.alert('Reported', 'Thank you for helping keep Anonixx safe')
      } else {
        Alert.alert('Error', 'Failed to report post')
      }
    } catch (error) {
      console.error('Report error:', error)
      Alert.alert('Error', 'Failed to report post')
    }
  }

  const handleBlockUser = () => {
    setMenuVisible(false)

    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to block users', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign In',
          onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
        },
      ])
      return
    }

    Alert.alert(
      'Block User',
      `Block ${post.anonymous_name}? You won't see their posts anymore.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => submitBlock(),
        },
      ],
    )
  }

  const submitBlock = async () => {
    try {
      const token = await AsyncStorage.getItem('token')

      const response = await fetch(`https://ulysses-apronlike-alethia.ngrok-free.dev/api/v1/users/block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: post.user_id }),
      })

      if (response.ok) {
        Alert.alert('Blocked', 'You will no longer see posts from this user')
      } else {
        Alert.alert('Error', 'Failed to block user')
      }
    } catch (error) {
      console.error('Block error:', error)
      Alert.alert('Error', 'Failed to block user')
    }
  }

  const handleHidePost = () => {
    setMenuVisible(false)
    Alert.alert('Post Hidden', 'This post has been hidden from your feed')
    // You can implement actual hiding logic here
  }

  // ✅ NEW: Handle card press
  const handleCardPress = () => {
    if (onPress) {
      onPress(post)
    }
  }

  const styles = createStyles(theme)

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface }]}
      onPress={handleCardPress}
      activeOpacity={0.95}
    >
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
        <TouchableOpacity
          style={styles.moreButton}
          onPress={(e) => {
            e.stopPropagation() // ✅ Prevent card click
            setMenuVisible(true)
          }}
        >
          <MoreHorizontal size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <Text style={[styles.content, { color: theme.text }]}>
        {post.content}
      </Text>

      {/* ✅ NEW: Images */}
      {post.images && post.images.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.imagesContainer}
        >
          {post.images.map((imageUrl, index) => (
            <Image
              key={index}
              source={{ uri: imageUrl }}
              style={styles.postImage}
              resizeMode='cover'
            />
          ))}
        </ScrollView>
      )}

      {/* ✅ NEW: Video */}
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
            onPress={(e) => {
              e.stopPropagation() // ✅ Prevent card click
              handleResponse(option)
            }}
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
      <View style={[styles.actions, { borderTopColor: theme.border }]}>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation() // ✅ Prevent card click
            handleViewThread()
          }}
          style={styles.action}
        >
          <MessageCircle size={18} color={theme.textSecondary} />
          <Text style={[styles.actionText, { color: theme.textSecondary }]}>
            {post.thread_count || 0}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation() // ✅ Prevent card click
            handleSave()
          }}
          style={styles.action}
        >
          <Bookmark
            size={18}
            color={post.is_saved ? theme.primary : theme.textSecondary}
            fill={post.is_saved ? theme.primary : 'none'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation() // ✅ Prevent card click
            handleShare()
          }}
          style={styles.action}
        >
          <Share2 size={18} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* 3 Dots Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType='fade'
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View
            style={[styles.menuContainer, { backgroundColor: theme.surface }]}
          >
            <View style={styles.menuHeader}>
              <Text style={[styles.menuTitle, { color: theme.text }]}>
                Post Options
              </Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)}>
                <X size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: theme.border }]}
              onPress={handleCopyLink}
            >
              <Link size={20} color={theme.textSecondary} />
              <Text style={[styles.menuItemText, { color: theme.text }]}>
                Copy Link
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: theme.border }]}
              onPress={handleHidePost}
            >
              <EyeOff size={20} color={theme.textSecondary} />
              <Text style={[styles.menuItemText, { color: theme.text }]}>
                Hide Post
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: theme.border }]}
              onPress={handleReport}
            >
              <Flag size={20} color='#FF6B6B' />
              <Text style={[styles.menuItemText, { color: '#FF6B6B' }]}>
                Report Post
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleBlockUser}>
              <UserX size={20} color='#FF6B6B' />
              <Text style={[styles.menuItemText, { color: '#FF6B6B' }]}>
                Block User
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: theme.card }]}
              onPress={() => setMenuVisible(false)}
            >
              <Text style={[styles.cancelButtonText, { color: theme.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </TouchableOpacity>
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
    // ✅ NEW: Image styles
    imagesContainer: {
      marginBottom: 12,
    },
    postImage: {
      width: width - 64, // Card width minus padding
      height: 250,
      borderRadius: 12,
      marginRight: 8,
    },
    // ✅ NEW: Video styles
    videoContainer: {
      position: 'relative',
      marginBottom: 12,
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
      marginLeft: -20,
      marginTop: -20,
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
    // Modal Styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      justifyContent: 'flex-end',
    },
    menuContainer: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 20,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: -4,
      },
      shadowOpacity: 0.3,
      shadowRadius: 5,
      elevation: 10,
    },
    menuHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    menuTitle: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 18,
      gap: 14,
      borderBottomWidth: 1,
    },
    menuItemText: {
      fontSize: 16,
      fontWeight: '500',
    },
    cancelButton: {
      margin: 20,
      padding: 18,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
  })