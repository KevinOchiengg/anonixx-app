import React, { useState, useEffect, useRef } from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { Heart, MessageCircle, Eye, Play, Pause } from 'lucide-react-native'
import { Video, ResizeMode } from 'expo-av'
import { Audio } from 'expo-av'
import { useTheme } from '../context/ThemeContext'

function PostCard({ post, onPress }) {
  const { theme } = useTheme()
  const [sound, setSound] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef(null)
  const [videoStatus, setVideoStatus] = useState({})

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
        { shouldPlay: true },
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

  const handleVideoPress = async () => {
    if (!videoRef.current) return

    try {
      if (videoStatus.isPlaying) {
        await videoRef.current.pauseAsync()
      } else {
        await videoRef.current.playAsync()
      }
    } catch (error) {
      console.error('Error controlling video:', error)
    }
  }

  const formatTime = (millis) => {
    if (!millis) return '0:00'
    const totalSeconds = Math.floor(millis / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
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

      {post.content && (
        <Text style={[styles.content, { color: theme.text }]} numberOfLines={5}>
          {post.content}
        </Text>
      )}

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
              resizeMode='cover'
            />
          ))}
        </View>
      )}

      {post.video_url && (
        <View style={styles.videoWrapper}>
          <Video
            ref={videoRef}
            source={{ uri: post.video_url }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            isLooping={false}
            onPlaybackStatusUpdate={(status) => setVideoStatus(status)}
          />

          <TouchableOpacity
            onPress={handleVideoPress}
            style={styles.videoOverlay}
            activeOpacity={0.7}
          >
            <View style={styles.playButton}>
              {videoStatus.isPlaying ? (
                <Pause size={40} color='#ffffff' fill='#ffffff' />
              ) : (
                <Play size={40} color='#ffffff' fill='#ffffff' />
              )}
            </View>
          </TouchableOpacity>

          {videoStatus.durationMillis > 0 && (
            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${(videoStatus.positionMillis / videoStatus.durationMillis) * 100}%`,
                    backgroundColor: theme.primary,
                  },
                ]}
              />
            </View>
          )}

          {videoStatus.durationMillis > 0 && (
            <View style={styles.durationContainer}>
              <Text style={styles.durationText}>
                {formatTime(videoStatus.positionMillis)} /{' '}
                {formatTime(videoStatus.durationMillis)}
              </Text>
            </View>
          )}
        </View>
      )}

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
    videoWrapper: {
      position: 'relative',
      width: '100%',
      height: 300,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 12,
      backgroundColor: '#000',
    },
    video: {
      width: '100%',
      height: '100%',
    },
    videoOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    playButton: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    progressBarContainer: {
      position: 'absolute',
      bottom: 30,
      left: 12,
      right: 12,
      height: 4,
      backgroundColor: 'rgba(255,255,255,0.3)',
      borderRadius: 2,
    },
    progressBar: {
      height: '100%',
      borderRadius: 2,
    },
    durationContainer: {
      position: 'absolute',
      bottom: 8,
      right: 12,
      backgroundColor: 'rgba(0,0,0,0.7)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
    },
    durationText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '600',
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

const areEqual = (prevProps, nextProps) => {
  return prevProps.post.id === nextProps.post.id
}

export default React.memo(PostCard, areEqual)
