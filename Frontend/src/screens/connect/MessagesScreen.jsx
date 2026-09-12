import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, Modal, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Inbox, Menu, Plus, Search, X } from 'lucide-react-native';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../context/SocketContext';
import { API_BASE_URL } from '../../config/api';
import HamburgerMenu from '../../components/ui/HamburgerMenu';
import { useUnread } from '../../context/UnreadContext';
import T from '../../utils/theme';

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

// A dedicated palette for avatar-initial fallbacks — deliberately NOT the
// app's own coral (that's the action color: send button, unread badges,
// CTAs — an avatar rendering in it looks like something tappable/alerting)
// and not gold/violet either, since those already mean something else here
// (coins/premium, drop-type chats). These are warm riffs on coral's mood —
// terracotta, dusty rose, amber, clay — without literally being it, so
// avatars read as a distinct, calm identity layer of their own.
const AVATAR_COLORS = ['#C96F53', '#C97B84', '#D98E4A', '#B56576', '#A8674F'];

// Deterministic, not random — the same person gets the same color every
// time the list re-renders, instead of flickering to a different one.
function avatarColorFor(seed) {
  if (!seed) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// Cloudinary serves a poster frame for any video delivery URL by swapping
// the file extension to an image format — same trick DropChatScreen uses
// for chat video bubbles, reused here for a video clue's story-avatar.
function videoPosterUrl(url) {
  return url ? url.replace(/\.\w+(\?.*)?$/, '.jpg$1') : url;
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

// ─── Pending unlock stories — people who've sent a Link Up request on one
// of your confessions that you haven't answered yet. A tap opens their
// mini profile (their clue media as a "resume" of sorts) to accept or
// decline from; the leading "All" tile jumps to the full requests list. ──
const PendingUnlockStory = React.memo(({ request, onPress }) => {
  const clueUri = request.media_url
    ? (request.media_type === 'video' ? videoPosterUrl(request.media_url) : request.media_url)
    : null;

  return (
    <TouchableOpacity style={styles.storyItem} onPress={() => onPress(request)} activeOpacity={0.8}>
      <LinearGradient colors={[T.primary, T.gold]} style={styles.storyRing}>
        <View style={styles.storyAvatar}>
          {clueUri ? (
            <Image source={{ uri: clueUri }} style={styles.storyAvatarImage} />
          ) : (
            <Text style={styles.storyAvatarText}>
              {request.requester_anonymous_name?.[0]?.toUpperCase() || 'A'}
            </Text>
          )}
        </View>
      </LinearGradient>
      <Text style={styles.storyName} numberOfLines={1}>
        {request.requester_anonymous_name || 'Anonymous'}
      </Text>
    </TouchableOpacity>
  );
});

const PendingUnlockStories = React.memo(({ requests, onOpenRequest, onOpenAll }) => {
  if (!requests.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.storiesRow}
      contentContainerStyle={styles.storiesContent}
    >
      <TouchableOpacity style={styles.storyItem} onPress={onOpenAll} activeOpacity={0.8}>
        <View style={styles.storyAllRing}>
          <Inbox size={rs(20)} color={T.primary} strokeWidth={2} />
          <View style={styles.storyAllBadge}>
            <Text style={styles.storyAllBadgeText}>{requests.length > 99 ? '99+' : requests.length}</Text>
          </View>
        </View>
        <Text style={styles.storyName}>All</Text>
      </TouchableOpacity>
      {requests.map((r) => (
        <PendingUnlockStory key={r.id} request={r} onPress={onOpenRequest} />
      ))}
    </ScrollView>
  );
});

// ─── Clue media inside the mini profile — same muted/looping treatment as
// UnlockRequestsScreen's own thumbnail, just shown full-size here. ────────
const RequestClueMedia = React.memo(({ mediaUrl, mediaType }) => {
  const isVideo = mediaType === 'video';
  const player = useVideoPlayer(
    isVideo ? { uri: mediaUrl } : null,
    (p) => { p.loop = true; p.muted = true; p.play(); },
  );
  if (!mediaUrl) return null;
  return isVideo ? (
    <VideoView player={player} style={styles.sheetMedia} contentFit="cover" />
  ) : (
    <Image source={{ uri: mediaUrl }} style={styles.sheetMedia} resizeMode="cover" />
  );
});

// ─── Unified Chat Card — plain avatar + a small presence dot (like the
// mockup), not the gradient "story ring" treatment; two lines of info
// (name+time, preview+badge) with a WhatsApp-style read tick on my own
// last-sent message instead of a wall of status chips. ──────────────────
const ChatCard = React.memo(({ item, onPress, isOnline, isTyping }) => {
  const hasUnread = item.unread_count > 0;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }).start();
  }, []);

  const handlePress = useCallback(() => onPress(item), [onPress, item]);

  // Stable per-person gradient for the initial-fallback avatar — keyed on
  // their id (falls back to name if that's ever missing) so it doesn't
  // reshuffle on every refetch.
  const avatarColor = useMemo(
    () => avatarColorFor(item.other_user_id || item.other_anonymous_name),
    [item.other_user_id, item.other_anonymous_name],
  );

  const previewText = item.last_message || (item.confession ? `"${item.confession}"` : 'nothing said yet');

  // Only meaningful on my own last-sent message — mirrors the tick logic
  // already used inside the chat itself (DropChatScreen's Bubble).
  const showTick = item.last_message_is_own && !isTyping;

  return (
    <Animated.View style={{ opacity: slideAnim, transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
      <TouchableOpacity
        style={[styles.chatCard, hasUnread && styles.chatCardUnread]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        {/* Avatar — their real photo if they set one, otherwise a flat
            per-person color with their initial, plus a small green dot
            when they're online now */}
        <View style={styles.chatAvatarWrap}>
          {item.other_avatar_url ? (
            <View style={styles.chatAvatar}>
              <Image source={{ uri: item.other_avatar_url }} style={styles.chatAvatarImage} />
            </View>
          ) : (
            <View style={[styles.chatAvatar, { backgroundColor: avatarColor }]}>
              <Text style={styles.chatAvatarInitial}>
                {item.other_anonymous_name?.[0]?.toUpperCase() || 'A'}
              </Text>
            </View>
          )}
          {isOnline && <View style={styles.onlineDot} />}
        </View>

        {/* Info */}
        <View style={styles.chatInfo}>
          <View style={styles.chatTopRow}>
            <Text style={[styles.chatName, hasUnread && styles.chatNameUnread]} numberOfLines={1}>
              {item.other_anonymous_name}
            </Text>
            <Text style={styles.chatTime}>{formatChatTime(item.last_message_at)}</Text>
          </View>

          <View style={styles.chatBottomRow}>
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
                {showTick ? (
                  <Text style={item.last_message_seen ? styles.tickSeen : styles.tickSent}>
                    {item.last_message_seen ? '✓✓ ' : '✓ '}
                  </Text>
                ) : null}
                {previewText}
              </Text>
            )}
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{item.unread_count > 99 ? '99+' : item.unread_count}</Text>
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
// real chat: taps into DemoChatScreen, a fully local walkthrough. Built
// from the exact same row styles as ChatCard so it reads as part of the
// list rather than a separate banner — only the "· guide" tag and the 🌑
// avatar give away that it isn't a real person. ─────────────────────────
const AnonixxDemoCard = React.memo(({ onPress }) => (
  <TouchableOpacity style={styles.chatCard} onPress={onPress} activeOpacity={0.85}>
    <View style={styles.chatAvatarWrap}>
      <View style={[styles.chatAvatar, { backgroundColor: '#A8674F' }]}>
        <Text style={styles.chatAvatarInitial}>🌑</Text>
      </View>
      <View style={styles.onlineDot} />
    </View>
    <View style={styles.chatInfo}>
      <View style={styles.chatTopRow}>
        <Text style={styles.chatName} numberOfLines={1}>
          anonixx<Text style={styles.demoGuideTag}> · guide</Text>
        </Text>
      </View>
      <View style={styles.chatBottomRow}>
        <Text style={styles.chatPreview} numberOfLines={1}>see what a real chat room looks like</Text>
      </View>
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
  const [pendingRequests, setPendingRequests] = useState([]);
  const [acceptingIds, setAcceptingIds] = useState(new Set());
  const [detailRequest, setDetailRequest] = useState(null);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'

  // ── Load inbox — calls the live production endpoints in parallel ──
  // /drops/connections   → Link Up chats (the only chat surface there is)
  // /unlock-requests/incoming → confessions of mine other people want to unlock
  const loadInbox = useCallback(async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) { setLoading(false); return; }

      const headers = { Authorization: `Bearer ${token}` };

      const [dropsRes, unlockReqRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/drops/connections`,  { headers }),
        fetch(`${API_BASE_URL}/api/v1/unlock-requests/incoming`, { headers }),
      ]);

      const dropsData   = dropsRes.ok    ? await dropsRes.json().catch(() => [])    : [];
      const unlockReqData = unlockReqRes.ok ? await unlockReqRes.json().catch(() => ({})) : {};
      const incomingRequests = unlockReqData?.requests || [];
      setPendingRequests(incomingRequests);

      // Normalise drop connections → inbox shape
      // Production endpoint returns { connections: [...] } with field "id"
      const rawDrops = dropsData?.connections || (Array.isArray(dropsData) ? dropsData : []);
      const dropItems = rawDrops.map(d => ({
        id:                   d.id,
        chat_type:            'drop',
        other_anonymous_name: d.other_anonymous_name || 'Anonymous',
        other_avatar_url:     d.other_avatar_url || null,
        other_user_id:        d.other_user_id || '',
        other_is_online:      !!d.other_is_online,
        last_message:         d.last_message  || null,
        last_message_at:      d.last_message_at || null,
        last_message_is_own:  !!d.last_message_is_own,
        last_message_seen:    !!d.last_message_seen,
        unread_count:         d.unread_count || 0,
        message_count:        d.message_count || 0,
        drop_id:              d.drop_id       || null,
        confession:           d.confession    || null,
        is_sender:            d.is_sender     ?? null,
      }));

      // Sort by most-recent message
      const merged = [...dropItems].sort((a, b) => {
        const ta = a.last_message_at || '';
        const tb = b.last_message_at || '';
        return tb.localeCompare(ta);
      });

      setItems(merged);
      // Seed presence from this fetch (fresh ground truth); socket
      // user_online/user_offline events keep it live after this.
      setOnlineIds(new Set(dropItems.filter(d => d.other_is_online).map(d => d.other_user_id).filter(Boolean)));
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

    const handleUnlockRequestChange = () => loadInbox();

    socketService.on?.('user_online',  handleOnline);
    socketService.on?.('user_offline', handleOffline);
    socketService.on?.('user_typing',  handleTyping);
    socketService.on?.('unlock_request_received',  handleUnlockRequestChange);
    socketService.on?.('unlock_request_cancelled', handleUnlockRequestChange);

    return () => {
      socketService.off?.('user_online',  handleOnline);
      socketService.off?.('user_offline', handleOffline);
      socketService.off?.('user_typing',  handleTyping);
      socketService.off?.('unlock_request_received',  handleUnlockRequestChange);
      socketService.off?.('unlock_request_cancelled', handleUnlockRequestChange);
      Object.values(typingTimers).forEach(clearTimeout);
    };
  }, [socketService, loadInbox]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInbox();
    setRefreshing(false);
  }, [loadInbox]);

  // ── Open chat — route by type ─────────────────────────────
  const handleOpenChat = useCallback((item) => {
    navigation.navigate('DropChat', { connectionId: item.id });
  }, [navigation]);

  const handleOpenDemo = useCallback(() => navigation.navigate('DemoChat'), [navigation]);

  // "+" in the header — Anonixx has no compose-to-anyone flow, so finding
  // someone new to chat with means unlocking their drop first. That
  // happens on the home feed, not in Messages, so jump tabs there instead
  // of the "All" tile's destination (pending unlock requests you already have).
  const handleGoToFeed = useCallback(() => navigation.navigate('Feed'), [navigation]);

  // Header search icon toggles the search bar instead of it always sitting
  // there — closing it also clears the query so the list resets.
  const toggleSearch = useCallback(() => {
    setSearchOpen((v) => {
      if (v) setSearch('');
      return !v;
    });
  }, []);

  // ── Story avatar tap → mini profile sheet, not an instant accept ──
  const handleOpenRequestDetail = useCallback((request) => setDetailRequest(request), []);
  const closeDetail = useCallback(() => setDetailRequest(null), []);
  const handleOpenAllRequests = useCallback(
    () => navigation.navigate('UnlockRequestsScreen'),
    [navigation],
  );

  // Accept from inside the mini profile. Coins move on the requester's side
  // only; accepting just spins up the connection and drops the owner
  // straight into it, same landing DropChat gives the requester once *they*
  // get accepted.
  const handleAcceptRequest = useCallback(async (request) => {
    setAcceptingIds((prev) => new Set(prev).add(request.id));
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/unlock-requests/${request.id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setPendingRequests((prev) => prev.filter((r) => r.id !== request.id));
        setDetailRequest(null);
        showToast({ type: 'success', message: `You're chatting with ${request.requester_anonymous_name || 'them'} now.` });
        loadInbox();
        navigation.navigate('DropChat', { connectionId: data.connection_id });
      } else {
        showToast({ type: 'warning', message: data.detail || 'Could not accept right now.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong.' });
    } finally {
      setAcceptingIds((prev) => { const s = new Set(prev); s.delete(request.id); return s; });
    }
  }, [showToast, loadInbox, navigation]);

  // Decline from inside the mini profile — same effect as declining on the
  // full requests screen, just without leaving this one.
  const handleDeclineRequest = useCallback(async (request) => {
    setAcceptingIds((prev) => new Set(prev).add(request.id));
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/unlock-requests/${request.id}/decline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPendingRequests((prev) => prev.filter((r) => r.id !== request.id));
        setDetailRequest(null);
      } else {
        showToast({ type: 'error', message: 'Could not decline right now.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong.' });
    } finally {
      setAcceptingIds((prev) => { const s = new Set(prev); s.delete(request.id); return s; });
    }
  }, [showToast]);

  const renderItem = useCallback(({ item }) => (
    <ChatCard
      item={item}
      onPress={handleOpenChat}
      isOnline={onlineIds.has(item.other_user_id)}
      isTyping={typingIds.has(item.other_user_id)}
    />
  ), [handleOpenChat, onlineIds, typingIds]);

  const keyExtractor = useCallback((item) => `${item.chat_type}-${item.id}`, []);

  // Total unread for header
  const totalUnread = items.reduce((acc, i) => acc + (i.unread_count || 0), 0);

  const filteredItems = useMemo(() => {
    const base = filter === 'unread' ? items.filter((i) => (i.unread_count || 0) > 0) : items;
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((i) => (
      i.other_anonymous_name?.toLowerCase().includes(q)
      || i.last_message?.toLowerCase().includes(q)
      || i.confession?.toLowerCase().includes(q)
    ));
  }, [items, search, filter]);

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header — hamburger + title on the left, search toggle + "+" on the
          right, matching the mockup's layout instead of the old centered
          wordmark/right-icon-cluster arrangement. */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.iconBtn} hitSlop={HIT_SLOP}>
            <Menu size={rs(22)} color={T.text} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>messages</Text>
          {totalUnread > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={toggleSearch} style={styles.iconBtn} hitSlop={HIT_SLOP}>
            {searchOpen
              ? <X size={rs(20)} color={T.textSecondary} strokeWidth={2} />
              : <Search size={rs(20)} color={T.textSecondary} strokeWidth={2} />}
          </TouchableOpacity>
          {/* Anonixx has no blank "message anyone" compose screen — finding
              someone new to chat with means unlocking their drop on the home
              feed first, so "+" jumps there instead of opening an empty form. */}
          <TouchableOpacity onPress={handleGoToFeed} style={styles.addBtn} hitSlop={HIT_SLOP}>
            <Plus size={rs(20)} color="#fff" strokeWidth={2.4} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search — filters the list below by anon name, last message, or
          confession text. Purely client-side over the already-loaded inbox.
          Collapsed by default; the header icon toggles it open. */}
      {searchOpen && (
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Search size={rs(16)} color={T.textMuted} strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search"
              placeholderTextColor={T.textMuted}
              returnKeyType="search"
              autoFocus
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={HIT_SLOP}>
                <X size={rs(15)} color={T.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Pending unlock requests — tap an avatar for their mini profile,
          or "All" for the full list. Hidden entirely when no one's waiting. */}
      <PendingUnlockStories
        requests={pendingRequests}
        onOpenRequest={handleOpenRequestDetail}
        onOpenAll={handleOpenAllRequests}
      />

      {/* Filter chips — All / Unread, coral pill when active */}
      <View style={styles.filterRow}>
        {[['all', 'All'], ['unread', 'Unread']].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setFilter(key)}
            style={[styles.filterChip, filter === key && styles.filterChipActive]}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, filter === key && styles.filterChipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Anonixx guide — always visible, so this tab is never a blank
          screen before someone's unlocked their first real conversation. */}
      {search.trim().length === 0 && (
        <View style={styles.demoWrap}>
          <AnonixxDemoCard onPress={handleOpenDemo} />
        </View>
      )}

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator color={T.primary} />
        </View>
      ) : filteredItems.length === 0 ? (
        search.trim().length > 0 ? (
          <View style={styles.centered}>
            <Text style={styles.noResultsText}>No chats match "{search.trim()}"</Text>
          </View>
        ) : filter === 'unread' ? (
          <View style={styles.centered}>
            <Text style={styles.noResultsText}>You're all caught up.</Text>
          </View>
        ) : null
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

      {/* Mini profile — their clue media as a "resume", Accept/Decline
          right there instead of blind-accepting from the avatar itself. */}
      <Modal visible={!!detailRequest} transparent animationType="fade" onRequestClose={closeDetail}>
        <TouchableWithoutFeedback onPress={closeDetail}>
          <View style={styles.sheetBackdrop} />
        </TouchableWithoutFeedback>
        {detailRequest && (
          <View style={styles.sheetCard}>
            <TouchableOpacity style={styles.sheetClose} onPress={closeDetail} hitSlop={HIT_SLOP}>
              <X size={rs(18)} color={T.textSecondary} />
            </TouchableOpacity>

            {detailRequest.media_url ? (
              <RequestClueMedia mediaUrl={detailRequest.media_url} mediaType={detailRequest.media_type} />
            ) : (
              <View style={styles.sheetNoMedia}>
                <Text style={styles.sheetNoMediaInitial}>
                  {detailRequest.requester_anonymous_name?.[0]?.toUpperCase() || 'A'}
                </Text>
              </View>
            )}

            <View style={styles.sheetBody}>
              <Text style={styles.sheetName}>{detailRequest.requester_anonymous_name || 'Anonymous'}</Text>
              <Text style={styles.sheetSub}>wants to unlock your confession</Text>
              {!!detailRequest.confession_snippet && (
                <Text style={styles.sheetSnippet} numberOfLines={3}>
                  &ldquo;{detailRequest.confession_snippet}&rdquo;
                </Text>
              )}

              <View style={styles.sheetActions}>
                <TouchableOpacity
                  style={styles.sheetDeclineBtn}
                  onPress={() => handleDeclineRequest(detailRequest)}
                  disabled={acceptingIds.has(detailRequest.id)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.sheetDeclineText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sheetAcceptBtn}
                  onPress={() => handleAcceptRequest(detailRequest)}
                  disabled={acceptingIds.has(detailRequest.id)}
                  activeOpacity={0.85}
                >
                  {acceptingIds.has(detailRequest.id)
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.sheetAcceptText}>Accept</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>
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
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: rp(10) },
  headerTitle: { fontSize: rs(21), fontWeight: '800', color: T.primary, letterSpacing: -0.3 },
  headerBadge: {
    backgroundColor: T.primary, borderRadius: rs(10),
    minWidth: rs(20), height: rs(20),
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: rp(5),
  },
  headerBadgeText: { fontSize: rf(10), fontWeight: '800', color: '#fff' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: rp(8) },
  iconBtn: {
    width: rs(36), height: rs(36), alignItems: 'center', justifyContent: 'center',
    borderRadius: rs(18), backgroundColor: 'rgba(255,255,255,0.04)',
  },
  addBtn: {
    width: rs(36), height: rs(36), alignItems: 'center', justifyContent: 'center',
    borderRadius: rs(18), backgroundColor: T.primary,
  },

  // List
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: rs(100), gap: SPACING.xs },

  // Anonixx demo row
  // Search bar
  searchWrap: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: rp(8),
    backgroundColor: T.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: T.border,
    paddingHorizontal: SPACING.md, paddingVertical: rp(10),
  },
  searchInput: {
    flex: 1, fontSize: FONT.sm, color: T.text, padding: 0,
  },
  noResultsText: { fontSize: FONT.sm, color: T.textMuted },

  // Filter chips
  filterRow: {
    flexDirection: 'row', gap: rp(8),
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm,
  },
  filterChip: {
    paddingHorizontal: rp(16), paddingVertical: rp(7),
    borderRadius: RADIUS.full,
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
  },
  filterChipActive: { backgroundColor: T.primary, borderColor: T.primary },
  filterChipText: { fontSize: FONT.xs, fontWeight: '700', color: T.textMuted },
  filterChipTextActive: { color: '#fff' },

  // Pending unlock stories
  storiesRow: { maxHeight: rs(92) },
  storiesContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, gap: rp(14) },
  storyItem: { width: rs(64), alignItems: 'center', gap: rp(5) },
  storyRing: {
    width: rs(60), height: rs(60), borderRadius: rs(30),
    padding: rs(2.5), alignItems: 'center', justifyContent: 'center',
  },
  storyAvatar: {
    width: '100%', height: '100%', borderRadius: rs(28),
    backgroundColor: T.surfaceAlt, borderWidth: 2, borderColor: T.background,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  storyAvatarImage: { width: '100%', height: '100%' },
  storyAvatarText: { fontSize: rf(18), fontWeight: '700', color: T.primary },
  storyName: { fontSize: rf(10.5), color: T.textSecondary, fontWeight: '600' },
  storyAllRing: {
    width: rs(60), height: rs(60), borderRadius: rs(30),
    backgroundColor: T.surfaceAlt, borderWidth: 1.5, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  storyAllBadge: {
    position: 'absolute', top: -rp(2), right: -rp(2),
    backgroundColor: T.primary, borderRadius: rs(9),
    minWidth: rs(18), height: rs(18), paddingHorizontal: rp(4),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: T.background,
  },
  storyAllBadgeText: { fontSize: rf(9), fontWeight: '800', color: '#fff' },

  // Pending unlock request — mini profile sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
  sheetCard: {
    position: 'absolute', left: SPACING.lg, right: SPACING.lg, top: '18%',
    backgroundColor: T.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: T.border, overflow: 'hidden',
  },
  sheetClose: {
    position: 'absolute', top: rp(10), right: rp(10), zIndex: 2,
    width: rs(30), height: rs(30), borderRadius: rs(15),
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  sheetMedia: { width: '100%', height: rs(220), backgroundColor: T.surfaceAlt },
  sheetNoMedia: {
    width: '100%', height: rs(140), backgroundColor: T.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetNoMediaInitial: { fontSize: rf(36), fontWeight: '700', color: T.primary },
  sheetBody: { padding: SPACING.lg, gap: rp(4) },
  sheetName: { fontSize: FONT.lg, fontWeight: '800', color: T.text },
  sheetSub: { fontSize: FONT.xs, color: T.textMuted, marginBottom: rp(4) },
  sheetSnippet: {
    fontSize: FONT.sm, color: T.textSecondary, fontStyle: 'italic',
    lineHeight: FONT.sm * 1.5, marginBottom: SPACING.sm,
  },
  sheetActions: { flexDirection: 'row', gap: rp(10), marginTop: rp(6) },
  sheetDeclineBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: rp(12), borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: T.border,
  },
  sheetDeclineText: { color: T.textSecondary, fontSize: FONT.sm, fontWeight: '700' },
  sheetAcceptBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: rp(12), borderRadius: RADIUS.md,
    backgroundColor: T.primary,
  },
  sheetAcceptText: { color: '#fff', fontSize: FONT.sm, fontWeight: '700' },

  demoWrap: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  demoGuideTag: { fontSize: FONT.xs, fontWeight: '600', color: T.primary },

  // Chat card — plain row, no card border/background per the mockup;
  // unread rows just get a subtly raised background, same as before.
  chatCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: rp(10), gap: SPACING.sm,
  },
  chatCardUnread: { backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: RADIUS.md },

  // Shadow lives on the wrap, not chatAvatar itself — chatAvatar clips its
  // image to a circle with overflow:hidden, which on iOS clips a shadow
  // defined on the same layer too.
  chatAvatarWrap: {
    position: 'relative', flexShrink: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 3,
  },
  chatAvatar: {
    width: rs(52), height: rs(52), borderRadius: rs(26),
    backgroundColor: T.avatarBg,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  chatAvatarImage: { width: '100%', height: '100%' },
  chatAvatarInitial: { fontSize: rf(20), fontWeight: '800', color: '#fff' },
  // Plain presence dot, bottom-right of the avatar — same spot WhatsApp
  // uses, not a ring around the whole avatar.
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: rs(13), height: rs(13), borderRadius: rs(7),
    backgroundColor: T.online, borderWidth: 2, borderColor: T.background,
  },

  chatInfo:   { flex: 1, gap: rp(3) },
  chatTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatName:   { fontSize: FONT.md, fontWeight: '600', color: T.text, flex: 1 },
  chatNameUnread: { fontWeight: '800' },
  chatTime:   { fontSize: FONT.xs, color: T.textMuted },

  chatBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: rp(8) },
  chatPreview:       { flex: 1, fontSize: FONT.sm, color: T.textSecondary },
  chatPreviewUnread: { color: T.text, fontWeight: '500' },
  tickSent: { color: T.textMuted },
  tickSeen: { color: T.primary, fontWeight: '700' },

  typingRow:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: rp(6) },
  typingDots:  { flexDirection: 'row', alignItems: 'center', gap: rp(3) },
  typingDot:   { width: rs(5), height: rs(5), borderRadius: rs(3), backgroundColor: T.primary },
  typingLabel: { fontSize: FONT.xs, color: T.primary, fontStyle: 'italic' },

  unreadBadge: {
    backgroundColor: T.primary, borderRadius: rs(10),
    minWidth: rs(18), height: rs(18),
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: rp(4),
  },
  unreadBadgeText: { fontSize: rf(10), fontWeight: '700', color: '#fff' },
});
