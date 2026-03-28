/**
 * MediaFeedScreen
 * TikTok-style fullscreen vertical swipe player for video/audio confessions.
 * Receives { posts, startIndex } from navigation params.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Bookmark,
  ChevronDown,
  Heart,
  MessageCircle,
  Pause,
  Play,
  Send,
  Share2,
  Volume2,
  VolumeX,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { FEATURES } from '../../config/featureFlags';
import StarryBackground from '../../components/common/StarryBackground';

// expo-video stubs (same pattern as CalmPostCard)
let VideoView = null;
let useVideoPlayer = () => ({
  play: () => {}, pause: () => {}, replace: () => {},
  loop: false, muted: false, playing: false,
  addListener: () => ({ remove: () => {} }),
});
let useEvent = (_p, _e, d) => d ?? {};

if (FEATURES.nativeVideo) {
  const ev = require('expo-video');
  VideoView = ev.VideoView;
  useVideoPlayer = ev.useVideoPlayer;
  useEvent = ev.useEvent;
}

const { width, height } = Dimensions.get('window');

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
  borderStrong: 'rgba(255,255,255,0.12)',
  avatarBg: '#1e2330',
};

// ─── COMMENT BOTTOM SHEET ─────────────────────────────────────
const CommentSheet = ({ visible, postId, isAuthenticated, navigation, onClose, onCountChange }) => {
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
      if (res.ok) { setComments(data.threads || []); onCountChange?.(data.threads?.length || 0); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const submit = async () => {
    if (!text.trim() || !isAuthenticated) return;
    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/thread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: text.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setComments((prev) => [{ ...data, time_ago: 'just now' }, ...prev]);
        onCountChange?.(comments.length + 1);
        setText('');
      }
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  };

  const handleClose = () =>
    Animated.timing(slideAnim, { toValue: height, duration: 220, useNativeDriver: true }).start(onClose);

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) slideAnim.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 80) handleClose();
      else Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <TouchableOpacity style={cs.backdrop} activeOpacity={1} onPress={handleClose} />
      <Animated.View style={[cs.sheet, { transform: [{ translateY: slideAnim }] }]} {...pan.panHandlers}>
        <View style={cs.handleRow}>
      <StarryBackground /><View style={cs.handleBar} /></View>
        <View style={cs.header}>
          <Text style={cs.headerText}>{comments.length} {comments.length === 1 ? 'comment' : 'comments'}</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <ChevronDown size={20} color={THEME.textSecondary} />
          </TouchableOpacity>
        </View>
        {loading ? (
          <View style={cs.center}><ActivityIndicator color={THEME.primary} /></View>
        ) : comments.length === 0 ? (
          <View style={cs.center}><Text style={cs.emptyText}>no one has said anything yet. say something.</Text></View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(item, i) => item.id || String(i)}
            style={cs.list}
            renderItem={({ item }) => (
              <View style={cs.commentItem}>
                <View style={cs.commentAvatar}>
                  <Text style={cs.commentAvatarText}>{item.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
                </View>
                <View style={cs.commentBody}>
                  <Text style={cs.commentAuthor}>{item.anonymous_name || 'Anonymous'}</Text>
                  <Text style={cs.commentText}>{item.content}</Text>
                  <Text style={cs.commentTime}>{item.time_ago}</Text>
                </View>
              </View>
            )}
          />
        )}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={cs.inputRow}>
            <TextInput
              style={cs.input}
              value={text}
              onChangeText={setText}
              placeholder={isAuthenticated ? 'say what you actually think...' : 'sign in to comment...'}
              placeholderTextColor={THEME.textSecondary}
              multiline maxLength={500}
              editable={isAuthenticated}
            />
            <TouchableOpacity
              style={[cs.sendBtn, (!text.trim() || submitting) && { opacity: 0.4 }]}
              onPress={submit} disabled={!text.trim() || submitting}
            >
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Send size={16} color="#fff" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
};

// ─── VIDEO SLIDE ──────────────────────────────────────────────
const VideoSlide = ({ post, isActive, onLike, liked, likesCount, onSave, saved, onComment, commentCount, navigation }) => {
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const controlsTimer = useRef(null);
  const lastTap = useRef(null);
  const [showHeart, setShowHeart] = useState(false);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(1)).current;
  const [expanded, setExpanded] = useState(false);

  const player = useVideoPlayer(post.video_url, (p) => {
    p.loop = true;
    p.muted = muted;
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: false });

  useEffect(() => {
    if (isActive) {
      player.muted = muted;
      player.play();
    } else {
      player.pause();
    }
  }, [isActive]);

  useEffect(() => {
    player.muted = muted;
  }, [muted]);

  const flashControls = () => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 2500);
  };

  const handleTap = () => {
    const now = Date.now();
    if (lastTap.current && now - lastTap.current < 280) {
      // Double tap — like
      triggerHeart();
      if (!liked) onLike();
    } else {
      lastTap.current = now;
      setTimeout(() => {
        if (Date.now() - lastTap.current >= 260) flashControls();
      }, 290);
    }
    lastTap.current = now;
  };

  const triggerHeart = () => {
    setShowHeart(true);
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(heartScale, { toValue: 1, friction: 3, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(heartOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ]).start(() => setShowHeart(false));
  };

  const shouldTruncate = (post.content?.length || 0) > 80;
  const displayContent = shouldTruncate && !expanded
    ? post.content.substring(0, 80) + '...'
    : post.content;

  return (
    <View style={ss.slide}>
      {/* Video */}
      <TouchableWithoutFeedback onPress={handleTap}>
        <View style={StyleSheet.absoluteFill}>
          {VideoView ? (
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
              allowsPictureInPicture={false}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0a0d14', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: THEME.textSecondary, fontSize: 13 }}>Video available in build</Text>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>

      {/* Dark gradient overlays */}
      <View style={ss.gradientTop} pointerEvents="none" />
      <View style={ss.gradientBottom} pointerEvents="none" />

      {/* Double-tap heart */}
      {showHeart && (
        <Animated.View pointerEvents="none" style={[ss.heartBurst, { transform: [{ scale: heartScale }], opacity: heartOpacity }]}>
          <Heart size={90} color={THEME.primary} fill={THEME.primary} />
        </Animated.View>
      )}

      {/* Play/pause overlay */}
      {showControls && (
        <TouchableOpacity
          style={ss.playOverlay}
          onPress={() => { isPlaying ? player.pause() : player.play(); flashControls(); }}
          activeOpacity={1}
        >
          <View style={ss.playBtn}>
            {isPlaying
              ? <Pause size={36} color="#fff" fill="#fff" />
              : <Play size={36} color="#fff" fill="#fff" />}
          </View>
        </TouchableOpacity>
      )}

      {/* Right action rail */}
      <View style={ss.rail}>
        <ActionBtn icon={<Heart size={26} color={liked ? THEME.primary : '#fff'} fill={liked ? THEME.primary : 'none'} />} count={likesCount} onPress={onLike} active={liked} />
        <ActionBtn icon={<MessageCircle size={26} color="#fff" />} count={commentCount} onPress={onComment} />
        <ActionBtn icon={<Bookmark size={26} color={saved ? THEME.primary : '#fff'} fill={saved ? THEME.primary : 'none'} />} count={null} onPress={onSave} active={saved} />
        <ActionBtn icon={<Share2 size={26} color="#fff" />} count={null} onPress={async () => {
          try { await Share.share({ message: `"${post.content?.substring(0, 100)}..." — Anonixx` }); } catch (e) {}
        }} />
        <TouchableOpacity style={ss.muteBtn} onPress={() => setMuted(v => !v)}>
          {muted ? <VolumeX size={22} color="rgba(255,255,255,0.85)" /> : <Volume2 size={22} color="rgba(255,255,255,0.85)" />}
        </TouchableOpacity>
      </View>

      {/* Bottom info */}
      <View style={ss.bottomInfo}>
        <View style={ss.authorRow}>
          <View style={ss.avatar}>
            <Text style={ss.avatarText}>{post.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
          </View>
          <Text style={ss.authorName}>{post.anonymous_name || 'Anonymous'}</Text>
          <Text style={ss.timeAgo}>{post.time_ago}</Text>
        </View>
        {post.content ? (
          <TouchableOpacity onPress={() => setExpanded(v => !v)} activeOpacity={0.85}>
            <Text style={ss.contentText}>
              {displayContent}
              {shouldTruncate && (
                <Text style={ss.moreText}>{expanded ? ' less' : ' more'}</Text>
              )}
            </Text>
          </TouchableOpacity>
        ) : null}
        {post.topics?.length > 0 && (
          <View style={ss.topicsRow}>
            {post.topics.filter(t => t !== 'general').slice(0, 3).map(t => (
              <View key={t} style={ss.topicTag}>
                <Text style={ss.topicText}>{t}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

// ─── AUDIO SLIDE ──────────────────────────────────────────────
const AudioSlide = ({ post, isActive, onLike, liked, likesCount, onSave, saved, onComment, commentCount }) => {
  const soundRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Auto-pause when slide leaves view
  useEffect(() => {
    if (!isActive && playing) {
      soundRef.current?.pauseAsync();
      setPlaying(false);
    }
  }, [isActive]);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  const togglePlay = async () => {
    try {
      if (!soundRef.current) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: post.audio_url },
          { shouldPlay: true },
          onStatus
        );
        soundRef.current = sound;
        setPlaying(true);
      } else {
        const status = await soundRef.current.getStatusAsync();
        if (status.isPlaying) { await soundRef.current.pauseAsync(); setPlaying(false); }
        else { await soundRef.current.playAsync(); setPlaying(true); }
      }
    } catch (e) { console.error('Audio error:', e); }
  };

  const onStatus = (status) => {
    if (status.isLoaded) {
      const pos = status.positionMillis;
      const dur = status.durationMillis || 0;
      setPosition(pos);
      setDuration(dur);
      const prog = dur > 0 ? pos / dur : 0;
      setProgress(prog);
      Animated.timing(progressAnim, { toValue: prog, duration: 100, useNativeDriver: false }).start();
      if (status.didJustFinish) { setPlaying(false); setProgress(0); setPosition(0); progressAnim.setValue(0); }
    }
  };

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const bars = Array.from({ length: 48 }, (_, i) => ({
    h: Math.sin(i * 0.55) * 20 + Math.cos(i * 0.3) * 10 + 28,
    played: progress > 0 && i / 48 <= progress,
  }));

  const shouldTruncate = (post.content?.length || 0) > 120;
  const displayContent = shouldTruncate && !expanded ? post.content.substring(0, 120) + '...' : post.content;

  return (
    <View style={[ss.slide, { backgroundColor: THEME.background }]}>
      {/* Subtle animated background */}
      <View style={as.bgAccent} />
      <View style={as.bgAccent2} />

      {/* Right action rail */}
      <View style={ss.rail}>
        <ActionBtn icon={<Heart size={26} color={liked ? THEME.primary : '#fff'} fill={liked ? THEME.primary : 'none'} />} count={likesCount} onPress={onLike} active={liked} />
        <ActionBtn icon={<MessageCircle size={26} color="#fff" />} count={commentCount} onPress={onComment} />
        <ActionBtn icon={<Bookmark size={26} color={saved ? THEME.primary : '#fff'} fill={saved ? THEME.primary : 'none'} />} count={null} onPress={onSave} active={saved} />
        <ActionBtn icon={<Share2 size={26} color="#fff" />} count={null} onPress={async () => {
          try { await Share.share({ message: `"${post.content?.substring(0, 100)}..." — Anonixx` }); } catch (e) {}
        }} />
      </View>

      {/* Center audio player */}
      <View style={as.center}>
        {/* Author */}
        <View style={as.authorRow}>
          <View style={as.avatar}>
            <Text style={as.avatarText}>{post.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
          </View>
          <View>
            <Text style={as.authorName}>{post.anonymous_name || 'Anonymous'}</Text>
            <Text style={as.timeAgo}>{post.time_ago}</Text>
          </View>
        </View>

        {/* Content */}
        {post.content ? (
          <TouchableOpacity onPress={() => setExpanded(v => !v)} activeOpacity={0.85} style={as.contentWrap}>
            <Text style={as.contentText}>
              {displayContent}
              {shouldTruncate && <Text style={as.moreText}>{expanded ? ' less' : ' more'}</Text>}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Waveform */}
        <View style={as.waveformWrap}>
          {bars.map((bar, i) => (
            <View
              key={i}
              style={[
                as.bar,
                { height: bar.h },
                bar.played ? as.barPlayed : as.barUnplayed,
              ]}
            />
          ))}
        </View>

        {/* Progress bar */}
        <View style={as.progressTrack}>
          <Animated.View style={[as.progressFill, {
            width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }]} />
        </View>

        {/* Time */}
        <View style={as.timeRow}>
          <Text style={as.timeText}>{formatTime(position)}</Text>
          <Text style={as.timeText}>{duration > 0 ? formatTime(duration) : '--:--'}</Text>
        </View>

        {/* Play button */}
        <TouchableOpacity style={as.playBtn} onPress={togglePlay} activeOpacity={0.85}>
          {playing
            ? <Pause size={32} color="#fff" fill="#fff" />
            : <Play size={32} color="#fff" fill="#fff" />}
        </TouchableOpacity>

        {/* Topics */}
        {post.topics?.length > 0 && (
          <View style={as.topicsRow}>
            {post.topics.filter(t => t !== 'general').slice(0, 3).map(t => (
              <View key={t} style={as.topicTag}>
                <Text style={as.topicText}>{t}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

// ─── ACTION BUTTON (right rail) ───────────────────────────────
const ActionBtn = ({ icon, count, onPress, active }) => (
  <TouchableOpacity style={ss.actionBtn} onPress={onPress} activeOpacity={0.75}>
    {icon}
    {count !== null && count !== undefined && (
      <Text style={[ss.actionCount, active && { color: THEME.primary }]}>{count}</Text>
    )}
  </TouchableOpacity>
);

// ─── MEDIA FEED SCREEN ────────────────────────────────────────
export default function MediaFeedScreen({ route, navigation }) {
  const { posts, startIndex = 0 } = route.params;
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();

  const [activeIndex, setActiveIndex] = useState(startIndex);
  const [likeMap, setLikeMap] = useState(() => {
    const m = {};
    posts.forEach(p => { m[p.id] = { liked: p.is_liked || false, count: p.likes_count || 0 }; });
    return m;
  });
  const [saveMap, setSaveMap] = useState(() => {
    const m = {};
    posts.forEach(p => { m[p.id] = p.is_saved || false; });
    return m;
  });
  const [commentCounts, setCommentCounts] = useState(() => {
    const m = {};
    posts.forEach(p => { m[p.id] = p.thread_count || 0; });
    return m;
  });
  const [commentSheet, setCommentSheet] = useState({ visible: false, postId: null });

  const flatListRef = useRef(null);

  // Scroll to startIndex on mount
  useEffect(() => {
    if (startIndex > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index: startIndex, animated: false });
      }, 50);
    }
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const handleLike = useCallback(async (postId) => {
    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to like', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => navigation.navigate('Auth', { screen: 'Login' }) },
      ]);
      return;
    }
    const current = likeMap[postId];
    const newLiked = !current.liked;
    setLikeMap(prev => ({ ...prev, [postId]: { liked: newLiked, count: newLiked ? current.count + 1 : current.count - 1 } }));
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/like`, {
        method: newLiked ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      // Revert on failure
      setLikeMap(prev => ({ ...prev, [postId]: current }));
    }
  }, [isAuthenticated, likeMap]);

  const handleSave = useCallback(async (postId) => {
    if (!isAuthenticated) return;
    const wasSaved = saveMap[postId];
    setSaveMap(prev => ({ ...prev, [postId]: !wasSaved }));
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/save`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      setSaveMap(prev => ({ ...prev, [postId]: wasSaved }));
    }
  }, [isAuthenticated, saveMap]);

  const getItemLayout = useCallback((_, index) => ({
    length: height,
    offset: height * index,
    index,
  }), []);

  const renderItem = useCallback(({ item, index }) => {
    const isActive = index === activeIndex;
    const likeState = likeMap[item.id] || { liked: false, count: 0 };

    const commonProps = {
      post: item,
      isActive,
      liked: likeState.liked,
      likesCount: likeState.count,
      saved: saveMap[item.id] || false,
      commentCount: commentCounts[item.id] || 0,
      onLike: () => handleLike(item.id),
      onSave: () => handleSave(item.id),
      onComment: () => setCommentSheet({ visible: true, postId: item.id }),
      navigation,
    };

    return item.video_url
      ? <VideoSlide key={item.id} {...commonProps} />
      : <AudioSlide key={item.id} {...commonProps} />;
  }, [activeIndex, likeMap, saveMap, commentCounts, handleLike, handleSave]);

  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <View style={ss.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      {/* Back button */}
      <TouchableOpacity
        style={[ss.backBtn, { top: insets.top + 12 }]}
        onPress={() => navigation.goBack()}
      >
        <ArrowLeft size={22} color="#fff" />
      </TouchableOpacity>

      {/* Post counter */}
      <View style={[ss.counter, { top: insets.top + 14 }]}>
        <Text style={ss.counterText}>{activeIndex + 1} / {posts.length}</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={posts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        pagingEnabled
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialScrollIndex={startIndex}
        removeClippedSubviews
        maxToRenderPerBatch={3}
        windowSize={3}
        initialNumToRender={2}
      />

      {/* Comment sheet */}
      <CommentSheet
        visible={commentSheet.visible}
        postId={commentSheet.postId}
        isAuthenticated={isAuthenticated}
        navigation={navigation}
        onClose={() => setCommentSheet({ visible: false, postId: null })}
        onCountChange={(count) => {
          if (commentSheet.postId) {
            setCommentCounts(prev => ({ ...prev, [commentSheet.postId]: count }));
          }
        }}
      />
    </View>
  );
}

// ─── SLIDE STYLES ─────────────────────────────────────────────
const ss = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  slide: { width, height, backgroundColor: '#000' },

  gradientTop: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 120,
    // Simulated gradient via opacity layers
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  gradientBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 280,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  // Right action rail
  rail: {
    position: 'absolute', right: 14, bottom: 100,
    alignItems: 'center', gap: 22,
  },
  actionBtn: { alignItems: 'center', gap: 4 },
  actionCount: { fontSize: 13, fontWeight: '700', color: '#fff' },
  muteBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 6,
  },

  // Bottom info (video)
  bottomInfo: {
    position: 'absolute', bottom: 40, left: 16, right: 72,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: THEME.avatarBg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: THEME.primary,
  },
  avatarText: { fontSize: 14, fontWeight: '700', color: THEME.primary },
  authorName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  timeAgo: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginLeft: 6 },
  contentText: { fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 20, marginBottom: 8 },
  moreText: { color: THEME.primary, fontWeight: '600' },
  topicsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  topicTag: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: 'rgba(255,99,74,0.2)',
    borderWidth: 1, borderColor: 'rgba(255,99,74,0.35)',
  },
  topicText: { fontSize: 11, color: THEME.primary, fontWeight: '600' },

  // Play overlay
  playOverlay: {
    position: 'absolute', top: 0, left: 0, right: 72, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  playBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Heart burst
  heartBurst: {
    position: 'absolute', top: '50%', left: '50%',
    marginLeft: -45, marginTop: -45, zIndex: 100,
  },

  // Nav
  backBtn: {
    position: 'absolute', left: 16, zIndex: 100,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  counter: {
    position: 'absolute', right: 16, zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 12,
  },
  counterText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
});

// ─── AUDIO SLIDE STYLES ───────────────────────────────────────
const as = StyleSheet.create({
  bgAccent: {
    position: 'absolute', top: -100, left: -80,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(255,99,74,0.06)',
  },
  bgAccent2: {
    position: 'absolute', bottom: -80, right: -60,
    width: 250, height: 250, borderRadius: 125,
    backgroundColor: 'rgba(255,99,74,0.04)',
  },
  center: {
    flex: 1, paddingHorizontal: 28, paddingTop: 100,
    paddingBottom: 120, justifyContent: 'center',
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: THEME.avatarBg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: THEME.primary,
  },
  avatarText: { fontSize: 17, fontWeight: '700', color: THEME.primary },
  authorName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  timeAgo: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },

  contentWrap: { marginBottom: 28 },
  contentText: { fontSize: 16, lineHeight: 24, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.2 },
  moreText: { color: THEME.primary, fontWeight: '600' },

  waveformWrap: {
    flexDirection: 'row', alignItems: 'center',
    gap: 3, height: 64, marginBottom: 12,
  },
  bar: { width: 4, borderRadius: 3 },
  barPlayed: { backgroundColor: THEME.primary },
  barUnplayed: { backgroundColor: 'rgba(255,255,255,0.15)' },

  progressTrack: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 2, marginBottom: 8, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: THEME.primary, borderRadius: 2,
  },

  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  timeText: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },

  playBtn: {
    alignSelf: 'center',
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: THEME.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },

  topicsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  topicTag: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    backgroundColor: 'rgba(255,99,74,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,99,74,0.25)',
  },
  topicText: { fontSize: 12, color: THEME.primary, fontWeight: '600' },
});

// ─── COMMENT SHEET STYLES ─────────────────────────────────────
const cs = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: height * 0.60,
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 14, color: THEME.textSecondary, fontStyle: 'italic', textAlign: 'center' },
  list: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  commentItem: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  commentAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: THEME.avatarBg, alignItems: 'center', justifyContent: 'center',
  },
  commentAvatarText: { fontSize: 13, fontWeight: '700', color: THEME.primary },
  commentBody: { flex: 1 },
  commentAuthor: { fontSize: 13, fontWeight: '600', color: THEME.text, marginBottom: 3 },
  commentText: { fontSize: 14, color: THEME.textSecondary, lineHeight: 20 },
  commentTime: { fontSize: 11, color: THEME.textSecondary, marginTop: 3, opacity: 0.6 },
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
