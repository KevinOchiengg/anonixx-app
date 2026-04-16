/**
 * ChatScreen.jsx — Premium anonymous messaging
 * Cinematic Coral design system. Intensity meter. Locked premium features.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, Image, KeyboardAvoidingView,
  Modal, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import {
  ArrowLeft, Check, CheckCheck, Image as ImageIcon,
  Lock, Mic, MicOff, Phone, PhoneOff, Square, Video,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
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
// ─── Voice note player inside bubble ─────────────────────────
const VoiceNoteBubble = React.memo(({ url, isOwn }) => {
  const [playing,  setPlaying]  = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const soundRef = useRef(null);

  useEffect(() => () => { soundRef.current?.unloadAsync(); }, []);

  const toggle = useCallback(async () => {
    try {
      if (!soundRef.current) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound, status } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true },
          (s) => {
            setPosition(s.positionMillis || 0);
            setDuration(s.durationMillis || 0);
            if (s.didJustFinish) { setPlaying(false); setPosition(0); }
          }
        );
        soundRef.current = sound;
        setPlaying(true);
        setDuration(status.durationMillis || 0);
      } else if (playing) {
        await soundRef.current.pauseAsync();
        setPlaying(false);
      } else {
        await soundRef.current.playAsync();
        setPlaying(true);
      }
    } catch { /* silent */ }
  }, [url, playing]);

  const secs  = Math.floor((playing ? position : duration) / 1000);
  const label = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const progress = duration > 0 ? position / duration : 0;

  return (
    <TouchableOpacity onPress={toggle} activeOpacity={0.8} style={styles.voiceBubble}>
      <View style={[styles.voicePlayBtn, isOwn && styles.voicePlayBtnOwn]}>
        {playing
          ? <Square size={rs(12)} color={isOwn ? '#fff' : T.primary} fill={isOwn ? '#fff' : T.primary} />
          : <Mic    size={rs(14)} color={isOwn ? '#fff' : T.primary} strokeWidth={2} />
        }
      </View>
      <View style={styles.voiceWaveWrap}>
        <View style={[styles.voiceTrack, isOwn && styles.voiceTrackOwn]}>
          <View style={[styles.voiceFill, isOwn && styles.voiceFillOwn, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={[styles.voiceLabel, isOwn && styles.voiceLabelOwn]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
});

const MessageBubble = React.memo(({ message, onLongPress }) => {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(message.is_own ? 16 : -16)).current;
  const msgType   = message.message_type || 'text';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 10,  useNativeDriver: true }),
    ]).start();
  }, []);

  const bubbleContent = () => {
    if (msgType === 'image' && message.media_url) {
      return (
        <>
          <Image
            source={{ uri: message.media_url }}
            style={styles.bubbleImage}
            resizeMode="cover"
          />
          {message.content ? (
            <Text style={[styles.bubbleText, message.is_own && styles.bubbleTextOwn, { marginTop: rp(6) }]}>
              {message.content}
            </Text>
          ) : null}
        </>
      );
    }
    if (msgType === 'voice' && message.media_url) {
      return <VoiceNoteBubble url={message.media_url} isOwn={message.is_own} />;
    }
    return (
      <Text style={[styles.bubbleText, message.is_own && styles.bubbleTextOwn]}>
        {message.content}
      </Text>
    );
  };

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
        <View style={[
          styles.bubble,
          message.is_own ? styles.bubbleOwn : styles.bubbleTheir,
          msgType === 'image' && styles.bubbleImage_wrap,
        ]}>
          {bubbleContent()}
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

