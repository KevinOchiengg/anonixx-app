import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  View, FlatList, ActivityIndicator, StyleSheet,
  StatusBar, Text, TouchableOpacity, Animated, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Search, Flame, RefreshCw, Menu } from 'lucide-react-native';
import HamburgerMenu from '../../components/ui/HamburgerMenu';
import DailyRewardBanner from '../../components/rewards/DailyRewardBanner';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import CalmPostCard from '../../components/feed/CalmPostCard';
import FeedDivider from '../../components/feed/FeedDivider';
import MoodBalancer from '../../components/feed/MoodBalancer';
import AuthPromptModal from '../../components/modals/AuthPromptModal';
import { API_BASE_URL } from '../../config/api';
import {
  rs, rf, rp, rh, SPACING, FONT, RADIUS,
  BUTTON_HEIGHT, SCREEN, HIT_SLOP, isSmallDevice,
} from '../../utils/responsive';

const THEME = {
  background:    '#0b0f18',
  surface:       '#151924',
  surfaceAlt:    '#1a1f2e',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.10)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  border:        'rgba(255,255,255,0.05)',
  borderStrong:  'rgba(255,255,255,0.10)',
};

// ── Stars ─────────────────────────────────────────────────────
const STARS = Array.from({ length: 80 }, (_, i) => ({
  id: i,
  top:     Math.random() * SCREEN.height * 3,
  left:    Math.random() * SCREEN.width,
  size:    Math.random() * rs(4) + rs(1),
  opacity: Math.random() * 0.45 + 0.1,
}));

const StarryBackground = React.memo(() => (
  <>
    {STARS.map((s) => (
      <View key={s.id} style={{
        position: 'absolute', backgroundColor: THEME.primary,
        borderRadius: s.size, top: s.top, left: s.left,
        width: s.size, height: s.size, opacity: s.opacity,
      }} />
    ))}
  </>
));

// ── Streak Banner ─────────────────────────────────────────────
const StreakBanner = React.memo(({ message, onDismiss }) => {
  const slideAnim   = useRef(new Animated.Value(rh(-80))).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim,  { toValue: 0, useNativeDriver: true, tension: 70, friction: 10 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideAnim,   { toValue: rh(-80), duration: 300, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0,       duration: 300, useNativeDriver: true }),
      ]).start(onDismiss);
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.streakBanner, {
      transform: [{ translateY: slideAnim }],
      opacity:   opacityAnim,
    }]}>
      <Flame size={rs(16)} color={THEME.primary} fill={THEME.primary} />
      <Text style={styles.streakText}>{message}</Text>
      <TouchableOpacity onPress={onDismiss} hitSlop={HIT_SLOP} style={styles.streakDismiss}>
        <Text style={styles.streakDismissText}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ── Skeleton loader ───────────────────────────────────────────
const SkeletonCard = React.memo(() => {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] });
  return (
    <Animated.View style={[styles.skeletonCard, { opacity }]}>
      <View style={styles.skeletonAvatar} />
      <View style={styles.skeletonLines}>
        <View style={[styles.skeletonLine, { width: '75%' }]} />
        <View style={[styles.skeletonLine, { width: '55%', marginTop: rh(8) }]} />
        <View style={[styles.skeletonLine, { width: '40%', marginTop: rh(8) }]} />
      </View>
    </Animated.View>
  );
});

