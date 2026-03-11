/**
 * ConfessionMarketplaceScreen
 * Browse and unlock active confession cards from everyone.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, TextInput, ScrollView,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Clock, Flame, Filter, Moon, Plus,
  Search, Users, Zap,
} from 'lucide-react-native';
import { API_BASE_URL } from '../../config/api';

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  surfaceAlt: '#1a1f2e',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.06)',
};

const CATEGORIES = [
  { id: null,         label: 'All',        emoji: '✨' },
  { id: 'love',       label: 'Love',       emoji: '💔', color: '#FF6B8A' },
  { id: 'fun',        label: 'Fun',        emoji: '😈', color: '#FFB347' },
  { id: 'adventure',  label: 'Adventure',  emoji: '🌍', color: '#47B8FF' },
  { id: 'friendship', label: 'Friendship', emoji: '🤝', color: '#47FFB8' },
  { id: 'spicy',      label: 'Spicy',      emoji: '🌶️', color: '#FF4747' },
];

const getCatColor = (id) => CATEGORIES.find(c => c.id === id)?.color || THEME.primary;
const getCatEmoji = (id) => CATEGORIES.find(c => c.id === id)?.emoji || '✨';

export default function ConfessionMarketplaceScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [drops, setDrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [category, setCategory] = useState(null);
  const [nightOnly, setNightOnly] = useState(false);
  const [groupOnly, setGroupOnly] = useState(false);
  const skip = useRef(0);
  const LIMIT = 20;

  useEffect(() => {
    reset();
  }, [category, nightOnly, groupOnly]);

  const reset = () => {
    skip.current = 0;
    setDrops([]);
    setHasMore(true);
    load(true);
  };

  const load = async (isFirst = false) => {
    if (isFirst) setLoading(true);
    else setLoadingMore(true);

    try {
      const token = await AsyncStorage.getItem('token');
      const params = new URLSearchParams({
        skip: skip.current,
        limit: LIMIT,
        ...(category && { category }),
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
        skip.current += data.drops.length;
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  };

  const onRefresh = () => { setRefreshing(true); reset(); };

  const onEndReached = () => {
    if (!loadingMore && hasMore) load(false);
  };

  const renderDrop = ({ item }) => {
    const color = getCatColor(item.category);
    const emoji = getCatEmoji(item.category);

    return (
      <TouchableOpacity
        style={[styles.dropCard, { borderColor: `${color}30` }]}
        onPress={() => navigation.navigate('DropLanding', { dropId: item.id })}
        activeOpacity={0.85}
      >
        {/* Top row */}
        <View style={styles.dropTop}>
          <Text style={styles.dropEmoji}>{emoji}</Text>
          <Text style={[styles.dropCat, { color }]}>{item.category?.toUpperCase()}</Text>
          {item.is_night_mode && (
            <View style={styles.nightTag}>
              <Moon size={11} color="#9B8BFF" />
              <Text style={styles.nightTagText}>Night</Text>
            </View>
          )}
          {item.is_group && (
            <View style={[styles.groupTag, { backgroundColor: `${color}18` }]}>
              <Users size={11} color={color} />
              <Text style={[styles.groupTagText, { color }]}>Group · {item.group_size}</Text>
            </View>
          )}
          <Text style={styles.dropTimeAgo}>{item.time_ago}</Text>
        </View>

        {/* Confession */}
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
            <Clock size={12} color={THEME.textSecondary} />
            <Text style={styles.dropMetaText}>{item.time_left}</Text>
          </View>
          <View style={styles.dropMeta}>
            <Flame size={12} color={color} />
            <Text style={[styles.dropMetaText, { color }]}>{item.unlock_count} connected</Text>
          </View>

          {item.already_unlocked ? (
            <View style={[styles.unlockBadge, { backgroundColor: `${color}18`, borderColor: `${color}40` }]}>
              <Text style={[styles.unlockBadgeText, { color }]}>✓ Connected</Text>
            </View>
          ) : (
            <View style={[styles.unlockBadge, { backgroundColor: `${color}12`, borderColor: `${color}30` }]}>
              <Zap size={12} color={color} />
              <Text style={[styles.unlockBadgeText, { color }]}>${item.price}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const Header = () => (
    <View>
      {/* Category filter */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.catScroll} contentContainerStyle={styles.catContent}
      >
        {CATEGORIES.map(cat => {
          const active = category === cat.id;
          const color = cat.color || THEME.primary;
          return (
            <TouchableOpacity
              key={String(cat.id)}
              style={[
                styles.catChip,
                active && { backgroundColor: `${color}20`, borderColor: color },
              ]}
              onPress={() => setCategory(cat.id)}
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
          style={[styles.filterChip, nightOnly && styles.filterChipActive]}
          onPress={() => setNightOnly(v => !v)}
        >
          <Moon size={13} color={nightOnly ? '#9B8BFF' : THEME.textSecondary} />
          <Text style={[styles.filterChipText, nightOnly && { color: '#9B8BFF' }]}>Night only</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, groupOnly && styles.filterChipActive]}
          onPress={() => setGroupOnly(v => !v)}
        >
          <Users size={13} color={groupOnly ? THEME.primary : THEME.textSecondary} />
          <Text style={[styles.filterChipText, groupOnly && { color: THEME.primary }]}>Groups</Text>
        </TouchableOpacity>
        <Text style={styles.totalLabel}>{drops.length} drops</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={THEME.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Confession Market</Text>
          <Text style={styles.headerSub}>Anonymous. Real. Anonymous.</Text>
        </View>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => navigation.navigate('ShareCard')}
        >
          <Plus size={20} color={THEME.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={THEME.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={drops}
          keyExtractor={item => item.id}
          renderItem={renderDrop}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={<Header />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🌙</Text>
              <Text style={styles.emptyTitle}>No drops right now</Text>
              <Text style={styles.emptySub}>Be the first to drop a confession.</Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => navigation.navigate('ShareCard')}
              >
                <Plus size={16} color="#fff" />
                <Text style={styles.emptyBtnText}>Create a Drop</Text>
              </TouchableOpacity>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={THEME.primary} style={{ marginVertical: 20 }} />
            ) : null
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.primary} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: THEME.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.surface,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: THEME.text },
  headerSub: { fontSize: 12, color: THEME.textSecondary, marginTop: 1 },
  createBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.surface,
  },

  catScroll: { marginTop: 16 },
  catContent: { paddingHorizontal: 16, gap: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14,
    backgroundColor: THEME.surface, borderWidth: 1, borderColor: THEME.border,
  },
  catChipEmoji: { fontSize: 15 },
  catChipText: { fontSize: 13, fontWeight: '600', color: THEME.textSecondary },

  filterRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    backgroundColor: THEME.surface, borderWidth: 1, borderColor: THEME.border,
  },
  filterChipActive: { borderColor: '#9B8BFF', backgroundColor: 'rgba(155,139,255,0.1)' },
  filterChipText: { fontSize: 13, fontWeight: '500', color: THEME.textSecondary },
  totalLabel: { marginLeft: 'auto', fontSize: 12, color: THEME.textSecondary },

  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },

  dropCard: {
    backgroundColor: THEME.surface, borderRadius: 18, padding: 18,
    borderWidth: 1,
  },
  dropTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  dropEmoji: { fontSize: 18 },
  dropCat: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  nightTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(155,139,255,0.1)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  nightTagText: { fontSize: 10, color: '#9B8BFF', fontWeight: '600' },
  groupTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  groupTagText: { fontSize: 10, fontWeight: '600' },
  dropTimeAgo: { fontSize: 11, color: THEME.textSecondary, marginLeft: 'auto' },

  dropConfession: {
    fontSize: 17, lineHeight: 26, color: THEME.text,
    fontStyle: 'italic', marginBottom: 12,
  },

  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 12 },
  reactionBubble: {
    backgroundColor: THEME.surfaceAlt, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  reactionText: { fontSize: 14 },

  dropFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dropMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dropMetaText: { fontSize: 12, color: THEME.textSecondary, fontWeight: '500' },
  unlockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1,
  },
  unlockBadgeText: { fontSize: 12, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: THEME.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: THEME.textSecondary, textAlign: 'center', marginBottom: 24 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: THEME.primary, borderRadius: 14,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
