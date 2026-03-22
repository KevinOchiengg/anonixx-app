import React, {
  useCallback, useEffect, useRef, useState, useMemo,
} from 'react';
import {
  Animated, Dimensions, FlatList, Image, KeyboardAvoidingView,
  Modal, PanResponder, Platform, ScrollView, Share, StyleSheet,
  Text, TextInput, TouchableOpacity, TouchableWithoutFeedback,
  View, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Audio } from 'expo-av';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import {
  Bookmark, ChevronDown, EyeOff, Flag, Heart, Link,
  MessageCircle, MoreHorizontal, Play, Send, Share2,
  UserX, VolumeX, X, CornerDownRight,
} from 'lucide-react-native';
import Slider from '@react-native-community/slider';
import { API_BASE_URL } from '../../config/api';
import AnonProfileSheet from '../connect/AnonProfileSheet';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ui/Toast';
import { CommentBottomSheet } from './CommentBottomSheet';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP,
} from '../../utils/responsive';

const { width: W, height: H } = Dimensions.get('window');


// ─── Theme ────────────────────────────────────────────────────
const T = {
  background:   '#0b0f18',
  surface:      '#151924',
  surfaceAlt:   '#1a1f2e',
  primary:      '#FF634A',
  primaryDim:   'rgba(255,99,74,0.10)',
  primaryBorder:'rgba(255,99,74,0.20)',
  text:         '#EAEAF0',
  textSecondary:'#9A9AA3',
  textMuted:    '#5a5f70',
  border:       'rgba(255,255,255,0.05)',
  borderStrong: 'rgba(255,255,255,0.10)',
  avatarBg:     '#1e2330',
};

