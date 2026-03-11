import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { FEATURES } from '../../config/featureFlags';

let VideoView = null;
let useVideoPlayer = () => ({
  play: () => {}, pause: () => {}, replace: () => {},
  loop: false, muted: false, playing: false,
  addListener: () => ({ remove: () => {} }),
  removeListener: () => {},
});
let useEvent = (_player, _event, defaultVal) => defaultVal ?? {};

if (FEATURES.nativeVideo) {
  const expoVideo = require('expo-video');
  VideoView = expoVideo.VideoView;
  useVideoPlayer = expoVideo.useVideoPlayer;
  useEvent = expoVideo.useEvent;
}

let VideoThumbnails = null;
if (FEATURES.videoThumbnails) {
  VideoThumbnails = require('expo-video-thumbnails');
}

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
  Volume2,
  VolumeX,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  PanResponder,
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
import AnonProfileSheet from '../connect/AnonProfileSheet';
import { useAuth } from '../../context/AuthContext';

const { width, height } = Dimensions.get('window');

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
      Animated.spring(scaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 900, delay: 200, useNativeDriver: true }),
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
            style={[styles.heartAnimation, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}
          >
            <Heart size={80} color={THEME.primary} fill={THEME.primary} />
          </Animated.View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
};

// ─── AUDIO PLAYER (feed card — tap play to enter swipe player) ─
const AudioPlayer = ({ audioUrl, onMediaPress }) => {
  const bars = Array.from({ length: 28 }, (_, i) => ({
    height: Math.sin(i * 0.8) * 12 + 8 + (i % 3) * 4,
    played: false,
  }));

  return (
    <TouchableOpacity
      style={styles.audioContainer}
      onPress={onMediaPress}
      activeOpacity={0.85}
    >
      <View style={styles.audioPlayBtn}>
        <Play size={18} color="#fff" fill="#fff" />
      </View>
      <View style={styles.audioRight}>
        <View style={styles.waveform}>
          {bars.map((bar, i) => (
            <View
              key={i}
              style={[styles.waveBar, { height: bar.height }, styles.waveBarUnplayed]}
            />
          ))}
        </View>
        <View style={styles.audioMeta}>
          <Text style={styles.audioTimeText}>tap to play</Text>
          <Text style={styles.audioTimeText}>audio confession</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ─── VIDEO PLAYER (feed card thumbnail — tap to enter swipe player) ─
const VideoPlayer = ({ videoUrl, isActive, postId, viewCount, onMediaPress }) => {
  const [thumbnail, setThumbnail] = useState(null);
  const [thumbLoading, setThumbLoading] = useState(true);

  const inlinePlayer = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const { isPlaying: inlinePlaying } = useEvent(inlinePlayer, 'playingChange', { isPlaying: false });

  useEffect(() => {
    if (isActive) inlinePlayer.play();
    else inlinePlayer.pause();
  }, [isActive]);

  useEffect(() => {
    let cancelled = false;
    const generateThumb = async () => {
      try {
        if (!VideoThumbnails?.getThumbnailAsync) { if (!cancelled) setThumbLoading(false); return; }
        const { uri } = await VideoThumbnails.getThumbnailAsync(videoUrl, { time: 1000, quality: 0.7 });
        if (!cancelled) setThumbnail(uri);
      } catch (e) {
      } finally {
        if (!cancelled) setThumbLoading(false);
      }
    };
    generateThumb();
    return () => { cancelled = true; };
  }, [videoUrl]);

  return (
    <TouchableOpacity
      style={styles.videoContainer}
      onPress={onMediaPress}
      activeOpacity={0.97}
    >
      {thumbLoading && (
        <View style={styles.videoLoading}>
          <ActivityIndicator color={THEME.primary} />
        </View>
      )}
      {thumbnail && !inlinePlaying && (
        <Image source={{ uri: thumbnail }} style={styles.video} resizeMode="cover" />
      )}
      {VideoView && (
        <VideoView
          player={inlinePlayer}
          style={[styles.video, !inlinePlaying && { position: 'absolute', opacity: 0 }]}
          contentFit="cover"
          nativeControls={false}
          allowsPictureInPicture={false}
        />
      )}
      <View style={styles.videoOverlay} pointerEvents="none">
        {!inlinePlaying && (
          <View style={styles.playButton}>
            <Play size={26} color="#fff" fill="#fff" />
          </View>
        )}
        {inlinePlaying && (
          <View style={styles.videoLiveBar}>
            <View style={styles.videoLiveDot} />
            <Text style={styles.videoLiveText}>tap for swipe mode</Text>
          </View>
        )}
      </View>
      {inlinePlaying && (
        <View style={styles.videoMutedBadge}>
          <VolumeX size={12} color="rgba(255,255,255,0.7)" />
        </View>
      )}
      <View style={styles.videoTapBadge}>
        {viewCount > 0 && (
          <Text style={styles.videoTapText}>
            👁 {viewCount >= 1000 ? `${(viewCount / 1000).toFixed(1)}k` : viewCount} views
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ─── COMMENT BOTTOM SHEET ─────────────────────────────────────
const CommentBottomSheet = ({ visible, postId, isAuthenticated, navigation, onClose }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const slideAnim = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    if (visible) {
      setComments([]);
      loadComments();
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 8, tension: 65 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: height, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

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
    if (!isAuthenticated) { navigation.navigate('Auth', { screen: 'Login' }); return; }
    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/thread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: text.trim() }),
      });
      const data = await res.json();
      if (res.ok) { setComments((prev) => [data, ...prev]); setText(''); }
    } catch (e) {
      console.error('Submit comment error:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    Animated.timing(slideAnim, { toValue: height, duration: 220, useNativeDriver: true }).start(onClose);
  };

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) slideAnim.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 80) handleClose();
      else Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={csStyles.backdrop} />
      </TouchableWithoutFeedback>
      <Animated.View style={[csStyles.sheet, { transform: [{ translateY: slideAnim }] }]} {...panResponder.panHandlers}>
        <View style={csStyles.handleRow}><View style={csStyles.handleBar} /></View>
        <View style={csStyles.header}>
          <Text style={csStyles.headerText}>{comments.length} {comments.length === 1 ? 'comment' : 'comments'}</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ChevronDown size={20} color={THEME.textSecondary} />
          </TouchableOpacity>
        </View>
        {loading ? (
          <View style={csStyles.loadingWrap}><ActivityIndicator color={THEME.primary} size="small" /></View>
        ) : comments.length === 0 ? (
          <View style={csStyles.emptyWrap}>
            <Text style={csStyles.emptyText}>no one has said anything yet. say something.</Text>
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(item, i) => item.id || String(i)}
            style={csStyles.list}
            contentContainerStyle={{ paddingBottom: 8 }}
            renderItem={({ item }) => (
              <View style={csStyles.commentItem}>
                <View style={csStyles.commentAvatar}>
                  <Text style={csStyles.commentAvatarText}>{item.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
                </View>
                <View style={csStyles.commentBody}>
                  <Text style={csStyles.commentAuthor}>{item.anonymous_name || 'Anonymous'}</Text>
                  <Text style={csStyles.commentText}>{item.content}</Text>
                </View>
              </View>
            )}
          />
        )}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={csStyles.inputRow}>
            <TextInput
              style={csStyles.input}
              value={text}
              onChangeText={setText}
              placeholder="say what you actually think..."
              placeholderTextColor={THEME.textSecondary}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[csStyles.sendBtn, (!text.trim() || submitting) && { opacity: 0.4 }]}
              onPress={submitComment}
              disabled={!text.trim() || submitting}
            >
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Send size={16} color="#fff" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
};

