/**
 * ChatScreen.jsx — Premium anonymous messaging
 * Cinematic Coral design system. Intensity meter. Locked premium features.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, KeyboardAvoidingView,
  Modal, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import {
  ArrowLeft, Check, CheckCheck, Image as ImageIcon,
  Lock, Mic, Phone, Video,
} from 'lucide-react-native';
import { rs, rf, rp, rh, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../context/SocketContext';
import { API_BASE_URL } from '../../config/api';
import IntensityBackground from '../../components/chat/IntensityBackground';

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
  myBubble:      '#FF634A',
  theirBubble:   '#1e2535',
  success:       '#4CAF50',
  successDim:    'rgba(76,175,80,0.08)',
  successBorder: 'rgba(76,175,80,0.15)',
  online:        '#4CAF50',
};

const AVATAR_MAP = {
  ghost: '👻', shadow: '🌑', flame: '🔥', void: '🕳️',
  storm: '⛈️', smoke: '💨', eclipse: '🌘', shard: '🔷',
  moth: '🦋', raven: '🐦‍⬛',
};

// Intensity milestones based on message_count
const INTENSITY_MILESTONES = [
  { at: 10,  label: 'Read receipts',  icon: '✓✓',  unlocked: true  },
  { at: 25,  label: 'Voice notes',    icon: '🎙',  unlocked: false },
  { at: 40,  label: 'Images',         icon: '🖼',  unlocked: false },
  { at: 60,  label: 'Videos',         icon: '🎬',  unlocked: false },
  { at: 80,  label: 'Audio calls',    icon: '📞',  unlocked: false },
  { at: 100, label: 'Video calls',    icon: '📹',  unlocked: false },
];

function getIntensityPercent(messageCount) {
  return Math.min(100, Math.round((messageCount / 100) * 100));
}

function getUnlockedFeatures(messageCount) {
  return INTENSITY_MILESTONES.filter(m => messageCount >= m.at);
}

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    const normalised = isoString.replace(' ', 'T').replace(/(\.\d+)?$/, (m) =>
      /[Z+\-]\d/.test(isoString) ? m : m + 'Z'
    );
    const d = new Date(normalised);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// ─── Typing indicator ─────────────────────────────────────────
const TypingIndicator = React.memo(() => {
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
    <View style={styles.typingWrap}>
      <View style={styles.typingBubble}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[styles.typingDot, { opacity: dot }]} />
        ))}
      </View>
    </View>
  );
});

// ─── Message status ticks ─────────────────────────────────────
const MessageStatus = React.memo(({ isDelivered, isRead }) => {
  if (isRead)      return <CheckCheck size={rs(13)} color="#4FC3F7" strokeWidth={2.5} />;
  if (isDelivered) return <CheckCheck size={rs(13)} color="rgba(255,255,255,0.38)" strokeWidth={2.5} />;
  return <Check size={rs(13)} color="rgba(255,255,255,0.38)" strokeWidth={2.5} />;
});

// ─── Reaction picker ──────────────────────────────────────────
const REACTIONS = ['❤️', '😈', '🔥', '👀', '💀', '✨'];

const ReactionPicker = React.memo(({ onSelect, onClose }) => (
  <View style={styles.reactionPicker}>
    {REACTIONS.map(r => (
      <TouchableOpacity key={r} onPress={() => { onSelect(r); onClose(); }} hitSlop={HIT_SLOP}>
        <Text style={styles.reactionEmoji}>{r}</Text>
      </TouchableOpacity>
    ))}
  </View>
));

// ─── Message Bubble ───────────────────────────────────────────
const MessageBubble = React.memo(({ message, onLongPress }) => {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(message.is_own ? 16 : -16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 10,  useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[
      styles.bubbleRow,
      message.is_own ? styles.bubbleRowOwn : styles.bubbleRowTheir,
      { opacity: fadeAnim, transform: [{ translateX: slideAnim }] },
    ]}>
      <TouchableOpacity
        onLongPress={() => onLongPress?.(message)}
        activeOpacity={0.85}
        delayLongPress={400}
      >
        <View style={[styles.bubble, message.is_own ? styles.bubbleOwn : styles.bubbleTheir]}>
          <Text style={[styles.bubbleText, message.is_own && styles.bubbleTextOwn]}>
            {message.content}
          </Text>
          {message.reaction && (
            <View style={[styles.reactionBadge, message.is_own && styles.reactionBadgeOwn]}>
              <Text style={styles.reactionBadgeText}>{message.reaction}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
      <View style={[styles.bubbleFooter, message.is_own && styles.bubbleFooterOwn]}>
        <Text style={styles.bubbleTime}>{formatTime(message.created_at)}</Text>
        {message.is_own && (
          <MessageStatus isDelivered={message.is_delivered} isRead={message.is_read} />
        )}
      </View>
    </Animated.View>
  );
});

// ─── Intensity Meter ──────────────────────────────────────────
const IntensityMeter = React.memo(({ messageCount, isUnlocked }) => {
  const percent      = getIntensityPercent(messageCount);
  const widthAnim    = useRef(new Animated.Value(0)).current;
  const [show, setShow] = useState(false);

  useEffect(() => {
    Animated.spring(widthAnim, { toValue: percent, friction: 8, useNativeDriver: false }).start();
  }, [percent]);

  if (isUnlocked) return null;

  const barWidth = widthAnim.interpolate({
    inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp',
  });

  const nextMilestone = INTENSITY_MILESTONES.find(m => messageCount < m.at);

  return (
    <TouchableOpacity
      style={styles.intensityWrap}
      onPress={() => setShow(v => !v)}
      activeOpacity={0.9}
    >
      <View style={styles.intensityTopRow}>
        <Text style={styles.intensityLabel}>connection intensity</Text>
        <Text style={styles.intensityPercent}>{percent}%</Text>
      </View>
      <View style={styles.intensityTrack}>
        <Animated.View style={[styles.intensityFill, { width: barWidth }]} />
        {/* Milestone markers */}
        {INTENSITY_MILESTONES.map(m => (
          <View
            key={m.at}
            style={[styles.intensityMarker, { left: `${m.at}%` }]}
          />
        ))}
      </View>
      {nextMilestone && (
        <Text style={styles.intensityNext}>
          {nextMilestone.at - messageCount} more messages → unlock {nextMilestone.label} {nextMilestone.icon}
        </Text>
      )}

      {show && (
        <View style={styles.intensityMilestones}>
          {INTENSITY_MILESTONES.map(m => {
            const unlocked = messageCount >= m.at;
            return (
              <View key={m.at} style={styles.intensityMilestoneRow}>
                <Text style={[styles.intensityMilestoneIcon, !unlocked && styles.intensityMilestoneLocked]}>
                  {unlocked ? m.icon : '🔒'}
                </Text>
                <Text style={[styles.intensityMilestoneLabel, !unlocked && styles.intensityMilestoneLocked]}>
                  {m.label}
                </Text>
                <Text style={[styles.intensityMilestoneAt, unlocked && { color: T.success }]}>
                  {unlocked ? 'unlocked' : `at ${m.at} msgs`}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </TouchableOpacity>
  );
});

// ─── Limit Banner ─────────────────────────────────────────────
const LimitBanner = React.memo(({ messagesLeft, onUnlock }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (messagesLeft !== 0) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.02, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [messagesLeft]);

  if (messagesLeft === null || messagesLeft > 5) return null;

  if (messagesLeft === 0) {
    return (
      <Animated.View style={[styles.limitFull, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={styles.limitFullEmoji}>🔒</Text>
        <Text style={styles.limitFullTitle}>this conversation wants to continue.</Text>
        <Text style={styles.limitFullBody}>
          10 free messages. you've used them all.{'\n'}unlock once — no more limits, ever.
        </Text>
        <TouchableOpacity style={styles.unlockBtn} onPress={onUnlock} hitSlop={HIT_SLOP} activeOpacity={0.85}>
          <Text style={styles.unlockBtnText}>Unlock — KSh 49</Text>
        </TouchableOpacity>
        <Text style={styles.limitFullHint}>they're still waiting.</Text>
      </Animated.View>
    );
  }

  return (
    <View style={styles.limitWarn}>
      <Text style={styles.limitWarnText}>
        {messagesLeft} free {messagesLeft === 1 ? 'message' : 'messages'} remaining
        {'  ·  '}
        <Text style={styles.limitWarnLink} onPress={onUnlock}>Unlock KSh 49</Text>
      </Text>
    </View>
  );
});

// ─── Locked Feature Button ────────────────────────────────────
const LockedFeatureBtn = React.memo(({ icon: Icon, label, onPress }) => (
  <TouchableOpacity style={styles.lockedFeatureBtn} onPress={onPress} hitSlop={HIT_SLOP} activeOpacity={0.8}>
    <View style={styles.lockedFeatureIcon}>
      <Icon size={rs(18)} color={T.textMuted} strokeWidth={1.5} />
      <Lock size={rs(9)} color={T.primary} style={styles.lockOverlay} />
    </View>
    <Text style={styles.lockedFeatureLabel}>{label}</Text>
  </TouchableOpacity>
));

// ─── Reveal Modal ─────────────────────────────────────────────
const RevealModal = React.memo(({ visible, chat, onAccept, onDecline, onRequest, onClose }) => {
  if (!visible) return null;
  const isPending   = chat?.reveal_status === 'pending';
  const isInitiator = chat?.reveal_initiator;
  const isAccepted  = chat?.reveal_status === 'accepted';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.revealBackdrop}>
        <View style={styles.revealCard}>
          <Text style={styles.revealEmoji}>
            {isAccepted ? '✨' : (isPending && !isInitiator) ? '👁' : '🌑'}
          </Text>
          {isAccepted ? (
            <>
              <Text style={styles.revealTitle}>identities revealed</Text>
              <Text style={styles.revealBody}>you both chose to be seen.</Text>
            </>
          ) : isPending && !isInitiator ? (
            <>
              <Text style={styles.revealTitle}>they want to reveal</Text>
              <Text style={styles.revealBody}>
                they're asking to show you who they really are.{'\n'}you don't have to say yes.
              </Text>
              <TouchableOpacity style={styles.revealPrimaryBtn} onPress={onAccept} hitSlop={HIT_SLOP} activeOpacity={0.85}>
                <Text style={styles.revealPrimaryText}>reveal each other</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.revealSecondaryBtn} onPress={onDecline} hitSlop={HIT_SLOP} activeOpacity={0.85}>
                <Text style={styles.revealSecondaryText}>stay anonymous</Text>
              </TouchableOpacity>
            </>
          ) : isPending && isInitiator ? (
            <>
              <Text style={styles.revealTitle}>waiting…</Text>
              <Text style={styles.revealBody}>your reveal request was sent.{'\n'}waiting for their response.</Text>
            </>
          ) : (
            <>
              <Text style={styles.revealTitle}>reveal identity?</Text>
              <Text style={styles.revealBody}>
                send a request to reveal who you both are.{'\n'}they must agree for anything to show.
              </Text>
              <TouchableOpacity style={styles.revealPrimaryBtn} onPress={onRequest} hitSlop={HIT_SLOP} activeOpacity={0.85}>
                <Text style={styles.revealPrimaryText}>send reveal request</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={styles.revealCloseBtn} onPress={onClose} hitSlop={HIT_SLOP}>
            <Text style={styles.revealCloseText}>close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

// ─── Main Screen ──────────────────────────────────────────────
export default function ChatScreen({ route, navigation }) {
  const { chatId, otherName, otherAvatar, otherAvatarColor, otherUserId } = route.params || {};
  const { showToast }     = useToast();
  const { socketService } = useSocket();

  const [messages,      setMessages]      = useState([]);
  const [chatInfo,      setChatInfo]      = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [inputText,     setInputText]     = useState('');
  const [sending,       setSending]       = useState(false);
  const [showReveal,    setShowReveal]    = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);
  const [isOnline,      setIsOnline]      = useState(false);
  const [isTyping,      setIsTyping]      = useState(false);
  const [selectedMsg,   setSelectedMsg]   = useState(null);
  const [showReactions, setShowReactions] = useState(false);
  const [intensity,     setIntensity]     = useState(0);
  const [chatEvent,     setChatEvent]     = useState(null);
  const chatEventTimer = useRef(null);

  const flatListRef    = useRef(null);
  const pollRef        = useRef(null);
  const typingTimer    = useRef(null);
  const isTypingRef    = useRef(false);
  const avatarColor    = otherAvatarColor || T.primary;

  // ── Load messages ────────────────────────────────────────
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
        if (data.chat?.intensity_score != null) {
          setIntensity(data.chat.intensity_score);
        }
        socketService?.markRead?.(chatId);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [chatId, socketService]);

  useFocusEffect(useCallback(() => {
    loadMessages();
    pollRef.current = setInterval(loadMessages, 10000);
    return () => clearInterval(pollRef.current);
  }, [loadMessages]));

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  // ── Socket events ────────────────────────────────────────
  useEffect(() => {
    if (!socketService || !chatId) return;

    socketService.joinChat?.(chatId);

    const triggerChatEvent = (type) => {
      setChatEvent(type);
      clearTimeout(chatEventTimer.current);
      chatEventTimer.current = setTimeout(() => setChatEvent(null), 600);
    };

    const handleIntensityUpdate = ({ chatId: cid, score }) => {
      if (cid !== chatId) return;
      setIntensity(score);
    };

    const handleNewMessage = (msg) => {
      if (msg.chat_id !== chatId) return;
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, { ...msg, is_own: false }];
      });
      setIsTyping(false);
      triggerChatEvent('message');
      scrollToBottom();
      socketService.markRead?.(chatId);
    };

    const handleDelivered = ({ chatId: cid, messageIds }) => {
      if (cid !== chatId) return;
      const ids = new Set(messageIds);
      setMessages(prev => prev.map(m => ids.has(m.id) ? { ...m, is_delivered: true } : m));
    };

    const handleRead = ({ chatId: cid, messageIds }) => {
      if (cid !== chatId) return;
      const ids = new Set(messageIds);
      setMessages(prev => prev.map(m => ids.has(m.id) ? { ...m, is_delivered: true, is_read: true } : m));
    };

    const handleTyping = ({ chatId: cid, userId, isTyping: typing }) => {
      if (cid !== chatId || userId === otherUserId) return;
      setIsTyping(typing);
      if (typing) {
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setIsTyping(false), 3000);
        triggerChatEvent('typing');
      }
    };

    const handleOnline  = ({ userId }) => { if (userId === otherUserId) setIsOnline(true); };
    const handleOffline = ({ userId }) => { if (userId === otherUserId) setIsOnline(false); };

    socketService.onNewMessage?.(handleNewMessage);
    socketService.onMessagesDelivered?.(handleDelivered);
    socketService.onMessagesRead?.(handleRead);
    socketService.on?.('typing',           handleTyping);
    socketService.on?.('user_online',      handleOnline);
    socketService.on?.('user_offline',     handleOffline);
    socketService.on?.('intensity_update', handleIntensityUpdate);

    return () => {
      socketService.offNewMessage?.(handleNewMessage);
      socketService.offMessagesDelivered?.(handleDelivered);
      socketService.offMessagesRead?.(handleRead);
      socketService.off?.('typing',           handleTyping);
      socketService.off?.('user_online',      handleOnline);
      socketService.off?.('user_offline',     handleOffline);
      socketService.off?.('intensity_update', handleIntensityUpdate);
      socketService.leaveChat?.(chatId);
    };
  }, [socketService, chatId, otherUserId, scrollToBottom]);

  // ── Typing emit ──────────────────────────────────────────
  const handleInputChange = useCallback((text) => {
    setInputText(text);
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socketService?.emit?.('typing', { chatId, isTyping: true });
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      isTypingRef.current = false;
      socketService?.emit?.('typing', { chatId, isTyping: false });
    }, 1500);
  }, [socketService, chatId]);

  // ── Send message ─────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const content = inputText.trim();
    if (!content || sending) return;
    if (chatInfo?.messages_left === 0 && !chatInfo?.is_unlocked) return;

    setSending(true);
    const tempId = `temp_${Date.now()}`;

    setMessages(prev => [...prev, {
      id: tempId, content, is_own: true,
      is_delivered: false, is_read: false,
      created_at: new Date().toISOString(),
    }]);
    setInputText('');
    scrollToBottom();

    // Stop typing
    isTypingRef.current = false;
    socketService?.emit?.('typing', { chatId, isTyping: false });

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
          showToast({ type: 'warning', message: 'Limit reached. Unlock to continue.' });
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
  }, [inputText, sending, chatInfo, chatId, socketService, scrollToBottom, loadMessages, showToast]);

  // ── Unlock ───────────────────────────────────────────────
  const handleUnlock = useCallback(() => {
    navigation.navigate('UnlockPremium', { chatId, otherName });
  }, [navigation, chatId, otherName]);

  // ── Locked premium feature ────────────────────────────────
  const handleLockedFeature = useCallback((feature) => {
    showToast({ type: 'info', title: `${feature} coming soon`, message: 'Keep chatting to unlock more features.' });
  }, [showToast]);

  // ── Reactions ─────────────────────────────────────────────
  const handleLongPress = useCallback((message) => {
    setSelectedMsg(message);
    setShowReactions(true);
  }, []);

  const handleReaction = useCallback((emoji) => {
    if (!selectedMsg) return;
    setMessages(prev => prev.map(m =>
      m.id === selectedMsg.id ? { ...m, reaction: emoji } : m
    ));
    setSelectedMsg(null);
    setShowReactions(false);
  }, [selectedMsg]);

  // ── Reveal ────────────────────────────────────────────────
  const handleRevealRequest = useCallback(async () => {
    setRevealLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/reveal/request`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
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

  const renderMessage = useCallback(({ item }) => (
    <MessageBubble message={item} onLongPress={handleLongPress} />
  ), [handleLongPress]);

  const keyExtractor = useCallback((item) => item.id, []);

  const isBlocked    = chatInfo?.messages_left === 0 && !chatInfo?.is_unlocked;
  const messageCount = chatInfo?.message_count || 0;
  const unlockedFeatures = getUnlockedFeatures(messageCount);
  const hasVoiceNote = unlockedFeatures.some(f => f.label === 'Voice notes');
  const hasMedia     = unlockedFeatures.some(f => f.label === 'Images');
  const hasAudioCall = unlockedFeatures.some(f => f.label === 'Audio calls');
  const hasVideoCall = unlockedFeatures.some(f => f.label === 'Video calls');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <IntensityBackground intensity={intensity} event={chatEvent} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}>
            <ArrowLeft size={rs(20)} color={T.text} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <View style={[
              styles.headerAvatar,
              { backgroundColor: avatarColor + '22', borderColor: avatarColor + '55' },
              isOnline && { borderColor: T.online + '99' },
            ]}>
              <Text style={styles.headerAvatarEmoji}>{AVATAR_MAP[otherAvatar] || '👤'}</Text>
              {isOnline && <View style={styles.headerOnlineDot} />}
            </View>
            <View>
              <Text style={styles.headerName}>{otherName || 'Anonymous'}</Text>
              <Text style={[styles.headerSub, isOnline && styles.headerSubOnline]}>
                {isTyping ? 'typing…' : isOnline ? 'online now' : 'anonymous connection'}
              </Text>
            </View>
          </View>

          {/* Right actions */}
          <View style={styles.headerActions}>
            {/* Audio call */}
            <TouchableOpacity
              style={[styles.headerActionBtn, hasAudioCall && styles.headerActionBtnActive]}
              onPress={() => hasAudioCall ? handleLockedFeature('Audio call') : handleLockedFeature('Audio calls')}
              hitSlop={HIT_SLOP}
            >
              <Phone size={rs(16)} color={hasAudioCall ? T.primary : T.textMuted} strokeWidth={1.8} />
              {!hasAudioCall && <Lock size={rs(8)} color={T.primary} style={styles.lockOverlay} />}
            </TouchableOpacity>
            {/* Video call */}
            <TouchableOpacity
              style={[styles.headerActionBtn, hasVideoCall && styles.headerActionBtnActive]}
              onPress={() => handleLockedFeature('Video calls')}
              hitSlop={HIT_SLOP}
            >
              <Video size={rs(16)} color={hasVideoCall ? T.primary : T.textMuted} strokeWidth={1.8} />
              {!hasVideoCall && <Lock size={rs(8)} color={T.primary} style={styles.lockOverlay} />}
            </TouchableOpacity>
            {/* Reveal */}
            {chatInfo?.is_unlocked && (
              <TouchableOpacity
                style={[styles.headerActionBtn, chatInfo?.reveal_status === 'pending' && styles.headerActionBtnPending]}
                onPress={() => setShowReveal(true)}
                hitSlop={HIT_SLOP}
              >
                <Text style={styles.revealBtnText}>
                  {chatInfo?.reveal_status === 'accepted' ? '✨' : '👁'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Intensity meter ── */}
        <IntensityMeter messageCount={messageCount} isUnlocked={chatInfo?.is_unlocked} />

        {/* ── Limit banner ── */}
        <LimitBanner messagesLeft={chatInfo?.messages_left} onUnlock={handleUnlock} />

        {/* ── Messages ── */}
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
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatEmoji}>🌑</Text>
                <Text style={styles.emptyChatText}>you're connected.{'\n'}say something real.</Text>
              </View>
            }
            ListFooterComponent={isTyping ? <TypingIndicator /> : null}
          />
        )}

        {/* ── Revealed identity banner ── */}
        {chatInfo?.revealed_other && (
          <View style={styles.revealedBanner}>
            <Text style={styles.revealedBannerText}>✨ {chatInfo.revealed_other.username}</Text>
          </View>
        )}

        {/* ── Reaction picker modal ── */}
        {showReactions && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setShowReactions(false)}>
            <TouchableOpacity style={styles.reactionBackdrop} activeOpacity={1} onPress={() => setShowReactions(false)}>
              <ReactionPicker onSelect={handleReaction} onClose={() => setShowReactions(false)} />
            </TouchableOpacity>
          </Modal>
        )}

        {/* ── Input bar ── */}
        <View style={styles.inputBar}>
          {/* Media button */}
          <TouchableOpacity
            style={styles.inputActionBtn}
            onPress={() => hasMedia ? handleLockedFeature('Images') : handleLockedFeature('Images')}
            hitSlop={HIT_SLOP}
          >
            <ImageIcon size={rs(18)} color={hasMedia ? T.primary : T.textMuted} strokeWidth={1.5} />
            {!hasMedia && <Lock size={rs(8)} color={T.primary} style={styles.lockOverlay} />}
          </TouchableOpacity>

          {/* Text input */}
          <TextInput
            style={[styles.input, isBlocked && styles.inputBlocked]}
            value={inputText}
            onChangeText={handleInputChange}
            placeholder={isBlocked ? 'unlock to keep talking…' : 'say something…'}
            placeholderTextColor={T.textMuted}
            multiline
            maxLength={500}
            editable={!isBlocked}
            returnKeyType="default"
            selectionColor={T.primary}
          />

          {/* Voice note button */}
          <TouchableOpacity
            style={styles.inputActionBtn}
            onPress={() => hasVoiceNote ? handleLockedFeature('Voice notes') : handleLockedFeature('Voice notes')}
            hitSlop={HIT_SLOP}
          >
            <Mic size={rs(18)} color={hasVoiceNote ? T.primary : T.textMuted} strokeWidth={1.5} />
            {!hasVoiceNote && <Lock size={rs(8)} color={T.primary} style={styles.lockOverlay} />}
          </TouchableOpacity>

          {/* Send */}
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || sending || isBlocked) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending || isBlocked}
            hitSlop={HIT_SLOP}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.sendBtnText}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
    backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border,
    gap: SPACING.sm,
  },
  backBtn: { width: rs(36), height: rs(36), alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerAvatar: {
    width: rs(38), height: rs(38), borderRadius: rs(19),
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
    position: 'relative',
  },
  headerAvatarEmoji: { fontSize: rf(18) },
  headerOnlineDot: {
    position: 'absolute', bottom: rp(0), right: rp(0),
    width: rs(10), height: rs(10), borderRadius: rs(5),
    backgroundColor: T.online, borderWidth: 1.5, borderColor: T.surface,
  },
  headerName:  { fontSize: FONT.md, fontWeight: '700', color: T.text },
  headerSub:   { fontSize: FONT.xs, color: T.textSecondary, fontStyle: 'italic' },
  headerSubOnline: { color: T.online, fontStyle: 'normal', fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  headerActionBtn: {
    width: rs(32), height: rs(32), borderRadius: rs(16),
    backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.border, position: 'relative',
  },
  headerActionBtnActive:  { borderColor: T.primaryBorder, backgroundColor: T.primaryDim },
  headerActionBtnPending: { borderColor: T.primary, backgroundColor: T.primaryDim },
  revealBtnText: { fontSize: rf(14) },

  // Lock overlay for buttons
  lockOverlay: { position: 'absolute', bottom: rp(3), right: rp(3) },

  // Intensity meter
  intensityWrap: {
    marginHorizontal: SPACING.md, marginTop: rp(10), marginBottom: rp(4),
    padding: rp(12), backgroundColor: T.surface,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
  },
  intensityTopRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: rp(6) },
  intensityLabel:   { fontSize: rf(10), fontWeight: '700', color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  intensityPercent: { fontSize: rf(10), fontWeight: '700', color: T.primary },
  intensityTrack: {
    height: rs(4), backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: rs(2), overflow: 'visible', position: 'relative',
  },
  intensityFill: {
    position: 'absolute', top: 0, left: 0, bottom: 0,
    backgroundColor: T.primary, borderRadius: rs(2),
  },
  intensityMarker: {
    position: 'absolute', top: -rs(2), width: rs(1), height: rs(8),
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  intensityNext: { fontSize: rf(11), color: T.textSecondary, marginTop: rp(6), fontStyle: 'italic' },
  intensityMilestones: { marginTop: rp(10), gap: rp(6) },
  intensityMilestoneRow: { flexDirection: 'row', alignItems: 'center', gap: rp(8) },
  intensityMilestoneIcon: { fontSize: rf(14), width: rs(20) },
  intensityMilestoneLabel: { flex: 1, fontSize: FONT.sm, color: T.text, fontWeight: '500' },
  intensityMilestoneAt: { fontSize: FONT.xs, color: T.textMuted, fontWeight: '600' },
  intensityMilestoneLocked: { color: T.textMuted, opacity: 0.5 },

  // Limit banners
  limitWarn: {
    paddingHorizontal: SPACING.md, paddingVertical: rp(8),
    backgroundColor: T.primaryDim, borderBottomWidth: 1, borderBottomColor: T.primaryBorder,
    alignItems: 'center',
  },
  limitWarnText: { color: T.textSecondary, fontSize: FONT.sm },
  limitWarnLink: { color: T.primary, fontWeight: '700' },
  limitFull: {
    margin: SPACING.md, padding: SPACING.lg,
    backgroundColor: T.surface, borderRadius: RADIUS.lg,
    alignItems: 'center', borderWidth: 1, borderColor: T.primaryBorder, gap: SPACING.sm,
  },
  limitFullEmoji: { fontSize: rf(36) },
  limitFullTitle: { fontSize: FONT.md, fontWeight: '800', color: T.text, textAlign: 'center' },
  limitFullBody:  { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: rf(20) },
  limitFullHint:  { fontSize: rf(11), color: T.textMuted, fontStyle: 'italic' },
  unlockBtn: {
    backgroundColor: T.primary, paddingHorizontal: SPACING.xl, paddingVertical: rp(14),
    borderRadius: RADIUS.md, marginTop: rp(4),
    shadowColor: T.primary, shadowOffset: { width: 0, height: rs(6) },
    shadowOpacity: 0.4, shadowRadius: rs(12), elevation: 8,
  },
  unlockBtnText: { color: '#fff', fontSize: FONT.md, fontWeight: '800', letterSpacing: 0.3 },

  // Messages
  messagesList: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    gap: rp(4), paddingBottom: SPACING.md,
  },
  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyChat:      { alignItems: 'center', justifyContent: 'center', paddingTop: rs(80), gap: SPACING.sm },
  emptyChatEmoji: { fontSize: rf(40) },
  emptyChatText:  { color: T.textSecondary, fontSize: FONT.sm, fontStyle: 'italic', textAlign: 'center', lineHeight: rf(22) },

  // Typing indicator
  typingWrap:   { paddingHorizontal: SPACING.md, marginBottom: rp(4) },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: rp(4),
    backgroundColor: T.theirBubble, alignSelf: 'flex-start',
    paddingHorizontal: rp(14), paddingVertical: rp(12),
    borderRadius: RADIUS.lg, borderBottomLeftRadius: rp(4),
    borderWidth: 1, borderColor: T.border,
  },
  typingDot: { width: rs(6), height: rs(6), borderRadius: rs(3), backgroundColor: T.textSecondary },

  // Bubbles
  bubbleRow:      { marginVertical: rp(2), maxWidth: '80%' },
  bubbleRowOwn:   { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleRowTheir: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: rp(14), paddingVertical: rp(10), borderRadius: RADIUS.lg },
  bubbleOwn:    { backgroundColor: T.myBubble, borderBottomRightRadius: rp(4) },
  bubbleTheir:  { backgroundColor: T.theirBubble, borderBottomLeftRadius: rp(4), borderWidth: 1, borderColor: T.border },
  bubbleText:    { fontSize: FONT.md, color: T.textSecondary, lineHeight: rf(22) },
  bubbleTextOwn: { color: '#fff' },
  bubbleFooter:    { flexDirection: 'row', alignItems: 'center', gap: rp(4), marginTop: rp(3), marginLeft: rp(4) },
  bubbleFooterOwn: { justifyContent: 'flex-end', marginLeft: 0, marginRight: rp(4) },
  bubbleTime: { fontSize: FONT.xs, color: T.textSecondary, opacity: 0.7 },

  // Reactions
  reactionBadge: {
    position: 'absolute', bottom: -rp(8), left: rp(8),
    backgroundColor: T.surface, borderRadius: RADIUS.full,
    paddingHorizontal: rp(6), paddingVertical: rp(2),
    borderWidth: 1, borderColor: T.border,
  },
  reactionBadgeOwn:  { left: 'auto', right: rp(8) },
  reactionBadgeText: { fontSize: rf(13) },
  reactionBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  reactionPicker: {
    flexDirection: 'row', gap: rp(12),
    backgroundColor: T.surface, padding: rp(16),
    borderRadius: RADIUS.xl, borderWidth: 1, borderColor: T.border,
  },
  reactionEmoji: { fontSize: rf(28) },

  // Revealed banner
  revealedBanner: {
    backgroundColor: T.successDim, borderTopWidth: 1, borderTopColor: T.successBorder,
    paddingVertical: rp(8), alignItems: 'center',
  },
  revealedBannerText: { color: T.success, fontSize: FONT.sm, fontWeight: '600' },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    paddingBottom: Platform.OS === 'ios' ? rp(28) : SPACING.sm,
    gap: SPACING.xs, backgroundColor: T.surface,
    borderTopWidth: 1, borderTopColor: T.border,
  },
  inputActionBtn: {
    width: rs(36), height: rs(36), alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  input: {
    flex: 1, backgroundColor: T.surfaceAlt, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md, paddingTop: rp(10), paddingBottom: rp(10),
    color: T.text, fontSize: FONT.md, maxHeight: rs(100),
    borderWidth: 1, borderColor: T.border,
  },
  inputBlocked: { opacity: 0.4 },
  sendBtn: {
    width: rs(40), height: rs(40), borderRadius: rs(20),
    backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: T.primary, shadowOffset: { width: 0, height: rs(4) },
    shadowOpacity: 0.4, shadowRadius: rs(8), elevation: 6,
  },
  sendBtnDisabled: { backgroundColor: '#1e2330', shadowOpacity: 0 },
  sendBtnText: { color: '#fff', fontSize: rf(18), fontWeight: '800' },

  // Reveal modal
  revealBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: SPACING.lg,
  },
  revealCard: {
    backgroundColor: T.surface, borderRadius: RADIUS.xl,
    padding: SPACING.lg, width: '100%', alignItems: 'center',
    gap: SPACING.sm, borderWidth: 1, borderColor: T.border,
  },
  revealEmoji:        { fontSize: rf(48), marginBottom: rp(4) },
  revealTitle:        { fontSize: FONT.xl, fontWeight: '800', color: T.text, textAlign: 'center' },
  revealBody:         { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: rf(22), marginBottom: rp(8) },
  revealPrimaryBtn:   { width: '100%', backgroundColor: T.primary, paddingVertical: rp(14), borderRadius: RADIUS.md, alignItems: 'center' },
  revealPrimaryText:  { color: '#fff', fontSize: FONT.md, fontWeight: '700' },
  revealSecondaryBtn: { width: '100%', paddingVertical: rp(12), borderRadius: RADIUS.md, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  revealSecondaryText:{ color: T.textSecondary, fontSize: FONT.sm },
  revealCloseBtn:     { paddingVertical: rp(8), marginTop: rp(4) },
  revealCloseText:    { color: T.textMuted, fontSize: FONT.sm },
});
