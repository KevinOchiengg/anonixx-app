import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, RefreshControl,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Flame, Menu, Palette, Zap } from 'lucide-react-native';
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

// ─── Anonixx demo row — pinned above the real list so this tab is never
// just a blank screen for someone who hasn't unlocked anyone yet. Not a
// real chat: taps into DemoChatScreen, a fully local walkthrough. ──
const AnonixxDemoCard = React.memo(({ onPress }) => (
  <TouchableOpacity style={styles.demoCard} onPress={onPress} activeOpacity={0.85}>
    <View style={styles.demoAvatarWrap}>
      <View style={styles.demoAvatar}>
        <Text style={styles.demoAvatarEmoji}>🌑</Text>
      </View>
      <View style={styles.demoOnlineDot} />
    </View>
    <View style={styles.demoInfo}>
      <View style={styles.demoTopRow}>
        <Text style={styles.demoName}>anonixx</Text>
        <View style={styles.demoBadge}>
          <Text style={styles.demoBadgeText}>guide</Text>
        </View>
      </View>
      <Text style={styles.demoPreview} numberOfLines={1}>see what a real chat room looks like</Text>
    </View>
  </TouchableOpacity>
));

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

  const handleOpenDemo = useCallback(() => navigation.navigate('DemoChat'), [navigation]);

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
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => navigation.navigate('ChatProfileSetup')}
            style={styles.menuBtn}
            hitSlop={HIT_SLOP}
          >
            <Palette size={rs(18)} color={T.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuBtn} hitSlop={HIT_SLOP}>
            <Menu size={rs(20)} color={T.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Anonixx guide — always visible, so this tab is never a blank
          screen before someone's unlocked their first real conversation. */}
      <View style={styles.demoWrap}>
        <AnonixxDemoCard onPress={handleOpenDemo} />
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator color={T.primary} />
        </View>
      ) : items.length === 0 ? null : (
        <FlatList
          data={items}
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: rp(8) },
  menuBtn: {
    width: rs(36), height: rs(36), alignItems: 'center', justifyContent: 'center',
    borderRadius: rs(18), backgroundColor: 'rgba(255,255,255,0.04)',
  },

  // List
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: rs(100), gap: SPACING.xs },

  // Anonixx demo row
  demoWrap: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  demoCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: T.primaryDim, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: T.primaryBorder, padding: SPACING.md,
  },
  demoAvatarWrap: { position: 'relative', flexShrink: 0 },
  demoAvatar: {
    width: rs(46), height: rs(46), borderRadius: rs(23),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.surface, borderWidth: 1.5, borderColor: T.primaryBorder,
  },
  demoAvatarEmoji: { fontSize: rf(20) },
  demoOnlineDot: {
    position: 'absolute', bottom: rp(1), right: rp(1),
    width: rs(12), height: rs(12), borderRadius: rs(6),
    backgroundColor: T.online, borderWidth: 2, borderColor: T.background,
  },
  demoInfo: { flex: 1, gap: rp(2) },
  demoTopRow: { flexDirection: 'row', alignItems: 'center', gap: rp(8) },
  demoName: { fontSize: FONT.md, fontWeight: '700', color: T.text },
  demoBadge: {
    backgroundColor: T.primary, borderRadius: RADIUS.full,
    paddingHorizontal: rp(8), paddingVertical: rp(2),
  },
  demoBadgeText: { fontSize: rf(9), fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.4 },
  demoPreview: { fontSize: FONT.sm, color: T.textSecondary },

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
});
