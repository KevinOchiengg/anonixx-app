import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio, Video } from 'expo-av';
import {
  Bookmark,
  ChevronDown,
  EyeOff,
  Flag,
  Heart,
  Link,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Send,
  Share2,
  UserX,
  X,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Clipboard,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { API_BASE_URL } from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const { width } = Dimensions.get('window');

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
  borderStrong: 'rgba(255,255,255,0.10)',
  avatarBg: '#1e2330',
  avatarIcon: '#5a5f70',
  inputBg: 'rgba(255,255,255,0.05)',
};

// ─── DOUBLE TAP ───────────────────────────────────────────────
const DoubleTapLike = ({ children, onDoubleTap }) => {
  const [showHeart, setShowHeart] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const lastTap = useRef(null);

  const handleTap = () => {
    const now = Date.now();
    if (lastTap.current && now - lastTap.current < 300) {
      triggerHeart();
    } else {
      lastTap.current = now;
    }
  };

  const triggerHeart = () => {
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
        duration: 900,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setShowHeart(false));
    onDoubleTap?.();
  };

  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={{ position: 'relative' }}>
        {children}
        {showHeart && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.heartAnimation,
              { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
            ]}
          >
            <Heart size={80} color={THEME.primary} fill={THEME.primary} />
          </Animated.View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
};

