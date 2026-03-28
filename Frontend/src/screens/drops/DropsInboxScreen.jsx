/**
 * DropsInboxScreen
 * Active cards you've sent + all connections (chats from drops).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Clock, Flame, MessageCircle, Plus,
  Share2, Users, Zap, Eye, ChevronRight,
} from 'lucide-react-native';
import { Share } from 'react-native';
import { API_BASE_URL } from '../../config/api';
import StarryBackground from '../../components/common/StarryBackground';

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  surfaceAlt: '#1a1f2e',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.06)',
};

const CATEGORY_COLORS = {
  love: '#FF6B8A', fun: '#FFB347', adventure: '#47B8FF',
  friendship: '#47FFB8', spicy: '#FF4747',
};

const TABS = ['Cards', 'Connections'];

export default function DropsInboxScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState(0);
  const [data, setData] = useState({ active_drops: [], connections: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const tabIndicator = useState(new Animated.Value(0))[0];

  useEffect(() => { load(); }, []);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/drops/inbox`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const onRefresh = () => { setRefreshing(true); load(true); };

  const switchTab = (i) => {
    setActiveTab(i);
    Animated.spring(tabIndicator, { toValue: i, friction: 8, useNativeDriver: true }).start();
  };

  const handleShare = async (drop) => {
    try {
      await Share.share({
        message: `${drop.confession}\n\n— unlock to connect 👀\nanonixx://drop/${drop.id}`,
        title: 'Anonixx Drop',
      });
    } catch (e) {}
  };

  // ── Card item ──────────────────────────────────────────────
  const renderCard = ({ item }) => {
    const color = CATEGORY_COLORS[item.category] || THEME.primary;
    return (
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: color, borderLeftWidth: 3 }]}
        onPress={() => navigation.navigate('ShareCard')}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
      <StarryBackground />
          <View style={[styles.categoryDot, { backgroundColor: color }]} />
          <Text style={styles.cardCategory}>{item.category}</Text>
          {item.is_night_mode && (
            <View style={styles.nightTag}>
              <Text style={styles.nightTagText}>🌙 Night</Text>
            </View>
          )}
          <View style={styles.timerTag}>
            <Clock size={11} color={THEME.textSecondary} />
            <Text style={styles.timerTagText}>{item.time_left}</Text>
          </View>
        </View>

        <Text style={styles.cardConfession} numberOfLines={2}>
          "{item.confession}"
        </Text>

        <View style={styles.cardStats}>
          <View style={styles.stat}>
            <Zap size={13} color={color} />
            <Text style={[styles.statNum, { color }]}>{item.unlock_count}</Text>
            <Text style={styles.statLabel}>unlocks</Text>
          </View>
          <View style={styles.stat}>
            <Eye size={13} color={THEME.textSecondary} />
            <Text style={styles.statNum}>{item.admirer_count}</Text>
            <Text style={styles.statLabel}>views</Text>
          </View>
          {item.reactions?.length > 0 && (
            <View style={styles.stat}>
              <Text style={styles.reactionPreview}>
                {item.reactions.slice(-3).join(' ')}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.shareBtn, { borderColor: color }]}
            onPress={() => handleShare(item)}
          >
            <Share2 size={13} color={color} />
            <Text style={[styles.shareBtnText, { color }]}>Share</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Connection item ────────────────────────────────────────
  const renderConnection = ({ item }) => {
    const hasUnread = item.message_count > 0 && !item.last_message;
    return (
      <TouchableOpacity
        style={styles.connItem}
        onPress={() => navigation.navigate('DropChat', { connectionId: item.id })}
        activeOpacity={0.8}
      >
        <View style={styles.connAvatar}>
          <Text style={styles.connAvatarText}>
            {item.other_anonymous_name?.[0]?.toUpperCase() || '?'}
          </Text>
          {item.is_revealed && (
            <View style={styles.revealedDot} />
          )}
        </View>

        <View style={styles.connInfo}>
          <View style={styles.connTitleRow}>
            <Text style={styles.connName} numberOfLines={1}>
              {item.other_anonymous_name}
            </Text>
            {item.is_revealed && (
              <View style={styles.revealedBadge}>
                <Text style={styles.revealedBadgeText}>Revealed</Text>
              </View>
            )}
          </View>

          <Text style={styles.connConfession} numberOfLines={1}>
            "{item.confession}"
          </Text>

          {item.last_message && (
            <Text style={styles.connLastMsg} numberOfLines={1}>
              {item.is_sender ? 'You: ' : ''}{item.last_message}
            </Text>
          )}
        </View>

        <View style={styles.connRight}>
          <Text style={styles.connMsgCount}>{item.message_count} msgs</Text>
          <ChevronRight size={16} color={THEME.textSecondary} />
        </View>
      </TouchableOpacity>
    );
  };

  const EmptyCards = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>🔥</Text>
      <Text style={styles.emptyTitle}>No active cards</Text>
      <Text style={styles.emptySub}>Create a confession card and share it anywhere to get connections.</Text>
      <TouchableOpacity
        style={styles.emptyBtn}
        onPress={() => navigation.navigate('ShareCard')}
      >
        <Plus size={16} color="#fff" />
        <Text style={styles.emptyBtnText}>Create a Drop</Text>
      </TouchableOpacity>
    </View>
  );

  const EmptyConnections = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>💬</Text>
      <Text style={styles.emptyTitle}>No connections yet</Text>
      <Text style={styles.emptySub}>When someone pays to unlock your drop, they appear here.</Text>
      <TouchableOpacity
        style={styles.emptyBtn}
        onPress={() => navigation.navigate('ConfessionMarketplace')}
      >
        <Text style={styles.emptyBtnText}>Browse Marketplace</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={THEME.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Drops Inbox</Text>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => navigation.navigate('ShareCard')}
        >
          <Plus size={20} color={THEME.primary} />
        </TouchableOpacity>
      </View>

      {/* Vibe score strip */}
      <TouchableOpacity
        style={styles.vibeStrip}
        onPress={() => navigation.navigate('VibeScore')}
      >
        <Flame size={16} color={THEME.primary} />
        <Text style={styles.vibeStripText}>View your Vibe Score & admirers</Text>
        <ChevronRight size={16} color={THEME.textSecondary} />
      </TouchableOpacity>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map((tab, i) => (
          <TouchableOpacity
            key={tab}
            style={styles.tab}
            onPress={() => switchTab(i)}
          >
            <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>
              {tab}
            </Text>
            {i === 0 && data.active_drops.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{data.active_drops.length}</Text>
              </View>
            )}
            {i === 1 && data.connections.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{data.connections.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
        <Animated.View style={[
          styles.tabIndicator,
          {
            transform: [{
              translateX: tabIndicator.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 100],
              })
            }]
          }
        ]} />
      </View>

      {/* Content */}
      {activeTab === 0 ? (
        <FlatList
          data={data.active_drops}
          keyExtractor={item => item.id}
          renderItem={renderCard}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyCards />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.primary} />
          }
        />
      ) : (
        <FlatList
          data={data.connections}
          keyExtractor={item => item.id}
          renderItem={renderConnection}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyConnections />}
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
  centered: { justifyContent: 'center', alignItems: 'center' },

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
  createBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.surface,
  },

  vibeStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 16, backgroundColor: THEME.surface, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: THEME.border,
  },
  vibeStripText: { flex: 1, fontSize: 14, fontWeight: '500', color: THEME.text },

  tabBar: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: THEME.border,
    position: 'relative',
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 6,
  },
  tabText: { fontSize: 15, fontWeight: '500', color: THEME.textSecondary },
  tabTextActive: { color: THEME.text, fontWeight: '700' },
  tabIndicator: {
    position: 'absolute', bottom: 0, left: 0,
    width: '50%', height: 2, backgroundColor: THEME.primary, borderRadius: 1,
  },
  badge: {
    backgroundColor: THEME.primary, borderRadius: 8,
    minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  list: { padding: 16, gap: 12, flexGrow: 1 },

  // Card item
  card: {
    backgroundColor: THEME.surface, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: THEME.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  cardCategory: { fontSize: 12, fontWeight: '700', color: THEME.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, flex: 1 },
  nightTag: {
    backgroundColor: 'rgba(155,139,255,0.12)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  nightTagText: { fontSize: 11, color: '#9B8BFF' },
  timerTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: THEME.surfaceAlt, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  timerTagText: { fontSize: 11, color: THEME.textSecondary },

  cardConfession: { fontSize: 16, color: THEME.text, fontStyle: 'italic', lineHeight: 22, marginBottom: 14 },

  cardStats: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statNum: { fontSize: 14, fontWeight: '700', color: THEME.text },
  statLabel: { fontSize: 12, color: THEME.textSecondary },
  reactionPreview: { fontSize: 16, letterSpacing: 2 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1,
  },
  shareBtnText: { fontSize: 12, fontWeight: '600' },

  // Connection item
  connItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: THEME.surface, borderRadius: 16,
    padding: 14, borderWidth: 1, borderColor: THEME.border, gap: 12,
  },
  connAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: THEME.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  connAvatarText: { fontSize: 20, fontWeight: '700', color: THEME.text },
  revealedDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#47FFB8', borderWidth: 2, borderColor: THEME.surface,
  },
  connInfo: { flex: 1, gap: 3 },
  connTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  connName: { fontSize: 15, fontWeight: '700', color: THEME.text },
  revealedBadge: {
    backgroundColor: 'rgba(71,255,184,0.12)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  revealedBadgeText: { fontSize: 10, color: '#47FFB8', fontWeight: '600' },
  connConfession: { fontSize: 12, color: THEME.textSecondary, fontStyle: 'italic' },
  connLastMsg: { fontSize: 13, color: THEME.textSecondary },
  connRight: { alignItems: 'flex-end', gap: 4 },
  connMsgCount: { fontSize: 12, color: THEME.textSecondary },

  // Empty states
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: THEME.text, marginBottom: 8, textAlign: 'center' },
  emptySub: { fontSize: 14, color: THEME.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: THEME.primary, borderRadius: 14,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
