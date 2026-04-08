import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Menu, Zap } from 'lucide-react-native';
import { rs, rf, rp, rh, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../context/SocketContext';
import { API_BASE_URL } from '../../config/api';
import HamburgerMenu from '../../components/ui/HamburgerMenu';
import { useUnread } from '../../context/UnreadContext';

// ─── Theme ────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  surfaceAlt:    '#1a1f2e',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.10)',
  primaryBorder: 'rgba(255,99,74,0.20)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#4a5068',
  border:        'rgba(255,255,255,0.06)',
  borderStrong:  'rgba(255,255,255,0.10)',
  success:       '#4CAF50',
  successDim:    'rgba(76,175,80,0.12)',
  successBorder: 'rgba(76,175,80,0.25)',
  online:        '#4CAF50',
  warning:       '#FB923C',
};

const AVATAR_MAP = {
  ghost: '👻', shadow: '🌑', flame: '🔥', void: '🕳️',
  storm: '⛈️', smoke: '💨', eclipse: '🌘', shard: '🔷',
  moth: '🦋', raven: '🐦‍⬛',
};
const getAvatar = (name) => AVATAR_MAP[name] || '👤';

function timeAgo(isoString) {
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

const TABS = ['All', 'Online 🔥', 'Locked 🔒'];

// ─── Typing dots ──────────────────────────────────────────────
const TypingDots = React.memo(() => {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot, delay) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        Animated.delay(600),
      ])
    ).start();
    animate(dot1, 0);
    animate(dot2, 200);
    animate(dot3, 400);
  }, []);

  return (
    <View style={styles.typingDots}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View key={i} style={[styles.typingDot, { opacity: dot }]} />
      ))}
    </View>
  );
});