// ─── AUDIO PLAYER ─────────────────────────────────────────────
const AudioPlayer = ({ audioUrl }) => {
  const soundRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  const togglePlay = async () => {
    try {
      if (!soundRef.current) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );
        soundRef.current = sound;
        setPlaying(true);
      } else {
        const status = await soundRef.current.getStatusAsync();
        if (status.isPlaying) {
          await soundRef.current.pauseAsync();
          setPlaying(false);
        } else {
          await soundRef.current.playAsync();
          setPlaying(true);
        }
      }
    } catch (e) {
      console.error('Audio error:', e);
    }
  };

  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      setDuration(status.durationMillis || 0);
      setProgress(
        status.durationMillis
          ? status.positionMillis / status.durationMillis
          : 0
      );
      if (status.didJustFinish) {
        setPlaying(false);
        setProgress(0);
        setPosition(0);
      }
    }
  };

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const bars = Array.from({ length: 28 }, (_, i) => ({
    height: Math.sin(i * 0.8) * 12 + Math.random() * 10 + 8,
    played: progress > 0 && i / 28 <= progress,
  }));

  return (
    <View style={styles.audioContainer}>
      <TouchableOpacity style={styles.audioPlayBtn} onPress={togglePlay}>
        {playing ? (
          <Pause size={18} color="#fff" fill="#fff" />
        ) : (
          <Play size={18} color="#fff" fill="#fff" />
        )}
      </TouchableOpacity>

      <View style={styles.audioRight}>
        <View style={styles.waveform}>
          {bars.map((bar, i) => (
            <View
              key={i}
              style={[
                styles.waveBar,
                { height: bar.height },
                bar.played ? styles.waveBarPlayed : styles.waveBarUnplayed,
              ]}
            />
          ))}
        </View>
        <View style={styles.audioMeta}>
          <Text style={styles.audioTimeText}>
            {duration > 0 ? formatTime(position) : '0:00'}
          </Text>
          <Text style={styles.audioTimeText}>
            {duration > 0 ? formatTime(duration) : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
};

// ─── VIDEO PLAYER ─────────────────────────────────────────────
const VideoPlayer = ({ videoUrl }) => {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const togglePlay = async () => {
    if (!videoRef.current) return;
    if (playing) {
      await videoRef.current.pauseAsync();
      setPlaying(false);
    } else {
      await videoRef.current.playAsync();
      setPlaying(true);
    }
  };

  return (
    <View style={styles.videoContainer}>
      <Video
        ref={videoRef}
        source={{ uri: videoUrl }}
        style={styles.video}
        resizeMode="cover"
        onLoad={() => setLoaded(true)}
        onPlaybackStatusUpdate={(s) => {
          if (s.didJustFinish) setPlaying(false);
        }}
        useNativeControls={false}
      />
      {!loaded && (
        <View style={styles.videoLoading}>
          <ActivityIndicator color={THEME.primary} />
        </View>
      )}
      <TouchableOpacity
        style={styles.videoOverlay}
        onPress={togglePlay}
        activeOpacity={0.9}
      >
        {!playing && (
          <View style={styles.playButton}>
            <Play size={26} color="#fff" fill="#fff" />
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

// ─── COMMENT SECTION (TikTok style inline) ────────────────────
const CommentSection = ({ postId, isAuthenticated, navigation, onClose }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
    }).start();
    loadComments();
  }, []);

  const loadComments = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/thread`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) setComments(data.threads || []);
    } catch (e) {
      console.error('Load comments error:', e);
    } finally {
      setLoading(false);
    }
  };

  const submitComment = async () => {
    if (!text.trim()) return;
    if (!isAuthenticated) {
      navigation.navigate('Auth', { screen: 'Login' });
      return;
    }
    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: text.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setComments((prev) => [data, ...prev]);
        setText('');
      }
    } catch (e) {
      console.error('Submit comment error:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 200,
      useNativeDriver: true,
    }).start(onClose);
  };

  return (
    <Animated.View
      style={[
        styles.commentSection,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      {/* Handle bar */}
      <TouchableOpacity style={styles.commentHandle} onPress={handleClose}>
        <View style={styles.handleBar} />
      </TouchableOpacity>

      <View style={styles.commentHeader}>
        <Text style={styles.commentHeaderText}>
          {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
        </Text>
        <TouchableOpacity onPress={handleClose}>
          <ChevronDown size={20} color={THEME.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.commentLoading}>
          <ActivityIndicator color={THEME.primary} size="small" />
        </View>
      ) : comments.length === 0 ? (
        <View style={styles.commentEmpty}>
          <Text style={styles.commentEmptyText}>
            No comments yet. Be the first.
          </Text>
        </View>
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(item, i) => item.id || String(i)}
          style={styles.commentList}
          renderItem={({ item }) => (
            <View style={styles.commentItem}>
              <View style={styles.commentAvatar}>
                <Text style={styles.commentAvatarText}>
                  {item.anonymous_name?.[0]?.toUpperCase() || 'A'}
                </Text>
              </View>
              <View style={styles.commentBody}>
                <Text style={styles.commentAuthor}>
                  {item.anonymous_name || 'Anonymous'}
                </Text>
                <Text style={styles.commentText}>{item.content}</Text>
              </View>
            </View>
          )}
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.commentInput}>
          <TextInput
            style={styles.commentTextInput}
            value={text}
            onChangeText={setText}
            placeholder="Add a comment..."
            placeholderTextColor={THEME.textSecondary}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!text.trim() || submitting) && { opacity: 0.4 },
            ]}
            onPress={submitComment}
            disabled={!text.trim() || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send size={16} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
};

// ─── MAIN CARD ────────────────────────────────────────────────
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
  const [showComments, setShowComments] = useState(false);
  const [liked, setLiked] = useState(post.is_liked || false);
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [animating, setAnimating] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setLiked(post.is_liked || false);
    setLikesCount(post.likes_count || 0);
  }, [post.is_liked, post.likes_count]);

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
    setLiked(newLiked);
    setLikesCount((c) => (newLiked ? c + 1 : c - 1));
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.35,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(() => setAnimating(false));
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/like`, {
        method: newLiked ? 'POST' : 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      if (res.ok) {
        setLiked(data.liked);
        setLikesCount(data.likes_count);
      } else {
        setLiked(!newLiked);
        setLikesCount((c) => (newLiked ? c - 1 : c + 1));
      }
    } catch {
      setLiked(!newLiked);
      setLikesCount((c) => (newLiked ? c - 1 : c + 1));
    }
  };

  const handleDoubleTap = async () => {
    if (liked || !isAuthenticated) return;
    setLiked(true);
    setLikesCount((c) => c + 1);
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.35,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/like`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      if (res.ok) {
        setLiked(data.liked);
        setLikesCount(data.likes_count);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `"${post.content?.substring(0, 120)}..." — Anonixx`,
      });
    } catch (e) {
      console.log(e);
    }
  };

  const handleCopyLink = () => {
    Clipboard.setString(`anonixx://post/${post.id}`);
    setMenuVisible(false);
    Alert.alert('Copied', 'Link copied to clipboard');
  };

  const handleReport = () => {
    setMenuVisible(false);
    Alert.alert('Report Post', 'Why are you reporting this?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Harmful', onPress: () => submitReport('harmful') },
      { text: 'Spam', onPress: () => submitReport('spam') },
      { text: 'Inappropriate', onPress: () => submitReport('inappropriate') },
    ]);
  };

  const submitReport = async (reason) => {
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      Alert.alert('Reported', 'Thank you for keeping Anonixx safe.');
    } catch (e) {
      console.error(e);
    }
  };

  const handleBlockUser = () => {
    setMenuVisible(false);
    Alert.alert('Block User', `Block ${post.anonymous_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          const token = await AsyncStorage.getItem('token');
          await fetch(`${API_BASE_URL}/api/v1/users/block`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ user_id: post.user_id }),
          });
        },
      },
    ]);
  };

  const isTextOnly = !post.images?.length && !post.video_url && !post.audio_url;
  const shouldTruncate = isTextOnly && post.content?.length > 200;
  const displayContent =
    shouldTruncate && !showFullContent
      ? post.content.substring(0, 200) + '...'
      : post.content;

  return (
    <View style={styles.cardWrapper}>
      {/* Thin accent bar */}
      <View style={styles.accentBar} />

      <DoubleTapLike onDoubleTap={handleDoubleTap}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => onPress?.(post)}
          activeOpacity={0.97}
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
                <Text style={styles.authorName}>
                  {post.anonymous_name || 'Anonymous'}
                </Text>
                <Text style={styles.timestamp}>{post.time_ago}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                setMenuVisible(true);
              }}
              style={styles.moreButton}
            >
              <MoreHorizontal size={18} color={THEME.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Text content */}
          {post.content ? (
            <>
              <Text style={styles.content}>{displayContent}</Text>
              {shouldTruncate && !showFullContent && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    setShowFullContent(true);
                  }}
                >
                  <Text style={styles.readMore}>Read more</Text>
                </TouchableOpacity>
              )}
            </>
          ) : null}

          {/* Images */}
          {post.images?.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.imagesScroll}
            >
              {post.images.map((url, i) => (
                <Image
                  key={i}
                  source={{ uri: url }}
                  style={styles.postImage}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          )}

          {/* Video */}
          {post.video_url && <VideoPlayer videoUrl={post.video_url} />}

          {/* Audio */}
          {post.audio_url && <AudioPlayer audioUrl={post.audio_url} />}

          <View style={styles.divider} />

          {/* Nudge */}
          {isTextOnly && (
            <Text style={styles.hint}>say something if it hits.</Text>
          )}
          {(post.video_url || post.audio_url) && (
            <Text style={styles.hint}>react or drop a comment.</Text>
          )}

          {/* Actions: save+share LEFT | like+comment RIGHT */}
          <View style={styles.actions}>
            {/* Left: Save + Share */}
            <View style={styles.actionsLeft}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onSave(post.id);
                }}
                style={styles.action}
              >
                <Bookmark
                  size={17}
                  color={post.is_saved ? THEME.primary : THEME.textSecondary}
                  fill={post.is_saved ? THEME.primary : 'none'}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleShare();
                }}
                style={styles.action}
              >
                <Share2 size={17} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Right: Like + Comment */}
            <View style={styles.actionsRight}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  setShowComments((v) => !v);
                }}
                style={styles.action}
              >
                <MessageCircle
                  size={18}
                  color={showComments ? THEME.primary : THEME.textSecondary}
                />
                <Text
                  style={[
                    styles.actionCount,
                    showComments && { color: THEME.primary },
                  ]}
                >
                  {post.thread_count || 0}
                </Text>
              </TouchableOpacity>

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
                  style={[
                    styles.actionCount,
                    liked && { color: THEME.primary },
                  ]}
                >
                  {likesCount}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Inline TikTok-style comment section */}
          {showComments && (
            <CommentSection
              postId={post.id}
              isAuthenticated={isAuthenticated}
              navigation={navigation}
              onClose={() => setShowComments(false)}
            />
          )}
        </TouchableOpacity>
      </DoubleTapLike>

      {/* Options Menu */}
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
              <Text style={styles.menuTitle}>Options</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)}>
                <X size={20} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>

            {[
              {
                icon: (
                  <Bookmark
                    size={18}
                    color={post.is_saved ? THEME.primary : THEME.textSecondary}
                    fill={post.is_saved ? THEME.primary : 'none'}
                  />
                ),
                label: post.is_saved ? 'Unsave' : 'Save',
                onPress: () => {
                  setMenuVisible(false);
                  onSave(post.id);
                },
              },
              {
                icon: <Share2 size={18} color={THEME.textSecondary} />,
                label: 'Share',
                onPress: () => {
                  setMenuVisible(false);
                  handleShare();
                },
              },
              {
                icon: <Link size={18} color={THEME.textSecondary} />,
                label: 'Copy Link',
                onPress: handleCopyLink,
              },
              {
                icon: <EyeOff size={18} color={THEME.textSecondary} />,
                label: 'Hide Post',
                onPress: () => setMenuVisible(false),
              },
              {
                icon: <Flag size={18} color={THEME.primary} />,
                label: 'Report',
                onPress: handleReport,
                danger: true,
              },
              {
                icon: <UserX size={18} color={THEME.primary} />,
                label: 'Block User',
                onPress: handleBlockUser,
                danger: true,
              },
            ].map((item, i) => (
              <TouchableOpacity
                key={i}
                style={styles.menuItem}
                onPress={item.onPress}
              >
                {item.icon}
                <Text
                  style={[
                    styles.menuItemText,
                    item.danger && { color: THEME.primary },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setMenuVisible(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
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
    marginBottom: 24,
    marginHorizontal: 16,
  },
  accentBar: {
    display: 'none',
  },
  card: {
    backgroundColor: THEME.surface,
    paddingVertical: 20,
    paddingHorizontal: 20,
    paddingLeft: 22,
    borderRadius: 18,
    borderLeftWidth: 1,
    borderLeftColor: THEME.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
  heartAnimation: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    marginLeft: -40,
    marginTop: -40,
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: THEME.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,99,74,0.2)',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.primary,
  },
  authorInfo: { flex: 1 },
  authorName: { fontSize: 14, fontWeight: '600', color: THEME.text },
  timestamp: { fontSize: 12, color: THEME.textSecondary, marginTop: 1 },
  moreButton: { padding: 4 },
  divider: { height: 1, backgroundColor: THEME.border, marginVertical: 12 },
  content: {
    fontSize: 16,
    lineHeight: 26,
    color: THEME.text,
    letterSpacing: 0.2,
    marginBottom: 10,
  },
  readMore: {
    fontSize: 14,
    fontWeight: '500',
    color: THEME.primary,
    marginBottom: 12,
  },
  imagesScroll: { marginBottom: 14 },
  postImage: {
    width: width - 90,
    height: 200,
    borderRadius: 12,
    marginRight: 8,
  },

  // Video
  videoContainer: {
    position: 'relative',
    marginBottom: 14,
    borderRadius: 14,
    overflow: 'hidden',
    height: 220,
    backgroundColor: '#0d1018',
  },
  video: { width: '100%', height: '100%' },
  videoLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d1018',
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
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,99,74,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },

  // Audio
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,99,74,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,99,74,0.15)',
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
  },
  audioPlayBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  audioRight: { flex: 1 },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 36,
  },
  waveBar: { width: 3, borderRadius: 2 },
  waveBarPlayed: { backgroundColor: THEME.primary },
  waveBarUnplayed: { backgroundColor: 'rgba(255,255,255,0.12)' },
  audioMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  audioTimeText: { fontSize: 11, color: THEME.textSecondary },

  hint: {
    fontSize: 13,
    color: THEME.textSecondary,
    fontStyle: 'italic',
    marginBottom: 12,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  actionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionCount: { fontSize: 14, fontWeight: '500', color: THEME.textSecondary },

  // Comment section
  commentSection: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    paddingTop: 8,
    maxHeight: 320,
  },
  commentHandle: { alignItems: 'center', paddingVertical: 6 },
  handleBar: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: THEME.borderStrong,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  commentHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.textSecondary,
  },
  commentLoading: { paddingVertical: 20, alignItems: 'center' },
  commentEmpty: { paddingVertical: 16, alignItems: 'center' },
  commentEmptyText: {
    fontSize: 13,
    color: THEME.textSecondary,
    fontStyle: 'italic',
  },
  commentList: { maxHeight: 180 },
  commentItem: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: THEME.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: { fontSize: 12, fontWeight: '700', color: THEME.primary },
  commentBody: { flex: 1 },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.text,
    marginBottom: 2,
  },
  commentText: { fontSize: 13, color: THEME.textSecondary, lineHeight: 18 },
  commentInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  commentTextInput: {
    flex: 1,
    backgroundColor: THEME.inputBg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
    color: THEME.text,
    borderWidth: 1,
    borderColor: THEME.border,
    maxHeight: 80,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Menu
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: THEME.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  menuTitle: { fontSize: 16, fontWeight: '700', color: THEME.text },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  menuItemText: { fontSize: 15, fontWeight: '500', color: THEME.text },
  cancelButton: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: THEME.textSecondary },
});

const areEqual = (prev, next) =>
  prev.post.id === next.post.id &&
  prev.post.is_saved === next.post.is_saved &&
  prev.post.is_liked === next.post.is_liked &&
  prev.post.likes_count === next.post.likes_count &&
  prev.post.thread_count === next.post.thread_count;

export default React.memo(CalmPostCard, areEqual);
