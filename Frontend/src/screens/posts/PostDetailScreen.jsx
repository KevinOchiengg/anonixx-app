import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
  Share,
  Modal,
  FlatList,
  RefreshControl,
  Vibration,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft,
  Send,
  Play,
  Bookmark,
  Share2,
  Heart,
  MessageCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Reply,
  TrendingUp,
  Clock,
  Flame,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

const { width, height } = Dimensions.get('window');

// NEW Cinematic Coral Theme
const THEME = {
  background: '#0b0f18',
  backgroundDark: '#06080f',
  surface: '#151924',
  surfaceDark: '#10131c',
  primary: '#FF634A',
  primaryDark: '#ff3b2f',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
  avatarBg: '#3a3f50',
  avatarIcon: '#5a5f70',
  input: 'rgba(30, 35, 45, 0.7)',
};

// Starry Background Component
const StarryBackground = () => {
  const stars = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      top: Math.random() * height,
      left: Math.random() * width,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.6 + 0.2,
    }));
  }, []);

  return (
    <>
      {stars.map((star) => (
        <View
          key={star.id}
          style={{
            position: 'absolute',
            backgroundColor: THEME.primary,
            borderRadius: 50,
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
          }}
        />
      ))}
    </>
  );
};

// Full-Screen Image Gallery Modal
const ImageGalleryModal = ({ visible, images, initialIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.galleryModal}>
        <TouchableOpacity style={styles.galleryClose} onPress={onClose}>
          <X size={28} color="#fff" />
        </TouchableOpacity>

        <Image
          source={{ uri: images[currentIndex] }}
          style={styles.galleryImage}
          resizeMode="contain"
        />

        {images.length > 1 && (
          <>
            <TouchableOpacity
              style={styles.galleryPrev}
              onPress={handlePrevious}
            >
              <ChevronLeft size={32} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.galleryNext} onPress={handleNext}>
              <ChevronRight size={32} color="#fff" />
            </TouchableOpacity>

            <View style={styles.galleryIndicator}>
              <Text style={styles.galleryIndicatorText}>
                {currentIndex + 1} / {images.length}
              </Text>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
};

// Video Player Modal
const VideoPlayerModal = ({ visible, videoUrl, onClose }) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.videoModal}>
        <TouchableOpacity style={styles.videoClose} onPress={onClose}>
          <X size={28} color="#fff" />
        </TouchableOpacity>

        <View style={styles.videoPlayerContainer}>
          <Image
            source={{ uri: videoUrl }}
            style={styles.videoPlayer}
            resizeMode="contain"
          />
          <View style={styles.videoPlayOverlay}>
            <View style={styles.videoPlayButton}>
              <Play size={40} color="#1a1f2e" fill="#1a1f2e" />
            </View>
          </View>
          <Text style={styles.videoPlaceholder}>
            Video player would load here
          </Text>
        </View>
      </View>
    </Modal>
  );
};