// ─── MAIN CARD ────────────────────────────────────────────────
function CalmPostCard({ post, onResponse, onSave, onViewThread, onPress, onMediaPress, navigation, activeVideoId, nextVideo, onVideoChange }) {
  const { isAuthenticated } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);
  const [profileSheetVisible, setProfileSheetVisible] = useState(false);
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
        { text: 'Sign In', onPress: () => navigation.navigate('Auth', { screen: 'Login' }) },
      ]);
      return;
    }
    setAnimating(true);
    const newLiked = !liked;
    setLiked(newLiked);
    setLikesCount((c) => (newLiked ? c + 1 : c - 1));
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.35, duration: 120, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start(() => setAnimating(false));
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/like`, {
        method: newLiked ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) { setLiked(data.liked); setLikesCount(data.likes_count); }
      else { setLiked(!newLiked); setLikesCount((c) => (newLiked ? c - 1 : c + 1)); }
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
      Animated.timing(scaleAnim, { toValue: 1.35, duration: 120, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) { setLiked(data.liked); setLikesCount(data.likes_count); }
    } catch (e) { console.error(e); }
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: `"${post.content?.substring(0, 120)}..." — Anonixx` });
    } catch (e) {}
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason }),
      });
      Alert.alert('Reported', 'Thank you for keeping Anonixx safe.');
    } catch (e) { console.error(e); }
  };

  const handleBlockUser = () => {
    setMenuVisible(false);
    Alert.alert('Block User', `Block ${post.anonymous_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block', style: 'destructive',
        onPress: async () => {
          const token = await AsyncStorage.getItem('token');
          await fetch(`${API_BASE_URL}/api/v1/users/block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ user_id: post.user_id }),
          });
        },
      },
    ]);
  };

  const isTextOnly = !post.images?.length && !post.video_url && !post.audio_url;
  const shouldTruncate = post.content?.length > 400;
  const displayContent = shouldTruncate && !showFullContent
    ? post.content.substring(0, 400) + '...'
    : post.content;

  return (
    <View style={styles.cardWrapper}>
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.leftSection}
            onPress={() => setProfileSheetVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{post.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
            </View>
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{post.anonymous_name || 'Anonymous'}</Text>
              <Text style={styles.timestamp}>{post.time_ago}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.moreButton}>
            <MoreHorizontal size={18} color={THEME.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <DoubleTapLike onDoubleTap={handleDoubleTap}>
          <TouchableOpacity style={styles.cardBody} onPress={() => onPress?.(post)} activeOpacity={0.97}>
            {post.content ? (
              <>
                <Text style={styles.content}>{displayContent}</Text>
                {shouldTruncate && !showFullContent && (
                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); setShowFullContent(true); }}>
                    <Text style={styles.readMore}>Read more</Text>
                  </TouchableOpacity>
                )}
                {shouldTruncate && showFullContent && (
                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); setShowFullContent(false); }}>
                    <Text style={styles.readMore}>Show less</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : null}

            {post.images?.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesScroll}>
                {post.images.map((url, i) => (
                  <Image key={i} source={{ uri: url }} style={styles.postImage} resizeMode="cover" />
                ))}
              </ScrollView>
            )}

            {/* VIDEO — tap launches MediaFeedScreen */}
            {post.video_url && (
              <VideoPlayer
                videoUrl={post.video_url}
                isActive={activeVideoId === post.id}
                postId={post.id}
                viewCount={post.views_count || 0}
                onMediaPress={() => onMediaPress?.(post)}
              />
            )}

            {/* AUDIO — tap launches MediaFeedScreen */}
            {post.audio_url && (
              <AudioPlayer
                audioUrl={post.audio_url}
                onMediaPress={() => onMediaPress?.(post)}
              />
            )}

            <View style={styles.divider} />

            {isTextOnly && <Text style={styles.hint}>say something if it hits.</Text>}
            {(post.video_url || post.audio_url) && (
              <Text style={styles.hint}>swipe through confessions like reels ↑</Text>
            )}

            {/* Actions */}
            <View style={styles.actions}>
              <View style={styles.actionsLeft}>
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); onSave(post.id); }} style={styles.action}>
                  <Bookmark size={17} color={post.is_saved ? THEME.primary : THEME.textSecondary} fill={post.is_saved ? THEME.primary : 'none'} />
                </TouchableOpacity>
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleShare(); }} style={styles.action}>
                  <Share2 size={17} color={THEME.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.actionsRight}>
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); setShowComments(true); }}
                  style={styles.action}
                >
                  <MessageCircle size={18} color={THEME.textSecondary} />
                  <Text style={styles.actionCount}>{post.thread_count || 0}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleLike(); }} style={styles.action}>
                  <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                    <Heart size={18} color={liked ? THEME.primary : THEME.textSecondary} fill={liked ? THEME.primary : 'none'} />
                  </Animated.View>
                  <Text style={[styles.actionCount, liked && { color: THEME.primary }]}>{likesCount}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </DoubleTapLike>
      </View>

      {/* Comment bottom sheet */}
      <CommentBottomSheet
        visible={showComments}
        postId={post.id}
        isAuthenticated={isAuthenticated}
        navigation={navigation}
        onClose={() => setShowComments(false)}
      />

      {/* Options Menu */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Options</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)}>
                <X size={20} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>
            {[
              { icon: <Bookmark size={18} color={post.is_saved ? THEME.primary : THEME.textSecondary} fill={post.is_saved ? THEME.primary : 'none'} />, label: post.is_saved ? 'Unsave' : 'Save', onPress: () => { setMenuVisible(false); onSave(post.id); } },
              { icon: <Share2 size={18} color={THEME.textSecondary} />, label: 'Share', onPress: () => { setMenuVisible(false); handleShare(); } },
              { icon: <Link size={18} color={THEME.textSecondary} />, label: 'Copy Link', onPress: handleCopyLink },
              { icon: <EyeOff size={18} color={THEME.textSecondary} />, label: 'Hide Post', onPress: () => setMenuVisible(false) },
              { icon: <Flag size={18} color={THEME.primary} />, label: 'Report', onPress: handleReport, danger: true },
              { icon: <UserX size={18} color={THEME.primary} />, label: 'Block User', onPress: handleBlockUser, danger: true },
            ].map((item, i) => (
              <TouchableOpacity key={i} style={styles.menuItem} onPress={item.onPress}>
                {item.icon}
                <Text style={[styles.menuItemText, item.danger && { color: THEME.primary }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.cancelButton} onPress={() => setMenuVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <AnonProfileSheet
        visible={profileSheetVisible}
        onClose={() => setProfileSheetVisible(false)}
        userId={post.user_id}
        anonymousName={post.anonymous_name}
        navigation={navigation}
      />
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  cardWrapper: { position: 'relative', marginBottom: 24, marginHorizontal: 16 },
  cardBody: { paddingBottom: 4 },
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
    position: 'absolute', top: '40%', left: '50%',
    marginLeft: -40, marginTop: -40, zIndex: 1000,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  leftSection: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: THEME.avatarBg,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1, borderColor: 'rgba(255,99,74,0.2)',
  },
  avatarText: { fontSize: 15, fontWeight: '700', color: THEME.primary },
  authorInfo: { flex: 1 },
  authorName: { fontSize: 14, fontWeight: '600', color: THEME.text },
  timestamp: { fontSize: 12, color: THEME.textSecondary, marginTop: 1 },
  moreButton: { padding: 4 },
  divider: { height: 1, backgroundColor: THEME.border, marginVertical: 12 },
  content: { fontSize: 16, lineHeight: 26, color: THEME.text, letterSpacing: 0.2, marginBottom: 10 },
  readMore: { fontSize: 14, fontWeight: '500', color: THEME.primary, marginBottom: 12 },
  imagesScroll: { marginBottom: 14 },
  postImage: { width: width - 90, height: 200, borderRadius: 12, marginRight: 8 },

  // Video
  videoContainer: {
    position: 'relative', marginBottom: 14, borderRadius: 14,
    overflow: 'hidden', height: 220, backgroundColor: '#0d1018',
  },
  video: { width: '100%', height: '100%' },
  videoLoading: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d1018',
  },
  videoOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  playButton: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,99,74,0.85)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: THEME.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6, shadowRadius: 12,
  },
  videoTapBadge: {
    position: 'absolute', bottom: 10, right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  videoTapText: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  videoLiveBar: {
    position: 'absolute', bottom: 10, left: 0, right: 0,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  videoLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: THEME.primary },
  videoLiveText: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  videoMutedBadge: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', padding: 6, borderRadius: 10,
  },

  // Audio
  audioContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,99,74,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,99,74,0.15)',
    padding: 14, borderRadius: 14, marginBottom: 14,
  },
  audioPlayBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: THEME.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: THEME.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 8,
  },
  audioRight: { flex: 1 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 36 },
  waveBar: { width: 3, borderRadius: 2 },
  waveBarPlayed: { backgroundColor: THEME.primary },
  waveBarUnplayed: { backgroundColor: 'rgba(255,255,255,0.12)' },
  audioMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  audioTimeText: { fontSize: 11, color: THEME.textSecondary },

  hint: { fontSize: 13, color: THEME.textSecondary, fontStyle: 'italic', marginBottom: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 },
  actionsLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actionsRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { fontSize: 14, fontWeight: '500', color: THEME.textSecondary },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  menuContainer: { backgroundColor: THEME.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24 },
  menuHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: THEME.border },
  menuTitle: { fontSize: 16, fontWeight: '700', color: THEME.text },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderBottomWidth: 1, borderBottomColor: THEME.border },
  menuItemText: { fontSize: 15, fontWeight: '500', color: THEME.text },
  cancelButton: { margin: 16, padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  cancelText: { fontSize: 15, fontWeight: '600', color: THEME.textSecondary },
});

// ─── COMMENT SHEET STYLES ─────────────────────────────────────
const csStyles = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: height * 0.55,
    backgroundColor: THEME.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderTopColor: THEME.borderStrong,
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5, shadowRadius: 24, elevation: 20,
  },
  handleRow: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handleBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: THEME.borderStrong },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: THEME.border,
  },
  headerText: { fontSize: 14, fontWeight: '700', color: THEME.text },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 14, color: THEME.textSecondary, fontStyle: 'italic', textAlign: 'center' },
  list: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  commentItem: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: THEME.avatarBg, alignItems: 'center', justifyContent: 'center' },
  commentAvatarText: { fontSize: 13, fontWeight: '700', color: THEME.primary },
  commentBody: { flex: 1 },
  commentAuthor: { fontSize: 13, fontWeight: '600', color: THEME.text, marginBottom: 3 },
  commentText: { fontSize: 14, color: THEME.textSecondary, lineHeight: 20 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: THEME.border,
  },
  input: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: THEME.text,
    borderWidth: 1, borderColor: THEME.border, maxHeight: 80,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: THEME.primary, alignItems: 'center', justifyContent: 'center',
  },
});

const areEqual = (prev, next) =>
  prev.post.id === next.post.id &&
  prev.post.is_saved === next.post.is_saved &&
  prev.post.is_liked === next.post.is_liked &&
  prev.post.likes_count === next.post.likes_count &&
  prev.post.thread_count === next.post.thread_count;

export default React.memo(CalmPostCard, areEqual);
