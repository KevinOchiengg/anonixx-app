/**
 * ConfessionMarketplaceScreen
 * Browse and unlock active confession cards from everyone.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Clock, Flame, Moon, Plus, Users, Zap } from 'lucide-react-native';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  background:   '#0b0f18',
  surface:      '#151924',
  surfaceAlt:   '#1a1f2e',
  primary:      '#FF634A',
  text:         '#EAEAF0',
  textSecondary:'#9A9AA3',
  border:       'rgba(255,255,255,0.06)',
  night:        '#9B8BFF',
  nightDim:     'rgba(155,139,255,0.10)',
};

// ─── Static data (module level) ───────────────────────────────────────────────
const CATEGORIES = [
  { id: null,         label: 'All',        emoji: '✨', color: T.primary  },
  { id: 'love',       label: 'Love',       emoji: '💔', color: '#FF6B8A' },
  { id: 'fun',        label: 'Fun',        emoji: '😈', color: '#FFB347' },
  { id: 'adventure',  label: 'Adventure',  emoji: '🌍', color: '#47B8FF' },
  { id: 'friendship', label: 'Friendship', emoji: '🤝', color: '#47FFB8' },
  { id: 'spicy',      label: 'Spicy',      emoji: '🌶️', color: '#FF4747' },
];

const LIMIT = 20;

const getCatColor = (id) => CATEGORIES.find(c => c.id === id)?.color ?? T.primary;
const getCatEmoji = (id) => CATEGORIES.find(c => c.id === id)?.emoji ?? '✨';

// ─── Drop Card ────────────────────────────────────────────────────────────────
const DropCard = React.memo(({ item, onPress }) => {
  const color = getCatColor(item.category);
  const emoji = getCatEmoji(item.category);

  const handlePress = useCallback(() => onPress(item.id), [onPress, item.id]);

  return (
    <TouchableOpacity
      style={[styles.dropCard, { borderColor: color + '30' }]}
      onPress={handlePress}
      hitSlop={HIT_SLOP}
      activeOpacity={0.85}
    >
      {/* Top row */}
      <View style={styles.dropTop}>
        <Text style={styles.dropEmoji}>{emoji}</Text>
        <Text style={[styles.dropCat, { color }]}>
          {item.category?.toUpperCase()}
        </Text>
        {item.is_night_mode && (
          <View style={styles.nightTag}>
            <Moon size={rs(11)} color={T.night} />
            <Text style={styles.nightTagText}>Night</Text>
          </View>
        )}
        {item.is_group && (
          <View style={[styles.groupTag, { backgroundColor: color + '18' }]}>
            <Users size={rs(11)} color={color} />
            <Text style={[styles.groupTagText, { color }]}>
              Group · {item.group_size}
            </Text>
          </View>
        )}
        <Text style={styles.dropTimeAgo}>{item.time_ago}</Text>
      </View>

      {/* Confession text */}
      <Text style={styles.dropConfession} numberOfLines={3}>
        "{item.confession}"
      </Text>

      {/* Reactions */}
      {item.reactions?.length > 0 && (
        <View style={styles.reactionsRow}>
          {item.reactions.map((r, i) => (
            <View key={i} style={styles.reactionBubble}>
              <Text style={styles.reactionText}>{r}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Footer */}
      <View style={styles.dropFooter}>
        <View style={styles.dropMeta}>
          <Clock size={rs(12)} color={T.textSecondary} />
          <Text style={styles.dropMetaText}>{item.time_left}</Text>
        </View>
        <View style={styles.dropMeta}>
          <Flame size={rs(12)} color={color} />
          <Text style={[styles.dropMetaText, { color }]}>
            {item.unlock_count} connected
          </Text>
        </View>
        {item.already_unlocked ? (
          <View style={[styles.unlockBadge, {
            backgroundColor: color + '18',
            borderColor:     color + '40',
          }]}>
            <Text style={[styles.unlockBadgeText, { color }]}>✓ Connected</Text>
          </View>
        ) : (
          <View style={[styles.unlockBadge, {
            backgroundColor: color + '12',
            borderColor:     color + '30',
          }]}>
            <Zap size={rs(12)} color={color} />
            <Text style={[styles.unlockBadgeText, { color }]}>${item.price}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ─── List Header ──────────────────────────────────────────────────────────────
const ListHeader = React.memo(({ category, setCategory, nightOnly, setNightOnly, groupOnly, setGroupOnly, total }) => (
  <View>
    {/* Category filter */}
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.catScroll}
      contentContainerStyle={styles.catContent}
    >
      {CATEGORIES.map(cat => {
        const active = category === cat.id;
        const color  = cat.color;
        return (
          <TouchableOpacity
            key={String(cat.id)}
            style={[
              styles.catChip,
              active && { backgroundColor: color + '20', borderColor: color },
            ]}
            onPress={() => setCategory(cat.id)}
            hitSlop={HIT_SLOP}
          >
            <Text style={styles.catChipEmoji}>{cat.emoji}</Text>
            <Text style={[styles.catChipText, active && { color }]}>{cat.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>

    {/* Filter toggles */}
    <View style={styles.filterRow}>
      <TouchableOpacity
        style={[styles.filterChip, nightOnly && styles.filterChipNight]}
        onPress={() => setNightOnly(v => !v)}
        hitSlop={HIT_SLOP}
      >
        <Moon size={rs(13)} color={nightOnly ? T.night : T.textSecondary} />
        <Text style={[styles.filterChipText, nightOnly && { color: T.night }]}>
          Night only
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.filterChip, groupOnly && styles.filterChipActive]}
        onPress={() => setGroupOnly(v => !v)}
        hitSlop={HIT_SLOP}
      >
        <Users size={rs(13)} color={groupOnly ? T.primary : T.textSecondary} />
        <Text style={[styles.filterChipText, groupOnly && { color: T.primary }]}>
          Groups
        </Text>
      </TouchableOpacity>

      <Text style={styles.totalLabel}>{total} drops</Text>
    </View>
  </View>
));

// ─── Empty State ──────────────────────────────────────────────────────────────
const EmptyState = React.memo(({ onCreateDrop }) => (
  <View style={styles.empty}>
    <Text style={styles.emptyIcon}>🌙</Text>
    <Text style={styles.emptyTitle}>No drops right now</Text>
    <Text style={styles.emptySub}>Be the first to drop a confession.</Text>
    <TouchableOpacity style={styles.emptyBtn} onPress={onCreateDrop} hitSlop={HIT_SLOP}>
      <Plus size={rs(16)} color="#fff" />
      <Text style={styles.emptyBtnText}>Create a Drop</Text>
    </TouchableOpacity>
  </View>
));

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ConfessionMarketplaceScreen({ navigation }) {
  const { showToast } = useToast();

  const [drops, setDrops]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]       = useState(true);

  const [category, setCategory]   = useState(null);
  const [nightOnly, setNightOnly] = useState(false);
  const [groupOnly, setGroupOnly] = useState(false);

  const skipRef = useRef(0);

  // ── Load ─────────────────────────────────────────────────────────────────────
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

  // Reset when filters change
  useEffect(() => {
    skipRef.current = 0;
    setDrops([]);
    setHasMore(true);
    load(true);
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

  // ── Navigation handlers ───────────────────────────────────────────────────────
  const handleDropPress = useCallback((dropId) => {
    navigation.navigate('DropLanding', { dropId });
  }, [navigation]);

  const handleCreateDrop = useCallback(() => {
    navigation.navigate('ShareCard');
  }, [navigation]);

  // ── Render helpers ───────────────────────────────────────────────────────────
  const renderDrop = useCallback(({ item }) => (
    <DropCard item={item} onPress={handleDropPress} />
  ), [handleDropPress]);

  const keyExtractor = useCallback((item) => item.id, []);

  const ListHeaderComponent = useCallback(() => (
    <ListHeader
      category={category}   setCategory={setCategory}
      nightOnly={nightOnly} setNightOnly={setNightOnly}
      groupOnly={groupOnly} setGroupOnly={setGroupOnly}
      total={drops.length}
    />
  ), [category, nightOnly, groupOnly, drops.length]);

  const ListFooterComponent = useCallback(() =>
    loadingMore
      ? <ActivityIndicator color={T.primary} style={{ marginVertical: SPACING.lg }} />
      : null
  , [loadingMore]);

  const ListEmptyComponent = useCallback(() =>
    loading ? null : <EmptyState onCreateDrop={handleCreateDrop} />
  , [loading, handleCreateDrop]);

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={HIT_SLOP}
          style={styles.iconBtn}
        >
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Confession Market</Text>
          <Text style={styles.headerSub}>Anonymous. Real. Unfiltered.</Text>
        </View>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={handleCreateDrop}
          hitSlop={HIT_SLOP}
        >
          <Plus size={rs(22)} color={T.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={T.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={drops}
          keyExtractor={keyExtractor}
          renderItem={renderDrop}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: T.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  iconBtn: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(19),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surface,
  },
  headerText: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: FONT.md,
    fontWeight: '700',
    color: T.text,
  },
  headerSub: {
    fontSize: FONT.xs,
    color: T.textSecondary,
    marginTop: rp(2),
  },

  // List
  list: {
    paddingHorizontal: SPACING.md,
    paddingBottom: rs(40),
    gap: SPACING.sm,
  },

  // Category filter
  catScroll:    { marginTop: SPACING.md },
  catContent:   { paddingHorizontal: SPACING.md, gap: SPACING.xs },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(5),
    paddingHorizontal: SPACING.sm,
    paddingVertical: rp(8),
    borderRadius: RADIUS.md,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  catChipEmoji: { fontSize: rf(15) },
  catChipText: {
    fontSize: FONT.sm,
    fontWeight: '600',
    color: T.textSecondary,
  },

  // Filter toggles
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(5),
    paddingHorizontal: SPACING.sm,
    paddingVertical: rp(6),
    borderRadius: RADIUS.sm,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  filterChipActive: {
    borderColor: T.primary,
    backgroundColor: 'rgba(255,99,74,0.10)',
  },
  filterChipNight: {
    borderColor: T.night,
    backgroundColor: T.nightDim,
  },
  filterChipText: {
    fontSize: FONT.sm,
    fontWeight: '500',
    color: T.textSecondary,
  },
  totalLabel: {
    marginLeft: 'auto',
    fontSize: FONT.xs,
    color: T.textSecondary,
  },

  // Drop card
  dropCard: {
    backgroundColor: T.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
  },
  dropTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  dropEmoji:   { fontSize: rf(18) },
  dropCat: {
    fontSize: FONT.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  nightTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(3),
    backgroundColor: T.nightDim,
    borderRadius: RADIUS.xs,
    paddingHorizontal: rp(6),
    paddingVertical: rp(2),
  },
  nightTagText: {
    fontSize: FONT.xs,
    color: T.night,
    fontWeight: '600',
  },
  groupTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(3),
    borderRadius: RADIUS.xs,
    paddingHorizontal: rp(6),
    paddingVertical: rp(2),
  },
  groupTagText: {
    fontSize: FONT.xs,
    fontWeight: '600',
  },
  dropTimeAgo: {
    fontSize: FONT.xs,
    color: T.textSecondary,
    marginLeft: 'auto',
  },
  dropConfession: {
    fontSize: FONT.md,
    lineHeight: rf(26),
    color: T.text,
    fontStyle: 'italic',
    marginBottom: SPACING.sm,
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rp(5),
    marginBottom: SPACING.sm,
  },
  reactionBubble: {
    backgroundColor: T.surfaceAlt,
    borderRadius: RADIUS.sm,
    paddingHorizontal: rp(8),
    paddingVertical: rp(4),
  },
  reactionText: { fontSize: rf(14) },
  dropFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dropMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(4),
  },
  dropMetaText: {
    fontSize: FONT.xs,
    color: T.textSecondary,
    fontWeight: '500',
  },
  unlockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(4),
    marginLeft: 'auto',
    paddingHorizontal: rp(10),
    paddingVertical: rp(5),
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  unlockBadgeText: {
    fontSize: FONT.xs,
    fontWeight: '700',
  },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingTop: rs(60),
    paddingHorizontal: SPACING.xl,
  },
  emptyIcon: {
    fontSize: rf(48),
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT.lg,
    fontWeight: '700',
    color: T.text,
    marginBottom: SPACING.xs,
  },
  emptySub: {
    fontSize: FONT.sm,
    color: T.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: T.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: rp(12),
  },
  emptyBtnText: {
    fontSize: FONT.sm,
    fontWeight: '700',
    color: '#fff',
  },
});
