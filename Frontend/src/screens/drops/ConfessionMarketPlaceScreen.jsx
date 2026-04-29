/**
 * ConfessionMarketplaceScreen
 *
 * Browse and unlock active confession cards from everyone.
 *
 * Rebuilt to match the design language of DropsComposeScreen:
 *   • shared `T` palette from utils/colorTokens
 *   • shared DropScreenHeader (italic title + right action)
 *   • shared Chip / ChipRow for category + filter chips
 *   • PlayfairDisplay-Italic for confession teasers & section titles
 *   • DMSans for chrome text
 *   • 320 ms entrance fade
 */
import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, ScrollView, Image, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Clock, Film, Flame, Moon, Plus, Users, Zap,
} from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import { Chip, ChipRow } from '../../components/drops/ChipRow';

// ─── Static data (module level) ───────────────────────────────
const CATEGORIES = [
  { id: null,                    label: 'All',              emoji: '✨' },
  // Emotional / situational
  { id: 'open to connection',    label: 'Open to Connect',  emoji: '🤲' },
  { id: 'carrying this alone',   label: 'Carrying This',    emoji: '💛' },
  { id: 'starting over',         label: 'Starting Over',    emoji: '🌱' },
  { id: 'need stability',        label: 'Need Stability',   emoji: '🏠' },
  { id: 'just need to be heard', label: 'Need to Be Heard', emoji: '🌙' },
  // Social
  { id: 'love',                  label: 'Love',             emoji: '💔' },
  { id: 'fun',                   label: 'Fun',              emoji: '😈' },
  { id: 'adventure',             label: 'Adventure',        emoji: '🌍' },
  { id: 'friendship',            label: 'Friendship',       emoji: '🤝' },
  { id: 'spicy',                 label: 'Spicy',            emoji: '🌶️' },
];

const LIMIT = 20;

const getCatEmoji = (id) => CATEGORIES.find(c => c.id === id)?.emoji ?? '✨';

