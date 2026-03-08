import AsyncStorage from '@react-native-async-storage/async-storage';
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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { useFocusEffect } from '@react-navigation/native';

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  surfaceAlt: '#1a1f2e',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.06)',
  avatarBg: '#1e2330',
  success: '#4CAF50',
};

const AVATAR_MAP = {
  ghost: '👻',
  shadow: '🌑',
  flame: '🔥',
  void: '🕳️',
  storm: '⛈️',
  smoke: '💨',
  eclipse: '🌘',
  shard: '🔷',
  moth: '🦋',
  raven: '🐦‍⬛',
};

const getAvatar = (name) => AVATAR_MAP[name] || '👤';

function timeAgo(isoString) {
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}


// ─── REQUEST CARD ─────────────────────────────────────────────
function RequestCard({ request, onAccept, onDecline, accepting }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleAccept = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start(() => onAccept(request.request_id));
  };

  return (
    <Animated.View style={[styles.requestCard, { transform: [{ scale: scaleAnim }] }]}>
      {/* Avatar */}
      <View style={[styles.requestAvatar, { backgroundColor: request.from_avatar_color + '22', borderColor: request.from_avatar_color + '55' }]}>
        <Text style={styles.requestAvatarEmoji}>{getAvatar(request.from_avatar)}</Text>
      </View>

      {/* Info */}
      <View style={styles.requestInfo}>
        <Text style={styles.requestName}>{request.from_anonymous_name}</Text>
        {request.from_vibe_tags?.length > 0 && (
          <View style={styles.requestVibes}>
            {request.from_vibe_tags.slice(0, 2).map((tag) => (
              <View key={tag} style={styles.miniVibeTag}>
                <Text style={styles.miniVibeText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.requestTime}>{timeAgo(request.created_at)}</Text>
      </View>

      {/* Actions */}
      <View style={styles.requestActions}>
        <TouchableOpacity
          style={styles.acceptBtn}
          onPress={handleAccept}
          disabled={accepting === request.request_id}
          activeOpacity={0.8}
        >
          {accepting === request.request_id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.acceptBtnText}>Accept</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.declineBtn}
          onPress={() => onDecline(request.request_id)}
          activeOpacity={0.8}
        >
          <Text style={styles.declineBtnText}>Ignore</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}


// ─── CHAT CARD ────────────────────────────────────────────────
function ChatCard({ chat, onPress }) {
  const hasUnread = chat.unread_count > 0;
  const isLow = !chat.is_unlocked && chat.messages_left !== null && chat.messages_left <= 3;

  return (
    <TouchableOpacity style={styles.chatCard} onPress={() => onPress(chat)} activeOpacity={0.8}>
      {/* Avatar */}
      <View style={[styles.chatAvatar, { backgroundColor: (chat.other_avatar_color || '#FF634A') + '22', borderColor: (chat.other_avatar_color || '#FF634A') + '55' }]}>
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

        <Text style={[styles.chatPreview, hasUnread && styles.chatPreviewUnread]} numberOfLines={1}>
          {chat.last_message || 'No messages yet'}
        </Text>

        {/* Status badges */}
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
                {chat.reveal_initiator ? 'Reveal pending...' : '👁 Reveal request'}
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
}


// ─── MAIN SCREEN ──────────────────────────────────────────────
export default function ConnectScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('requests');
  const [requests, setRequests] = useState([]);
  const [chats, setChats] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState(null);
  const [requestCount, setRequestCount] = useState(0);

  const tabIndicator = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [])
  );

  const loadAll = async () => {
    await Promise.all([loadRequests(), loadChats()]);
  };

  const loadRequests = async () => {
    setLoadingRequests(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/connect/requests/incoming`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) {
        setRequests(data.requests || []);
        setRequestCount(data.count || 0);
      }
    } catch (e) {
      console.log('Load requests error:', e);
    } finally {
      setLoadingRequests(false);
    }
  };

  const loadChats = async () => {
    setLoadingChats(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/connect/chats`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) setChats(data.chats || []);
    } catch (e) {
      console.log('Load chats error:', e);
    } finally {
      setLoadingChats(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    Animated.spring(tabIndicator, {
      toValue: tab === 'requests' ? 0 : 1,
      useNativeDriver: true,
      friction: 10,
    }).start();
  };

  const handleAccept = async (requestId) => {
    setAccepting(requestId);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/connect/requests/${requestId}/accept`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.request_id !== requestId));
        setRequestCount((c) => Math.max(0, c - 1));
        // Reload chats to show new one
        loadChats();
        // Switch to chats tab
        switchTab('chats');
      }
    } catch (e) {
      console.log('Accept error:', e);
    } finally {
      setAccepting(null);
    }
  };

  const handleDecline = async (requestId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/connect/requests/${requestId}/decline`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setRequests((prev) => prev.filter((r) => r.request_id !== requestId));
      setRequestCount((c) => Math.max(0, c - 1));
    } catch (e) {
      console.log('Decline error:', e);
    }
  };

  const handleOpenChat = (chat) => {
    navigation.navigate('Chat', {
      chatId: chat.chat_id,
      otherName: chat.other_anonymous_name,
      otherAvatar: chat.other_avatar,
      otherAvatarColor: chat.other_avatar_color,
    });
  };

  const tabIndicatorX = tabIndicator.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '50%'],
  });

  const isLoading = activeTab === 'requests' ? loadingRequests : loadingChats;
  const isEmpty = activeTab === 'requests' ? requests.length === 0 : chats.length === 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Connect</Text>
        <Text style={styles.headerSub}>Anonymous, until you're ready.</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity style={styles.tab} onPress={() => switchTab('requests')} activeOpacity={0.8}>
          <Text style={[styles.tabText, activeTab === 'requests' && styles.tabTextActive]}>
            Requests
          </Text>
          {requestCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{requestCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => switchTab('chats')} activeOpacity={0.8}>
          <Text style={[styles.tabText, activeTab === 'chats' && styles.tabTextActive]}>
            Chats
          </Text>
        </TouchableOpacity>

        {/* Sliding indicator */}
        <Animated.View style={[styles.tabIndicator, { left: tabIndicatorX }]} />
      </View>

      {/* Content */}
      {isLoading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator color={THEME.primary} />
        </View>
      ) : isEmpty ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>
            {activeTab === 'requests' ? '🌑' : '💬'}
          </Text>
          <Text style={styles.emptyTitle}>
            {activeTab === 'requests' ? 'No requests yet' : 'No chats yet'}
          </Text>
          <Text style={styles.emptyBody}>
            {activeTab === 'requests'
              ? 'When someone wants to connect with you, they\'ll appear here.'
              : 'Accept a connect request to start an anonymous conversation.'}
          </Text>
        </View>
      ) : activeTab === 'requests' ? (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.request_id}
          renderItem={({ item }) => (
            <RequestCard
              request={item}
              onAccept={handleAccept}
              onDecline={handleDecline}
              accepting={accepting}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.primary} />
          }
        />
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.chat_id}
          renderItem={({ item }) => (
            <ChatCard chat={item} onPress={handleOpenChat} />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.primary} />
          }
        />
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: THEME.text,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    color: THEME.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    zIndex: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.textSecondary,
  },
  tabTextActive: {
    color: THEME.text,
  },
  tabIndicator: {
    position: 'absolute',
    width: '50%',
    top: 4,
    bottom: 4,
    backgroundColor: THEME.surfaceAlt,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  tabBadge: {
    backgroundColor: THEME.primary,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 18,
    alignItems: 'center',
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  // List
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    gap: 12,
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
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14,
    color: THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Request card
  requestCard: {
    backgroundColor: THEME.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  requestAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    flexShrink: 0,
  },
  requestAvatarEmoji: {
    fontSize: 24,
  },
  requestInfo: {
    flex: 1,
    gap: 5,
  },
  requestName: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.text,
  },
  requestVibes: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  miniVibeTag: {
    backgroundColor: 'rgba(255,99,74,0.1)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,99,74,0.2)',
  },
  miniVibeText: {
    color: THEME.primary,
    fontSize: 11,
  },
  requestTime: {
    color: THEME.textSecondary,
    fontSize: 12,
  },
  requestActions: {
    gap: 8,
    flexShrink: 0,
  },
  acceptBtn: {
    backgroundColor: THEME.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 72,
    alignItems: 'center',
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  declineBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  declineBtnText: {
    color: THEME.textSecondary,
    fontSize: 13,
  },

  // Chat card
  chatCard: {
    backgroundColor: THEME.surface,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  chatAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    flexShrink: 0,
    position: 'relative',
  },
  chatAvatarEmoji: {
    fontSize: 22,
  },
  unreadDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.primary,
    borderWidth: 1.5,
    borderColor: THEME.background,
  },
  chatInfo: {
    flex: 1,
    gap: 4,
  },
  chatTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatName: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME.text,
  },
  chatNameUnread: {
    fontWeight: '800',
  },
  chatTime: {
    fontSize: 11,
    color: THEME.textSecondary,
  },
  chatPreview: {
    fontSize: 13,
    color: THEME.textSecondary,
  },
  chatPreviewUnread: {
    color: THEME.text,
    fontWeight: '500',
  },
  chatBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  unlockedBadge: {
    backgroundColor: 'rgba(76,175,80,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.25)',
  },
  unlockedBadgeText: {
    color: THEME.success,
    fontSize: 11,
    fontWeight: '600',
  },
  lowBadge: {
    backgroundColor: 'rgba(255,99,74,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,99,74,0.25)',
  },
  lowBadgeText: {
    color: THEME.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  revealBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  revealAccepted: {
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderColor: 'rgba(76,175,80,0.2)',
  },
  revealBadgeText: {
    color: THEME.textSecondary,
    fontSize: 11,
  },
  unreadBadge: {
    backgroundColor: THEME.primary,
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
});
