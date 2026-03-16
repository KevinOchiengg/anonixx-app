import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, FlatList, ActivityIndicator, StyleSheet,
  StatusBar, Text, TouchableOpacity, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { RefreshCw, WifiOff } from 'lucide-react-native';
import FullScreenPostCard from '../../components/feed/FullScreenPostCard';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import {
  rs, rf, rp, rh, SPACING, FONT, RADIUS,
  BUTTON_HEIGHT, SCREEN, HIT_SLOP,
} from '../../utils/responsive';

const THEME = {
  background:    '#0b0f18',
  surface:       '#151924',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.12)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  border:        'rgba(255,255,255,0.06)',
};

const PAGE_LIMIT = 10;

// ── Skeleton loader (full-screen card shimmer) ────────────────
const SkeletonFullCard = React.memo(() => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 850, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });

  return (
    <Animated.View style={[styles.skeletonCard, { opacity }]}>
      <View style={styles.skeletonAvatar} />
      <View style={styles.skeletonBody}>
        <View style={[styles.skeletonLine, { width: '80%' }]} />
        <View style={[styles.skeletonLine, { width: '65%', marginTop: rh(10) }]} />
        <View style={[styles.skeletonLine, { width: '50%', marginTop: rh(10) }]} />
      </View>
      <View style={styles.skeletonActions}>
        {[1, 2, 3].map((i) => <View key={i} style={styles.skeletonAction} />)}
      </View>
    </Animated.View>
  );
});

// ── Error / Empty state ───────────────────────────────────────
const ErrorState = React.memo(({ isNetwork, onRetry }) => (
  <View style={styles.stateCard}>
    {isNetwork
      ? <WifiOff size={rs(36)} color={THEME.textSecondary} strokeWidth={1.5} />
      : <Text style={styles.stateEmoji}>✨</Text>
    }
    <Text style={styles.stateTitle}>
      {isNetwork ? 'No connection' : 'Nothing here yet'}
    </Text>
    <Text style={styles.stateSubtitle}>
      {isNetwork
        ? 'Check your internet and try again.'
        : 'The feed is empty. Check back soon.'}
    </Text>
    <TouchableOpacity onPress={onRetry} style={styles.retryBtn} activeOpacity={0.8}>
      <RefreshCw size={rs(16)} color={THEME.primary} />
      <Text style={styles.retryBtnText}>Try Again</Text>
    </TouchableOpacity>
  </View>
));