// ─── Drop Card ────────────────────────────────────────────────
const DropCard = React.memo(({ item, onPress, onViewThread }) => {
  const emoji = getCatEmoji(item.category);
  const handlePress        = useCallback(() => onPress(item.id), [onPress, item.id]);
  const handleThreadPress  = useCallback((e) => {
    e.stopPropagation();
    onViewThread?.(item.inspired_by_post_id);
  }, [onViewThread, item.inspired_by_post_id]);

  return (
    <TouchableOpacity
      style={s.dropCard}
      onPress={handlePress}
      hitSlop={HIT_SLOP}
      activeOpacity={0.85}
    >
      {/* Top row */}
      <View style={s.dropTop}>
        <Text style={s.dropEmoji}>{emoji}</Text>
        <Text style={s.dropCat}>
          {item.category?.toUpperCase()}
        </Text>

        {item.ai_refined && (
          <View style={s.aiRefinedBadge}>
            <Text style={s.aiRefinedBadgeText}>✦</Text>
          </View>
        )}

        {item.is_night_mode && (
          <View style={s.nightTag}>
            <Moon size={rs(11)} color={T.tier2} strokeWidth={2} />
            <Text style={s.nightTagText}>After Dark</Text>
          </View>
        )}

        {item.is_group && (
          <View style={s.groupTag}>
            <Users size={rs(11)} color={T.primary} strokeWidth={2} />
            <Text style={s.groupTagText}>
              Group · {item.group_size}
            </Text>
          </View>
        )}

        <Text style={s.dropTimeAgo}>{item.time_ago}</Text>
      </View>

      {/* Confession / Media */}
      {item.media_type === 'image' && item.media_url ? (
        <View style={s.mediaThumbWrap}>
          <Image source={{ uri: item.media_url }} style={s.mediaThumb} resizeMode="cover" />
          {item.confession ? (
            <Text style={s.dropConfession} numberOfLines={2}>
              “{item.confession}”
            </Text>
          ) : null}
        </View>
      ) : item.media_type === 'video' ? (
        <View style={s.mediaThumbWrap}>
          {item.card_image_url ? (
            <Image source={{ uri: item.card_image_url }} style={s.mediaThumb} resizeMode="cover" />
          ) : (
            <View style={s.videoPlaceholder}>
              <Film size={rs(28)} color={T.primary} strokeWidth={1.6} />
            </View>
          )}
          <View style={s.videoOverlay}>
            <Film size={rs(13)} color="#fff" strokeWidth={2} />
            <Text style={s.videoOverlayText}>Video</Text>
          </View>
          {item.confession ? (
            <Text style={s.dropConfession} numberOfLines={1}>
              “{item.confession}”
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={s.dropConfession} numberOfLines={3}>
          “{item.confession}”
        </Text>
      )}

      {/* "Inspired by a confession" badge */}
      {!!item.inspired_by_post_id && (
        <TouchableOpacity
          style={s.inspiredBadge}
          onPress={handleThreadPress}
          hitSlop={HIT_SLOP}
          activeOpacity={0.75}
        >
          <Flame size={rs(10)} color={T.primary} strokeWidth={2} />
          <Text style={s.inspiredBadgeText}>inspired by a confession  →</Text>
        </TouchableOpacity>
      )}

      {/* Reactions */}
      {item.reactions?.length > 0 && (
        <View style={s.reactionsRow}>
          {item.reactions.map((r, i) => (
            <View key={i} style={s.reactionBubble}>
              <Text style={s.reactionText}>{r}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Footer */}
      <View style={s.dropFooter}>
        <View style={s.dropMeta}>
          <Clock size={rs(12)} color={T.textSec} strokeWidth={2} />
          <Text style={s.dropMetaText}>{item.time_left}</Text>
        </View>
        <View style={s.dropMeta}>
          <Flame size={rs(12)} color={T.primary} strokeWidth={2} />
          <Text style={[s.dropMetaText, { color: T.primary }]}>
            {item.unlock_count} connected
          </Text>
        </View>

        {item.already_unlocked ? (
          <View style={[s.unlockBadge, s.unlockBadgeOn]}>
            <Text style={[s.unlockBadgeText, { color: T.primary }]}>
              ✓ Connected
            </Text>
          </View>
        ) : (
          <View style={s.unlockBadge}>
            <Zap size={rs(12)} color={T.primary} strokeWidth={2} />
            <Text style={[s.unlockBadgeText, { color: T.primary }]}>
              ${item.price}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ─── Filter toggle row ────────────────────────────────────────
const FilterRow = React.memo(({
  nightOnly, setNightOnly, groupOnly, setGroupOnly, total,
}) => (
  <View style={s.filterRow}>
    <Chip
      variant="pill"
      label="After Dark"
      Icon={Moon}
      active={nightOnly}
      accent={T.tier2}
      onPress={() => setNightOnly(v => !v)}
    />
    <Chip
      variant="pill"
      label="Groups"
      Icon={Users}
      active={groupOnly}
      onPress={() => setGroupOnly(v => !v)}
    />
    <Text style={s.totalLabel}>{total} drops</Text>
  </View>
));

// ─── Category chip row ────────────────────────────────────────
const CategoryRow = React.memo(({ category, setCategory }) => (
  <ChipRow scroll gap="sm" style={s.catScroll} contentStyle={s.catContent}>
    {CATEGORIES.map(cat => (
      <Chip
        key={String(cat.id)}
        variant="pill"
        label={`${cat.emoji}  ${cat.label}`}
        active={category === cat.id}
        onPress={() => setCategory(cat.id)}
      />
    ))}
  </ChipRow>
));

// ─── Empty State ──────────────────────────────────────────────
const EmptyState = React.memo(({ onCreateDrop }) => (
  <View style={s.empty}>
    <Text style={s.emptyIcon}>🌙</Text>
    <Text style={s.emptyTitle}>No drops right now</Text>
    <Text style={s.emptySub}>Be the first to leave something real.</Text>
    <TouchableOpacity
      style={s.emptyBtn}
      onPress={onCreateDrop}
      hitSlop={HIT_SLOP}
      activeOpacity={0.85}
    >
      <Plus size={rs(16)} color="#fff" strokeWidth={2.4} />
      <Text style={s.emptyBtnText}>Create a Drop</Text>
    </TouchableOpacity>
  </View>
));

// ─── Spotlight card (Open to Connect) ─────────────────────────
const SpotlightCard = React.memo(({ item, onPress }) => {
  const emoji = getCatEmoji(item.category);
  const handlePress = useCallback(() => onPress(item.id), [onPress, item.id]);
  return (
    <TouchableOpacity
      style={s.spotlightCard}
      onPress={handlePress}
      activeOpacity={0.85}
      hitSlop={HIT_SLOP}
    >
      <Text style={s.spotlightCatEmoji}>{emoji}</Text>
      <Text style={s.spotlightConfession} numberOfLines={4}>
        “{item.confession || 'tap to see'}”
      </Text>
      {item.intent ? (
        <View style={s.intentBadge}>
          <Text style={s.intentBadgeText}>{item.intent}</Text>
        </View>
      ) : null}
      <Text style={s.spotlightTime}>{item.time_ago}</Text>
    </TouchableOpacity>
  );
});

// ─── Main Screen ──────────────────────────────────────────────
export default function ConfessionMarketplaceScreen({ navigation }) {
  const { showToast } = useToast();

  const [drops, setDrops]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(true);

  const [category, setCategory]         = useState(null);
  const [nightOnly, setNightOnly]       = useState(false);
  const [groupOnly, setGroupOnly]       = useState(false);
  const [openToConnect, setOpenToConnect] = useState([]);

  const skipRef = useRef(0);

  // Entrance animation
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, {
      toValue:         1,
      duration:        320,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  // ── Load ──────────────────────────────────────────────────
  const load = useCallback(async (isFirst = false) => {
    if (isFirst) setLoading(true);
    else         setLoadingMore(true);

    try {
      const token  = await AsyncStorage.getItem('token');
      const params = new URLSearchParams({
        skip:  skipRef.current,
        limit: LIMIT,
        ...(category  && { category }),
        ...(nightOnly && { night_only: true }),
        ...(groupOnly && { is_group: true }),
      });

      const res = await fetch(`${API_BASE_URL}/api/v1/drops/marketplace?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        const data = await res.json();
        if (isFirst) {
          setDrops(data.drops);
        } else {
          setDrops(prev => {
            const ids = new Set(prev.map(d => d.id));
            return [...prev, ...data.drops.filter(d => !ids.has(d.id))];
          });
        }
        setHasMore(data.has_more);
        skipRef.current += data.drops.length;
      }
    } catch {
      if (isFirst) showToast({ type: 'error', message: 'Could not load drops.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [category, nightOnly, groupOnly, showToast]);

  // Load "Open to Connect" spotlight once on mount
  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const res   = await fetch(
          `${API_BASE_URL}/api/v1/drops/marketplace/open-to-connect?limit=6`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (res.ok) {
          const data = await res.json();
          setOpenToConnect(data.drops || []);
        }
      } catch {
        /* silent */
      }
    })();
  }, []);

  // Reset when filters change
  useEffect(() => {
    skipRef.current = 0;
    setDrops([]);
    setHasMore(true);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, nightOnly, groupOnly]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    skipRef.current = 0;
    setDrops([]);
    setHasMore(true);
    load(true);
  }, [load]);

  const onEndReached = useCallback(() => {
    if (!loadingMore && hasMore) load(false);
  }, [loadingMore, hasMore, load]);

  // ── Navigation ────────────────────────────────────────────
  const handleDropPress = useCallback((dropId) => {
    navigation.navigate('DropLanding', { dropId });
  }, [navigation]);

  const handleViewThread = useCallback((postId) => {
    if (postId) navigation.navigate('InspirationThread', { postId });
  }, [navigation]);

  const handleCreateDrop = useCallback(() => {
    navigation.navigate('DropsCompose');
  }, [navigation]);

  // ── Render helpers ────────────────────────────────────────
  const renderDrop = useCallback(({ item }) => (
    <DropCard item={item} onPress={handleDropPress} onViewThread={handleViewThread} />
  ), [handleDropPress, handleViewThread]);

  const keyExtractor = useCallback((item) => item.id, []);

  const showSpotlight = !category && openToConnect.length > 0;

  const ListHeaderComponent = useMemo(() => (
    <View>
      {/* Editorial lede */}
      <View style={s.lede}>
        <Text style={s.ledeEyebrow}>ANONIXX · MARKETPLACE</Text>
        <Text style={s.ledeTitle}>Anonymous.</Text>
        <Text style={s.ledeTitle}>Real. Unfiltered.</Text>
        <Text style={s.ledeBody}>
          Stories dropped tonight. Connect with the ones that move you.
        </Text>
      </View>

      {/* Open to Connect spotlight */}
      {showSpotlight && (
        <View style={s.spotlightSection}>
          <View style={s.spotlightHeader}>
            <Text style={s.spotlightEmoji}>🤲</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.spotlightTitle}>Open to Connection</Text>
              <Text style={s.spotlightSub}>
                People who said something real — and mean it
              </Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.spotlightScroll}
          >
            {openToConnect.map(item => (
              <SpotlightCard
                key={item.id}
                item={item}
                onPress={handleDropPress}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Category chips */}
      <CategoryRow category={category} setCategory={setCategory} />

      {/* Filter toggles */}
      <FilterRow
        nightOnly={nightOnly} setNightOnly={setNightOnly}
        groupOnly={groupOnly} setGroupOnly={setGroupOnly}
        total={drops.length}
      />
    </View>
  ), [
    showSpotlight, openToConnect, category, nightOnly, groupOnly,
    drops.length, handleDropPress,
  ]);

  const ListFooterComponent = useCallback(() => (
    loadingMore
      ? <ActivityIndicator color={T.primary} style={{ marginVertical: SPACING.lg }} />
      : null
  ), [loadingMore]);

  const ListEmptyComponent = useCallback(() => (
    loading ? null : <EmptyState onCreateDrop={handleCreateDrop} />
  ), [loading, handleCreateDrop]);

  const HeaderRight = useMemo(() => (
    <TouchableOpacity
      onPress={handleCreateDrop}
      hitSlop={HIT_SLOP}
      activeOpacity={0.8}
      style={s.rightBtn}
    >
      <Plus size={rs(18)} color={T.primary} strokeWidth={2.4} />
    </TouchableOpacity>
  ), [handleCreateDrop]);

  // ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <DropScreenHeader
        title="Marketplace"
        navigation={navigation}
        right={HeaderRight}
      />

      <Animated.View style={[s.flex, { opacity: fade }]}>
        {loading ? (
          <View style={s.centered}>
            <ActivityIndicator color={T.primary} size="large" />
          </View>
        ) : (
          <FlatList
            data={drops}
            keyExtractor={keyExtractor}
            renderItem={renderDrop}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            initialNumToRender={6}
            maxToRenderPerBatch={8}
            windowSize={9}
            ListHeaderComponent={ListHeaderComponent}
            ListEmptyComponent={ListEmptyComponent}
            ListFooterComponent={ListFooterComponent}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.3}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={T.primary}
                colors={[T.primary]}
              />
            }
          />
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: T.background,
  },
  flex:     { flex: 1 },
  centered: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Right-side "Plus" button on the header
  rightBtn: {
    width:           rs(34),
    height:          rs(34),
    borderRadius:    RADIUS.full,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: T.primaryDim,
    borderWidth:     1,
    borderColor:     T.primaryBorder,
  },

  // List
  list: {
    paddingHorizontal: SPACING.md,
    paddingBottom:     rs(48),
    gap:               SPACING.sm,
  },

  // Editorial lede
  lede: {
    paddingTop:    SPACING.lg,
    paddingBottom: SPACING.md,
  },
  ledeEyebrow: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.textMute,
    letterSpacing: 2,
    marginBottom:  SPACING.sm,
  },
  ledeTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(32),
    lineHeight:    rf(38),
    color:         T.text,
    letterSpacing: 0.2,
  },
  ledeBody: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    marginTop:     SPACING.sm,
    lineHeight:    rf(20),
    letterSpacing: 0.2,
  },

  // Category chip scroller — pulls into full-bleed
  catScroll:  { marginHorizontal: -SPACING.md, marginTop: SPACING.sm },
  catContent: { paddingHorizontal: SPACING.md },

  // Filter row
  filterRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  totalLabel: {
    marginLeft:    'auto',
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textMute,
    letterSpacing: 0.5,
  },

  // ── Spotlight (Open to Connect) ──
  spotlightSection: {
    marginBottom: SPACING.md,
    paddingTop:   SPACING.sm,
  },
  spotlightHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(12),
    marginBottom:  SPACING.sm,
  },
  spotlightEmoji: { fontSize: rf(24) },
  spotlightTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    letterSpacing: 0.3,
  },
  spotlightSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textSec,
    marginTop:     rp(2),
    letterSpacing: 0.3,
  },
  spotlightScroll: {
    paddingVertical: rp(4),
    gap:             rp(10),
  },
  spotlightCard: {
    width:           rs(210),
    backgroundColor: T.tier2Dim,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     T.tier2Border,
    padding:         rp(16),
    gap:             rp(8),
  },
  spotlightCatEmoji: { fontSize: rf(22) },
  spotlightConfession: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(14),
    color:         T.text,
    lineHeight:    rf(22),
    letterSpacing: 0.2,
  },
  intentBadge: {
    alignSelf:         'flex-start',
    backgroundColor:   'rgba(179,107,255,0.14)',
    borderRadius:      RADIUS.sm,
    paddingHorizontal: rp(8),
    paddingVertical:   rp(3),
    borderWidth:       1,
    borderColor:       T.tier2Border,
  },
  intentBadgeText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.tier2,
    letterSpacing: 0.6,
  },
  spotlightTime: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(10),
    color:         T.textMute,
    letterSpacing: 0.3,
  },

  // ── Drop card ──
  dropCard: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    padding:         SPACING.md,
    borderWidth:     1,
    borderColor:     T.border,
  },
  dropTop: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.xs,
    marginBottom:  SPACING.sm,
  },
  dropEmoji: { fontSize: rf(18) },
  dropCat: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.primary,
    letterSpacing: 1.4,
  },
  aiRefinedBadge: {
    paddingHorizontal: rp(5),
    paddingVertical:   rp(1),
    borderRadius:      RADIUS.sm,
    backgroundColor:   'rgba(255,99,74,0.10)',
    borderWidth:       1,
    borderColor:       'rgba(255,99,74,0.25)',
  },
  aiRefinedBadgeText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(9),
    color:         T.primary,
    letterSpacing: 0.5,
  },
  nightTag: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(3),
    backgroundColor:   T.tier2Dim,
    borderRadius:      RADIUS.sm,
    paddingHorizontal: rp(6),
    paddingVertical:   rp(2),
    borderWidth:       1,
    borderColor:       T.tier2Border,
  },
  nightTagText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(9),
    color:         T.tier2,
    letterSpacing: 0.8,
  },
  groupTag: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(3),
    borderRadius:      RADIUS.sm,
    paddingHorizontal: rp(6),
    paddingVertical:   rp(2),
    backgroundColor:   T.primaryDim,
    borderWidth:       1,
    borderColor:       T.primaryBorder,
  },
  groupTagText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(9),
    color:         T.primary,
    letterSpacing: 0.6,
  },
  dropTimeAgo: {
    marginLeft: 'auto',
    fontFamily: 'DMSans-Italic',
    fontSize:   rf(10),
    color:      T.textMute,
  },
  dropConfession: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(16),
    lineHeight:    rf(24),
    color:         T.text,
    marginBottom:  SPACING.sm,
    letterSpacing: 0.2,
  },
  mediaThumbWrap: {
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.md,
    overflow:     'hidden',
    position:     'relative',
  },
  mediaThumb: { width: '100%', height: rs(150) },
  videoPlaceholder: {
    width:           '100%',
    height:          rs(150),
    backgroundColor: T.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
  },
  videoOverlay: {
    position:          'absolute',
    top:               rp(8),
    left:              rp(8),
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(4),
    backgroundColor:   'rgba(0,0,0,0.55)',
    paddingHorizontal: rp(8),
    paddingVertical:   rp(4),
    borderRadius:      RADIUS.sm,
  },
  videoOverlayText: {
    fontFamily: 'DMSans-Bold',
    fontSize:   rf(10),
    color:      'rgba(255,255,255,0.88)',
    letterSpacing: 0.4,
  },
  // "inspired by a confession" chip
  inspiredBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    alignSelf:         'flex-start',
    gap:               rp(5),
    backgroundColor:   'rgba(255,99,74,0.08)',
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       'rgba(255,99,74,0.20)',
    paddingHorizontal: rp(10),
    paddingVertical:   rp(4),
    marginBottom:      SPACING.sm,
  },
  inspiredBadgeText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.primary,
    letterSpacing: 0.3,
  },

  reactionsRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           rp(5),
    marginBottom:  SPACING.sm,
  },
  reactionBubble: {
    backgroundColor:   T.surfaceAlt,
    borderRadius:      RADIUS.sm,
    paddingHorizontal: rp(8),
    paddingVertical:   rp(4),
    borderWidth:       1,
    borderColor:       T.border,
  },
  reactionText: { fontSize: rf(14) },
  dropFooter: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.sm,
  },
  dropMeta: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(4),
  },
  dropMetaText: {
    fontFamily: 'DMSans-Regular',
    fontSize:   rf(11),
    color:      T.textSec,
    letterSpacing: 0.3,
  },
  unlockBadge: {
    marginLeft:        'auto',
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(4),
    paddingHorizontal: rp(10),
    paddingVertical:   rp(5),
    borderRadius:      RADIUS.sm,
    borderWidth:       1,
    backgroundColor:   T.primaryDim,
    borderColor:       T.primaryBorder,
  },
  unlockBadgeOn: {
    backgroundColor: T.primaryTint,
  },
  unlockBadgeText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    letterSpacing: 0.4,
  },

  // ── Empty state ──
  empty: {
    alignItems:        'center',
    paddingTop:        rs(60),
    paddingHorizontal: SPACING.xl,
  },
  emptyIcon: {
    fontSize:     rf(48),
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.xl,
    color:         T.text,
    marginBottom:  SPACING.xs,
    letterSpacing: 0.3,
  },
  emptySub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    textAlign:     'center',
    marginBottom:  SPACING.lg,
    letterSpacing: 0.3,
  },
  emptyBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               SPACING.xs,
    backgroundColor:   T.primary,
    borderRadius:      RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(12),
    shadowColor:       T.primary,
    shadowOpacity:     0.35,
    shadowRadius:      12,
    shadowOffset:      { width: 0, height: 4 },
    elevation:         4,
  },
  emptyBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         '#fff',
    letterSpacing: 0.4,
  },
});