// ─── Reveal Progress Banner ───────────────────────────────────
const RevealProgressBanner = React.memo(({ messageCount, revealUnlocked }) => {
  const THRESHOLD = 30;
  if (revealUnlocked || messageCount === 0) return null;

  const remaining = THRESHOLD - messageCount;
  const progress  = Math.min(messageCount / THRESHOLD, 1);

  // Only show in the last 10 messages before unlock, or exactly at unlock
  if (remaining > 10) return null;

  return (
    <View style={styles.revealProgressBanner}>
      <Text style={styles.revealProgressEmoji}>👁</Text>
      <View style={styles.revealProgressBody}>
        <Text style={styles.revealProgressText}>
          {remaining === 0
            ? 'identity reveal is now unlocked ✨'
            : `${remaining} more ${remaining === 1 ? 'message' : 'messages'} to unlock reveal`}
        </Text>
        <View style={styles.revealProgressTrack}>
          <View style={[styles.revealProgressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>
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

// ─── Deep Connection Countdown ────────────────────────────────
function useCountdown(expiresAt) {
  const [timeLeft, setTimeLeft] = useState(null);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = new Date(expiresAt) - new Date();
      if (diff <= 0) { setTimeLeft(null); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft({ d, h, m, diff });
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return timeLeft;
}

const DeepConnectionCountdown = React.memo(({ expiresAt, revealUnlocked, onReveal }) => {
  const tl = useCountdown(expiresAt);
  if (!tl) return null;

  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
  const ONE_DAY    = 24 * 60 * 60 * 1000;
  if (tl.diff > THREE_DAYS) return null;   // only show in the last 3 days

  const urgent = tl.diff < ONE_DAY;
  const label  = tl.d > 0 ? `${tl.d}d ${tl.h}h left` : `${tl.h}h ${tl.m}m left`;

  return (
    <View style={[styles.countdownBanner, urgent && styles.countdownBannerUrgent]}>
      <Text style={[styles.countdownText, urgent && styles.countdownTextUrgent]}>
        ⏳ this connection closes in {label}
      </Text>
      {revealUnlocked && (
        <TouchableOpacity onPress={onReveal} hitSlop={HIT_SLOP} style={styles.countdownRevealBtn}>
          <Text style={styles.countdownRevealText}>reveal & continue →</Text>
        </TouchableOpacity>
      )}
    </View>
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
  const [isRecording,    setIsRecording]    = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [incomingCall,   setIncomingCall]   = useState(null); // {callType, callerName, callerAvatar, callerColor}
  const chatEventTimer = useRef(null);
  const recordingRef   = useRef(null);

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

    // Incoming call offer
    const handleCallOffer = ({ chat_id, call_type, caller_name, caller_avatar, caller_color }) => {
      if (chat_id !== chatId) return;
      setIncomingCall({ callType: call_type, callerName: caller_name, callerAvatar: caller_avatar, callerColor: caller_color });
    };
    const handleCallEnded = ({ chat_id }) => {
      if (chat_id !== chatId) return;
      setIncomingCall(null);
    };

    socketService.onNewMessage?.(handleNewMessage);
    socketService.onMessagesDelivered?.(handleDelivered);
    socketService.onMessagesRead?.(handleRead);
    socketService.on?.('typing',           handleTyping);
    socketService.on?.('user_online',      handleOnline);
    socketService.on?.('user_offline',     handleOffline);
    socketService.on?.('intensity_update', handleIntensityUpdate);
    socketService.onCallOffer?.(handleCallOffer);
    socketService.onCallEnded?.(handleCallEnded);

    return () => {
      socketService.offNewMessage?.(handleNewMessage);
      socketService.offMessagesDelivered?.(handleDelivered);
      socketService.offMessagesRead?.(handleRead);
      socketService.off?.('typing',           handleTyping);
      socketService.off?.('user_online',      handleOnline);
      socketService.off?.('user_offline',     handleOffline);
      socketService.off?.('intensity_update', handleIntensityUpdate);
      socketService.offCallOffer?.(handleCallOffer);
      socketService.offCallEnded?.(handleCallEnded);
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
      if (!res.ok) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        showToast({ type: 'error', message: 'Message could not be sent.' });
      } else {
        loadMessages();
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      showToast({ type: 'error', message: 'Message could not be sent.' });
    } finally {
      setSending(false);
    }
  }, [inputText, sending, chatInfo, chatId, socketService, scrollToBottom, loadMessages, showToast]);

  // ── Upload media to Cloudinary via signed upload ──────────
  const uploadMedia = useCallback(async (uri, resourceType = 'image') => {
    try {
      const token = await AsyncStorage.getItem('token');
      // Get signed upload params from backend
      const sigRes = await fetch(`${API_BASE_URL}/api/v1/upload/sign`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ resource_type: resourceType }),
      });
      if (!sigRes.ok) throw new Error('signature failed');
      const { signature, timestamp, api_key, cloud_name, upload_preset } = await sigRes.json();

      const form = new FormData();
      const ext  = resourceType === 'video' ? 'mp4' : resourceType === 'image' ? 'jpg' : 'm4a';
      form.append('file', { uri, name: `chat_media_${Date.now()}.${ext}`, type: resourceType === 'image' ? 'image/jpeg' : 'audio/m4a' });
      form.append('signature',   signature);
      form.append('timestamp',   String(timestamp));
      form.append('api_key',     api_key);
      if (upload_preset) form.append('upload_preset', upload_preset);

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloud_name}/${resourceType}/upload`,
        { method: 'POST', body: form }
      );
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData?.error?.message || 'upload failed');
      return uploadData.secure_url;
    } catch (e) {
      showToast({ type: 'error', message: 'Media upload failed. Try again.' });
      return null;
    }
  }, [showToast]);

  // ── Send a message with optional media ───────────────────
  const sendMediaMessage = useCallback(async ({ content = '', messageType, mediaUrl }) => {
    if (sending || mediaUploading) return;
    setSending(true);
    const tempId = `temp_${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, content, message_type: messageType, media_url: mediaUrl,
      is_own: true, is_delivered: false, is_read: false,
      created_at: new Date().toISOString(),
    }]);
    scrollToBottom();
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ chat_id: chatId, content, message_type: messageType, media_url: mediaUrl }),
      });
      if (!res.ok) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        showToast({ type: 'error', message: 'Could not send message.' });
      } else {
        loadMessages();
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      showToast({ type: 'error', message: 'Could not send message.' });
    } finally {
      setSending(false);
    }
  }, [sending, mediaUploading, chatId, scrollToBottom, loadMessages, showToast]);

  // ── Image picker ─────────────────────────────────────────
  const handleImagePress = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'warning', message: 'Gallery permission is needed.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 0.8,
        allowsEditing: false,
      });
      if (result.canceled) return;
      setMediaUploading(true);
      const url = await uploadMedia(result.assets[0].uri, 'image');
      setMediaUploading(false);
      if (url) await sendMediaMessage({ messageType: 'image', mediaUrl: url });
    } catch {
      setMediaUploading(false);
      showToast({ type: 'error', message: 'Could not send image.' });
    }
  }, [showToast, uploadMedia, sendMediaMessage]);

  // ── Voice note record / stop ─────────────────────────────
  const handleVoicePress = useCallback(async () => {
    if (isRecording) {
      // Stop and send
      try {
        await recordingRef.current?.stopAndUnloadAsync();
        const uri = recordingRef.current?.getURI();
        setIsRecording(false);
        recordingRef.current = null;
        if (!uri) return;
        setMediaUploading(true);
        const url = await uploadMedia(uri, 'video'); // Cloudinary uses 'video' resource type for audio
        setMediaUploading(false);
        if (url) await sendMediaMessage({ messageType: 'voice', mediaUrl: url });
      } catch {
        setIsRecording(false);
        setMediaUploading(false);
        showToast({ type: 'error', message: 'Could not send voice note.' });
      }
    } else {
      // Start recording
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          showToast({ type: 'warning', message: 'Microphone permission is needed.' });
          return;
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = recording;
        setIsRecording(true);
      } catch {
        showToast({ type: 'error', message: 'Could not start recording.' });
      }
    }
  }, [isRecording, uploadMedia, sendMediaMessage, showToast]);

  // ── Unlock ───────────────────────────────────────────────
  const handleUnlock = useCallback(() => {
    navigation.navigate('UnlockPremium', { chatId, otherName });
  }, [navigation, chatId, otherName]);

  // ── Locked feature toast ──────────────────────────────────
  const handleLockedFeature = useCallback((feature, needed) => {
    const left = needed - (chatInfo?.message_count || 0);
    showToast({ type: 'info', title: `${feature} locked`, message: `${left} more messages to unlock.` });
  }, [showToast, chatInfo]);

  // ── Start a call ─────────────────────────────────────────
  const handleStartCall = useCallback((callType) => {
    navigation.navigate('Call', {
      chatId,
      callType,
      isInitiator:    true,
      otherName,
      otherAvatar,
      otherAvatarColor,
    });
  }, [navigation, chatId, otherName, otherAvatar, otherAvatarColor]);

  // ── Accept incoming call ──────────────────────────────────
  const handleAcceptCall = useCallback(() => {
    if (!incomingCall) return;
    const { callType, callerName, callerAvatar, callerColor } = incomingCall;
    setIncomingCall(null);
    navigation.navigate('Call', {
      chatId,
      callType,
      isInitiator:    false,
      otherName:      callerName,
      otherAvatar:    callerAvatar,
      otherAvatarColor: callerColor,
    });
  }, [incomingCall, navigation, chatId]);

  // ── Reject incoming call ──────────────────────────────────
  const handleRejectCall = useCallback(async () => {
    setIncomingCall(null);
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/call/reject`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* silent */ }
  }, [chatId]);

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

  const messageCount    = chatInfo?.message_count || 0;
  const revealUnlocked  = chatInfo?.reveal_unlocked || messageCount >= 30;
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
              onPress={() => hasAudioCall ? handleStartCall('audio') : handleLockedFeature('Audio calls', 80)}
              hitSlop={HIT_SLOP}
            >
              <Phone size={rs(16)} color={hasAudioCall ? T.primary : T.textMuted} strokeWidth={1.8} />
              {!hasAudioCall && <Lock size={rs(8)} color={T.primary} style={styles.lockOverlay} />}
            </TouchableOpacity>
            {/* Video call */}
            <TouchableOpacity
              style={[styles.headerActionBtn, hasVideoCall && styles.headerActionBtnActive]}
              onPress={() => hasVideoCall ? handleStartCall('video') : handleLockedFeature('Video calls', 100)}
              hitSlop={HIT_SLOP}
            >
              <Video size={rs(16)} color={hasVideoCall ? T.primary : T.textMuted} strokeWidth={1.8} />
              {!hasVideoCall && <Lock size={rs(8)} color={T.primary} style={styles.lockOverlay} />}
            </TouchableOpacity>
            {/* Reveal */}
            {revealUnlocked && (
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
        <IntensityMeter messageCount={messageCount} isUnlocked={revealUnlocked} />

        {/* ── Reveal progress banner ── */}
        <RevealProgressBanner messageCount={messageCount} revealUnlocked={revealUnlocked} />

        {/* ── Deep connection countdown ── */}
        <DeepConnectionCountdown
          expiresAt={chatInfo?.chat_expires_at}
          revealUnlocked={revealUnlocked}
          onReveal={() => setShowReveal(true)}
        />

        {/* ── Drop nudge — they have a confession ── */}
        {chatInfo?.has_active_drop && chatInfo?.drop_id && (
          <TouchableOpacity
            style={styles.dropNudgeBanner}
            onPress={() => navigation.navigate('DropLanding', { dropId: chatInfo.drop_id })}
            hitSlop={HIT_SLOP}
            activeOpacity={0.85}
          >
            <Text style={styles.dropNudgeText}>
              🌑 they have a confession on the board · <Text style={styles.dropNudgeLink}>read it</Text>
            </Text>
          </TouchableOpacity>
        )}

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
          {/* Image button */}
          <TouchableOpacity
            style={[styles.inputActionBtn, mediaUploading && styles.inputActionBtnBusy]}
            onPress={hasMedia ? handleImagePress : () => handleLockedFeature('Images')}
            hitSlop={HIT_SLOP}
            disabled={mediaUploading}
          >
            {mediaUploading
              ? <ActivityIndicator size="small" color={T.primary} />
              : <ImageIcon size={rs(18)} color={hasMedia ? T.primary : T.textMuted} strokeWidth={1.5} />
            }
            {!hasMedia && !mediaUploading && <Lock size={rs(8)} color={T.primary} style={styles.lockOverlay} />}
          </TouchableOpacity>

          {/* Text input */}
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={handleInputChange}
            placeholder="say something…"
            placeholderTextColor={T.textMuted}
            multiline
            maxLength={500}
            returnKeyType="default"
            selectionColor={T.primary}
          />

          {/* Voice note button */}
          <TouchableOpacity
            style={[styles.inputActionBtn, isRecording && styles.inputActionBtnRecording]}
            onPress={hasVoiceNote ? handleVoicePress : () => handleLockedFeature('Voice notes')}
            hitSlop={HIT_SLOP}
          >
            {isRecording
              ? <MicOff size={rs(18)} color="#fff" strokeWidth={2} />
              : <Mic    size={rs(18)} color={hasVoiceNote ? T.primary : T.textMuted} strokeWidth={1.5} />
            }
            {!hasVoiceNote && !isRecording && <Lock size={rs(8)} color={T.primary} style={styles.lockOverlay} />}
          </TouchableOpacity>

          {/* Send */}
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
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

      {/* ── Incoming call modal ── */}
      {incomingCall && (
        <Modal visible transparent animationType="slide" onRequestClose={handleRejectCall}>
          <View style={styles.incomingBackdrop}>
            <View style={styles.incomingCard}>
              <View style={[styles.incomingAvatar, { backgroundColor: (incomingCall.callerColor || T.primary) + '22', borderColor: (incomingCall.callerColor || T.primary) + '55' }]}>
                <Text style={styles.incomingAvatarEmoji}>
                  {/* Avatar emoji map reuse */}
                  {({'ghost':'👻','shadow':'🌑','flame':'🔥','void':'🕳️','storm':'⛈️','smoke':'💨','eclipse':'🌘','shard':'🔷','moth':'🦋','raven':'🐦‍⬛'})[incomingCall.callerAvatar] || '👤'}
                </Text>
              </View>
              <Text style={styles.incomingName}>{incomingCall.callerName || 'Anonymous'}</Text>
              <Text style={styles.incomingType}>
                {incomingCall.callType === 'video' ? '📹 incoming video call' : '📞 incoming audio call'}
              </Text>
              <View style={styles.incomingBtns}>
                <TouchableOpacity style={styles.incomingReject} onPress={handleRejectCall} activeOpacity={0.85}>
                  <PhoneOff size={rs(22)} color="#fff" strokeWidth={2} />
                  <Text style={styles.incomingBtnLabel}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.incomingAccept} onPress={handleAcceptCall} activeOpacity={0.85}>
                  <Phone size={rs(22)} color="#fff" strokeWidth={2} />
                  <Text style={styles.incomingBtnLabel}>Accept</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
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

  // Deep connection countdown
  countdownBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: rp(7),
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(251,191,36,0.18)',
    gap: SPACING.sm,
  },
  countdownBannerUrgent: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderBottomColor: 'rgba(239,68,68,0.2)',
  },
  countdownText:        { color: T.textSecondary, fontSize: FONT.xs, flex: 1 },
  countdownTextUrgent:  { color: '#EF4444' },
  countdownRevealBtn:   { paddingHorizontal: rp(10), paddingVertical: rp(4), backgroundColor: T.primary, borderRadius: RADIUS.sm },
  countdownRevealText:  { color: '#fff', fontSize: FONT.xs, fontWeight: '700' },

  // Drop nudge banner
  dropNudgeBanner: {
    paddingHorizontal: SPACING.md, paddingVertical: rp(7),
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center',
  },
  dropNudgeText: { color: T.textSecondary, fontSize: FONT.xs },
  dropNudgeLink: { color: '#8B5CF6', fontWeight: '700' },

  // Reveal progress banner
  revealProgressBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: rp(8),
    backgroundColor: 'rgba(255,99,74,0.08)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,99,74,0.18)',
  },
  revealProgressEmoji: { fontSize: rf(16) },
  revealProgressBody:  { flex: 1, gap: rp(4) },
  revealProgressText:  { color: T.textSecondary, fontSize: FONT.xs },
  revealProgressTrack: {
    height: rp(3), backgroundColor: T.border, borderRadius: rp(2), overflow: 'hidden',
  },
  revealProgressFill: {
    height: '100%', backgroundColor: T.primary, borderRadius: rp(2),
  },

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
  sendBtn: {
    width: rs(40), height: rs(40), borderRadius: rs(20),
    backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: T.primary, shadowOffset: { width: 0, height: rs(4) },
    shadowOpacity: 0.4, shadowRadius: rs(8), elevation: 6,
  },
  sendBtnDisabled: { backgroundColor: '#1e2330', shadowOpacity: 0 },
  sendBtnText: { color: '#fff', fontSize: rf(18), fontWeight: '800' },
  inputActionBtnBusy:      { opacity: 0.6 },
  inputActionBtnRecording: {
    backgroundColor: T.primary, borderRadius: rs(18),
    shadowColor: T.primary, shadowOpacity: 0.5, shadowRadius: rs(6), elevation: 4,
  },

  // Voice note bubble
  voiceBubble: {
    flexDirection: 'row', alignItems: 'center',
    gap: rp(10), paddingVertical: rp(4), minWidth: rs(160),
  },
  voicePlayBtn: {
    width: rs(32), height: rs(32), borderRadius: rs(16),
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  voicePlayBtnOwn: { backgroundColor: 'rgba(255,255,255,0.25)' },
  voiceWaveWrap:   { flex: 1, gap: rp(4) },
  voiceTrack: {
    height: rs(3), backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: rs(2), overflow: 'hidden',
  },
  voiceTrackOwn:  { backgroundColor: 'rgba(255,255,255,0.25)' },
  voiceFill:      { height: '100%', backgroundColor: T.textSecondary, borderRadius: rs(2) },
  voiceFillOwn:   { backgroundColor: 'rgba(255,255,255,0.7)' },
  voiceLabel:     { fontSize: rf(10), color: T.textSecondary },
  voiceLabelOwn:  { color: 'rgba(255,255,255,0.7)' },

  // Image bubble
  bubbleImage_wrap: { padding: rp(4) },
  bubbleImage: {
    width:        rs(220),
    height:       rs(160),
    borderRadius: RADIUS.md,
  },

  // Reveal modal
  // Incoming call modal
  incomingBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'flex-end', paddingBottom: rs(60),
  },
  incomingCard: {
    backgroundColor: T.surface, borderRadius: RADIUS.xl,
    padding: rp(28), width: '90%', alignItems: 'center',
    gap: SPACING.sm, borderWidth: 1, borderColor: T.border,
  },
  incomingAvatar: {
    width: rs(72), height: rs(72), borderRadius: rs(36),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, marginBottom: rp(4),
  },
  incomingAvatarEmoji: { fontSize: rf(32) },
  incomingName: { fontSize: rf(18), fontWeight: '700', color: T.text },
  incomingType: { fontSize: rf(13), color: T.textSecondary, marginBottom: rp(8) },
  incomingBtns: {
    flexDirection: 'row', gap: SPACING.lg, marginTop: rp(8),
  },
  incomingReject: {
    width: rs(64), height: rs(64), borderRadius: rs(32),
    backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center',
    gap: rp(4),
  },
  incomingAccept: {
    width: rs(64), height: rs(64), borderRadius: rs(32),
    backgroundColor: T.online, alignItems: 'center', justifyContent: 'center',
    gap: rp(4),
  },
  incomingBtnLabel: { fontSize: rf(10), fontWeight: '700', color: '#fff' },

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