// ── Main screen ───────────────────────────────────────────────
export default function FullScreenFeedScreen({ navigation }) {
  const insets        = useSafeAreaInsets();
  const { showToast } = useToast();

  const [posts, setPosts]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [hasMore, setHasMore]   = useState(true);
  const [networkError, setNetworkError] = useState(false);

  const flatListRef  = useRef(null);
  const loadingRef   = useRef(false);
  const hasInitRef   = useRef(false);

  // ── Load feed ────────────────────────────────────────────
  const loadFeed = useCallback(async (targetPage = 1, reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!reset) setLoading(true);
    setNetworkError(false);

    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showToast({ type: 'error', title: 'Not signed in', message: 'Please sign in to view your feed.' });
        navigation.navigate('Auth', { screen: 'Login' });
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/v1/posts/personalized-feed?page=${targetPage}&limit=${PAGE_LIMIT}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        if (response.status === 401) {
          await AsyncStorage.removeItem('token');
          showToast({ type: 'error', title: 'Session Expired', message: 'Please sign in again.' });
          navigation.navigate('Auth', { screen: 'Login' });
        } else if (response.status >= 500) {
          showToast({ type: 'error', title: 'Server Error', message: 'Could not load feed. Try again shortly.' });
        } else {
          showToast({ type: 'error', message: 'Could not load feed. Pull down to try again.' });
        }
        return;
      }

      const data = await response.json();

      setPosts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const fresh       = data.posts.filter((p) => !existingIds.has(p.id));
        return reset ? data.posts : [...prev, ...fresh];
      });

      setHasMore(data.has_more ?? false);
      setPage(targetPage);

    } catch (error) {
      const msg = error?.message || '';
      if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
        setNetworkError(true);
        showToast({ type: 'error', title: 'No Connection', message: 'Check your internet and try again.' });
      } else {
        showToast({ type: 'error', message: 'Something went wrong. Please try again.' });
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [navigation, showToast]);

  useFocusEffect(
    useCallback(() => {
      if (!hasInitRef.current) {
        hasInitRef.current = true;
        loadFeed(1, true);
      }
    }, [loadFeed])
  );

  const loadMore = useCallback(() => {
    if (!loading && hasMore) loadFeed(page + 1, false);
  }, [loading, hasMore, page, loadFeed]);

  const handleRetry = useCallback(() => {
    setPosts([]);
    setPage(1);
    setHasMore(true);
    loadFeed(1, true);
  }, [loadFeed]);

  // ── React to post ─────────────────────────────────────────
  const handleReact = useCallback(async (postId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showToast({ type: 'error', title: 'Not signed in', message: 'Sign in to react to posts.' });
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/react`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setPosts((prev) =>
          prev.map((post) =>
            post.id === postId
              ? {
                  ...post,
                  user_reaction:   data.reacted ? 'support' : null,
                  reactions_count: data.reacted
                    ? (post.reactions_count ?? 0) + 1
                    : Math.max((post.reactions_count ?? 1) - 1, 0),
                }
              : post
          )
        );
      } else if (response.status === 401) {
        await AsyncStorage.removeItem('token');
        showToast({ type: 'error', title: 'Session Expired', message: 'Please sign in again.' });
        navigation.navigate('Auth', { screen: 'Login' });
      } else {
        showToast({ type: 'error', message: 'Could not react. Try again.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Check your connection.' });
    }
  }, [showToast, navigation]);

  // ── Comment placeholder ───────────────────────────────────
  const handleComment = useCallback((postId) => {
    navigation.navigate('ThreadView', { postId });
  }, [navigation]);

  const keyExtractor = useCallback((item, index) => `${item.id}-${index}`, []);

  const renderItem = useCallback(({ item }) => (
    <FullScreenPostCard
      post={item}
      onReact={handleReact}
      onComment={handleComment}
    />
  ), [handleReact, handleComment]);

  const ListFooter = useMemo(() => {
    if (!loading || !hasMore || posts.length === 0) return null;
    return (
      <View style={[styles.footerLoader, { height: SCREEN.height }]}>
        <ActivityIndicator color={THEME.primary} size="small" />
        <Text style={styles.footerText}>Loading more...</Text>
      </View>
    );
  }, [loading, hasMore, posts.length]);

  // ── Loading state — skeletons ─────────────────────────────
  if (loading && posts.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <SkeletonFullCard />
      </View>
    );
  }

  // ── Error / empty state ───────────────────────────────────
  if (!loading && posts.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <View style={styles.centered}>
          <ErrorState isNetwork={networkError} onRetry={handleRetry} />
        </View>
      </View>
    );
  }

  // ── Main feed ─────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <FlatList
        ref={flatListRef}
        data={posts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        snapToInterval={SCREEN.height}
        decelerationRate="fast"
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={ListFooter}
        removeClippedSubviews
        maxToRenderPerBatch={3}
        windowSize={3}
        initialNumToRender={2}
        getItemLayout={(_, index) => ({
          length: SCREEN.height,
          offset: SCREEN.height * index,
          index,
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },

  // Skeleton
  skeletonCard: {
    width:           SCREEN.width,
    height:          SCREEN.height,
    backgroundColor: THEME.background,
    justifyContent:  'flex-end',
    padding:         SPACING.xl,
  },
  skeletonAvatar: {
    position:        'absolute',
    bottom:          rh(160),
    left:            SPACING.xl,
    width:           rs(44),
    height:          rs(44),
    borderRadius:    RADIUS.full,
    backgroundColor: THEME.surface,
  },
  skeletonBody:  { marginBottom: rh(80) },
  skeletonLine:  { height: rh(14), borderRadius: RADIUS.sm, backgroundColor: THEME.surface },
  skeletonActions: {
    position:        'absolute',
    right:           SPACING.lg,
    bottom:          rh(120),
    gap:             SPACING.lg,
    alignItems:      'center',
  },
  skeletonAction: {
    width:           rs(40),
    height:          rs(40),
    borderRadius:    RADIUS.full,
    backgroundColor: THEME.surface,
  },

  // Error / empty
  stateCard: {
    width:           '100%',
    backgroundColor: THEME.surface,
    borderRadius:    RADIUS.xl,
    padding:         rp(32),
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     THEME.border,
  },
  stateEmoji:    { fontSize: rf(40), marginBottom: SPACING.md },
  stateTitle:    { fontSize: FONT.xl, fontWeight: '700', color: THEME.text, marginBottom: SPACING.sm, textAlign: 'center' },
  stateSubtitle: { fontSize: FONT.md, color: THEME.textSecondary, textAlign: 'center', lineHeight: FONT.md * 1.6, marginBottom: SPACING.xl },
  retryBtn:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: rp(20), paddingVertical: rp(12), borderRadius: RADIUS.full, backgroundColor: THEME.primaryDim, borderWidth: 1, borderColor: 'rgba(255,99,74,0.25)' },
  retryBtnText:  { fontSize: FONT.sm, fontWeight: '700', color: THEME.primary },

  // Footer loader
  footerLoader: { justifyContent: 'center', alignItems: 'center', gap: SPACING.sm },
  footerText:   { fontSize: FONT.sm, color: THEME.textSecondary, opacity: 0.6 },
});
