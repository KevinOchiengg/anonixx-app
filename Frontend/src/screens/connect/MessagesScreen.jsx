import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Flame, Menu, MessageSquare, Zap } from 'lucide-react-native';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../context/SocketContext';
import { API_BASE_URL } from '../../config/api';
import HamburgerMenu from '../../components/ui/HamburgerMenu';
import { useUnread } from '../../context/UnreadContext';
import T from '../../utils/theme';

// ─── Constants ────────────────────────────────────────────────
const AVATAR_MAP = {
  ghost: '👻', shadow: '🌑', flame: '🔥', void: '🕳️',
  storm: '⛈️', smoke: '💨', eclipse: '🌘', shard: '🔷',
  moth: '🦋', raven: '🐦‍⬛',
};
const getAvatar = (name) => AVATAR_MAP[name] || '👤';

const TABS = ['All', 'Connect 🔗', 'Drops 🔥', 'Online ⚡'];

// ─── Helpers ──────────────────────────────────────────────────
function formatChatTime(isoString) {
  if (!isoString) return '';
  const withT      = isoString.replace(' ', 'T');
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(withT);
  const normalised  = hasTimezone ? withT : withT + 'Z';
  const msgDate     = new Date(normalised);
  if (isNaN(msgDate.getTime())) return '';

  const now       = new Date();
  const msgStr    = msgDate.toDateString();

  if (msgStr === now.toDateString()) {
    return msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (msgStr === yesterday.toDateString()) return 'Yesterday';

  const sevenAgo = new Date(now);
  sevenAgo.setDate(now.getDate() - 7);
  if (msgDate > sevenAgo) {
    return msgDate.toLocaleDateString([], { weekday: 'short' });
  }
  return msgDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ─── Typing dots ──────────────────────────────────────────────
const TypingDots = React.memo(() => {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot, delay) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dot, { toValue: 1,   duration: 300, useNativeDriver: true }),
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

// ─── Active Now Strip (connect chats only) ───────────────────
const ActiveNowStrip = React.memo(({ items, onlineIds, onPress }) => {
  const activeItems = items.filter(
    c => c.chat_type === 'connect' && onlineIds.has(c.other_user_id)
  );
  if (!activeItems.length) return null;

  return (
    <View style={styles.activeStrip}>
      <Text style={styles.activeStripLabel}>Active Now</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeStripRow}>
        {activeItems.map(item => (
          <TouchableOpacity
            key={item.id}
            onPress={() => onPress(item)}
            style={styles.activeAvatar}
            activeOpacity={0.8}
            hitSlop={HIT_SLOP}
          >
            <View style={[styles.activeAvatarRing, { borderColor: (item.other_avatar_color || T.primary) + '99' }]}>
              <Text style={styles.activeAvatarEmoji}>{getAvatar(item.other_avatar)}</Text>
            </View>
            <View style={styles.activeOnlineDot} />
            <Text style={styles.activeAvatarName} numberOfLines={1}>
              {item.other_anonymous_name?.split(' ')[0]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

// ─── Unified Chat Card ────────────────────────────────────────
const ChatCard = React.memo(({ item, onPress, isOnline, isTyping }) => {
  const isDrop       = item.chat_type === 'drop';
  const hasUnread    = item.unread_count > 0;
  const isLow        = !isDrop && !item.is_unlocked && item.messages_left !== null && item.messages_left !== undefined && item.messages_left <= 3;
  const isLocked     = !isDrop && !item.is_unlocked && item.messages_left === 0;
  const avatarColor  = item.other_avatar_color || (isDrop ? T.drop : T.primary);
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const slideAnim    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }).start();
  }, []);

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

  const handlePress = useCallback(() => onPress(item), [onPress, item]);

  // Avatar — drops get a confession emoji; connect gets the avatar slug
  const avatarContent = isDrop
    ? <Text style={styles.chatAvatarEmoji}>🔥</Text>
    : <Text style={styles.chatAvatarEmoji}>{getAvatar(item.other_avatar)}</Text>;

  const avatarBorderColor = isDrop
    ? T.drop + '55'
    : avatarColor + '55';

  const avatarBg = isDrop
    ? T.drop + '22'
    : avatarColor + '22';

  // Preview text
  let previewText;
  if (isLocked) {
    previewText = '🔒 Unlock to keep talking';
  } else if (isDrop && !item.last_message && item.confession) {
    previewText = `"${item.confession}"`;
  } else {
    previewText = item.last_message || 'No messages yet';
  }

  return (
    <Animated.View style={{ opacity: slideAnim, transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
      <TouchableOpacity
        style={[
          styles.chatCard,
          isDrop       && styles.chatCardDrop,
          isLocked     && styles.chatCardLocked,
          hasUnread    && styles.chatCardUnread,
        ]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        {/* Type chip — only shown for drop chats; connect is self-evident */}
        {isDrop && (
          <View style={[styles.typeChip, styles.typeChipDrop]}>
            <Flame size={rs(9)} color={T.drop} />
            <Text style={[styles.typeChipText, styles.typeChipTextDrop]}>drop</Text>
          </View>
        )}

        {/* Avatar */}
        <Animated.View style={[
          styles.chatAvatarWrap,
          isOnline && { transform: [{ scale: pulseAnim }] },
        ]}>
          <View style={[
            styles.chatAvatar,
            { backgroundColor: avatarBg, borderColor: avatarBorderColor },
            isOnline && { borderColor: T.online + '99', borderWidth: 2 },
          ]}>
            {avatarContent}
          </View>
          {isOnline && <View style={styles.onlineDot} />}
          {hasUnread && !isOnline && <View style={styles.unreadDot} />}
        </Animated.View>

        {/* Info */}
        <View style={styles.chatInfo}>
          <View style={styles.chatTopRow}>
            <Text style={[styles.chatName, hasUnread && styles.chatNameUnread]} numberOfLines={1}>
              {item.other_anonymous_name}
            </Text>
            <View style={styles.chatMetaRight}>
              <Text style={styles.chatTime}>{formatChatTime(item.last_message_at)}</Text>
              {hasUnread && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{item.unread_count > 99 ? '99+' : item.unread_count}</Text>
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
              style={[
                styles.chatPreview,
                hasUnread && styles.chatPreviewUnread,
                isDrop && !item.last_message && styles.chatPreviewConfession,
              ]}
              numberOfLines={1}
            >
              {previewText}
            </Text>
          )}

          {/* Badges row */}
          <View style={styles.chatBadges}>
            {isOnline && (
              <View style={styles.onlineBadge}>
                <View style={styles.onlineBadgeDot} />
                <Text style={styles.onlineBadgeText}>online</Text>
              </View>
            )}
            {!isDrop && item.is_unlocked && (
              <View style={styles.unlockedBadge}>
                <Zap size={rs(9)} color={T.success} />
                <Text style={styles.unlockedBadgeText}>Unlocked</Text>
              </View>
            )}
            {isLow && !isLocked && (
              <View style={styles.lowBadge}>
                <Text style={styles.lowBadgeText}>{item.messages_left} left</Text>
              </View>
            )}
            {isLocked && (
              <View style={styles.lockedBadge}>
                <Text style={styles.lockedBadgeText}>tap to unlock</Text>
              </View>
            )}
            {!isDrop && item.reveal_status === 'pending' && (
              <View style={styles.revealBadge}>
                <Text style={styles.revealBadgeText}>
                  {item.reveal_initiator ? '👁 waiting…' : '👁 reveal request'}
                </Text>
              </View>
            )}
            {!isDrop && item.reveal_status === 'accepted' && (
              <View style={[styles.revealBadge, styles.revealAccepted]}>
                <Text style={styles.revealBadgeText}>✨ revealed</Text>
              </View>
            )}
            {isDrop && item.is_revealed && (
              <View style={[styles.revealBadge, styles.revealAccepted]}>
                <Text style={styles.revealBadgeText}>✨ revealed</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Empty State ──────────────────────────────────────────────
const EmptyState = React.memo(({ tab }) => {
  const content = {
    'All':        { emoji: '🌑', title: 'nothing yet',         body: 'your conversations will\nappear here.' },
    'Connect 🔗': { emoji: '👻', title: 'no connect chats',    body: 'accept a connect request\nand start something real.' },
    'Drops 🔥':   { emoji: '🔥', title: 'no drop chats yet',   body: 'unlock a confession drop\nto start a private thread.' },
    'Online ⚡':  { emoji: '⚡', title: 'nobody online',       body: 'check back later.\nthey\'re always watching.' },
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

  const [items,       setItems]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeTab,   setActiveTab]   = useState('All');
  const [onlineIds,   setOnlineIds]   = useState(new Set());
  const [typingIds,   setTypingIds]   = useState(new Set());

  // ── Load inbox — calls the two live production endpoints in parallel ──
  // /connect/chats     → connect conversations
  // /drops/connections → drop marketplace chats
  // Merged and sorted by last_message_at descending on the frontend.
  const loadInbox = useCallback(async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) { setLoading(false); return; }

      const headers = { Authorization: `Bearer ${token}` };

      const [connectRes, dropsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/connect/chats`,      { headers }),
        fetch(`${API_BASE_URL}/api/v1/drops/connections`,  { headers }),
      ]);

      // Parse both — treat non-ok as empty, not fatal
      const connectData = connectRes.ok  ? await connectRes.json().catch(() => [])  : [];
      const dropsData   = dropsRes.ok    ? await dropsRes.json().catch(() => [])    : [];

      // Normalise connect chats → inbox shape
      // Production endpoint returns { chats: [...] } with field "chat_id"
      const rawConnect = connectData?.chats || (Array.isArray(connectData) ? connectData : []);
      const REVEAL_THRESHOLD = 30;
      const connectItems = rawConnect.map(c => {
        const msgCount   = c.message_count || 0;
        const isUnlocked = c.is_unlocked   || false;
        return {
          id:                   c.chat_id || c.id,   // production uses chat_id
          chat_type:            'connect',
          other_anonymous_name: c.other_anonymous_name || 'Anonymous',
          other_avatar:         c.other_avatar         || 'ghost',
          other_avatar_color:   c.other_avatar_color   || '#FF634A',
          other_user_id:        c.other_user_id        || '',
          last_message:         c.last_message         || null,
          last_message_at:      c.last_message_at      || null,
          unread_count:         c.unread_count         || 0,
          is_unlocked:          isUnlocked,
          messages_left:        isUnlocked ? null : Math.max(0, REVEAL_THRESHOLD - msgCount),
          reveal_status:        c.reveal_status        || null,
          reveal_initiator:     c.reveal_initiator     || false,
          message_count:        msgCount,
          drop_id:              null,
          confession:           null,
          is_sender:            null,
          is_revealed:          null,
          other_revealed:       null,
        };
      });

      // Normalise drop connections → inbox shape
      // Production endpoint returns { connections: [...] } with field "id"
      const rawDrops = dropsData?.connections || (Array.isArray(dropsData) ? dropsData : []);
      const dropItems = rawDrops.map(d => ({
        id:                   d.id,
        chat_type:            'drop',
        other_anonymous_name: d.other_anonymous_name || 'Anonymous',
        other_avatar:         null,
        other_avatar_color:   null,
        other_user_id:        d.other_user_id || '',   // not in prod response — ok, used for typing only
        last_message:         d.last_message  || null,
        last_message_at:      d.last_message_at || null,
        unread_count:         0,
        is_unlocked:          true,
        messages_left:        null,
        reveal_status:        null,
        reveal_initiator:     null,
        message_count:        d.message_count || 0,
        drop_id:              d.drop_id       || null,
        confession:           d.confession    || null,
        is_sender:            d.is_sender     ?? null,
        is_revealed:          d.is_revealed   ?? null,
        other_revealed:       d.other_revealed ?? null,
      }));

      // Merge and sort by most-recent message
      const merged = [...connectItems, ...dropItems].sort((a, b) => {
        const ta = a.last_message_at || '';
        const tb = b.last_message_at || '';
        return tb.localeCompare(ta);
      });

      setItems(merged);
      refreshUnread();
    } catch (e) {
      console.warn('MessagesScreen: loadInbox error', e);
      showToast({ type: 'error', message: 'Connection error. Pull down to retry.' });
    } finally {
      setLoading(false);
    }
  }, [refreshUnread, showToast]);

  useFocusEffect(useCallback(() => { loadInbox(); }, [loadInbox]));

  // ── Socket: online/typing ─────────────────────────────────
  useEffect(() => {
    if (!socketService) return;

    const handleOnline  = ({ userId }) => setOnlineIds(prev => new Set([...prev, userId]));
    const handleOffline = ({ userId }) => setOnlineIds(prev => { const s = new Set(prev); s.delete(userId); return s; });
    const typingTimers  = {};
    const handleTyping  = ({ userId }) => {
      if (!userId) return;
      setTypingIds(prev => new Set([...prev, userId]));
      clearTimeout(typingTimers[userId]);
      typingTimers[userId] = setTimeout(() => {
        setTypingIds(prev => { const s = new Set(prev); s.delete(userId); return s; });
      }, 3000);
    };

    socketService.on?.('user_online',  handleOnline);
    socketService.on?.('user_offline', handleOffline);
    socketService.on?.('user_typing',  handleTyping);

    return () => {
      socketService.off?.('user_online',  handleOnline);
      socketService.off?.('user_offline', handleOffline);
      socketService.off?.('user_typing',  handleTyping);
      Object.values(typingTimers).forEach(clearTimeout);
    };
  }, [socketService]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInbox();
    setRefreshing(false);
  }, [loadInbox]);

  // ── Open chat — route by type ─────────────────────────────
  const handleOpenChat = useCallback((item) => {
    if (item.chat_type === 'drop') {
      navigation.navigate('DropChat', { connectionId: item.id });
    } else {
      navigation.navigate('Chat', {
        chatId:           item.id,
        otherName:        item.other_anonymous_name,
        otherAvatar:      item.other_avatar,
        otherAvatarColor: item.other_avatar_color,
        otherUserId:      item.other_user_id,
      });
    }
  }, [navigation]);

  // ── Filter by tab ─────────────────────────────────────────
  const filteredItems = items.filter(item => {
    if (activeTab === 'Connect 🔗') return item.chat_type === 'connect';
    if (activeTab === 'Drops 🔥')   return item.chat_type === 'drop';
    if (activeTab === 'Online ⚡')  return item.chat_type === 'connect' && onlineIds.has(item.other_user_id);
    return true;
  });

  const renderItem = useCallback(({ item }) => (
    <ChatCard
      item={item}
      onPress={handleOpenChat}
      isOnline={item.chat_type === 'connect' && onlineIds.has(item.other_user_id)}
      isTyping={item.chat_type === 'connect' && typingIds.has(item.other_user_id)}
    />
  ), [handleOpenChat, onlineIds, typingIds]);

  const keyExtractor = useCallback((item) => `${item.chat_type}-${item.id}`, []);

  // Total unread for header
  const totalUnread = items.reduce((acc, i) => acc + (i.unread_count || 0), 0);

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerLogo}>messages</Text>
          {totalUnread > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuBtn} hitSlop={HIT_SLOP}>
          <Menu size={rs(20)} color={T.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tab filters */}
      <View style={styles.tabRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRowContent}>
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
        </ScrollView>
      </View>

      {/* Active Now strip — connect only */}
      <ActiveNowStrip items={items} onlineIds={onlineIds} onPress={handleOpenChat} />

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator color={T.primary} />
        </View>
      ) : filteredItems.length === 0 ? (
        <EmptyState tab={activeTab} />
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={true}
          maxToRenderPerBatch={12}
          windowSize={10}
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
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  headerLogo:  { fontSize: rs(18), fontWeight: '800', color: T.primary, letterSpacing: -0.3 },
  headerBadge: {
    backgroundColor: T.primary, borderRadius: rs(10),
    minWidth: rs(20), height: rs(20),
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: rp(5),
  },
  headerBadgeText: { fontSize: rf(10), fontWeight: '800', color: '#fff' },
  menuBtn: {
    width: rs(36), height: rs(36), alignItems: 'center', justifyContent: 'center',
    borderRadius: rs(18), backgroundColor: 'rgba(255,255,255,0.04)',
  },

  // Tabs
  tabRow:         { borderBottomWidth: 1, borderBottomColor: T.border },
  tabRowContent:  { paddingHorizontal: SPACING.md, paddingVertical: rp(10), gap: SPACING.sm },
  tab: {
    paddingHorizontal: rp(14), paddingVertical: rp(6),
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.border,
  },
  tabActive:     { backgroundColor: T.primaryDim, borderColor: T.primaryBorder },
  tabText:       { fontSize: FONT.xs, fontWeight: '600', color: T.textSecondary },
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
    position: 'relative', overflow: 'hidden',
  },
  chatCardDrop:   { borderColor: 'rgba(167,139,250,0.15)' },
  chatCardUnread: { borderColor: 'rgba(255,99,74,0.15)', backgroundColor: '#171d2a' },
  chatCardLocked: { opacity: 0.75 },

  // Type chip
  typeChip: {
    position: 'absolute', top: rp(8), right: rp(10),
    flexDirection: 'row', alignItems: 'center', gap: rp(3),
    paddingHorizontal: rp(6), paddingVertical: rp(2),
    borderRadius: RADIUS.sm, borderWidth: 1,
    backgroundColor: T.primaryDim, borderColor: T.primaryBorder,
  },
  typeChipDrop:    { backgroundColor: T.dropDim, borderColor: T.dropBorder },
  typeChipText:    { fontSize: rf(9), fontWeight: '700', color: T.primary, textTransform: 'lowercase' },
  typeChipTextDrop:{ color: T.drop },

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
  chatTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: rp(40) },
  chatName:   { fontSize: FONT.md, fontWeight: '600', color: T.text, flex: 1 },
  chatNameUnread: { fontWeight: '800' },
  chatMetaRight:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  chatTime:   { fontSize: FONT.xs, color: T.textMuted },

  chatPreview:           { fontSize: FONT.sm, color: T.textSecondary },
  chatPreviewUnread:     { color: T.text, fontWeight: '500' },
  chatPreviewConfession: { color: T.textMuted, fontStyle: 'italic' },

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
  onlineBadgeDot:  { width: rs(5), height: rs(5), borderRadius: rs(3), backgroundColor: T.online },
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