// ── Session limit screen ───────────────────────────────────────
const SessionLimitView = React.memo(({ hasMore, onContinue, onClose }) => (
  <View style={styles.centeredView}>
    <View style={styles.limitCard}>
      <Text style={styles.limitEmoji}>🌑</Text>
      <Text style={styles.limitTitle}>You've been deep in it.</Text>
      <View style={styles.limitDivider} />
      <Text style={styles.limitSubtitle}>
        Sometimes the truth hits differently when you step away from it.
      </Text>
      <Text style={styles.limitMessage}>Come back when you have more to say.</Text>
      <View style={styles.limitButtons}>
        <TouchableOpacity onPress={onClose} style={styles.limitBtnSecondary} activeOpacity={0.8}>
          <Text style={styles.limitBtnSecondaryText}>Close</Text>
        </TouchableOpacity>
        {hasMore && (
          <TouchableOpacity onPress={onContinue} style={styles.limitBtnPrimary} activeOpacity={0.85}>
            <Text style={styles.limitBtnPrimaryText}>5 more posts</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  </View>
));

// ── Empty state ───────────────────────────────────────────────
const EmptyState = React.memo(({ onRefresh }) => (
  <View style={styles.centeredView}>
    <View style={styles.emptyCard}>
      <Text style={styles.emptyEmoji}>✨</Text>
      <Text style={styles.emptyTitle}>Nothing here yet</Text>
      <Text style={styles.emptySubtitle}>
        The feed is quiet. Be the first to confess something real.
      </Text>
      <TouchableOpacity onPress={onRefresh} style={styles.emptyRefreshBtn} activeOpacity={0.8}>
        <RefreshCw size={rs(16)} color={THEME.primary} />
        <Text style={styles.emptyRefreshText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  </View>
));

// ── Main screen ───────────────────────────────────────────────
export default function CalmFeedScreen({ navigation, route }) {
  const { isAuthenticated, checkAuth } = useAuth();
  const insets                         = useSafeAreaInsets();
  const { showToast }                  = useToast();

  const [posts, setPosts]                   = useState([]);
  const [loading, setLoading]               = useState(true);
  const [sessionPosts, setSessionPosts]     = useState(0);
  const [hasMore, setHasMore]               = useState(true);
  const [sessionLimitReached, setSessionLimitReached] = useState(false);
  const [authModalVisible, setAuthModalVisible]       = useState(false);
  const [authModalAction, setAuthModalAction]         = useState('default');
  const [streakBanner, setStreakBanner]     = useState(null);
  const [activeVideoId, setActiveVideoId]   = useState(null);
  const [nextVideo, setNextVideo]           = useState(null);
  const [menuVisible, setMenuVisible]       = useState(false);

  const flatListRef   = useRef(null);
  const postsRef      = useRef([]);
  const loadingRef    = useRef(false);
  const hasLoadedRef  = useRef(false);

  useEffect(() => { postsRef.current = posts; }, [posts]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 300,
  }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const visibleVideo = viewableItems.find(
      (v) => v.item?.type === 'post' && v.item?.video_url
    );
    if (visibleVideo) {
      setActiveVideoId(visibleVideo.item.id);
      const videoPosts = postsRef.current.filter((p) => p.type === 'post' && p.video_url);
      const idx = videoPosts.findIndex((p) => p.id === visibleVideo.item.id);
      setNextVideo(videoPosts[idx + 1] || null);
    } else {
      setActiveVideoId(null);
      setNextVideo(null);
    }
  }).current;

  useFocusEffect(
    useCallback(() => {
      checkAuth();
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        loadFeed(true);
      } else if (route?.params?.refresh) {
        loadFeed(true);
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    }, [route?.params?.refresh])
  );

  const loadFeed = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    try {
      const token         = await AsyncStorage.getItem('token');
      const headers       = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const currentOffset = reset ? 0 : sessionPosts;

      const response = await fetch(
        `${API_BASE_URL}/api/v1/posts/calm-feed?session_posts=${currentOffset}`,
        { headers }
      );

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired — clear and continue as guest
          await AsyncStorage.removeItem('token');
          showToast({ type: 'info', message: 'Session expired. Continuing as guest.' });
        } else if (response.status >= 500) {
          showToast({ type: 'error', title: 'Server error', message: 'Could not load feed. Try again shortly.' });
        }
        return;
      }

      const data = await response.json();

      if (data.message === 'session_limit') {
        setSessionLimitReached(true);
        setHasMore(data.has_more);
      } else {
        setPosts((prev) => {
          const merged = reset ? data.posts : [...prev, ...data.posts];
          const seen   = new Set();
          return merged.filter((p) => {
            if (!p.id) return true;
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });
        });
        setSessionPosts(data.session_posts);
        setHasMore(data.has_more);

        if (data.streak?.is_new_day && data.streak?.message) {
          setStreakBanner({ message: data.streak.message });
        }
      }
    } catch (error) {
      const msg = error?.message || '';
      if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
        showToast({ type: 'error', title: 'No Connection', message: 'Check your internet and try again.' });
      } else {
        showToast({ type: 'error', message: 'Could not load feed. Pull down to try again.' });
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [sessionPosts, showToast]);

  const refreshFeed = useCallback(() => {
    setPosts([]);
    setSessionPosts(0);
    setHasMore(true);
    setSessionLimitReached(false);
    hasLoadedRef.current = false;
    loadFeed(true);
  }, [loadFeed]);

  const showAuthPrompt = useCallback((action) => {
    setAuthModalAction(action);
    setAuthModalVisible(true);
  }, []);

  const handleMediaPress = useCallback((post, startTime = 0) => {
    const mediaPosts = postsRef.current.filter(
      (p) => p.type === 'post' && (p.video_url || p.audio_url)
    );
    const startIndex = mediaPosts.findIndex((p) => p.id === post.id);
    navigation.navigate('MediaFeed', { posts: mediaPosts, startIndex: Math.max(0, startIndex), startTime });
  }, [navigation]);

  const handleResponse = useCallback(async (postId, responseType) => {
    if (!isAuthenticated) { showAuthPrompt('respond'); return; }
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showToast({ type: 'error', title: 'Session Expired', message: 'Please sign in again.' });
        navigation.navigate('Auth', { screen: 'Login' });
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/respond`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ type: responseType }),
      });

      if (response.ok) {
        setPosts((prev) =>
          prev.map((item) =>
            item.type === 'post' && item.id === postId
              ? { ...item, user_response: responseType }
              : item
          )
        );
      } else if (response.status === 401) {
        await AsyncStorage.removeItem('token');
        showToast({ type: 'error', title: 'Session Expired', message: 'Please sign in again.' });
        navigation.navigate('Auth', { screen: 'Login' });
      } else {
        showToast({ type: 'error', message: 'Could not send response. Try again.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Check your connection.' });
    }
  }, [isAuthenticated, navigation, showAuthPrompt, showToast]);

  const handleSave = useCallback(async (postId) => {
    if (!isAuthenticated) { showAuthPrompt('save'); return; }
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showToast({ type: 'error', title: 'Session Expired', message: 'Please sign in again.' });
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/save`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setPosts((prev) =>
          prev.map((item) =>
            item.type === 'post' && item.id === postId
              ? { ...item, is_saved: data.saved }
              : item
          )
        );
        showToast({
          type:    data.saved ? 'success' : 'info',
          message: data.saved ? 'Post saved.' : 'Post unsaved.',
        });
      } else if (response.status === 401) {
        await AsyncStorage.removeItem('token');
        showToast({ type: 'error', title: 'Session Expired', message: 'Please sign in again.' });
      } else {
        showToast({ type: 'error', message: 'Could not save post. Try again.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Check your connection.' });
    }
  }, [isAuthenticated, showAuthPrompt, showToast]);

  const handleViewThread = useCallback(async (postId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      // Fire-and-forget view tracking — don't block navigation on this
      fetch(`${API_BASE_URL}/api/v1/posts/${postId}/view`, {
        method:  'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => {});

      const post = postsRef.current.find((p) => p.type === 'post' && p.id === postId);
      if (post) navigation.navigate('ThreadView', { postId, postContent: post.content });
    } catch {
      showToast({ type: 'error', message: 'Could not open thread.' });
    }
  }, [navigation, showToast]);

  const handlePostPress = useCallback((post) => {
    navigation.navigate('PostDetail', { post });
  }, [navigation]);

  const handleVideoChange = useCallback((newPostId) => {
    setActiveVideoId(newPostId);
    const videoPosts = postsRef.current.filter((p) => p.type === 'post' && p.video_url);
    const idx = videoPosts.findIndex((p) => p.id === newPostId);
    setNextVideo(videoPosts[idx + 1] || null);
    const nextIndex = postsRef.current.findIndex((p) => p.id === newPostId);
    if (nextIndex !== -1) {
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true, viewPosition: 0.1 });
    }
  }, []);

  const handleContinue = useCallback(() => {
    setSessionLimitReached(false);
    loadFeed(false);
  }, [loadFeed]);


  const renderItem = useCallback(({ item }) => {
    if (item.type === 'divider')      return <FeedDivider text={item.text} />;
    if (item.type === 'mood_balancer') return <MoodBalancer text={item.text} />;
    if (item.type === 'post') {
      return (
        <CalmPostCard
          post={item}
          onResponse={handleResponse}
          onSave={handleSave}
          onViewThread={handleViewThread}
          onPress={handlePostPress}
          onMediaPress={handleMediaPress}
          navigation={navigation}
          activeVideoId={activeVideoId}
          nextVideo={item.video_url && item.id === activeVideoId ? nextVideo : null}
          onVideoChange={handleVideoChange}
        />
      );
    }
    return null;
  }, [handleResponse, handleSave, handleViewThread, handlePostPress, handleMediaPress,
      navigation, activeVideoId, nextVideo, handleVideoChange]);

  const keyExtractor = useCallback((item, index) => `${item.id || item.type}-${index}`, []);

  const ListFooter = useMemo(() => {
    if (!loading || !hasMore || posts.length === 0) return null;
    return (
      <View style={styles.feedFooter}>
        <ActivityIndicator color={THEME.primary} size="small" />
      </View>
    );
  }, [loading, hasMore, posts.length]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !loading) loadFeed(false);
  }, [hasMore, loading, loadFeed]);

  // ── Loading state — skeletons ──────────────────────────────
  if (loading && posts.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
        <StarryBackground />
        <View style={[styles.header, { paddingTop: insets.top + rh(8) }]}>
          <Text style={styles.headerLogo}>anonixx</Text>
          <View style={styles.headerRight}>
            <View style={styles.headerBtn} />
            <View style={styles.headerBtn} />
          </View>
        </View>
        <View style={styles.skeletonContainer}>
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          <Text style={styles.loadingText}>Loading the unsayable...</Text>
        </View>
      </View>
    );
  }

  // ── Session limit state ────────────────────────────────────
  if (sessionLimitReached) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
        <StarryBackground />
        <SessionLimitView
          hasMore={hasMore}
          onContinue={handleContinue}
          onClose={() => navigation.goBack()}
        />
      </View>
    );
  }

  // ── Main feed ──────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + rh(8) }]}>
        <Text style={styles.headerLogo}>anonixx</Text>

        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Search')}
            style={styles.headerBtn}
            hitSlop={HIT_SLOP}
          >
            <Search size={rs(20)} color={THEME.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            style={styles.headerBtn}
            hitSlop={HIT_SLOP}
          >
            <Menu size={rs(20)} color={THEME.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {streakBanner && (
        <StreakBanner
          message={streakBanner.message}
          onDismiss={() => setStreakBanner(null)}
        />
      )}

      {isAuthenticated && <DailyRewardBanner />}

      <FlatList
        ref={flatListRef}
        data={posts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        removeClippedSubviews
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={100}
        initialNumToRender={5}
        windowSize={3}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={loading && posts.length > 0}
            onRefresh={refreshFeed}
            tintColor={THEME.primary}
            colors={[THEME.primary]}
          />
        }
        ListFooterComponent={ListFooter}
        ListEmptyComponent={<EmptyState onRefresh={refreshFeed} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.feedContent, { paddingBottom: insets.bottom + rh(40) }]}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      <AuthPromptModal
        visible={authModalVisible}
        onClose={() => setAuthModalVisible(false)}
        onSignUp={() => { setAuthModalVisible(false); navigation.navigate('Auth', { screen: 'Register' }); }}
        onLogin={() => { setAuthModalVisible(false); navigation.navigate('Auth', { screen: 'Login' }); }}
        action={authModalAction}
      />

      <HamburgerMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        navigation={navigation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom:     rp(12),
    zIndex:            10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerLogo: {
    fontSize:      FONT.lg,
    fontWeight:    '800',
    color:         THEME.primary,
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(4),
  },
  headerBtn: {
    width:          rs(38),
    height:         rs(38),
    alignItems:     'center',
    justifyContent: 'center',
    borderRadius:   rs(19),
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  // Streak banner
  streakBanner: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               SPACING.sm,
    marginHorizontal:  SPACING.md,
    marginBottom:      SPACING.sm,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(10),
    borderRadius:      RADIUS.md,
    backgroundColor:   THEME.primaryDim,
    borderWidth:       1,
    borderColor:       'rgba(255,99,74,0.25)',
  },
  streakText:        { flex: 1, fontSize: FONT.sm, fontWeight: '600', color: THEME.text },
  streakDismiss:     { padding: rp(2) },
  streakDismissText: { fontSize: rf(12), color: THEME.textSecondary },

  // Feed
  feedContent:  { paddingTop: rh(8) },
  feedFooter:   { height: rh(80), justifyContent: 'center', alignItems: 'center' },

  // Skeleton
  skeletonContainer: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  skeletonCard: {
    flexDirection:   'row',
    backgroundColor: THEME.surface,
    borderRadius:    RADIUS.lg,
    padding:         rp(16),
    marginBottom:    SPACING.md,
    gap:             SPACING.sm,
  },
  skeletonAvatar: {
    width:           rs(44),
    height:          rs(44),
    borderRadius:    RADIUS.full,
    backgroundColor: THEME.surfaceAlt,
  },
  skeletonLines: { flex: 1, justifyContent: 'center' },
  skeletonLine:  { height: rh(12), borderRadius: RADIUS.sm, backgroundColor: THEME.surfaceAlt },
  loadingText: {
    fontSize:    FONT.sm,
    fontStyle:   'italic',
    color:       THEME.textSecondary,
    textAlign:   'center',
    marginTop:   SPACING.xl,
    opacity:     0.7,
  },

  // Centered wrapper (limit + empty)
  centeredView: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },

  // Session limit card
  limitCard: {
    width:           '100%',
    backgroundColor: THEME.surface,
    borderRadius:    RADIUS.xl,
    padding:         rp(28),
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     THEME.border,
  },
  limitEmoji:           { fontSize: rf(40), marginBottom: SPACING.md },
  limitTitle:           { fontSize: FONT.xl, fontWeight: '700', color: THEME.text, textAlign: 'center', marginBottom: SPACING.lg },
  limitDivider:         { width: rs(60), height: rh(2), backgroundColor: THEME.primary, opacity: 0.4, marginBottom: SPACING.lg },
  limitSubtitle:        { fontSize: FONT.md, color: THEME.textSecondary, textAlign: 'center', lineHeight: FONT.md * 1.6, marginBottom: SPACING.sm },
  limitMessage:         { fontSize: FONT.md, color: THEME.textSecondary, textAlign: 'center', marginBottom: SPACING.xl, opacity: 0.7 },
  limitButtons:         { flexDirection: 'row', gap: SPACING.sm, width: '100%' },
  limitBtnSecondary:    { flex: 1, height: BUTTON_HEIGHT, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.surfaceAlt, borderWidth: 1, borderColor: THEME.border },
  limitBtnSecondaryText:{ fontSize: FONT.md, fontWeight: '600', color: THEME.text },
  limitBtnPrimary:      { flex: 1, height: BUTTON_HEIGHT, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.primary, shadowColor: THEME.primary, shadowOffset: { width: 0, height: rh(4) }, shadowOpacity: 0.4, shadowRadius: rs(12), elevation: 6 },
  limitBtnPrimaryText:  { fontSize: FONT.md, fontWeight: '700', color: '#fff' },

  // Empty state card
  emptyCard: {
    width:           '100%',
    backgroundColor: THEME.surface,
    borderRadius:    RADIUS.xl,
    padding:         rp(32),
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     THEME.border,
  },
  emptyEmoji:       { fontSize: rf(40), marginBottom: SPACING.md },
  emptyTitle:       { fontSize: FONT.xl, fontWeight: '700', color: THEME.text, marginBottom: SPACING.sm },
  emptySubtitle:    { fontSize: FONT.md, color: THEME.textSecondary, textAlign: 'center', lineHeight: FONT.md * 1.6, marginBottom: SPACING.xl },
  emptyRefreshBtn:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: rp(20), paddingVertical: rp(12), borderRadius: RADIUS.full, backgroundColor: THEME.primaryDim, borderWidth: 1, borderColor: 'rgba(255,99,74,0.25)' },
  emptyRefreshText: { fontSize: FONT.sm, fontWeight: '700', color: THEME.primary },
});
