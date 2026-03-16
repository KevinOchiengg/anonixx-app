import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Flame, Inbox, ShoppingBag } from 'lucide-react-native';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';

// ─── Theme ────────────────────────────────────────────────────────────────────
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
  avatarBg:      '#1e2330',
  success:       '#4CAF50',
  successDim:    'rgba(76,175,80,0.12)',
  successBorder: 'rgba(76,175,80,0.25)',
};

// ─── Static data (module level) ───────────────────────────────────────────────
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

// ─── Drops Banner ─────────────────────────────────────────────────────────────
const DropsBanner = React.memo(({ navigation }) => (
  <View style={styles.dropsBanner}>
    <View style={styles.dropsBannerTop}>
      <View>
        <Text style={styles.dropsBannerTitle}>Drops 🔥</Text>
        <Text style={styles.dropsBannerSub}>Post a confession. Get paid connections.</Text>
      </View>
      <TouchableOpacity
        style={styles.dropsCreateBtn}
        onPress={() => navigation.navigate('ShareCard')}
        hitSlop={HIT_SLOP}
        activeOpacity={0.85}
      >
        <Flame size={rs(15)} color="#fff" />
        <Text style={styles.dropsCreateBtnText}>Drop It</Text>
      </TouchableOpacity>
    </View>

    <View style={styles.dropsActions}>
      <TouchableOpacity
        style={styles.dropsActionBtn}
        onPress={() => navigation.navigate('ConfessionMarketplace')}
        hitSlop={HIT_SLOP}
        activeOpacity={0.8}
      >
        <ShoppingBag size={rs(15)} color={T.primary} />
        <Text style={styles.dropsActionText}>Browse</Text>
      </TouchableOpacity>
      <View style={styles.dropsActionDivider} />
      <TouchableOpacity
        style={styles.dropsActionBtn}
        onPress={() => navigation.navigate('DropsInbox')}
        hitSlop={HIT_SLOP}
        activeOpacity={0.8}
      >
        <Inbox size={rs(15)} color={T.primary} />
        <Text style={styles.dropsActionText}>My Drops</Text>
      </TouchableOpacity>
    </View>
  </View>
));

