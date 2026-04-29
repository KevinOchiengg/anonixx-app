/**
 * InspirationThreadScreen
 *
 * Shows a feed confession that sparked drops, plus all the drops it inspired.
 * Entry points:
 *   - Tapping the "X drops inspired by this" badge on a CalmPostCard
 *   - Tapping "inspired by a confession →" chip on a DropCard in the marketplace
 *
 * Layout:
 *   ┌────────────────────────────┐
 *   │  header  (back + title)    │
 *   ├────────────────────────────┤
 *   │  origin confession card    │
 *   │  "this confession sparked" │
 *   ├────────────────────────────┤
 *   │  inspired drop cards (list)│
 *   └────────────────────────────┘
 */
import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Clock, Flame, Zap } from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';

const LIMIT = 20;

// ─── Origin confession card ───────────────────────────────────
const OriginCard = React.memo(({ post }) => {
  if (!post) return null;
  return (
    <View style={s.originCard}>
      <View style={s.originHeader}>
        <Text style={s.originLabel}>ORIGINAL CONFESSION</Text>
        <Text style={s.originTime}>{post.time_ago}</Text>
      </View>
      <Text style={s.originText}>"{post.content}"</Text>
      {post.topics?.length > 0 && (
        <View style={s.topicRow}>
          {post.topics.slice(0, 4).map((t) => (
            <View key={t} style={s.topicChip}>
              <Text style={s.topicChipText}>{t}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});

// ─── Section divider ──────────────────────────────────────────
const ThreadDivider = React.memo(({ count }) => (
  <View style={s.divider}>
    <View style={s.dividerLine} />
    <View style={s.dividerBadge}>
      <Flame size={rs(12)} color={T.primary} fill={T.primary} />
      <Text style={s.dividerText}>
        {count} {count === 1 ? 'drop' : 'drops'} inspired by this
      </Text>
    </View>
    <View style={s.dividerLine} />
  </View>
));

// ─── Individual inspired drop card ───────────────────────────
const InspirationCard = React.memo(({ item, onPress }) => {
  const handlePress = useCallback(() => onPress(item.id), [onPress, item.id]);

  return (
    <TouchableOpacity
      style={[s.inspCard, item.is_night_mode && s.inspCardNight]}
      onPress={handlePress}
      hitSlop={HIT_SLOP}
      activeOpacity={0.85}
    >
      {/* Category + time */}
      <View style={s.inspTop}>
        <Text style={s.inspCat}>{item.category?.toUpperCase()}</Text>
        {item.mood_tag && (
          <View style={s.moodChip}>
            <Text style={s.moodChipText}>{item.mood_tag}</Text>
          </View>
        )}
        <Text style={s.inspTime}>{item.time_ago}</Text>
      </View>

      {/* Confession text */}
      {item.confession ? (
        <Text style={s.inspConfession} numberOfLines={3}>
          "{item.confession}"
        </Text>
      ) : (
        <Text style={s.inspMedia}>
          {item.media_type === 'image' ? '📷 image drop'
            : item.media_type === 'video' ? '🎥 video drop'
            : item.media_type === 'voice' ? '🎙 voice drop'
            : '…'}
        </Text>
      )}

      {/* Footer */}
      <View style={s.inspFooter}>
        <View style={s.inspMeta}>
          <Clock size={rs(11)} color={T.textSec} strokeWidth={2} />
          <Text style={s.inspMetaText}>{item.time_left}</Text>
        </View>
        <View style={s.inspMeta}>
          <Flame size={rs(11)} color={T.primary} strokeWidth={2} />
          <Text style={[s.inspMetaText, { color: T.primary }]}>
            {item.unlock_count} connected
          </Text>
        </View>
        {item.already_unlocked ? (
          <View style={[s.badge, s.badgeDone]}>
            <Text style={[s.badgeText, { color: T.primary }]}>✓ Connected</Text>
          </View>
        ) : (
          <View style={s.badge}>
            <Zap size={rs(11)} color={T.primary} strokeWidth={2} />
            <Text style={[s.badgeText, { color: T.primary }]}>${item.price}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ─── Empty state ──────────────────────────────────────────────
// hasOrigin: the originating post exists, meaning drops were made but expired.
// !hasOrigin: post deleted or no drops were ever made.
const EmptyState = React.memo(({ hasOrigin }) => (
  <View style={s.empty}>
    <Text style={s.emptyIcon}>{hasOrigin ? '⏳' : '🌑'}</Text>
    <Text style={s.emptyTitle}>
      {hasOrigin ? 'Drops have expired' : 'No drops yet'}
    </Text>
    <Text style={s.emptySub}>
      {hasOrigin
        ? 'The drops inspired by this confession are no longer active. Be the first to drop something new.'
        : 'Be the first to drop something inspired by this confession.'}
    </Text>
  </View>
));

// ─── Main Screen ──────────────────────────────────────────────
export default function InspirationThreadScreen({ navigation, route }) {
  const { postId } = route.params;
  const { showToast } = useToast();

  const [originPost,   setOriginPost]   = useState(null);
  const [drops,        setDrops]        = useState([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [hasMore,      setHasMore]      = useState(false);

  const skipRef = useRef(0);

  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1, duration: 280, useNativeDriver: true,
    }).start();
  }, [fade]);

  // ── Fetch ──────────────────────────────────────────────────
  const load = useCallback(async (isFirst = false) => {
    if (isFirst) { setLoading(true); skipRef.current = 0; }
    else           setLoadingMore(true);

    try {
      const token  = await AsyncStorage.getItem('token');
      const params = new URLSearchParams({ skip: skipRef.current, limit: LIMIT });

      const res = await fetch(
        `${API_BASE_URL}/api/v1/drops/inspired-by/${postId}?${params}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );

      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();

      if (isFirst) {
        setOriginPost(data.origin_post || null);
        setDrops(data.drops || []);
      } else {
        setDrops(prev => {
          const ids = new Set(prev.map(d => d.id));
          return [...prev, ...(data.drops || []).filter(d => !ids.has(d.id))];
        });
      }
      setTotal(data.total ?? 0);
      setHasMore(data.has_more ?? false);
      skipRef.current += (data.drops?.length ?? 0);
    } catch {
      if (isFirst) showToast({ type: 'error', message: 'Could not load thread.' });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [postId, showToast]);

  useEffect(() => { load(true); }, [load]);

  const onEndReached = useCallback(() => {
    if (!loadingMore && hasMore) load(false);
  }, [loadingMore, hasMore, load]);

  const handleDropPress = useCallback((dropId) => {
    navigation.navigate('DropLanding', { dropId });
  }, [navigation]);

  // ── Render helpers ────────────────────────────────────────
  const keyExtractor = useCallback((item) => item.id, []);

  const renderItem = useCallback(({ item }) => (
    <InspirationCard item={item} onPress={handleDropPress} />
  ), [handleDropPress]);

  const ListHeader = useMemo(() => (
    <View>
      <OriginCard post={originPost} />
      {/* Only show the divider when there are active drops to follow it */}
      {!loading && drops.length > 0 && <ThreadDivider count={total} />}
    </View>
  ), [originPost, loading, drops.length, total]);

  const ListEmpty = useCallback(() =>
    loading ? null : <EmptyState hasOrigin={!!originPost} />,
  [loading, originPost]);

  const ListFooter = useCallback(() =>
    loadingMore
      ? <ActivityIndicator color={T.primary} style={{ marginVertical: SPACING.lg }} />
      : null,
  [loadingMore]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          hitSlop={HIT_SLOP}
        >
          <ArrowLeft size={rs(20)} color={T.text} strokeWidth={2} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Inspiration Thread</Text>
          {total > 0 && (
            <Text style={s.headerSub}>{total} drops</Text>
          )}
        </View>
        <View style={s.backBtn} />
      </View>

      <Animated.View style={[s.flex, { opacity: fade }]}>
        {loading && drops.length === 0 ? (
          <View style={s.centered}>
            <ActivityIndicator color={T.primary} size="large" />
          </View>
        ) : (
          <FlatList
            data={drops}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            initialNumToRender={6}
            maxToRenderPerBatch={8}
            windowSize={9}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={ListEmpty}
            ListFooterComponent={ListFooter}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.4}
          />
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: T.background },
  flex:     { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(14),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width:          rs(36),
    alignItems:     'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex:        1,
    alignItems:  'center',
  },
  headerTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    letterSpacing: 0.3,
  },
  headerSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.primary,
    marginTop:     rp(2),
    letterSpacing: 0.3,
  },

  list: {
    paddingHorizontal: SPACING.md,
    paddingBottom:     rs(48),
    gap:               SPACING.sm,
  },

  // Origin card
  originCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius:    RADIUS.xl,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.08)',
    padding:         rp(18),
    marginTop:       SPACING.md,
    marginBottom:    rp(4),
    gap:             rp(10),
  },
  originHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  originLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(9),
    color:         T.textMute,
    letterSpacing: 2,
  },
  originTime: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(11),
    color:         T.textMute,
  },
  originText: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(16),
    color:         T.text,
    lineHeight:    rf(26),
    letterSpacing: 0.2,
  },
  topicRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: rp(6) },
  topicChip:    {
    backgroundColor:   'rgba(255,255,255,0.06)',
    borderRadius:      RADIUS.sm,
    paddingHorizontal: rp(8),
    paddingVertical:   rp(3),
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.08)',
  },
  topicChipText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(10),
    color:         T.textSec,
    letterSpacing: 0.3,
  },

  // Thread divider
  divider: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(10),
    marginVertical: SPACING.md,
  },
  dividerLine: {
    flex:            1,
    height:          1,
    backgroundColor: 'rgba(255,99,74,0.18)',
  },
  dividerBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(5),
    backgroundColor:   'rgba(255,99,74,0.08)',
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       'rgba(255,99,74,0.20)',
    paddingHorizontal: rp(12),
    paddingVertical:   rp(5),
  },
  dividerText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    color:         T.primary,
    letterSpacing: 0.3,
  },

  // Inspired drop card
  inspCard: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.xl,
    borderWidth:     1,
    borderColor:     T.border,
    padding:         rp(16),
    gap:             rp(10),
  },
  inspCardNight: {
    borderColor:     'rgba(179,107,255,0.22)',
    backgroundColor: 'rgba(179,107,255,0.05)',
  },
  inspTop: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(8),
  },
  inspCat: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(9),
    color:         T.textMute,
    letterSpacing: 1.5,
  },
  moodChip: {
    backgroundColor:   'rgba(255,99,74,0.10)',
    borderRadius:      RADIUS.sm,
    paddingHorizontal: rp(7),
    paddingVertical:   rp(2),
    borderWidth:       1,
    borderColor:       'rgba(255,99,74,0.18)',
  },
  moodChipText: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(9),
    color:         T.primary,
    letterSpacing: 0.2,
  },
  inspTime: {
    marginLeft:    'auto',
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(11),
    color:         T.textMute,
  },
  inspConfession: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(14),
    color:         T.text,
    lineHeight:    rf(22),
    letterSpacing: 0.2,
  },
  inspMedia: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(13),
    color:         T.textSec,
  },
  inspFooter: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.sm,
  },
  inspMeta: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(4),
  },
  inspMetaText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(11),
    color:         T.textSec,
  },
  badge: {
    marginLeft:        'auto',
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(4),
    backgroundColor:   T.primaryDim,
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       T.primaryBorder,
    paddingHorizontal: rp(10),
    paddingVertical:   rp(4),
  },
  badgeDone: {
    backgroundColor: 'rgba(255,99,74,0.10)',
    borderColor:     'rgba(255,99,74,0.22)',
  },
  badgeText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
  },

  // Empty
  empty: {
    alignItems:   'center',
    paddingTop:   rs(48),
    gap:          rp(10),
  },
  emptyIcon:  { fontSize: rf(36) },
  emptyTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    letterSpacing: 0.3,
  },
  emptySub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    textAlign:     'center',
    lineHeight:    rf(20),
    paddingHorizontal: SPACING.lg,
  },
});