// ─── Double tap like ──────────────────────────────────────────
const DoubleTapLike = React.memo(({ children, onDoubleTap }) => {
  const scaleAnim   = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const lastTap     = useRef(null);
  const [heartVisible, setHeartVisible] = useState(false);

  const triggerHeart = useCallback(() => {
    setHeartVisible(true);
    scaleAnim.setValue(0);
    opacityAnim.setValue(1);
    Animated.parallel([
      Animated.spring(scaleAnim,   { toValue: 1, friction: 3, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 900, delay: 200, useNativeDriver: true }),
    ]).start(() => setHeartVisible(false));
    onDoubleTap?.();
  }, [onDoubleTap]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (lastTap.current && now - lastTap.current < 300) {
      triggerHeart();
    } else {
      lastTap.current = now;
    }
  }, [triggerHeart]);

  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={{ position: 'relative' }}>
        {children}
        {heartVisible && (
          <Animated.View
            pointerEvents="none"
            style={[styles.heartAnim, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}
          >
            <Heart size={rs(80)} color={T.primary} fill={T.primary} />
          </Animated.View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
});

// ─── Audio Player ─────────────────────────────────────────────
const BARS = Array.from({ length: 28 }, (_, i) => ({
  id:     i,
  height: Math.sin(i * 0.8) * 12 + 8 + (i % 3) * 4,
}));

const AudioPlayer = React.memo(({ onMediaPress }) => (
  <TouchableOpacity style={styles.audioWrap} onPress={onMediaPress} activeOpacity={0.85} hitSlop={HIT_SLOP}>
    <View style={styles.audioPlayBtn}>
      <Play size={rs(18)} color="#fff" fill="#fff" />
    </View>
    <View style={styles.audioRight}>
      <View style={styles.waveform}>
        {BARS.map(b => (
          <View key={b.id} style={[styles.waveBar, { height: b.height }]} />
        ))}
      </View>
      <View style={styles.audioMeta}>
        <Text style={styles.audioMetaText}>tap to play</Text>
        <Text style={styles.audioMetaText}>audio confession</Text>
      </View>
    </View>
  </TouchableOpacity>
));

// ─── Video Player ─────────────────────────────────────────────
const VideoPlayer = React.memo(({ videoUrl, isActive, viewCount, onMediaPress }) => {
  const [thumbnail,   setThumbnail]   = useState(null);
  const [thumbLoading,setThumbLoading]= useState(true);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [isMuted,     setIsMuted]     = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const isSeekingRef  = useRef(false);
  const overlayOp     = useRef(new Animated.Value(1)).current;

  const inlinePlayer = useVideoPlayer(videoUrl, (p) => {
    p.loop  = true;
    p.muted = true;
  });

  // Track playing state
  useEffect(() => {
    const sub = inlinePlayer.addListener('playingChange', ({ isPlaying: playing }) => {
      setIsPlaying(playing);
    });
    return () => sub.remove();
  }, [inlinePlayer]);

  // Poll currentTime + duration every 250 ms while playing
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      if (isSeekingRef.current) return;
      const ct = inlinePlayer.currentTime;
      const d  = inlinePlayer.duration;
      if (typeof ct === 'number' && !isNaN(ct)) setCurrentTime(ct);
      if (typeof d  === 'number' && !isNaN(d) && d > 0) setDuration(d);
    }, 250);
    return () => clearInterval(id);
  }, [isPlaying, inlinePlayer]);

  useEffect(() => {
    if (isActive) inlinePlayer.play();
    else          inlinePlayer.pause();
  }, [isActive]);

  useEffect(() => {
    Animated.timing(overlayOp, {
      toValue:  isPlaying ? 0 : 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [isPlaying]);

  useEffect(() => {
    let cancelled = false;
    const gen = async () => {
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(videoUrl, { time: 1000, quality: 0.7 });
        if (!cancelled) setThumbnail(uri);
      } catch {}
      finally { if (!cancelled) setThumbLoading(false); }
    };
    gen();
    return () => { cancelled = true; };
  }, [videoUrl]);

  const toggleMute = useCallback((e) => {
    e.stopPropagation();
    const next = !isMuted;
    inlinePlayer.muted = next;
    setIsMuted(next);
  }, [isMuted, inlinePlayer]);

  const handleSeekComplete = useCallback((val) => {
    inlinePlayer.seekBy(val - inlinePlayer.currentTime);
    setCurrentTime(val);
    isSeekingRef.current = false;
  }, [inlinePlayer]);

  const views = viewCount >= 1000
    ? `${(viewCount / 1000).toFixed(1)}k`
    : String(viewCount || 0);

  return (
    <TouchableOpacity style={styles.videoWrap} onPress={() => { inlinePlayer.pause(); onMediaPress?.(currentTime); }} activeOpacity={0.97}>
      {thumbLoading && (
        <View style={styles.videoLoading}>
          <ActivityIndicator color={T.primary} />
        </View>
      )}
      {thumbnail && !isPlaying && (
        <Image source={{ uri: thumbnail }} style={styles.videoFill} resizeMode="cover" />
      )}
      <VideoView
        player={inlinePlayer}
        style={[styles.videoFill, !isPlaying && styles.hidden]}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
      <View style={styles.videoGradient} pointerEvents="none" />
      <Animated.View pointerEvents="none" style={[styles.videoCenter, { opacity: overlayOp }]}>
        <View style={styles.videoPlayRing}>
          <Play size={rs(22)} color="#fff" fill="#fff" />
        </View>
      </Animated.View>

      <View style={styles.videoBottom}>
        {isPlaying && (
          <View style={styles.videoLiveRow} pointerEvents="none">
            <View style={styles.videoLiveDot} />
            <Text style={styles.videoLiveText}>playing</Text>
          </View>
        )}
        <View style={styles.videoMetaRow}>
          {/* Mute/unmute chip — always visible while playing */}
          {isPlaying && (
            <TouchableOpacity
              onPress={toggleMute}
              hitSlop={HIT_SLOP}
              style={styles.videoMutedChip}
              activeOpacity={0.75}
            >
              <VolumeX size={rs(10)} color="rgba(255,255,255,0.6)" />
              <Text style={styles.videoMutedText}>{isMuted ? 'unmute' : 'mute'}</Text>
            </TouchableOpacity>
          )}
          {viewCount > 0 && (
            <View style={styles.videoViewsChip} pointerEvents="none">
              <Text style={styles.videoViewsText}>👁 {views}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Seekable progress bar */}
      {duration > 0 && (
        <View
          style={styles.videoProgressWrap}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
        >
          <Slider
            style={styles.videoProgressSlider}
            minimumValue={0}
            maximumValue={duration}
            value={currentTime}
            minimumTrackTintColor={T.primary}
            maximumTrackTintColor="rgba(255,255,255,0.22)"
            thumbTintColor={T.primary}
            onSlidingStart={() => { isSeekingRef.current = true; }}
            onValueChange={(val) => setCurrentTime(val)}
            onSlidingComplete={handleSeekComplete}
          />
        </View>
      )}
    </TouchableOpacity>
  );
});


// ─── Menu Item ────────────────────────────────────────────────
const MenuItem = React.memo(({ item }) => (
  <TouchableOpacity style={styles.menuItem} onPress={item.onPress} hitSlop={HIT_SLOP}>
    {item.icon}
    <Text style={[styles.menuItemText, item.danger && { color: T.primary }]}>
      {item.label}
    </Text>
  </TouchableOpacity>
));

// ─── Main Card ────────────────────────────────────────────────
function CalmPostCard({
  post, onResponse, onSave, onViewThread, onPress,
  onMediaPress, navigation, activeVideoId, nextVideo, onVideoChange,
}) {
  const { isAuthenticated } = useAuth();
  const { showToast }       = useToast();

  const [menuVisible,         setMenuVisible]         = useState(false);
  const [profileSheetVisible, setProfileSheetVisible] = useState(false);
  const [showFullContent,     setShowFullContent]     = useState(false);
  const [showComments,        setShowComments]        = useState(false);
  const [liked,               setLiked]               = useState(post.is_liked || false);
  const [likesCount,          setLikesCount]          = useState(post.likes_count || 0);
  const [animating,           setAnimating]           = useState(false);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setLiked(post.is_liked || false);
    setLikesCount(post.likes_count || 0);
  }, [post.is_liked, post.likes_count]);

  // ── Like ────────────────────────────────────────────────────
  const handleLike = useCallback(async () => {
    if (animating) return;
    if (!isAuthenticated) {
      showToast({ type: 'info', message: 'Sign in to like confessions.' });
      return;
    }
    setAnimating(true);
    const newLiked = !liked;
    setLiked(newLiked);
    setLikesCount(c => newLiked ? c + 1 : c - 1);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.35, duration: 120, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 120, useNativeDriver: true }),
    ]).start(() => setAnimating(false));
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/like`, {
        method:  newLiked ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) { setLiked(data.liked); setLikesCount(data.likes_count); }
      else { setLiked(!newLiked); setLikesCount(c => newLiked ? c - 1 : c + 1); }
    } catch {
      setLiked(!newLiked);
      setLikesCount(c => newLiked ? c - 1 : c + 1);
    }
  }, [animating, isAuthenticated, liked, post.id, scaleAnim, showToast]);

  const handleDoubleTap = useCallback(async () => {
    if (liked || !isAuthenticated) return;
    setLiked(true);
    setLikesCount(c => c + 1);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.35, duration: 120, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 120, useNativeDriver: true }),
    ]).start();
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/like`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) { setLiked(data.liked); setLikesCount(data.likes_count); }
    } catch {}
  }, [liked, isAuthenticated, post.id, scaleAnim]);

  // ── Share ───────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    try {
      const link     = `anonixx://confession/${post.id}`;
      const preview  = post.content?.substring(0, 100) ?? '';
      const ellipsis = (post.content?.length ?? 0) > 100 ? '…' : '';
      await Share.share({
        message: `"${preview}${ellipsis}"\n\nRead on Anonixx 👇\n${link}`,
        url: link,
      });
    } catch {}
  }, [post.id, post.content]);

  // ── Copy Link ───────────────────────────────────────────────
  const handleCopyLink = useCallback(async () => {
    setMenuVisible(false);
    try {
      await Clipboard.setStringAsync(`anonixx://confession/${post.id}`);
      showToast({ type: 'success', message: 'Link copied.' });
    } catch {
      showToast({ type: 'error', message: 'Could not copy link.' });
    }
  }, [post.id, showToast]);

  const handleReport = useCallback(() => {
    setMenuVisible(false);
    showToast({ type: 'info', message: 'Report submitted. Thank you.' });
  }, [showToast]);

  const handleBlockUser = useCallback(async () => {
    setMenuVisible(false);
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/users/block`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ user_id: post.user_id }),
      });
      showToast({ type: 'success', message: 'User blocked.' });
    } catch {}
  }, [post.user_id, showToast]);

  const handleProfilePress  = useCallback(() => setProfileSheetVisible(true), []);
  const handleMenuOpen      = useCallback(() => setMenuVisible(true),          []);
  const handleMenuClose     = useCallback(() => setMenuVisible(false),         []);
  const handleCommentsOpen  = useCallback(() => setShowComments(true),         []);
  const handleCommentsClose = useCallback(() => setShowComments(false),        []);
  const handlePostPress     = useCallback(() => onPress?.(post),               [onPress, post]);
  const handleSave          = useCallback((e) => { e.stopPropagation(); onSave(post.id); },          [onSave, post.id]);
  const handleSharePress    = useCallback((e) => { e.stopPropagation(); handleShare(); },            [handleShare]);
  const handleCommentPress  = useCallback((e) => { e.stopPropagation(); handleCommentsOpen(); },     [handleCommentsOpen]);
  const handleLikePress     = useCallback((e) => { e.stopPropagation(); handleLike(); },             [handleLike]);
  const handleReadMore      = useCallback((e) => { e.stopPropagation(); setShowFullContent(true);  }, []);
  const handleShowLess      = useCallback((e) => { e.stopPropagation(); setShowFullContent(false); }, []);
  const handleMediaPress    = useCallback((time) => onMediaPress?.(post, time), [onMediaPress, post]);

  const isTextOnly     = !post.images?.length && !post.video_url && !post.audio_url;
  const shouldTruncate = (post.content?.length ?? 0) > 400;
  const displayContent = shouldTruncate && !showFullContent
    ? post.content.substring(0, 400) + '...'
    : post.content;

  const menuItems = useMemo(() => [
    {
      icon:    <Bookmark size={rs(18)} color={post.is_saved ? T.primary : T.textSecondary} fill={post.is_saved ? T.primary : 'none'} />,
      label:   post.is_saved ? 'Unsave' : 'Save',
      onPress: () => { handleMenuClose(); onSave(post.id); },
    },
    {
      icon:    <Share2 size={rs(18)} color={T.textSecondary} />,
      label:   'Share',
      onPress: () => { handleMenuClose(); handleShare(); },
    },
    {
      icon:    <Link size={rs(18)} color={T.textSecondary} />,
      label:   'Copy Link',
      onPress: handleCopyLink,
    },
    {
      icon:    <EyeOff size={rs(18)} color={T.textSecondary} />,
      label:   'Hide Post',
      onPress: handleMenuClose,
    },
    {
      icon:    <Flag size={rs(18)} color={T.primary} />,
      label:   'Report',
      onPress: handleReport,
      danger:  true,
    },
    {
      icon:    <UserX size={rs(18)} color={T.primary} />,
      label:   'Block User',
      onPress: handleBlockUser,
      danger:  true,
    },
  ], [post.is_saved, post.id, onSave, handleShare, handleCopyLink, handleReport, handleBlockUser, handleMenuClose]);

  return (
    <View style={styles.cardWrapper}>
      <View style={styles.card}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerLeft} onPress={handleProfilePress} activeOpacity={0.7} hitSlop={HIT_SLOP}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{post.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
            </View>
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{post.anonymous_name || 'Anonymous'}</Text>
              <Text style={styles.timestamp}>{post.time_ago}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleMenuOpen} hitSlop={HIT_SLOP} style={styles.moreBtn}>
            <MoreHorizontal size={rs(18)} color={T.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <DoubleTapLike onDoubleTap={handleDoubleTap}>
          <TouchableOpacity style={styles.body} onPress={handlePostPress} activeOpacity={0.97}>
            {post.content ? (
              <>
                <Text style={styles.content}>{displayContent}</Text>
                {shouldTruncate && !showFullContent && (
                  <TouchableOpacity onPress={handleReadMore} hitSlop={HIT_SLOP}>
                    <Text style={styles.readMore}>Read more</Text>
                  </TouchableOpacity>
                )}
                {shouldTruncate && showFullContent && (
                  <TouchableOpacity onPress={handleShowLess} hitSlop={HIT_SLOP}>
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

            {post.video_url && (
              <VideoPlayer
                videoUrl={post.video_url}
                isActive={activeVideoId === post.id}
                postId={post.id}
                viewCount={post.views_count || 0}
                onMediaPress={handleMediaPress}
              />
            )}

            {post.audio_url && <AudioPlayer onMediaPress={handleMediaPress} />}

            <View style={styles.divider} />

            {isTextOnly && <Text style={styles.hint}>say something if it hits.</Text>}
            {(post.video_url || post.audio_url) && <Text style={styles.hint}>swipe through confessions ↑</Text>}

            <View style={styles.actions}>
              <View style={styles.actionsLeft}>
                <TouchableOpacity onPress={handleSave} style={styles.action} hitSlop={HIT_SLOP}>
                  <Bookmark size={rs(17)} color={post.is_saved ? T.primary : T.textSecondary} fill={post.is_saved ? T.primary : 'none'} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSharePress} style={styles.action} hitSlop={HIT_SLOP}>
                  <Share2 size={rs(17)} color={T.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.actionsRight}>
                <TouchableOpacity onPress={handleCommentPress} style={styles.action} hitSlop={HIT_SLOP}>
                  <MessageCircle size={rs(18)} color={T.textSecondary} />
                  <Text style={styles.actionCount}>{post.thread_count || 0}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleLikePress} style={styles.action} hitSlop={HIT_SLOP}>
                  <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                    <Heart size={rs(18)} color={liked ? T.primary : T.textSecondary} fill={liked ? T.primary : 'none'} />
                  </Animated.View>
                  <Text style={[styles.actionCount, liked && { color: T.primary }]}>{likesCount}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </DoubleTapLike>
      </View>

      <CommentBottomSheet
        visible={showComments}
        postId={post.id}
        isAuthenticated={isAuthenticated}
        navigation={navigation}
        onClose={handleCommentsClose}
      />

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={handleMenuClose}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={handleMenuClose}>
          <View style={styles.menuSheet}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Options</Text>
              <TouchableOpacity onPress={handleMenuClose} hitSlop={HIT_SLOP}>
                <X size={rs(20)} color={T.textSecondary} />
              </TouchableOpacity>
            </View>
            {menuItems.map((item, i) => <MenuItem key={i} item={item} />)}
            <TouchableOpacity style={styles.cancelBtn} onPress={handleMenuClose} hitSlop={HIT_SLOP}>
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

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  cardWrapper:      { position: 'relative', marginBottom: rp(24), marginHorizontal: SPACING.md },
  card:             { backgroundColor: T.surface, paddingVertical: rp(20), paddingHorizontal: rp(20), paddingLeft: rp(22), borderRadius: RADIUS.lg, borderLeftWidth: 1, borderLeftColor: T.primary, shadowColor: '#000', shadowOffset: { width: 0, height: rs(8) }, shadowOpacity: 0.4, shadowRadius: rs(24), elevation: 8 },
  heartAnim:        { position: 'absolute', top: '40%', left: '50%', marginLeft: -rs(40), marginTop: -rs(40), zIndex: 1000 },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: rp(12) },
  headerLeft:       { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar:           { width: rs(38), height: rs(38), borderRadius: rs(19), backgroundColor: T.avatarBg, alignItems: 'center', justifyContent: 'center', marginRight: rp(10), borderWidth: 1, borderColor: 'rgba(255,99,74,0.2)' },
  avatarText:       { fontSize: FONT.md, fontWeight: '700', color: T.primary },
  authorInfo:       { flex: 1 },
  authorName:       { fontSize: FONT.sm, fontWeight: '600', color: T.text },
  timestamp:        { fontSize: FONT.xs, color: T.textSecondary, marginTop: rp(1) },
  moreBtn:          { padding: rp(4) },
  divider:          { height: 1, backgroundColor: T.border, marginVertical: rp(12) },
  body:             { paddingBottom: rp(4) },
  content:          { fontSize: FONT.md, lineHeight: rf(26), color: T.text, letterSpacing: 0.2, marginBottom: rp(10), fontFamily: 'PlayfairDisplay-Regular' },
  readMore:         { fontSize: FONT.sm, fontWeight: '500', color: T.primary, marginBottom: rp(12) },
  imagesScroll:     { marginBottom: rp(14) },
  postImage:        { width: W - rs(90), height: rs(200), borderRadius: RADIUS.md, marginRight: rp(8) },
  videoWrap:        { position: 'relative', marginBottom: rp(14), borderRadius: RADIUS.lg, overflow: 'hidden', height: rs(240), backgroundColor: '#06080f', borderWidth: 1, borderColor: 'rgba(255,99,74,0.15)' },
  videoFill:        { width: '100%', height: '100%' },
  hidden:           { position: 'absolute', opacity: 0 },
  videoLoading:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#06080f' },
  videoGradient:    { position: 'absolute', bottom: 0, left: 0, right: 0, height: rs(100), backgroundColor: 'transparent', shadowColor: '#000', shadowOffset: { width: 0, height: -rs(40) }, shadowOpacity: 0.8, shadowRadius: rs(40) },
  videoCenter:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  videoPlayRing:    { width: rs(54), height: rs(54), borderRadius: rs(27), backgroundColor: 'rgba(255,99,74,0.85)', alignItems: 'center', justifyContent: 'center', shadowColor: T.primary, shadowOffset: { width: 0, height: rs(4) }, shadowOpacity: 0.6, shadowRadius: rs(12), borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  videoBottom:      { position: 'absolute', bottom: rs(30), left: 0, right: 0, paddingHorizontal: rp(12), paddingBottom: rp(10), flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  videoLiveRow:     { flexDirection: 'row', alignItems: 'center', gap: rp(5) },
  videoLiveDot:     { width: rs(6), height: rs(6), borderRadius: rs(3), backgroundColor: T.primary },
  videoLiveText:    { fontSize: rf(10), color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  videoMetaRow:     { flexDirection: 'row', gap: rp(6), alignItems: 'center', marginLeft: 'auto' },
  videoMutedChip:   { flexDirection: 'row', alignItems: 'center', gap: rp(3), backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: rp(7), paddingVertical: rp(4), borderRadius: rp(8) },
  videoMutedText:   { fontSize: rf(10), color: 'rgba(255,255,255,0.6)' },
  videoViewsChip:   { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: rp(8), paddingVertical: rp(4), borderRadius: rp(8) },
  videoViewsText:   { fontSize: rf(10), color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  videoProgressWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, height: rs(22) },
  videoProgressSlider: { width: '100%', height: rs(22) },
  audioWrap:        { flexDirection: 'row', alignItems: 'center', gap: rp(12), backgroundColor: T.primaryDim, borderWidth: 1, borderColor: T.primaryBorder, padding: rp(14), borderRadius: RADIUS.md, marginBottom: rp(14) },
  audioPlayBtn:     { width: rs(44), height: rs(44), borderRadius: rs(22), backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center', shadowColor: T.primary, shadowOffset: { width: 0, height: rs(4) }, shadowOpacity: 0.5, shadowRadius: rs(8) },
  audioRight:       { flex: 1 },
  waveform:         { flexDirection: 'row', alignItems: 'center', gap: rp(2), height: rs(36) },
  waveBar:          { width: rp(3), borderRadius: rp(2), backgroundColor: 'rgba(255,255,255,0.12)' },
  audioMeta:        { flexDirection: 'row', justifyContent: 'space-between', marginTop: rp(4) },
  audioMetaText:    { fontSize: FONT.xs, color: T.textSecondary },
  hint:             { fontSize: FONT.sm, color: T.textSecondary, fontStyle: 'italic', marginBottom: rp(12) },
  actions:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: rp(2) },
  actionsLeft:      { flexDirection: 'row', alignItems: 'center', gap: rp(16) },
  actionsRight:     { flexDirection: 'row', alignItems: 'center', gap: rp(16) },
  action:           { flexDirection: 'row', alignItems: 'center', gap: rp(6) },
  actionCount:      { fontSize: FONT.sm, fontWeight: '500', color: T.textSecondary },
  menuOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  menuSheet:        { backgroundColor: T.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, paddingBottom: rp(24) },
  menuHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: rp(18), borderBottomWidth: 1, borderBottomColor: T.border },
  menuTitle:        { fontSize: FONT.md, fontWeight: '700', color: T.text },
  menuItem:         { flexDirection: 'row', alignItems: 'center', gap: rp(14), padding: rp(16), borderBottomWidth: 1, borderBottomColor: T.border },
  menuItemText:     { fontSize: FONT.md, fontWeight: '500', color: T.text },
  cancelBtn:        { margin: rp(16), padding: rp(16), borderRadius: RADIUS.md, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  cancelText:       { fontSize: FONT.md, fontWeight: '600', color: T.textSecondary },
});


// ─── Memo comparison ──────────────────────────────────────────
const areEqual = (prev, next) =>
  prev.post.id           === next.post.id           &&
  prev.post.is_saved     === next.post.is_saved      &&
  prev.post.is_liked     === next.post.is_liked      &&
  prev.post.likes_count  === next.post.likes_count   &&
  prev.post.thread_count === next.post.thread_count  &&
  // Only re-render if THIS card's active state changed
  (prev.activeVideoId === prev.post.id) === (next.activeVideoId === next.post.id);

export default React.memo(CalmPostCard, areEqual);