// ─── Request Card ─────────────────────────────────────────────────────────────
const RequestCard = React.memo(({ request, onAccept, onDecline, accepting }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleAccept = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start(() => onAccept(request.request_id));
  }, [scaleAnim, onAccept, request.request_id]);

  const handleDecline = useCallback(() => {
    onDecline(request.request_id);
  }, [onDecline, request.request_id]);

  const avatarColor = request.from_avatar_color || T.primary;

  return (
    <Animated.View style={[styles.requestCard, { transform: [{ scale: scaleAnim }] }]}>
      <View style={[
        styles.requestAvatar,
        { backgroundColor: avatarColor + '22', borderColor: avatarColor + '55' },
      ]}>
        <Text style={styles.requestAvatarEmoji}>{getAvatar(request.from_avatar)}</Text>
      </View>

      <View style={styles.requestInfo}>
        <Text style={styles.requestName}>{request.from_anonymous_name}</Text>
        {request.from_vibe_tags?.length > 0 && (
          <View style={styles.requestVibes}>
            {request.from_vibe_tags.slice(0, 2).map(tag => (
              <View key={tag} style={styles.vibeTag}>
                <Text style={styles.vibeTagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.requestTime}>{timeAgo(request.created_at)}</Text>
      </View>

      <View style={styles.requestActions}>
        <TouchableOpacity
          style={styles.acceptBtn}
          onPress={handleAccept}
          disabled={accepting === request.request_id}
          hitSlop={HIT_SLOP}
          activeOpacity={0.8}
        >
          {accepting === request.request_id
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.acceptBtnText}>Accept</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.declineBtn}
          onPress={handleDecline}
          hitSlop={HIT_SLOP}
          activeOpacity={0.8}
        >
          <Text style={styles.declineBtnText}>Ignore</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});

// ─── Chat Card ────────────────────────────────────────────────────────────────
const ChatCard = React.memo(({ chat, onPress }) => {
  const hasUnread = chat.unread_count > 0;
  const isLow     = !chat.is_unlocked && chat.messages_left !== null && chat.messages_left <= 3;
  const avatarColor = chat.other_avatar_color || T.primary;

  const handlePress = useCallback(() => onPress(chat), [onPress, chat]);

  return (
    <TouchableOpacity style={styles.chatCard} onPress={handlePress} activeOpacity={0.8}>
      {/* Avatar */}
      <View style={[
        styles.chatAvatar,
        { backgroundColor: avatarColor + '22', borderColor: avatarColor + '55' },
      ]}>
        <Text style={styles.chatAvatarEmoji}>{getAvatar(chat.other_avatar)}</Text>
        {hasUnread && <View style={styles.unreadDot} />}
      </View>

      {/* Info */}
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

        {/* Badges */}
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

      {/* Unread count */}
      {hasUnread && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{chat.unread_count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

// ─── Empty State ──────────────────────────────────────────────────────────────
const EmptyState = React.memo(({ tab }) => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyEmoji}>{tab === 'requests' ? '🌑' : '💬'}</Text>
    <Text style={styles.emptyTitle}>
      {tab === 'requests' ? 'No requests yet' : 'No chats yet'}
    </Text>
    <Text style={styles.emptyBody}>
      {tab === 'requests'
        ? "When someone wants to connect with you, they'll appear here."
        : 'Accept a connect request to start an anonymous conversation.'}
    </Text>
  </View>
));

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ConnectScreen({ navigation }) {
  const { showToast } = useToast();

  const [activeTab, setActiveTab]             = useState('requests');
  const [requests, setRequests]               = useState([]);
  const [chats, setChats]                     = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingChats, setLoadingChats]       = useState(false);
  const [refreshing, setRefreshing]           = useState(false);
  const [accepting, setAccepting]             = useState(null);
  const [requestCount, setRequestCount]       = useState(0);

  const tabIndicator = useRef(new Animated.Value(0)).current;

  // ── Data loading ─────────────────────────────────────────────────────────────
  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res  = await fetch(`${API_BASE_URL}/api/v1/connect/requests/incoming`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setRequests(data.requests || []);
        setRequestCount(data.count || 0);
      }
    } catch {
      // silent — list stays stale
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  const loadChats = useCallback(async () => {
    setLoadingChats(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res  = await fetch(`${API_BASE_URL}/api/v1/connect/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setChats(data.chats || []);
    } catch {
      // silent
    } finally {
      setLoadingChats(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadRequests(), loadChats()]);
  }, [loadRequests, loadChats]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // ── Tab switch ───────────────────────────────────────────────────────────────
  const switchTab = useCallback((tab) => {
    setActiveTab(tab);
    Animated.spring(tabIndicator, {
      toValue: tab === 'requests' ? 0 : 1,
      useNativeDriver: true,
      friction: 10,
    }).start();
  }, [tabIndicator]);

  // ── Accept / Decline ─────────────────────────────────────────────────────────
  const handleAccept = useCallback(async (requestId) => {
    setAccepting(requestId);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res = await fetch(
        `${API_BASE_URL}/api/v1/connect/requests/${requestId}/accept`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        setRequests(prev => prev.filter(r => r.request_id !== requestId));
        setRequestCount(c => Math.max(0, c - 1));
        loadChats();
        switchTab('chats');
        showToast({ type: 'success', message: 'Connection accepted.' });
      } else {
        showToast({ type: 'error', message: 'Could not accept request.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not accept request.' });
    } finally {
      setAccepting(null);
    }
  }, [loadChats, switchTab, showToast]);

  const handleDecline = useCallback(async (requestId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      await fetch(
        `${API_BASE_URL}/api/v1/connect/requests/${requestId}/decline`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      setRequests(prev => prev.filter(r => r.request_id !== requestId));
      setRequestCount(c => Math.max(0, c - 1));
    } catch {
      showToast({ type: 'error', message: 'Could not ignore request.' });
    }
  }, [showToast]);

  // ── Open chat ────────────────────────────────────────────────────────────────
  const handleOpenChat = useCallback((chat) => {
    navigation.navigate('Chat', {
      chatId:          chat.chat_id,
      otherName:       chat.other_anonymous_name,
      otherAvatar:     chat.other_avatar,
      otherAvatarColor:chat.other_avatar_color,
    });
  }, [navigation]);

  // ── Render helpers ───────────────────────────────────────────────────────────
  const renderRequest = useCallback(({ item }) => (
    <RequestCard
      request={item}
      onAccept={handleAccept}
      onDecline={handleDecline}
      accepting={accepting}
    />
  ), [handleAccept, handleDecline, accepting]);

  const renderChat = useCallback(({ item }) => (
    <ChatCard chat={item} onPress={handleOpenChat} />
  ), [handleOpenChat]);

  const tabIndicatorX = tabIndicator.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '50%'],
  });

  const isLoading = activeTab === 'requests' ? loadingRequests : loadingChats;
  const data      = activeTab === 'requests' ? requests : chats;
  const keyExtractor = useCallback(
    (item) => activeTab === 'requests' ? item.request_id : item.chat_id,
    [activeTab]
  );

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Connect</Text>
        <Text style={styles.headerSub}>Anonymous, until you're ready.</Text>
      </View>

      {/* Drops Banner */}
      <DropsBanner navigation={navigation} />

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => switchTab('requests')}
          hitSlop={HIT_SLOP}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'requests' && styles.tabTextActive]}>
            Requests
          </Text>
          {requestCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{requestCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tab}
          onPress={() => switchTab('chats')}
          hitSlop={HIT_SLOP}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'chats' && styles.tabTextActive]}>
            Chats
          </Text>
        </TouchableOpacity>

        <Animated.View style={[styles.tabIndicator, { left: tabIndicatorX }]} />
      </View>

      {/* Content */}
      {isLoading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator color={T.primary} />
        </View>
      ) : data.length === 0 ? (
        <EmptyState tab={activeTab} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={keyExtractor}
          renderItem={activeTab === 'requests' ? renderRequest : renderChat}
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
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: T.background,
  },

  // Header
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTitle: {
    fontSize: FONT.xxl,
    fontWeight: '800',
    color: T.text,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: FONT.xs,
    color: T.textSecondary,
    marginTop: rp(3),
    fontStyle: 'italic',
  },

  // Drops banner
  dropsBanner: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: T.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: T.primaryBorder,
  },
  dropsBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  dropsBannerTitle: {
    fontSize: FONT.lg,
    fontWeight: '800',
    color: T.text,
  },
  dropsBannerSub: {
    fontSize: FONT.xs,
    color: T.textSecondary,
    marginTop: rp(3),
  },
  dropsCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: T.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: rp(9),
  },
  dropsCreateBtnText: {
    fontSize: FONT.sm,
    fontWeight: '800',
    color: '#fff',
  },
  dropsActions: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.surfaceAlt,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: T.border,
    overflow: 'hidden',
  },
  dropsActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: rp(10),
  },
  dropsActionDivider: {
    width: 1,
    height: rs(18),
    backgroundColor: T.border,
  },
  dropsActionText: {
    fontSize: FONT.sm,
    fontWeight: '600',
    color: T.primary,
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: T.surface,
    borderRadius: RADIUS.md,
    padding: rp(4),
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: T.border,
  },
  tab: {
    flex: 1,
    paddingVertical: rp(10),
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xs,
    zIndex: 1,
  },
  tabText: {
    fontSize: FONT.sm,
    fontWeight: '600',
    color: T.textSecondary,
  },
  tabTextActive: { color: T.text },
  tabIndicator: {
    position: 'absolute',
    width: '50%',
    top: rp(4),
    bottom: rp(4),
    backgroundColor: T.surfaceAlt,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: T.border,
  },
  tabBadge: {
    backgroundColor: T.primary,
    borderRadius: RADIUS.full,
    paddingHorizontal: rp(6),
    paddingVertical: rp(2),
    minWidth: rs(18),
    alignItems: 'center',
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: FONT.xs,
    fontWeight: '700',
  },

  // List
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: rs(100),
    gap: SPACING.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyEmoji: {
    fontSize: rf(48),
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT.lg,
    fontWeight: '700',
    color: T.text,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: FONT.sm,
    color: T.textSecondary,
    textAlign: 'center',
    lineHeight: rf(22),
  },

  // Request card
  requestCard: {
    backgroundColor: T.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: T.border,
  },
  requestAvatar: {
    width: rs(52),
    height: rs(52),
    borderRadius: rs(26),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    flexShrink: 0,
  },
  requestAvatarEmoji: { fontSize: rf(24) },
  requestInfo: {
    flex: 1,
    gap: rp(5),
  },
  requestName: {
    fontSize: FONT.md,
    fontWeight: '700',
    color: T.text,
  },
  requestVibes: {
    flexDirection: 'row',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  vibeTag: {
    backgroundColor: T.primaryDim,
    paddingHorizontal: rp(9),
    paddingVertical: rp(3),
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: T.primaryBorder,
  },
  vibeTagText: {
    color: T.primary,
    fontSize: FONT.xs,
  },
  requestTime: {
    color: T.textSecondary,
    fontSize: FONT.xs,
  },
  requestActions: {
    gap: SPACING.xs,
    flexShrink: 0,
  },
  acceptBtn: {
    backgroundColor: T.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: rp(8),
    borderRadius: RADIUS.sm,
    minWidth: rs(72),
    alignItems: 'center',
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: FONT.sm,
    fontWeight: '700',
  },
  declineBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: rp(8),
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.border,
  },
  declineBtnText: {
    color: T.textSecondary,
    fontSize: FONT.sm,
  },

  // Chat card
  chatCard: {
    backgroundColor: T.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: T.border,
  },
  chatAvatar: {
    width: rs(50),
    height: rs(50),
    borderRadius: rs(25),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    flexShrink: 0,
    position: 'relative',
  },
  chatAvatarEmoji: { fontSize: rf(22) },
  unreadDot: {
    position: 'absolute',
    top: rp(1),
    right: rp(1),
    width: rs(10),
    height: rs(10),
    borderRadius: rs(5),
    backgroundColor: T.primary,
    borderWidth: 1.5,
    borderColor: T.background,
  },
  chatInfo: {
    flex: 1,
    gap: rp(4),
  },
  chatTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatName: {
    fontSize: FONT.md,
    fontWeight: '600',
    color: T.text,
  },
  chatNameUnread: { fontWeight: '800' },
  chatTime: {
    fontSize: FONT.xs,
    color: T.textSecondary,
  },
  chatPreview: {
    fontSize: FONT.sm,
    color: T.textSecondary,
  },
  chatPreviewUnread: {
    color: T.text,
    fontWeight: '500',
  },
  chatBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: rp(2),
  },
  unlockedBadge: {
    backgroundColor: T.successDim,
    paddingHorizontal: rp(8),
    paddingVertical: rp(3),
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: T.successBorder,
  },
  unlockedBadgeText: {
    color: T.success,
    fontSize: FONT.xs,
    fontWeight: '600',
  },
  lowBadge: {
    backgroundColor: T.primaryDim,
    paddingHorizontal: rp(8),
    paddingVertical: rp(3),
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: T.primaryBorder,
  },
  lowBadgeText: {
    color: T.primary,
    fontSize: FONT.xs,
    fontWeight: '600',
  },
  revealBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: rp(8),
    paddingVertical: rp(3),
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: T.border,
  },
  revealAccepted: {
    backgroundColor: T.successDim,
    borderColor: T.successBorder,
  },
  revealBadgeText: {
    color: T.textSecondary,
    fontSize: FONT.xs,
  },
  unreadBadge: {
    backgroundColor: T.primary,
    borderRadius: RADIUS.full,
    minWidth: rs(22),
    height: rs(22),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rp(6),
    flexShrink: 0,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: FONT.xs,
    fontWeight: '800',
  },
});