// ─── Active Now Strip ─────────────────────────────────────────
const ActiveNowStrip = React.memo(({ chats, onlineIds, onPress }) => {
  const activeChats = chats.filter(c => onlineIds.has(c.other_user_id));
  if (!activeChats.length) return null;

  return (
    <View style={styles.activeStrip}>
      <Text style={styles.activeStripLabel}>Active Now</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeStripRow}>
        {activeChats.map(chat => (
          <TouchableOpacity
            key={chat.chat_id}
            onPress={() => onPress(chat)}
            style={styles.activeAvatar}
            activeOpacity={0.8}
            hitSlop={HIT_SLOP}
          >
            <View style={[styles.activeAvatarRing, { borderColor: (chat.other_avatar_color || T.primary) + '99' }]}>
              <Text style={styles.activeAvatarEmoji}>{getAvatar(chat.other_avatar)}</Text>
            </View>
            <View style={styles.activeOnlineDot} />
            <Text style={styles.activeAvatarName} numberOfLines={1}>
              {chat.other_anonymous_name?.split(' ')[0]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

// ─── Chat Card ────────────────────────────────────────────────
const ChatCard = React.memo(({ chat, onPress, isOnline, isTyping }) => {
  const hasUnread    = chat.unread_count > 0;
  const isLow        = !chat.is_unlocked && chat.messages_left !== null && chat.messages_left <= 3;
  const isLocked     = !chat.is_unlocked && chat.messages_left === 0;
  const avatarColor  = chat.other_avatar_color || T.primary;
  const pulseAnim    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isOnline) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isOnline]);

  const handlePress = useCallback(() => onPress(chat), [onPress, chat]);

  return (
    <TouchableOpacity
      style={[styles.chatCard, isLocked && styles.chatCardLocked, hasUnread && styles.chatCardUnread]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      {/* Avatar */}
      <Animated.View style={[
        styles.chatAvatarWrap,
        isOnline && { transform: [{ scale: pulseAnim }] },
      ]}>
        <View style={[
          styles.chatAvatar,
          { backgroundColor: avatarColor + '22', borderColor: avatarColor + '55' },
          isOnline && { borderColor: T.online + '99', borderWidth: 2 },
        ]}>
          <Text style={styles.chatAvatarEmoji}>{getAvatar(chat.other_avatar)}</Text>
        </View>
        {/* Online dot */}
        {isOnline && <View style={styles.onlineDot} />}
        {/* Unread dot */}
        {hasUnread && !isOnline && <View style={styles.unreadDot} />}
      </Animated.View>

      {/* Info */}
      <View style={styles.chatInfo}>
        <View style={styles.chatTopRow}>
          <Text style={[styles.chatName, hasUnread && styles.chatNameUnread]} numberOfLines={1}>
            {chat.other_anonymous_name}
          </Text>
          <View style={styles.chatMetaRight}>
            <Text style={styles.chatTime}>{timeAgo(chat.last_message_at)}</Text>
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{chat.unread_count > 99 ? '99+' : chat.unread_count}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Preview / typing */}
        {isTyping ? (
          <View style={styles.typingRow}>
            <TypingDots />
            <Text style={styles.typingLabel}>typing</Text>
          </View>
        ) : (
          <Text
            style={[styles.chatPreview, hasUnread && styles.chatPreviewUnread]}
            numberOfLines={1}
          >
            {isLocked
              ? '🔒 Unlock to keep talking'
              : (chat.last_message || 'No messages yet')}
          </Text>
        )}

        {/* Badges */}
        <View style={styles.chatBadges}>
          {isOnline && (
            <View style={styles.onlineBadge}>
              <View style={styles.onlineBadgeDot} />
              <Text style={styles.onlineBadgeText}>online</Text>
            </View>
          )}
          {chat.is_unlocked && (
            <View style={styles.unlockedBadge}>
              <Zap size={rs(9)} color={T.success} />
              <Text style={styles.unlockedBadgeText}>Unlocked</Text>
            </View>
          )}
          {isLow && !isLocked && (
            <View style={styles.lowBadge}>
              <Text style={styles.lowBadgeText}>{chat.messages_left} left</Text>
            </View>
          )}
          {isLocked && (
            <View style={styles.lockedBadge}>
              <Text style={styles.lockedBadgeText}>tap to unlock</Text>
            </View>
          )}
          {chat.reveal_status === 'pending' && (
            <View style={styles.revealBadge}>
              <Text style={styles.revealBadgeText}>
                {chat.reveal_initiator ? '👁 waiting…' : '👁 reveal request'}
              </Text>
            </View>
          )}
          {chat.reveal_status === 'accepted' && (
            <View style={[styles.revealBadge, styles.revealAccepted]}>
              <Text style={styles.revealBadgeText}>✨ revealed</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ─── Empty State ──────────────────────────────────────────────
const EmptyState = React.memo(({ tab }) => {
  const content = {
    'All':       { emoji: '🌑', title: 'no connections yet', body: 'accept a connect request\nand start something real.' },
    'Online 🔥': { emoji: '👻', title: `nobody online right now', body: 'check back later.\nthey're always watching.` },
    'Locked 🔒': { emoji: '🔓', title: `nothing locked', body: 'all your chats are unlocked.\nyou're in.` },
  };
  const { emoji, title, body } = content[tab] || content['All'];
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
});

// ─── Screen ───────────────────────────────────────────────────
export default function MessagesScreen({ navigation }) {
  const insets            = useSafeAreaInsets();
  const { showToast }     = useToast();
  const { refreshUnread } = useUnread();
  const { socketService } = useSocket();

  const [chats,       setChats]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeTab,   setActiveTab]   = useState('All');
  const [onlineIds,   setOnlineIds]   = useState(new Set());
  const [typingIds,   setTypingIds]   = useState(new Set());

  // ── Load chats ────────────────────────────────────────────
  const loadChats = useCallback(async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res  = await fetch(`${API_BASE_URL}/api/v1/connect/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setChats(data.chats || []);
        refreshUnread();
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [refreshUnread]);

  useFocusEffect(useCallback(() => { loadChats(); }, [loadChats]));

  // ── Socket: online/typing ─────────────────────────────────
  useEffect(() => {
    if (!socketService) return;

    const handleOnline  = ({ userId }) => setOnlineIds(prev => new Set([...prev, userId]));
    const handleOffline = ({ userId }) => setOnlineIds(prev => { const s = new Set(prev); s.delete(userId); return s; });
    const handleTyping  = ({ chatId, userId, isTyping }) => {
      setTypingIds(prev => {
        const s = new Set(prev);
        isTyping ? s.add(userId) : s.delete(userId);
        return s;
      });
    };

    socketService.on?.('user_online',  handleOnline);
    socketService.on?.('user_offline', handleOffline);
    socketService.on?.('typing',       handleTyping);

    return () => {
      socketService.off?.('user_online',  handleOnline);
      socketService.off?.('user_offline', handleOffline);
      socketService.off?.('typing',       handleTyping);
    };
  }, [socketService]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadChats();
    setRefreshing(false);
  }, [loadChats]);

  const handleOpenChat = useCallback((chat) => {
    navigation.navigate('Chat', {
      chatId:           chat.chat_id,
      otherName:        chat.other_anonymous_name,
      otherAvatar:      chat.other_avatar,
      otherAvatarColor: chat.other_avatar_color,
      otherUserId:      chat.other_user_id,
    });
  }, [navigation]);

  // ── Filter chats by tab ───────────────────────────────────
  const filteredChats = chats.filter(chat => {
    if (activeTab === 'Online 🔥') return onlineIds.has(chat.other_user_id);
    if (activeTab === 'Locked 🔒') return !chat.is_unlocked && chat.messages_left === 0;
    return true;
  });

  const renderChat = useCallback(({ item }) => (
    <ChatCard
      chat={item}
      onPress={handleOpenChat}
      isOnline={onlineIds.has(item.other_user_id)}
      isTyping={typingIds.has(item.other_user_id)}
    />
  ), [handleOpenChat, onlineIds, typingIds]);

  const keyExtractor = useCallback((item) => item.chat_id, []);

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLogo}>messages</Text>
        <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuBtn} hitSlop={HIT_SLOP}>
          <Menu size={rs(20)} color={T.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tab filters */}
      <View style={styles.tabRow}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            hitSlop={HIT_SLOP}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Active Now strip */}
      <ActiveNowStrip chats={chats} onlineIds={onlineIds} onPress={handleOpenChat} />

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator color={T.primary} />
        </View>
      ) : filteredChats.length === 0 ? (
        <EmptyState tab={activeTab} />
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={keyExtractor}
          renderItem={renderChat}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} colors={[T.primary]} />
          }
        />
      )}

      <HamburgerMenu visible={menuVisible} onClose={() => setMenuVisible(false)} navigation={navigation} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: rp(14),
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  headerLogo: { fontSize: rs(18), fontWeight: '800', color: T.primary, letterSpacing: -0.3 },
  menuBtn: {
    width: rs(36), height: rs(36), alignItems: 'center', justifyContent: 'center',
    borderRadius: rs(18), backgroundColor: 'rgba(255,255,255,0.04)',
  },

  // Tabs
  tabRow: {
    flexDirection: 'row', paddingHorizontal: SPACING.md,
    paddingVertical: rp(10), gap: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  tab: {
    paddingHorizontal: rp(14), paddingVertical: rp(6),
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.border,
  },
  tabActive: { backgroundColor: T.primaryDim, borderColor: T.primaryBorder },
  tabText:   { fontSize: FONT.xs, fontWeight: '600', color: T.textSecondary },
  tabTextActive: { color: T.primary },

  // Active Now
  activeStrip: {
    paddingTop: rp(12), paddingBottom: rp(8),
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  activeStripLabel: {
    fontSize: rf(11), fontWeight: '700', color: T.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: SPACING.md, marginBottom: rp(8),
  },
  activeStripRow:    { paddingHorizontal: SPACING.md, gap: SPACING.md },
  activeAvatar:      { alignItems: 'center', width: rs(56) },
  activeAvatarRing: {
    width: rs(48), height: rs(48), borderRadius: rs(24),
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.surfaceAlt,
  },
  activeAvatarEmoji: { fontSize: rf(22) },
  activeOnlineDot: {
    position: 'absolute', bottom: rp(2), right: rp(2),
    width: rs(12), height: rs(12), borderRadius: rs(6),
    backgroundColor: T.online, borderWidth: 2, borderColor: T.background,
  },
  activeAvatarName: {
    fontSize: rf(10), color: T.textSecondary, marginTop: rp(4),
    fontWeight: '600', textAlign: 'center',
  },

  // List
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: rs(100), gap: SPACING.xs },

  // Chat card
  chatCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surface, borderRadius: RADIUS.md,
    padding: SPACING.md, gap: SPACING.sm,
    borderWidth: 1, borderColor: T.border,
  },
  chatCardUnread: { borderColor: 'rgba(255,99,74,0.15)', backgroundColor: '#171d2a' },
  chatCardLocked: { opacity: 0.75 },

  chatAvatarWrap: { position: 'relative', flexShrink: 0 },
  chatAvatar: {
    width: rs(52), height: rs(52), borderRadius: rs(26),
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
  chatAvatarEmoji: { fontSize: rf(24) },
  onlineDot: {
    position: 'absolute', bottom: rp(1), right: rp(1),
    width: rs(13), height: rs(13), borderRadius: rs(7),
    backgroundColor: T.online, borderWidth: 2, borderColor: T.background,
  },
  unreadDot: {
    position: 'absolute', top: rp(2), right: rp(2),
    width: rs(10), height: rs(10), borderRadius: rs(5),
    backgroundColor: T.primary, borderWidth: 2, borderColor: T.background,
  },

  chatInfo:   { flex: 1, gap: rp(3) },
  chatTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatName:   { fontSize: FONT.md, fontWeight: '600', color: T.text, flex: 1 },
  chatNameUnread: { fontWeight: '800' },
  chatMetaRight:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  chatTime:   { fontSize: FONT.xs, color: T.textMuted },

  chatPreview:       { fontSize: FONT.sm, color: T.textSecondary },
  chatPreviewUnread: { color: T.text, fontWeight: '500' },

  typingRow:   { flexDirection: 'row', alignItems: 'center', gap: rp(6) },
  typingDots:  { flexDirection: 'row', alignItems: 'center', gap: rp(3) },
  typingDot:   { width: rs(5), height: rs(5), borderRadius: rs(3), backgroundColor: T.primary },
  typingLabel: { fontSize: FONT.xs, color: T.primary, fontStyle: 'italic' },

  chatBadges: { flexDirection: 'row', gap: rp(5), flexWrap: 'wrap', marginTop: rp(2) },
  onlineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: rp(4),
    backgroundColor: T.successDim, borderRadius: RADIUS.sm,
    paddingHorizontal: rp(7), paddingVertical: rp(2),
    borderWidth: 1, borderColor: T.successBorder,
  },
  onlineBadgeDot: { width: rs(5), height: rs(5), borderRadius: rs(3), backgroundColor: T.online },
  onlineBadgeText: { fontSize: FONT.xs, color: T.success, fontWeight: '700' },

  unlockedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: rp(3),
    backgroundColor: T.successDim, borderRadius: RADIUS.sm,
    paddingHorizontal: rp(7), paddingVertical: rp(2),
    borderWidth: 1, borderColor: T.successBorder,
  },
  unlockedBadgeText: { fontSize: FONT.xs, color: T.success, fontWeight: '600' },

  lowBadge: {
    backgroundColor: 'rgba(251,146,60,0.12)', borderRadius: RADIUS.sm,
    paddingHorizontal: rp(7), paddingVertical: rp(2),
    borderWidth: 1, borderColor: 'rgba(251,146,60,0.3)',
  },
  lowBadgeText: { fontSize: FONT.xs, color: '#FB923C', fontWeight: '600' },

  lockedBadge: {
    backgroundColor: T.primaryDim, borderRadius: RADIUS.sm,
    paddingHorizontal: rp(7), paddingVertical: rp(2),
    borderWidth: 1, borderColor: T.primaryBorder,
  },
  lockedBadgeText: { fontSize: FONT.xs, color: T.primary, fontWeight: '600' },

  revealBadge: {
    backgroundColor: T.primaryDim, borderRadius: RADIUS.sm,
    paddingHorizontal: rp(7), paddingVertical: rp(2),
    borderWidth: 1, borderColor: T.primaryBorder,
  },
  revealAccepted:  { backgroundColor: T.successDim, borderColor: T.successBorder },
  revealBadgeText: { fontSize: FONT.xs, color: T.primary, fontWeight: '600' },

  unreadBadge: {
    backgroundColor: T.primary, borderRadius: rs(10),
    minWidth: rs(18), height: rs(18),
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: rp(4),
  },
  unreadBadgeText: { fontSize: rf(10), fontWeight: '700', color: '#fff' },

  // Empty
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  emptyEmoji: { fontSize: rf(48), marginBottom: SPACING.md },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '700', color: T.text, marginBottom: SPACING.sm, textAlign: 'center' },
  emptyBody:  { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: rf(22), fontStyle: 'italic' },
});
