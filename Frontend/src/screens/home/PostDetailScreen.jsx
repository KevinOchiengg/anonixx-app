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
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Send,
  Play,
} from 'lucide-react-native'
import { Video } from 'expo-av'
import { Audio } from 'expo-av'

export default function PostDetailScreen({ route, navigation }) {
  const { postId } = route.params
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [liking, setLiking] = useState(false)
  const [sound, setSound] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    loadPost()
    loadComments()

    return () => {
      if (sound) {
        sound.unloadAsync()
      }
    }
  }, [postId])

  const loadPost = async () => {
    try {
      const token = await AsyncStorage.getItem('token')
      const response = await fetch(
        `http://192.168.100.22:8000/api/v1/posts/${postId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      const data = await response.json()
      setPost(data)
      setLiked(data.user_reaction !== null)
      setLikeCount(data.reactions_count || 0)
    } catch (error) {
      console.error('❌ Error loading post:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadComments = async () => {
    try {
      const token = await AsyncStorage.getItem('token')
      const response = await fetch(
        `http://192.168.100.22:8000/api/v1/posts/${postId}/comments`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      const data = await response.json()
      setComments(data)
    } catch (error) {
      console.error('❌ Error loading comments:', error)
    }
  }

  const handleLike = async () => {
    if (liking) return

    setLiking(true)
    try {
      const token = await AsyncStorage.getItem('token')

      if (liked) {
        await fetch(`http://192.168.100.22:8000/api/v1/posts/${postId}/react`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
        setLiked(false)
        setLikeCount((prev) => Math.max(0, prev - 1))
      } else {
        await fetch(`http://192.168.100.22:8000/api/v1/posts/${postId}/react`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reaction_type: 'like' }),
        })
        setLiked(true)
        setLikeCount((prev) => prev + 1)
      }
    } catch (error) {
      console.error('❌ Error liking post:', error)
    } finally {
      setLiking(false)
    }
  }

  const playAudio = async () => {
    try {
      if (sound) {
        await sound.unloadAsync()
        setSound(null)
        setIsPlaying(false)
        return
      }

      console.log('▶️ Playing audio...')
      const { sound: audioSound } = await Audio.Sound.createAsync(
        { uri: post.audio_url },
        { shouldPlay: true }
      )

      setSound(audioSound)
      setIsPlaying(true)

      audioSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setSound(null)
          setIsPlaying(false)
        }
      })
    } catch (error) {
      console.error('❌ Error playing audio:', error)
    }
  }

  const handleAddComment = async () => {
    if (!commentText.trim()) return

    setSubmitting(true)
    try {
      const token = await AsyncStorage.getItem('token')
      const response = await fetch(
        `http://192.168.100.22:8000/api/v1/posts/${postId}/comments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: commentText, is_anonymous: false }),
        }
      )

      if (response.ok) {
        setCommentText('')
        loadComments()
        loadPost()
      }
    } catch (error) {
      console.error('❌ Error adding comment:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const formatTime = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)

    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size='large' color='#a855f7' style={styles.loader} />
      </SafeAreaView>
    )
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Post not found</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color='#ffffff' />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Post */}
        <View style={styles.postContainer}>
          <View style={styles.postHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {post.is_anonymous ? '🎭' : '👤'}
              </Text>
            </View>
            <View style={styles.postHeaderInfo}>
              <Text style={styles.username}>
                {post.is_anonymous
                  ? post.anonymous_name || 'Anonymous'
                  : post.user?.username || 'User'}
              </Text>
              <Text style={styles.timestamp}>
                {formatTime(post.created_at)}
              </Text>
            </View>
          </View>

          <Text style={styles.content}>{post.content}</Text>

          {/* Images */}
          {post.images && post.images.length > 0 && (
            <View style={styles.imagesContainer}>
              {post.images.map((imageUri, index) => (
                <Image
                  key={index}
                  source={{ uri: imageUri }}
                  style={styles.image}
                  resizeMode='cover'
                />
              ))}
            </View>
          )}

          {/* Video */}
          {post.video_url && (
            <View style={styles.videoContainer}>
              <Video
                source={{ uri: post.video_url }}
                style={styles.video}
                useNativeControls
                resizeMode='contain'
              />
            </View>
          )}

          {/* Audio */}
          {post.audio_url && (
            <TouchableOpacity onPress={playAudio} style={styles.audioContainer}>
              <View style={styles.audioIcon}>
                <Play size={32} color={isPlaying ? '#14b8a6' : '#a855f7'} />
              </View>
              <View style={styles.audioInfo}>
                <Text style={styles.audioTitle}>Audio Message</Text>
                <Text style={styles.audioSubtitle}>
                  {isPlaying ? 'Playing...' : 'Tap to play'}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleLike}
              disabled={liking}
            >
              <Heart
                size={24}
                color={liked ? '#ef4444' : '#6b7280'}
                fill={liked ? '#ef4444' : 'none'}
              />
              <Text
                style={[styles.actionText, liked && styles.actionTextLiked]}
              >
                {likeCount}
              </Text>
            </TouchableOpacity>

            <View style={styles.actionButton}>
              <MessageCircle size={24} color='#6b7280' />
              <Text style={styles.actionText}>{post.comments_count || 0}</Text>
            </View>
          </View>
        </View>

        {/* Comments Section */}
        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>Comments ({comments.length})</Text>

          {comments.map((comment) => (
            <View key={comment.id} style={styles.comment}>
              <View style={styles.commentAvatar}>
                <Text style={styles.commentAvatarText}>
                  {comment.is_anonymous ? '🎭' : '👤'}
                </Text>
              </View>
              <View style={styles.commentContent}>
                <Text style={styles.commentUsername}>
                  {comment.is_anonymous
                    ? comment.anonymous_name || 'Anonymous'
                    : comment.user?.username || 'User'}
                </Text>
                <Text style={styles.commentText}>{comment.content}</Text>
                <Text style={styles.commentTime}>
                  {formatTime(comment.created_at)}
                </Text>
              </View>
            </View>
          ))}

          {comments.length === 0 && (
            <Text style={styles.noComments}>
              No comments yet. Be the first!
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Comment Input */}
      <View style={styles.commentInputContainer}>
        <TextInput
          value={commentText}
          onChangeText={setCommentText}
          placeholder='Add a comment...'
          placeholderTextColor='#6b7280'
          style={styles.commentInput}
          multiline
        />
        <TouchableOpacity
          onPress={handleAddComment}
          disabled={!commentText.trim() || submitting}
          style={[
            styles.sendButton,
            (!commentText.trim() || submitting) && styles.sendButtonDisabled,
          ]}
        >
          {submitting ? (
            <ActivityIndicator size='small' color='#ffffff' />
          ) : (
            <Send size={20} color='#ffffff' />
          )}
        </TouchableOpacity>
      </View>
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
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
  scrollView: { flex: 1 },
  loader: { marginTop: 100 },
  errorText: { color: '#ffffff', textAlign: 'center', marginTop: 100 },
  postContainer: {
    backgroundColor: '#16213e',
    padding: 16,
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  postHeader: { flexDirection: 'row', marginBottom: 16 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#a855f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 24 },
  postHeaderInfo: { flex: 1 },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  timestamp: { fontSize: 12, color: '#6b7280' },
  content: { fontSize: 16, color: '#ffffff', lineHeight: 24, marginBottom: 16 },
  imagesContainer: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 300,
    marginBottom: 8,
  },
  videoContainer: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0a0a1a',
  },
  video: {
    width: '100%',
    height: 300,
  },
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a1a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  audioIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  audioInfo: {
    flex: 1,
  },
  audioTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  audioSubtitle: {
    color: '#6b7280',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
    padding: 4,
  },
  actionText: {
    color: '#6b7280',
    fontSize: 16,
    marginLeft: 8,
    fontWeight: '600',
  },
  actionTextLiked: { color: '#ef4444' },
  commentsSection: { padding: 16 },
  commentsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  comment: {
    flexDirection: 'row',
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#16213e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#a855f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  commentAvatarText: { fontSize: 18 },
  commentContent: { flex: 1 },
  commentUsername: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  commentText: {
    fontSize: 14,
    color: '#ffffff',
    lineHeight: 20,
    marginBottom: 4,
  },
  commentTime: { fontSize: 11, color: '#6b7280' },
  noComments: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 14,
    marginTop: 32,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    backgroundColor: '#16213e',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#0a0a1a',
    color: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#374151',
    marginRight: 12,
    maxHeight: 100,
  },
  sendButton: {
    width: 48,
    height: 48,
    backgroundColor: '#14b8a6',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 },
})
