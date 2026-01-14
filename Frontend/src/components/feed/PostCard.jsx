import React, { useState, useEffect } from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { Heart, MessageCircle, Eye, Play } from 'lucide-react-native'
import { Video } from 'expo-av'
import { Audio } from 'expo-av'
import { useTheme } from '../../context/ThemeContext'

export default function PostCard({ post, onPress }) {
  const { theme } = useTheme()
  const [sound, setSound] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync()
      }
    }
  }, [sound])

  const playAudio = async () => {
    try {
      if (sound) {
        await sound.unloadAsync()
        setSound(null)
        setIsPlaying(false)
        return
      }

      const { sound: audioSound } = await Audio.Sound.createAsync(
        { uri: post.audio_url },
        { shouldPlay: true }
      )

      setSound(audioSound)
      setIsPlaying(true)

      audioSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setIsPlaying(false)
          setSound(null)
        }
      })
    } catch (error) {
      console.error('Error playing audio:', error)
    }
  }

  const styles = createStyles(theme)

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
      activeOpacity={0.9}
    >
      {/* User Info */}
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <Text style={styles.avatarText}>
            {post.is_anonymous
              ? post.anonymous_name?.charAt(0) || '?'
              : post.user?.username?.charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={[styles.username, { color: theme.text }]}>
            {post.is_anonymous
              ? post.anonymous_name
              : post.user?.username || 'Anonymous'}
          </Text>
          <Text style={[styles.timestamp, { color: theme.textSecondary }]}>
            {new Date(post.created_at).toLocaleDateString()}
          </Text>
        </View>
      </View>

      {/* Content */}
      {post.content && (
        <Text style={[styles.content, { color: theme.text }]}>
          {post.content}
        </Text>
      )}

      {/* Images */}
      {post.images && post.images.length > 0 && (
        <View style={styles.imagesContainer}>
          {post.images.slice(0, 4).map((imageUrl, index) => (
            <Image
              key={index}
              source={{ uri: imageUrl }}
              style={[
                styles.image,
                post.images.length === 1 && styles.singleImage,
                post.images.length === 2 && styles.doubleImage,
                post.images.length > 2 && styles.multiImage,
              ]}
            />
          ))}
        </View>
      )}

      {/* Video */}
      {post.video_url && (
        <Video
          source={{ uri: post.video_url }}
          style={styles.video}
          useNativeControls
          resizeMode='contain'
        />
      )}

      {/* Audio */}
      {post.audio_url && (
        <TouchableOpacity
          onPress={playAudio}
          style={[
            styles.audioContainer,
            { backgroundColor: theme.primaryLight, borderColor: theme.primary },
          ]}
        >
          <Play size={24} color={theme.primary} />
          <Text style={[styles.audioText, { color: theme.primary }]}>
            {isPlaying ? 'Playing...' : 'Play Audio'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Stats */}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Heart
            size={20}
            color={post.user_reaction ? theme.error : theme.textSecondary}
            fill={post.user_reaction ? theme.error : 'none'}
          />
          <Text style={[styles.statText, { color: theme.textSecondary }]}>
            {post.reactions_count || 0}
          </Text>
        </View>
        <View style={styles.stat}>
          <MessageCircle size={20} color={theme.textSecondary} />
          <Text style={[styles.statText, { color: theme.textSecondary }]}>
            {post.comments_count || 0}
          </Text>
        </View>
        <View style={styles.stat}>
          <Eye size={20} color={theme.textSecondary} />
          <Text style={[styles.statText, { color: theme.textSecondary }]}>
            {post.views_count || 0}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginVertical: 8,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    avatarText: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: 'bold',
    },
    userInfo: {
      flex: 1,
    },
    username: {
      fontSize: 16,
      fontWeight: '600',
    },
    timestamp: {
      fontSize: 12,
      marginTop: 2,
    },
    content: {
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 12,
    },
    imagesContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginBottom: 12,
    },
    image: {
      borderRadius: 8,
    },
    singleImage: {
      width: '100%',
      height: 300,
    },
    doubleImage: {
      width: '49%',
      height: 200,
    },
    multiImage: {
      width: '49%',
      height: 150,
    },
    video: {
      width: '100%',
      height: 300,
      borderRadius: 8,
      marginBottom: 12,
    },
    audioContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 8,
      marginBottom: 12,
      borderWidth: 1,
    },
    audioText: {
      marginLeft: 12,
      fontSize: 16,
      fontWeight: '600',
    },
    stats: {
      flexDirection: 'row',
      gap: 24,
    },
    stat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statText: {
      fontSize: 14,
    },
  })
