/**
 * MessagesScreen — all active anonymous chats.
 * Extracted from ConnectScreen's "Chats" tab, now its own full tab.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, FlatList, RefreshControl, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Menu } from 'lucide-react-native';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import HamburgerMenu from '../../components/ui/HamburgerMenu';
import { useUnread } from '../../context/UnreadContext';

const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  surfaceAlt:    '#1a1f2e',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.10)',
  primaryBorder: 'rgba(255,99,74,0.20)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  border:        'rgba(255,255,255,0.06)',
  success:       '#4CAF50',
  successDim:    'rgba(76,175,80,0.12)',
  successBorder: 'rgba(76,175,80,0.25)',
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
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Chat Card ────────────────────────────────────────────────
const ChatCard = React.memo(({ chat, onPress }) => {
  const hasUnread   = chat.unread_count > 0;
  const isLow       = !chat.is_unlocked && chat.messages_left !== null && chat.messages_left <= 3;
  const avatarColor = chat.other_avatar_color || T.primary;

  const handlePress = useCallback(() => onPress(chat), [onPress, chat]);

  return (
    <TouchableOpacity style={styles.chatCard} onPress={handlePress} activeOpacity={0.8}>
      <View style={[
        styles.chatAvatar,
        { backgroundColor: avatarColor + '22', borderColor: avatarColor + '55' },
      ]}>
        <Text style={styles.chatAvatarEmoji}>{getAvatar(chat.other_avatar)}</Text>
        {hasUnread && <View style={styles.unreadDot} />}
      </View>

      <View style={styles.chatInfo}>
        <View style={styles.chatTopRow}>
          <Text style={[styles.chatName, hasUnread && styles.chatNameUnread]}>
            {chat.other_anonymous_name}
          </Text>
          <Text style={styles.chatTime}>{timeAgo(chat.last_message_at)}</Text>
        </View>
        <Text
          style={[styles.chatPreview, hasUnread && styles.chatPreviewUnread]}
          numberOfLines={1}
        >
          {chat.last_message || 'No messages yet'}
        </Text>
        <View style={styles.chatBadges}>
          {chat.is_unlocked && (
            <View style={styles.unlockedBadge}>
              <Text style={styles.unlockedBadgeText}>Unlocked</Text>
            </View>
          )}
          {isLow && (
            <View style={styles.lowBadge}>
              <Text style={styles.lowBadgeText}>{chat.messages_left} msgs left</Text>
            </View>
          )}
          {chat.reveal_status === 'pending' && (
            <View style={styles.revealBadge}>
              <Text style={styles.revealBadgeText}>
                {chat.reveal_initiator ? 'Reveal pending…' : '👁 Reveal request'}
              </Text>
            </View>
          )}
          {chat.reveal_status === 'accepted' && (
            <View style={[styles.revealBadge, styles.revealAccepted]}>
              <Text style={styles.revealBadgeText}>✓ Revealed</Text>
            </View>
          )}
        </View>
      </View>

      {hasUnread && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{chat.unread_count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

// ─── Empty State ──────────────────────────────────────────────
const EmptyState = React.memo(() => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyEmoji}>💬</Text>
    <Text style={styles.emptyTitle}>No chats yet</Text>
    <Text style={styles.emptyBody}>
      Accept a connect request to start an anonymous conversation.
    </Text>
  </View>
));

// ─── Screen ───────────────────────────────────────────────────
export default function MessagesScreen({ navigation }) {
  const insets                  = useSafeAreaInsets();
  const { showToast }           = useToast();
  const { refreshUnread }       = useUnread();
  const [chats,        setChats]        = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);
  const [menuVisible,  setMenuVisible]  = useState(false);

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
        refreshUnread(); // sync badge count after viewing
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [refreshUnread]);

  useFocusEffect(useCallback(() => { loadChats(); }, [loadChats]));

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
    });
  }, [navigation]);

  const renderChat = useCallback(({ item }) => (
    <ChatCard chat={item} onPress={handleOpenChat} />
  ), [handleOpenChat]);

  const keyExtractor = useCallback((item) => item.chat_id, []);

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLogo}>anonixx</Text>
        <TouchableOpacity
          onPress={() => setMenuVisible(true)}
          style={styles.menuBtn}
          hitSlop={HIT_SLOP}
        >
          <Menu size={rs(20)} color={T.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator color={T.primary} />
        </View>
      ) : chats.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={chats}
          keyExtractor={keyExtractor}
          renderItem={renderChat}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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

      <HamburgerMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        navigation={navigation}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(14),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerLogo: {
    fontSize:      rs(18),
    fontWeight:    '800',
    color:         T.primary,
    letterSpacing: -0.3,
  },
  menuBtn: {
    width:           rs(36),
    height:          rs(36),
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    rs(18),
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  // Content
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.sm,
    paddingBottom:     rs(100),
    gap:               SPACING.sm,
  },

  // Empty
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyEmoji: { fontSize: rf(48), marginBottom: SPACING.md },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '700', color: T.text, marginBottom: SPACING.sm, textAlign: 'center' },
  emptyBody:  { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: rf(22) },

  // Chat card
  chatCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    padding:         SPACING.md,
    gap:             SPACING.sm,
    borderWidth:     1,
    borderColor:     T.border,
  },
  chatAvatar: {
    width:        rs(52),
    height:       rs(52),
    borderRadius: rs(26),
    alignItems:   'center',
    justifyContent: 'center',
    borderWidth:  1.5,
    flexShrink:   0,
    position:     'relative',
  },
  chatAvatarEmoji: { fontSize: rf(24) },
  unreadDot: {
    position:        'absolute',
    top:    rp(2),
    right:  rp(2),
    width:  rs(10),
    height: rs(10),
    borderRadius:    rs(5),
    backgroundColor: T.primary,
    borderWidth:     2,
    borderColor:     T.background,
  },
  chatInfo: { flex: 1, gap: rp(4) },
  chatTopRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  chatName:        { fontSize: FONT.md, fontWeight: '600', color: T.text },
  chatNameUnread:  { fontWeight: '700', color: T.text },
  chatTime:        { fontSize: FONT.xs, color: T.textSecondary },
  chatPreview:     { fontSize: FONT.sm, color: T.textSecondary },
  chatPreviewUnread: { color: T.text, fontWeight: '500' },
  chatBadges:      { flexDirection: 'row', gap: rp(5), flexWrap: 'wrap' },
  unlockedBadge: {
    backgroundColor: T.successDim,
    borderRadius:    RADIUS.sm,
    paddingHorizontal: rp(7),
    paddingVertical: rp(2),
    borderWidth:     1,
    borderColor:     T.successBorder,
  },
  unlockedBadgeText: { fontSize: FONT.xs, color: T.success, fontWeight: '600' },
  lowBadge: {
    backgroundColor: 'rgba(251,146,60,0.12)',
    borderRadius:    RADIUS.sm,
    paddingHorizontal: rp(7),
    paddingVertical: rp(2),
    borderWidth:     1,
    borderColor:     'rgba(251,146,60,0.3)',
  },
  lowBadgeText: { fontSize: FONT.xs, color: '#FB923C', fontWeight: '600' },
  revealBadge: {
    backgroundColor: T.primaryDim,
    borderRadius:    RADIUS.sm,
    paddingHorizontal: rp(7),
    paddingVertical: rp(2),
    borderWidth:     1,
    borderColor:     T.primaryBorder,
  },
  revealAccepted: {
    backgroundColor: T.successDim,
    borderColor:     T.successBorder,
  },
  revealBadgeText: { fontSize: FONT.xs, color: T.primary, fontWeight: '600' },
  unreadBadge: {
    backgroundColor: T.primary,
    borderRadius:    rs(10),
    minWidth:        rs(20),
    height:          rs(20),
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: rp(5),
  },
  unreadBadgeText: { fontSize: FONT.xs, fontWeight: '700', color: '#fff' },
});