export default function PostDetailScreen({ route, navigation }) {
  const { post: initialPost } = route.params;
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();

  const [post, setPost] = useState(initialPost);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isLiked, setIsLiked] = useState(initialPost.is_liked || false);
  const [likeCount, setLikeCount] = useState(initialPost.reactions_count || 0);

  // Enhanced features state
  const [sortBy, setSortBy] = useState('recent'); // recent, top, oldest
  const [replyingTo, setReplyingTo] = useState(null);
  const [imageGalleryVisible, setImageGalleryVisible] = useState(false);
  const [imageGalleryIndex, setImageGalleryIndex] = useState(0);
  const [videoModalVisible, setVideoModalVisible] = useState(false);

  useEffect(() => {
    loadThreads();
  }, []);

  const loadThreads = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const headers = {};

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/v1/posts/${post.id}/thread`,
        { headers }
      );

      const data = await response.json();

      if (response.ok) {
        setThreads(data.threads || []);
      }
    } catch (error) {
      console.error('❌ Error loading threads:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Vibration.vibrate(10); // Haptic feedback
    loadThreads();
  }, []);

  const handleLike = async () => {
    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to like posts', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign In',
          onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
        },
      ]);
      return;
    }

    Vibration.vibrate(10); // Haptic feedback

    // Optimistic update
    setIsLiked(!isLiked);
    setLikeCount(isLiked ? likeCount - 1 : likeCount + 1);

    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/like`, {
        method: isLiked ? 'DELETE' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error) {
      // Revert on error
      setIsLiked(isLiked);
      setLikeCount(likeCount);
      console.error('❌ Error liking post:', error);
    }
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to save posts', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign In',
          onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
        },
      ]);
      return;
    }

    Vibration.vibrate(10); // Haptic feedback

    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(
        `${API_BASE_URL}/api/v1/posts/${post.id}/save`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        setPost({ ...post, is_saved: data.saved });
        Alert.alert(
          data.saved ? 'Saved' : 'Removed',
          data.saved
            ? 'Added to your collection'
            : 'Removed from your collection'
        );
      }
    } catch (error) {
      console.error('❌ Error saving:', error);
    }
  };

  const handleShare = async () => {
    try {
      const message = `Check out this post on Anonixx:\n\n"${post.content.substring(0, 100)}${post.content.length > 100 ? '...' : ''}"`;

      await Share.share({
        message,
        title: 'Share from Anonixx',
      });
    } catch (error) {
      console.log('Share error:', error);
    }
  };

  const handleImagePress = (index) => {
    setImageGalleryIndex(index);
    setImageGalleryVisible(true);
  };

  const handleVideoPress = () => {
    setVideoModalVisible(true);
  };

  const handleReplyTo = (thread) => {
    Vibration.vibrate(10);
    setReplyingTo(thread);
    setReplyText(`@${thread.anonymous_name} `);
  };

  const handleAddReply = async () => {
    if (!replyText.trim()) return;

    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to reply', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign In',
          onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
        },
      ]);
      return;
    }

    if (threads.length >= 2) {
      Alert.alert(
        'Thread Closed',
        'This conversation has reached its limit (maximum 2 replies)'
      );
      return;
    }

    setSubmitting(true);
    Vibration.vibrate(10); // Haptic feedback

    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(
        `${API_BASE_URL}/api/v1/posts/${post.id}/thread`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: replyText,
            parent_id: replyingTo?.id || null,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setReplyText('');
        setReplyingTo(null);
        loadThreads();
        Alert.alert('Posted', 'Your reply has been added');
      } else {
        Alert.alert('Error', data.detail || 'Failed to post reply');
      }
    } catch (error) {
      console.error('❌ Error adding reply:', error);
      Alert.alert('Error', 'Failed to post reply');
    } finally {
      setSubmitting(false);
    }
  };

  const sortedThreads = useMemo(() => {
    const sorted = [...threads];
    if (sortBy === 'recent') {
      return sorted; // Already sorted by time
    } else if (sortBy === 'oldest') {
      return sorted.reverse();
    } else if (sortBy === 'top') {
      return sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    }
    return sorted;
  }, [threads, sortBy]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.primary}
            colors={[THEME.primary]}
          />
        }
      >
        {/* Post Card */}
        <View style={styles.postWrapper}>
          <View style={styles.accentBar} />
          <View style={styles.postContainer}>
            {/* Author Header */}
            <View style={styles.postHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {post.anonymous_name?.[0]?.toUpperCase() || 'A'}
                </Text>
              </View>
              <View style={styles.postHeaderInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.username}>
                    {post.anonymous_name || 'Anonymous'}
                  </Text>
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.timestamp}>{post.time_ago}</Text>
                </View>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Content */}
            <Text style={styles.content}>{post.content}</Text>

            {/* Images - Enhanced with Gallery */}
            {post.images && post.images.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.imagesContainer}
              >
                {post.images.map((imageUri, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => handleImagePress(index)}
                    activeOpacity={0.9}
                  >
                    <Image
                      source={{ uri: imageUri }}
                      style={styles.image}
                      resizeMode="cover"
                    />
                    {post.images.length > 1 && (
                      <View style={styles.imageBadge}>
                        <Text style={styles.imageBadgeText}>
                          {index + 1}/{post.images.length}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Video - Enhanced with Modal */}
            {post.video_url && (
              <TouchableOpacity onPress={handleVideoPress} activeOpacity={0.9}>
                <View style={styles.videoContainer}>
                  <Image
                    source={{ uri: post.video_url }}
                    style={styles.videoThumbnail}
                    resizeMode="cover"
                  />
                  <View style={styles.videoOverlay}>
                    <View style={styles.playButton}>
                      <Play size={24} color="#1a1f2e" fill="#1a1f2e" />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            )}

            {/* Divider before actions */}
            <View style={styles.divider} />

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity onPress={handleLike} style={styles.action}>
                <Heart
                  size={20}
                  color={THEME.primary}
                  fill={isLiked ? THEME.primary : 'none'}
                />
                <Text style={[styles.actionCount, { color: THEME.primary }]}>
                  {likeCount}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.action}>
                <MessageCircle size={20} color={THEME.textSecondary} />
                <Text style={styles.actionCount}>{threads.length}</Text>
              </TouchableOpacity>

              <View style={styles.spacer} />

              <TouchableOpacity
                onPress={handleSave}
                style={styles.actionButton}
              >
                <Bookmark
                  size={20}
                  color={post.is_saved ? THEME.primary : THEME.textSecondary}
                  fill={post.is_saved ? THEME.primary : 'none'}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleShare}
                style={styles.actionButton}
              >
                <Share2 size={20} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Replies Section */}
        <View style={styles.repliesSection}>
          {/* Sort Header */}
          <View style={styles.repliesHeader}>
            <Text style={styles.repliesTitle}>
              Replies ({threads.length}/2)
            </Text>

            <View style={styles.sortButtons}>
              <TouchableOpacity
                onPress={() => setSortBy('recent')}
                style={[
                  styles.sortButton,
                  sortBy === 'recent' && styles.sortButtonActive,
                ]}
              >
                <Clock
                  size={14}
                  color={
                    sortBy === 'recent' ? THEME.primary : THEME.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.sortText,
                    sortBy === 'recent' && styles.sortTextActive,
                  ]}
                >
                  Recent
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setSortBy('top')}
                style={[
                  styles.sortButton,
                  sortBy === 'top' && styles.sortButtonActive,
                ]}
              >
                <TrendingUp
                  size={14}
                  color={sortBy === 'top' ? THEME.primary : THEME.textSecondary}
                />
                <Text
                  style={[
                    styles.sortText,
                    sortBy === 'top' && styles.sortTextActive,
                  ]}
                >
                  Top
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setSortBy('oldest')}
                style={[
                  styles.sortButton,
                  sortBy === 'oldest' && styles.sortButtonActive,
                ]}
              >
                <Flame
                  size={14}
                  color={
                    sortBy === 'oldest' ? THEME.primary : THEME.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.sortText,
                    sortBy === 'oldest' && styles.sortTextActive,
                  ]}
                >
                  First
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator
              color={THEME.primary}
              style={{ marginTop: 20 }}
            />
          ) : sortedThreads.length > 0 ? (
            sortedThreads.map((thread) => (
              <View key={thread.id} style={styles.replyWrapper}>
                <View style={styles.replyAccentBar} />
                <View style={styles.replyCard}>
                  <View style={styles.replyHeader}>
                    <View style={styles.replyAvatar}>
                      <Text style={styles.replyAvatarText}>
                        {thread.anonymous_name?.[0]?.toUpperCase() || 'A'}
                      </Text>
                    </View>
                    <View style={styles.replyHeaderInfo}>
                      <Text style={styles.replyUsername}>
                        {thread.is_own_reply
                          ? 'You'
                          : thread.anonymous_name || 'Anonymous'}
                      </Text>
                      <Text style={styles.replyTime}>{thread.time_ago}</Text>
                    </View>

                    {/* Inline Reply Button */}
                    <TouchableOpacity
                      onPress={() => handleReplyTo(thread)}
                      style={styles.replyIconButton}
                    >
                      <Reply size={18} color={THEME.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.replyText}>{thread.content}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.noReplies}>
              No replies yet. Be the first to respond.
            </Text>
          )}

          {threads.length >= 2 && (
            <View style={styles.closedBanner}>
              <Text style={styles.closedText}>
                Thread closed - Preserved for reading
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Reply Input */}
      {threads.length < 2 && (
        <View style={styles.replyInputContainer}>
          {replyingTo && (
            <View style={styles.replyingToBar}>
              <Text style={styles.replyingToText}>
                Replying to {replyingTo.anonymous_name}
              </Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <X size={16} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.inputRow}>
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder={
                isAuthenticated
                  ? 'Add a thoughtful reply...'
                  : 'Sign in to reply...'
              }
              placeholderTextColor={THEME.textSecondary}
              style={styles.replyInput}
              multiline
              maxLength={500}
              editable={isAuthenticated}
            />
            <TouchableOpacity
              onPress={handleAddReply}
              disabled={!replyText.trim() || submitting}
              style={[
                styles.sendButton,
                {
                  backgroundColor:
                    replyText.trim() && !submitting
                      ? THEME.primary
                      : THEME.border,
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Send size={20} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Image Gallery Modal */}
      {post.images && (
        <ImageGalleryModal
          visible={imageGalleryVisible}
          images={post.images}
          initialIndex={imageGalleryIndex}
          onClose={() => setImageGalleryVisible(false)}
        />
      )}

      {/* Video Player Modal */}
      <VideoPlayerModal
        visible={videoModalVisible}
        videoUrl={post.video_url}
        onClose={() => setVideoModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME.text,
  },
  scrollView: {
    flex: 1,
  },
  // Post Card
  postWrapper: {
    position: 'relative',
    margin: 16,
    marginBottom: 24,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    zIndex: 1,
  },
  postContainer: {
    backgroundColor: THEME.surface,
    padding: 22,
    paddingLeft: 28,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 10,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: THEME.avatarIcon,
  },
  postHeaderInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME.text,
  },
  dot: {
    fontSize: 14,
    color: THEME.textSecondary,
  },
  timestamp: {
    fontSize: 14,
    color: THEME.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.border,
    marginVertical: 14,
  },
  content: {
    fontSize: 17,
    lineHeight: 27,
    color: THEME.text,
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  imagesContainer: {
    marginBottom: 16,
  },
  image: {
    width: width - 80,
    height: 250,
    borderRadius: 12,
    marginRight: 8,
  },
  imageBadge: {
    position: 'absolute',
    bottom: 12,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  imageBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  videoContainer: {
    position: 'relative',
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    height: 250,
    backgroundColor: '#1a1f2e',
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionCount: {
    fontSize: 16,
    fontWeight: '500',
    color: THEME.textSecondary,
  },
  spacer: {
    flex: 1,
  },
  actionButton: {
    padding: 8,
  },
  // Replies Section
  repliesSection: {
    padding: 16,
  },
  repliesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  repliesTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: THEME.text,
  },
  sortButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: THEME.surface,
  },
  sortButtonActive: {
    backgroundColor: 'rgba(255, 99, 74, 0.1)',
  },
  sortText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.textSecondary,
  },
  sortTextActive: {
    color: THEME.primary,
  },
  replyWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  replyAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    opacity: 0.6,
  },
  replyCard: {
    backgroundColor: THEME.surface,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  replyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  replyAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME.avatarIcon,
  },
  replyHeaderInfo: {
    flex: 1,
  },
  replyUsername: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME.text,
    marginBottom: 2,
  },
  replyTime: {
    fontSize: 12,
    color: THEME.textSecondary,
  },
  replyIconButton: {
    padding: 8,
  },
  replyText: {
    fontSize: 16,
    lineHeight: 24,
    color: THEME.text,
    letterSpacing: 0.2,
  },
  noReplies: {
    textAlign: 'center',
    fontSize: 15,
    color: THEME.textSecondary,
    fontStyle: 'italic',
    marginVertical: 32,
  },
  closedBanner: {
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(255, 99, 74, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 99, 74, 0.15)',
  },
  closedText: {
    fontSize: 14,
    fontWeight: '500',
    fontStyle: 'italic',
    color: THEME.textSecondary,
  },
  // Reply Input
  replyInputContainer: {
    backgroundColor: THEME.surface,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    paddingBottom: 16,
  },
  replyingToBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 99, 74, 0.08)',
  },
  replyingToText: {
    fontSize: 13,
    color: THEME.primary,
    fontStyle: 'italic',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    gap: 12,
  },
  replyInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: THEME.text,
    backgroundColor: THEME.input,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Image Gallery Modal
  galleryModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  galleryImage: {
    width: width,
    height: height * 0.8,
  },
  galleryPrev: {
    position: 'absolute',
    left: 20,
    top: '50%',
    marginTop: -25,
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 25,
  },
  galleryNext: {
    position: 'absolute',
    right: 20,
    top: '50%',
    marginTop: -25,
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 25,
  },
  galleryIndicator: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  galleryIndicatorText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Video Modal
  videoModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  videoPlayerContainer: {
    width: width,
    height: height * 0.6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  videoPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlaceholder: {
    position: 'absolute',
    bottom: 40,
    color: THEME.textSecondary,
    fontSize: 14,
    fontStyle: 'italic',
  },
});
