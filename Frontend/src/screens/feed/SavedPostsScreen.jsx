/**
 * SavedPostsScreen — thoughts worth returning to.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, FlatList, RefreshControl, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Bookmark } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../config/api';
import { useToast } from '../../components/ui/Toast';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { formatTimeAgo } from '../../utils/helpers';

// ─── Theme ────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  surfaceAlt:    '#1a1f2e',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.15)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#4a4f62',
  border:        'rgba(255,255,255,0.06)',
};

// ─── Static data at module level (Rule 5) ─────────────────────
// Golden-ratio distribution — deterministic, no Math.random()
const STARS = Array.from({ length: 28 }, (_, i) => ({
  id:      i,
  top:     ((i * 137.5) % 100).toFixed(2),
  left:    ((i * 97.3)  % 100).toFixed(2),
  size:    (i % 3) + 3,
  opacity: 0.10 + (i % 5) * 0.05,
}));

// ─── StarryBg ─────────────────────────────────────────────────
const StarryBg = React.memo(() => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    {STARS.map((s) => (
      <View
        key={s.id}
        style={{
          position:        'absolute',
          top:             `${s.top}%`,
          left:            `${s.left}%`,
          width:           s.size,
          height:          s.size,
          borderRadius:    s.size,
          backgroundColor: T.primary,
          opacity:         s.opacity,
        }}
      />
    ))}
  </View>
));

// ─── PostCard ─────────────────────────────────────────────────
const PostCard = React.memo(({ post, onPress }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = useCallback(() => {
    Animated.spring(scale, { toValue: 0.975, useNativeDriver: true, speed: 30 }).start();
  }, [scale]);

  const onPressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  }, [scale]);

  const timeLabel = post.saved_at
    ? formatTimeAgo(post.saved_at)
    : post.saved_days_ago === 0
      ? 'today'
      : post.saved_days_ago === 1
        ? 'yesterday'
        : `${post.saved_days_ago}d ago`;

  return (
    <Animated.View style={[styles.cardWrap, { transform: [{ scale }] }]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={1}
        style={styles.card}
      >
        {/* Card header */}
        <View style={styles.cardHeader}>
          <View style={styles.savedBadge}>
            <Bookmark size={rs(12)} color={T.primary} fill={T.primary} />
            <Text style={styles.savedBadgeText}>saved</Text>
          </View>
          <Text style={styles.cardTime}>{timeLabel}</Text>
        </View>

        <View style={styles.divider} />

        {/* Confession text — Playfair Display for emotional weight */}
        <Text style={styles.cardContent} numberOfLines={6}>
          {post.content}
        </Text>

        {post.content?.length > 200 && (
          <Text style={styles.readMore}>read more →</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Screen ───────────────────────────────────────────────────
export default function SavedPostsScreen({ navigation }) {
  const { showToast }                     = useToast();
  const [savedPosts, setSavedPosts]       = useState([]);
  const [loading,    setLoading]          = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(rs(28))).current;

  const loadSavedPosts = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/posts/saved`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSavedPosts(data.saved_posts ?? []);
      } else {
        showToast({ type: 'error', message: 'Could not load your saved thoughts.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadSavedPosts();
  }, [loadSavedPosts]);

  // Entrance animation after load
  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 420, delay: 60,  useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 420, delay: 60,  useNativeDriver: true }),
      ]).start();
    }
  }, [loading, fadeAnim, slideAnim]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadSavedPosts();
  }, [loadSavedPosts]);

  const handlePostPress = useCallback((post) => {
    navigation.navigate('PostDetail', { post });
  }, [navigation]);

  const renderItem = useCallback(({ item }) => (
    <PostCard post={item} onPress={() => handlePostPress(item)} />
  ), [handlePostPress]);

  const keyExtractor = useCallback((item) => String(item.id ?? item._id), []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={T.background} />
      <StarryBg />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}>
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Thoughts</Text>
        <View style={{ width: rs(22) }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={T.primary} />
          <Text style={styles.loadingText}>retrieving what you held onto…</Text>
        </View>
      ) : savedPosts.length === 0 ? (
        <Animated.View
          style={[styles.center, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          <View style={styles.emptyIconWrap}>
            <Bookmark size={rs(38)} color={T.primary} />
          </View>
          <Text style={styles.emptyTitle}>nothing saved yet</Text>
          <Text style={styles.emptyBody}>
            some words deserve a second read.{'\n'}bookmark any thought to find it here.
          </Text>
        </Animated.View>
      ) : (
        <Animated.View
          style={[{ flex: 1 }, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          {/* Count strip */}
          <View style={styles.countStrip}>
            <Bookmark size={rs(13)} color={T.primary} fill={T.primary} />
            <Text style={styles.countText}>
              <Text style={styles.countNum}>{savedPosts.length}</Text>
              {'  '}
              {savedPosts.length === 1 ? 'saved thought' : 'saved thoughts'}
            </Text>
          </View>

          <FlatList
            data={savedPosts}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            maxToRenderPerBatch={5}
            windowSize={3}
            initialNumToRender={8}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={T.primary}
                colors={[T.primary]}
              />
            }
          />
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: T.background,
  },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTitle: {
    fontSize:      FONT.md,
    fontWeight:    '600',
    color:         T.text,
    letterSpacing: 0.3,
    fontFamily:    'DMSans-SemiBold',
  },

  // Loading / empty
  center: {
    flex:              1,
    justifyContent:    'center',
    alignItems:        'center',
    paddingHorizontal: SPACING.xl,
  },
  loadingText: {
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    marginTop:  SPACING.sm,
    fontStyle:  'italic',
    fontFamily: 'DMSans-Regular',
  },
  emptyIconWrap: {
    width:           rs(88),
    height:          rs(88),
    borderRadius:    rs(44),
    backgroundColor: T.primaryDim,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    SPACING.lg,
  },
  emptyTitle: {
    fontSize:      rf(22),
    fontWeight:    '700',
    color:         T.text,
    marginBottom:  SPACING.xs,
    textAlign:     'center',
    fontFamily:    'PlayfairDisplay-Bold',
  },
  emptyBody: {
    fontSize:      FONT.sm,
    color:         T.textSecondary,
    textAlign:     'center',
    lineHeight:    rf(22),
    fontFamily:    'DMSans-Regular',
  },

  // Count strip
  countStrip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(6),
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(10),
  },
  countText: {
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    fontFamily: 'DMSans-Regular',
  },
  countNum: {
    color:      T.primary,
    fontWeight: '700',
    fontFamily: 'DMSans-Bold',
  },

  // List
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom:     SPACING.xl,
  },

  // Card
  cardWrap: {
    marginBottom: SPACING.sm,
  },
  card: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     T.border,
    borderLeftWidth: 1,
    borderLeftColor: T.primary,
    paddingVertical:   rp(16),
    paddingHorizontal: rp(18),
    paddingLeft:       rp(18),
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: rs(4) },
    shadowOpacity:     0.25,
    shadowRadius:      rs(12),
    elevation:         4,
  },
  cardHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   rp(10),
  },
  savedBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(5),
    backgroundColor:   T.primaryDim,
    paddingHorizontal: rp(9),
    paddingVertical:   rp(4),
    borderRadius:      RADIUS.sm,
  },
  savedBadgeText: {
    fontSize:   FONT.xs,
    fontWeight: '600',
    color:      T.primary,
    fontFamily: 'DMSans-SemiBold',
  },
  cardTime: {
    fontSize:   FONT.xs,
    color:      T.textMuted,
    fontFamily: 'DMSans-Regular',
  },
  divider: {
    height:          1,
    backgroundColor: T.border,
    marginBottom:    rp(12),
  },
  cardContent: {
    fontSize:      rf(16),
    lineHeight:    rf(26),
    color:         T.text,
    letterSpacing: 0.15,
    fontFamily:    'PlayfairDisplay-Regular',
  },
  readMore: {
    fontSize:   FONT.xs,
    fontWeight: '600',
    color:      T.primary,
    marginTop:  rp(8),
    fontFamily: 'DMSans-SemiBold',
  },
});
