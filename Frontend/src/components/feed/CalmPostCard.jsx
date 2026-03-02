import React, { useState, useEffect } from 'react';
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
  Animated,
  TouchableWithoutFeedback,
} from 'react-native';

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
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

const { width } = Dimensions.get('window');

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
};

// ==================== DOUBLE TAP LIKE COMPONENT ====================
const DoubleTapLike = ({ children, onDoubleTap, disabled = false }) => {
  const [showHeart, setShowHeart] = useState(false);
  const [scaleAnim] = useState(new Animated.Value(0));
  const [opacityAnim] = useState(new Animated.Value(1));
  const [lastTap, setLastTap] = useState(null);

  const handleTap = () => {
    if (disabled) return;

    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (lastTap && now - lastTap < DOUBLE_TAP_DELAY) {
      handleDoubleTap();
    } else {
      setLastTap(now);
    }
  };

  const handleDoubleTap = () => {
    setShowHeart(true);
    scaleAnim.setValue(0);
    opacityAnim.setValue(1);

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 1000,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowHeart(false);
    });

    if (onDoubleTap) {
      onDoubleTap();
    }
  };

  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.doubleTapContainer}>
        {children}
        {showHeart && (
          <Animated.View
            style={[
              styles.heartAnimation,
              {
                transform: [{ scale: scaleAnim }],
                opacity: opacityAnim,
              },
            ]}
            pointerEvents="none"
          >
            <Heart size={80} color={THEME.primary} fill={THEME.primary} />
          </Animated.View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
};

function CalmPostCard({
  post,
  onResponse,
  onSave,
  onViewThread,
  onPress,
  navigation,
}) {
  const { isAuthenticated } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);

  // ✅ NEW: Like state
  const [liked, setLiked] = useState(post.is_liked || false);
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [animating, setAnimating] = useState(false);
  const [scaleAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (post.id) {
      trackView();
    }
  }, [post.id]);

  // ✅ NEW: Update like state when post changes
  useEffect(() => {
    setLiked(post.is_liked || false);
    setLikesCount(post.likes_count || 0);
  }, [post.is_liked, post.likes_count]);

  const trackView = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const headers = {};

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/view`, {
        method: 'POST',
        headers,
      });
    } catch (error) {
      console.log('View tracking failed:', error);
    }
  };

  // ✅ NEW: Handle like/unlike
  const handleLike = async () => {
    if (animating) return;

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

    setAnimating(true);
    const newLiked = !liked;
    const newCount = newLiked ? likesCount + 1 : likesCount - 1;

    // Optimistic update
    setLiked(newLiked);
    setLikesCount(newCount);

    // Animate
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.3,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => setAnimating(false));

    // Call API
    try {
      const token = await AsyncStorage.getItem('token');
      const endpoint = `${API_BASE_URL}/api/v1/posts/${post.id}/like`;

      const response = await fetch(endpoint, {
        method: newLiked ? 'POST' : 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok) {
        setLiked(data.liked);
        setLikesCount(data.likes_count);
      } else {
        // Revert on error
        setLiked(!newLiked);
        setLikesCount(liked ? likesCount + 1 : likesCount - 1);
        console.error('Like error:', data);
      }
    } catch (error) {
      // Revert on error
      setLiked(!newLiked);
      setLikesCount(liked ? likesCount + 1 : likesCount - 1);
      console.error('Like error:', error);
    }
  };

  // ✅ NEW: Handle double tap like
  const handleDoubleTap = async () => {
    if (!liked && isAuthenticated) {
      try {
        const token = await AsyncStorage.getItem('token');
        const response = await fetch(
          `${API_BASE_URL}/api/v1/posts/${post.id}/like`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const data = await response.json();

        if (response.ok) {
          setLiked(data.liked);
          setLikesCount(data.likes_count);
        }
      } catch (error) {
        console.error('Double tap like error:', error);
      }
    }
  };

  const handleSave = () => {
    setMenuVisible(false);
    onSave(post.id);
  };

  const handleViewThread = () => {
    onViewThread(post.id);
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

  const handleCopyLink = () => {
    const link = `anonixx://post/${post.id}`;
    Clipboard.setString(link);
    setMenuVisible(false);
    Alert.alert('Link Copied', 'Post link copied to clipboard');
  };

  const handleReport = () => {
    setMenuVisible(false);

    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to report posts', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign In',
          onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
        },
      ]);
      return;
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
    ]);
  };

  const submitReport = async (reason) => {
    try {
      const token = await AsyncStorage.getItem('token');

      const response = await fetch(
        `${API_BASE_URL}/api/v1/posts/${post.id}/report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reason }),
        }
      );

      if (response.ok) {
        Alert.alert('Reported', 'Thank you for helping keep Anonixx safe');
      } else {
        Alert.alert('Error', 'Failed to report post');
      }
    } catch (error) {
      console.error('Report error:', error);
      Alert.alert('Error', 'Failed to report post');
    }
  };

  const handleBlockUser = () => {
    setMenuVisible(false);

    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to block users', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign In',
          onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
        },
      ]);
      return;
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
      ]
    );
  };

  const submitBlock = async () => {
    try {
      const token = await AsyncStorage.getItem('token');

      const response = await fetch(`${API_BASE_URL}/api/v1/users/block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: post.user_id }),
      });

      if (response.ok) {
        Alert.alert('Blocked', 'You will no longer see posts from this user');
      } else {
        Alert.alert('Error', 'Failed to block user');
      }
    } catch (error) {
      console.error('Block error:', error);
      Alert.alert('Error', 'Failed to block user');
    }
  };

  const handleHidePost = () => {
    setMenuVisible(false);
    Alert.alert('Post Hidden', 'This post has been hidden from your feed');
  };

  const handleCardPress = () => {
    if (onPress) {
      onPress(post);
    }
  };

  const isTextOnly = !post.images?.length && !post.video_url && !post.audio_url;
  const shouldTruncate =
    isTextOnly && post.content && post.content.length > 200;
  const displayContent =
    shouldTruncate && !showFullContent
      ? post.content.substring(0, 200) + '...'
      : post.content;

  return (
    <View style={styles.cardWrapper}>
      <View style={styles.accentBar} />

      <DoubleTapLike onDoubleTap={handleDoubleTap}>
        <TouchableOpacity
          style={styles.card}
          onPress={handleCardPress}
          activeOpacity={0.95}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.leftSection}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {post.anonymous_name?.[0]?.toUpperCase() || 'A'}
                </Text>
              </View>
              <View style={styles.authorInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.authorName}>
                    {post.anonymous_name || 'Anonymous'}
                  </Text>
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.timestamp}>{post.time_ago}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.moreButton}
              onPress={(e) => {
                e.stopPropagation();
                setMenuVisible(true);
              }}
            >
              <MoreHorizontal size={20} color={THEME.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Content */}
          <Text style={styles.content}>{displayContent}</Text>

          {shouldTruncate && !showFullContent && (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                setShowFullContent(true);
              }}
            >
              <Text style={styles.readMore}>Read More</Text>
            </TouchableOpacity>
          )}

          {/* Images */}
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
                  resizeMode="cover"
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
                resizeMode="cover"
              />
              <View style={styles.videoOverlay}>
                <View style={styles.playButton}>
                  <Play size={24} color="#1a1f2e" fill="#1a1f2e" />
                </View>
              </View>
            </View>
          )}

          {/* Audio */}
          {post.audio_url && (
            <View style={styles.audioContainer}>
              <View style={styles.audioPlayButton}>
                <Play size={20} color="#fff" fill="#fff" />
              </View>
              <View style={styles.waveform}>
                {[...Array(20)].map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.waveBar,
                      { height: Math.random() * 30 + 10 },
                      i < 8 ? styles.waveBarPlayed : styles.waveBarUnplayed,
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.audioTime}>0:42</Text>
            </View>
          )}

          {(post.video_url || post.audio_url) && (
            <Text style={styles.hint}>React or comment</Text>
          )}

          <View style={styles.divider} />

          {isTextOnly && (
            <Text style={styles.hint}>
              React or comment to share your thoughts
            </Text>
          )}

          {/* Actions - ✅ NOW WITH REAL DATA */}
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleLike();
              }}
              style={styles.action}
            >
              <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <Heart
                  size={18}
                  color={liked ? THEME.primary : THEME.textSecondary}
                  fill={liked ? THEME.primary : 'none'}
                />
              </Animated.View>
              <Text
                style={[styles.actionCount, liked && { color: THEME.primary }]}
              >
                {likesCount}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleViewThread();
              }}
              style={styles.action}
            >
              <MessageCircle size={18} color={THEME.textSecondary} />
              <Text style={styles.actionCount}>{post.thread_count || 0}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </DoubleTapLike>

      {/* Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Post Options</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)}>
                <X size={20} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.menuItem} onPress={handleSave}>
              <Bookmark
                size={20}
                color={post.is_saved ? THEME.primary : THEME.textSecondary}
                fill={post.is_saved ? THEME.primary : 'none'}
              />
              <Text style={styles.menuItemText}>
                {post.is_saved ? 'Unsave Post' : 'Save Post'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                handleShare();
              }}
            >
              <Share2 size={20} color={THEME.textSecondary} />
              <Text style={styles.menuItemText}>Share Post</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleCopyLink}>
              <Link size={20} color={THEME.textSecondary} />
              <Text style={styles.menuItemText}>Copy Link</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleHidePost}>
              <EyeOff size={20} color={THEME.textSecondary} />
              <Text style={styles.menuItemText}>Hide Post</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
              <Flag size={20} color={THEME.primary} />
              <Text style={[styles.menuItemText, { color: THEME.primary }]}>
                Report Post
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleBlockUser}>
              <UserX size={20} color={THEME.primary} />
              <Text style={[styles.menuItemText, { color: THEME.primary }]}>
                Block User
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setMenuVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    position: 'relative',
    marginBottom: 26,
    marginHorizontal: 16,
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
  card: {
    backgroundColor: THEME.surface,
    paddingVertical: 22,
    paddingHorizontal: 24,
    paddingLeft: 28,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 10,
  },
  doubleTapContainer: {
    position: 'relative',
  },
  heartAnimation: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -40,
    marginLeft: -40,
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
  authorInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorName: {
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
  moreButton: {
    padding: 4,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.border,
    marginVertical: 12,
  },
  content: {
    fontSize: 17,
    lineHeight: 27,
    color: THEME.text,
    marginBottom: 14,
    letterSpacing: 0.2,
  },
  readMore: {
    fontSize: 15,
    fontWeight: '500',
    color: THEME.primary,
    marginBottom: 14,
  },
  imagesContainer: {
    marginBottom: 16,
  },
  postImage: {
    width: width - 80,
    height: 180,
    borderRadius: 12,
    marginRight: 8,
  },
  videoContainer: {
    position: 'relative',
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    height: 180,
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
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(30, 35, 45, 0.7)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  audioPlayButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 40,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  waveBarPlayed: {
    backgroundColor: THEME.primary,
  },
  waveBarUnplayed: {
    backgroundColor: '#4a4f60',
  },
  audioTime: {
    fontSize: 14,
    fontWeight: '500',
    color: THEME.text,
  },
  hint: {
    fontSize: 13,
    color: THEME.textSecondary,
    fontStyle: 'italic',
    marginBottom: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    justifyContent: 'flex-end',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: THEME.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: THEME.text,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: THEME.text,
  },
  cancelButton: {
    margin: 20,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME.text,
  },
});

const areEqual = (prevProps, nextProps) => {
  return (
    prevProps.post.id === nextProps.post.id &&
    prevProps.post.is_saved === nextProps.post.is_saved &&
    prevProps.post.is_liked === nextProps.post.is_liked &&
    prevProps.post.likes_count === nextProps.post.likes_count &&
    prevProps.post.thread_count === nextProps.post.thread_count
  );
};

export default React.memo(CalmPostCard, areEqual);




