/**
 * ChatScreen.jsx
 * Anonymous chat between two connected users.
 * Features: message limit, $2 unlock, identity reveal request/response.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import StarryBackground from '../../components/common/StarryBackground';

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
  myBubble:      '#FF634A',
  theirBubble:   '#1e2535',
  success:       '#4CAF50',
  successDim:    'rgba(76,175,80,0.08)',
  successBorder: 'rgba(76,175,80,0.15)',
};

// ─── Static data (module level) ───────────────────────────────────────────────
const AVATAR_MAP = {
  ghost: '👻', shadow: '🌑', flame: '🔥', void: '🕳️',
  storm: '⛈️', smoke: '💨', eclipse: '🌘', shard: '🔷',
  moth: '🦋', raven: '🐦‍⬛',
};

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
const MessageBubble = React.memo(({ message, showTime }) => {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(message.is_own ? 12 : -12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 10,  useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[
      styles.bubbleRow,
      message.is_own ? styles.bubbleRowOwn : styles.bubbleRowTheir,
      { opacity: fadeAnim, transform: [{ translateX: slideAnim }] },
    ]}>
      <View style={[styles.bubble, message.is_own ? styles.bubbleOwn : styles.bubbleTheir]}>
      <StarryBackground />
        <Text style={[styles.bubbleText, message.is_own && styles.bubbleTextOwn]}>
          {message.content}
        </Text>
      </View>
      {showTime && (
        <Text style={[styles.bubbleTime, message.is_own && styles.bubbleTimeOwn]}>
          {formatTime(message.created_at)}
          {message.is_own && message.is_read ? '  ✓' : ''}
        </Text>
      )}
    </Animated.View>
  );
});

// ─── Limit Banner ─────────────────────────────────────────────────────────────
const LimitBanner = React.memo(({ messagesLeft, onUnlock }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (messagesLeft !== 0) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.02, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [messagesLeft]);

  if (messagesLeft === null || messagesLeft > 5) return null;

  if (messagesLeft === 0) {
    return (
      <Animated.View style={[styles.limitFull, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={styles.limitFullTitle}>Message limit reached</Text>
        <Text style={styles.limitFullBody}>Unlock this chat for $2 — no more limits, ever.</Text>
        <TouchableOpacity style={styles.unlockBtn} onPress={onUnlock} hitSlop={HIT_SLOP} activeOpacity={0.8}>
          <Text style={styles.unlockBtnText}>Unlock — $2</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <View style={styles.limitWarn}>
      <Text style={styles.limitWarnText}>
        {messagesLeft} free {messagesLeft === 1 ? 'message' : 'messages'} left
        {'  ·  '}
        <Text style={styles.limitWarnLink} onPress={onUnlock}>Unlock $2</Text>
      </Text>
    </View>
  );
});

// ─── Reveal Modal ─────────────────────────────────────────────────────────────
const RevealModal = React.memo(({ visible, chat, onAccept, onDecline, onRequest, onClose }) => {
  if (!visible) return null;

  const isPending    = chat?.reveal_status === 'pending';
  const isInitiator  = chat?.reveal_initiator;
  const isAccepted   = chat?.reveal_status === 'accepted';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.revealBackdrop}>
        <View style={styles.revealCard}>
          <Text style={styles.revealEmoji}>
            {isAccepted ? '✨' : (isPending && !isInitiator) ? '👁' : '🌑'}
          </Text>

          {isAccepted ? (
            <>
              <Text style={styles.revealTitle}>Identities revealed</Text>
              <Text style={styles.revealBody}>You both chose to be seen.</Text>
            </>
          ) : isPending && !isInitiator ? (
            <>
              <Text style={styles.revealTitle}>They want to reveal</Text>
              <Text style={styles.revealBody}>
                They're asking to show you who they really are. You don't have to say yes.
              </Text>
              <TouchableOpacity style={styles.revealPrimaryBtn} onPress={onAccept} hitSlop={HIT_SLOP} activeOpacity={0.8}>
                <Text style={styles.revealPrimaryText}>Reveal each other</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.revealSecondaryBtn} onPress={onDecline} hitSlop={HIT_SLOP} activeOpacity={0.8}>
                <Text style={styles.revealSecondaryText}>Stay anonymous</Text>
              </TouchableOpacity>
            </>
          ) : isPending && isInitiator ? (
            <>
              <Text style={styles.revealTitle}>Waiting…</Text>
              <Text style={styles.revealBody}>Your reveal request has been sent. Waiting for their response.</Text>
            </>
          ) : (
            <>
              <Text style={styles.revealTitle}>Reveal identity?</Text>
              <Text style={styles.revealBody}>
                Send a request to reveal who you both are. They must agree for anything to be shown.
              </Text>
              <TouchableOpacity style={styles.revealPrimaryBtn} onPress={onRequest} hitSlop={HIT_SLOP} activeOpacity={0.8}>
                <Text style={styles.revealPrimaryText}>Send reveal request</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.revealCloseBtn} onPress={onClose} hitSlop={HIT_SLOP}>
            <Text style={styles.revealCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ChatScreen({ route, navigation }) {
  const { chatId, otherName, otherAvatar, otherAvatarColor } = route.params || {};
  const { showToast } = useToast();

  const [messages, setMessages]           = useState([]);
  const [chatInfo, setChatInfo]           = useState(null);
  const [loading, setLoading]             = useState(true);
  const [inputText, setInputText]         = useState('');
  const [sending, setSending]             = useState(false);
  const [showReveal, setShowReveal]       = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);

  const flatListRef = useRef(null);
  const pollRef     = useRef(null);

  // ── Load messages (also used as poll) ────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res  = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setMessages(data.messages || []);
        setChatInfo(data.chat);
      }
    } catch {
      // silent — chat stays with last known state
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useFocusEffect(useCallback(() => {
    loadMessages();
    pollRef.current = setInterval(loadMessages, 5000);
    return () => clearInterval(pollRef.current);
  }, [loadMessages]));

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const content = inputText.trim();
    if (!content || sending) return;
    if (chatInfo?.messages_left === 0 && !chatInfo?.is_unlocked) return;

    setSending(true);
    const tempId = `temp_${Date.now()}`;

    // Optimistic update
    setMessages(prev => [...prev, {
      id: tempId, content, is_own: true, is_read: false,
      created_at: new Date().toISOString(),
    }]);
    setInputText('');
    scrollToBottom();

    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res  = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ chat_id: chatId, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        if (res.status === 402) {
          setChatInfo(prev => ({ ...prev, messages_left: 0 }));
          showToast({ type: 'warning', message: 'Message limit reached. Unlock to continue.' });
        } else {
          showToast({ type: 'error', message: 'Message could not be sent.' });
        }
      } else {
        if (data.messages_left !== undefined) {
          setChatInfo(prev => ({ ...prev, messages_left: data.messages_left }));
        }
        loadMessages();
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      showToast({ type: 'error', message: 'Message could not be sent.' });
    } finally {
      setSending(false);
    }
  }, [inputText, sending, chatInfo, chatId, scrollToBottom, loadMessages, showToast]);

  // ── Unlock ───────────────────────────────────────────────────────────────────
  const handleUnlock = useCallback(() => {
    navigation.navigate('UnlockPremium', { chatId, otherName });
  }, [navigation, chatId, otherName]);

  // ── Reveal request ───────────────────────────────────────────────────────────
  const handleRevealRequest = useCallback(async () => {
    setRevealLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/reveal/request`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setChatInfo(prev => ({ ...prev, reveal_status: 'pending', reveal_initiator: true }));
        showToast({ type: 'info', message: 'Reveal request sent.' });
      } else {
        showToast({ type: 'error', message: 'Could not send reveal request.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not send reveal request.' });
    } finally {
      setRevealLoading(false);
    }
  }, [chatId, showToast]);

  // ── Reveal respond ───────────────────────────────────────────────────────────
  const handleRevealRespond = useCallback(async (accept) => {
    setRevealLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res  = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/reveal/respond`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ reveal_id: chatId, accept }),
      });
      const data = await res.json();
      if (res.ok) {
        if (accept && data.other_user) {
          setChatInfo(prev => ({ ...prev, reveal_status: 'accepted', revealed_other: data.other_user }));
          showToast({ type: 'success', message: 'Identities revealed. ✨' });
        } else {
          setChatInfo(prev => ({ ...prev, reveal_status: 'declined' }));
          setShowReveal(false);
        }
      } else {
        showToast({ type: 'error', message: 'Could not respond to reveal.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not respond to reveal.' });
    } finally {
      setRevealLoading(false);
    }
  }, [chatId, showToast]);

  // ── Render helpers ───────────────────────────────────────────────────────────
  const renderMessage = useCallback(({ item, index }) => {
    const isLast  = index === messages.length - 1;
    const nextMsg = messages[index + 1];
    const showTime = isLast || (nextMsg && nextMsg.is_own !== item.is_own);
    return <MessageBubble message={item} showTime={showTime} />;
  }, [messages.length]);

  const keyExtractor = useCallback((item) => item.id, []);

  const isBlocked   = chatInfo?.messages_left === 0 && !chatInfo?.is_unlocked;
  const avatarColor = otherAvatarColor || T.primary;

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : rs(20)}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={HIT_SLOP}
            activeOpacity={0.7}
          >
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <View style={[
              styles.headerAvatar,
              { backgroundColor: avatarColor + '22', borderColor: avatarColor + '55' },
            ]}>
              <Text style={styles.headerAvatarEmoji}>
                {AVATAR_MAP[otherAvatar] || '👤'}
              </Text>
            </View>
            <View>
              <Text style={styles.headerName}>{otherName || 'Anonymous'}</Text>
              <Text style={styles.headerSub}>Anonymous connection</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.revealBtn,
              chatInfo?.reveal_status === 'pending' && styles.revealBtnPending,
            ]}
            onPress={() => setShowReveal(true)}
            hitSlop={HIT_SLOP}
            activeOpacity={0.8}
          >
            <Text style={styles.revealBtnText}>
              {chatInfo?.reveal_status === 'accepted' ? '✨' : '👁'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Limit banner */}
        <LimitBanner messagesLeft={chatInfo?.messages_left} onUnlock={handleUnlock} />

        {/* Messages */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={T.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={scrollToBottom}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatEmoji}>🌑</Text>
                <Text style={styles.emptyChatText}>You're connected. Say something.</Text>
              </View>
            }
          />
        )}

        {/* Revealed identity banner */}
        {chatInfo?.revealed_other && (
          <View style={styles.revealedBanner}>
            <Text style={styles.revealedBannerText}>✨ {chatInfo.revealed_other.username}</Text>
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={[styles.input, isBlocked && styles.inputBlocked]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={isBlocked ? 'Unlock to keep talking…' : 'Say something…'}
            placeholderTextColor={T.textSecondary}
            multiline
            maxLength={500}
            editable={!isBlocked}
            onSubmitEditing={sendMessage}
            keyboardShouldPersistTaps="handled"
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!inputText.trim() || sending || isBlocked) && styles.sendBtnDisabled,
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending || isBlocked}
            hitSlop={HIT_SLOP}
            activeOpacity={0.8}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.sendBtnText}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Reveal modal */}
      <RevealModal
        visible={showReveal}
        chat={chatInfo}
        onAccept={() => handleRevealRespond(true)}
        onDecline={() => handleRevealRespond(false)}
        onRequest={handleRevealRequest}
        onClose={() => setShowReveal(false)}
      />
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: T.surface,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    gap: SPACING.sm,
  },
  backBtn: {
    width: rs(36),
    height: rs(36),
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: T.text,
    fontSize: rf(22),
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerAvatar: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(19),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  headerAvatarEmoji: { fontSize: rf(18) },
  headerName: {
    fontSize: FONT.md,
    fontWeight: '700',
    color: T.text,
  },
  headerSub: {
    fontSize: FONT.xs,
    color: T.textSecondary,
    fontStyle: 'italic',
  },
  revealBtn: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    backgroundColor: T.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: T.border,
  },
  revealBtnPending: {
    borderColor: T.primary,
    backgroundColor: T.primaryDim,
  },
  revealBtnText: { fontSize: rf(16) },

  // Limit banners
  limitWarn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: rp(8),
    backgroundColor: T.primaryDim,
    borderBottomWidth: 1,
    borderBottomColor: T.primaryBorder,
    alignItems: 'center',
  },
  limitWarnText: {
    color: T.textSecondary,
    fontSize: FONT.sm,
  },
  limitWarnLink: {
    color: T.primary,
    fontWeight: '700',
  },
  limitFull: {
    margin: SPACING.md,
    padding: SPACING.md,
    backgroundColor: T.surface,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.primaryBorder,
    gap: SPACING.sm,
  },
  limitFullTitle: {
    fontSize: FONT.md,
    fontWeight: '800',
    color: T.text,
  },
  limitFullBody: {
    fontSize: FONT.sm,
    color: T.textSecondary,
    textAlign: 'center',
    lineHeight: rf(20),
  },
  unlockBtn: {
    backgroundColor: T.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: rp(12),
    borderRadius: RADIUS.md,
    marginTop: rp(4),
  },
  unlockBtnText: {
    color: '#fff',
    fontSize: FONT.md,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Messages
  messagesList: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: rp(4),
    paddingBottom: SPACING.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChat: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: rs(80),
    gap: SPACING.sm,
  },
  emptyChatEmoji: { fontSize: rf(40) },
  emptyChatText: {
    color: T.textSecondary,
    fontSize: FONT.sm,
    fontStyle: 'italic',
  },

  // Bubbles
  bubbleRow: {
    marginVertical: rp(3),
    maxWidth: '80%',
  },
  bubbleRowOwn: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubbleRowTheir: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: rp(14),
    paddingVertical: rp(10),
    borderRadius: RADIUS.lg,
  },
  bubbleOwn: {
    backgroundColor: T.myBubble,
    borderBottomRightRadius: rp(4),
  },
  bubbleTheir: {
    backgroundColor: T.theirBubble,
    borderBottomLeftRadius: rp(4),
    borderWidth: 1,
    borderColor: T.border,
  },
  bubbleText: {
    fontSize: FONT.md,
    color: T.textSecondary,
    lineHeight: rf(22),
  },
  bubbleTextOwn: { color: '#fff' },
  bubbleTime: {
    fontSize: FONT.xs,
    color: T.textSecondary,
    marginTop: rp(3),
    marginLeft: rp(4),
    opacity: 0.7,
  },
  bubbleTimeOwn: {
    marginRight: rp(4),
    marginLeft: 0,
  },

  // Revealed banner
  revealedBanner: {
    backgroundColor: T.successDim,
    borderTopWidth: 1,
    borderTopColor: T.successBorder,
    paddingVertical: rp(8),
    alignItems: 'center',
  },
  revealedBannerText: {
    color: T.success,
    fontSize: FONT.sm,
    fontWeight: '600',
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingBottom: Platform.OS === 'ios' ? rp(28) : SPACING.sm,
    gap: SPACING.sm,
    backgroundColor: T.surface,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  input: {
    flex: 1,
    backgroundColor: T.surfaceAlt,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingTop: rp(10),
    paddingBottom: rp(10),
    color: T.text,
    fontSize: FONT.md,
    maxHeight: rs(100),
    borderWidth: 1,
    borderColor: T.border,
  },
  inputBlocked: { opacity: 0.4 },
  sendBtn: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(20),
    backgroundColor: T.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#1e2330' },
  sendBtnText: {
    color: '#fff',
    fontSize: rf(18),
    fontWeight: '800',
  },

  // Reveal modal
  revealBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  revealCard: {
    backgroundColor: T.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    width: '100%',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: T.border,
  },
  revealEmoji:       { fontSize: rf(48), marginBottom: rp(4) },
  revealTitle:       { fontSize: FONT.xl, fontWeight: '800', color: T.text, textAlign: 'center' },
  revealBody:        { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: rf(22), marginBottom: rp(8) },
  revealPrimaryBtn: {
    width: '100%',
    backgroundColor: T.primary,
    paddingVertical: rp(14),
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  revealPrimaryText: { color: '#fff', fontSize: FONT.md, fontWeight: '700' },
  revealSecondaryBtn: {
    width: '100%',
    paddingVertical: rp(12),
    borderRadius: RADIUS.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.border,
  },
  revealSecondaryText: { color: T.textSecondary, fontSize: FONT.sm },
  revealCloseBtn:  { paddingVertical: rp(8), marginTop: rp(4) },
  revealCloseText: { color: T.textSecondary, fontSize: FONT.sm },
});
