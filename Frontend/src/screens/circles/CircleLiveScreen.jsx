/**
 * CircleLiveScreen.jsx
 * The live room. The main event.
 *
 * Creator view:  Stream controls, end live, manage hot seat, see gifts
 * Audience view: Watch stream, whisper, pulse, send gift, preview timer
 *
 * Design: Everything recedes except the stream and the energy.
 * The UI breathes. The gifts float. The whispers drift and die.
 * This screen should feel like being in the same dark room as a stranger.
 */
import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  FlatList, TextInput, KeyboardAvoidingView, Platform,
  Modal, ActivityIndicator, Dimensions, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  X, Mic, MicOff, Video, VideoOff, Gift,
  Heart, Users, ChevronUp, Crown,
} from 'lucide-react-native';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP,
} from '../../utils/responsive';
import { useDispatch } from 'react-redux';
import { useToast } from '../../components/ui/Toast';
import CoinGate from '../../components/payments/CoinGate';
import { API_BASE_URL } from '../../config/api';
import { awardMilestone } from '../../store/slices/coinsSlice';
import T from '../../utils/theme';

const { width: W, height: H } = Dimensions.get('window');

// ─── Static data ──────────────────────────────────────────────────────────────
const GIFT_TIERS = [
  { id: 'spark',   emoji: '🔥', label: 'Spark',   kes: 10  },
  { id: 'bolt',    emoji: '⚡', label: 'Bolt',    kes: 50  },
  { id: 'crystal', emoji: '💎', label: 'Crystal', kes: 200 },
  { id: 'crown',   emoji: '👑', label: 'Crown',   kes: 500 },
];

const VIBE_STATES = [
  { label: 'Heavy',      color: '#3B82F6', emoji: '💙' },
  { label: 'Charged',    color: '#8B5CF6', emoji: '💜' },
  { label: 'Alive',      color: '#FF634A', emoji: '🔴' },
  { label: 'Dead quiet', color: '#1a1f2e', emoji: '🖤' },
];

const WHISPER_LIFETIME_MS = 4000;
const PREVIEW_POLL_MS     = 10000;
const HOT_SEAT_POLL_MS    = 5000;

// ─── Whisper Bubble ───────────────────────────────────────────────────────────
const WhisperBubble = React.memo(({ whisper, onDone }) => {
  const opacity  = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(whisper.startX)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity,     { toValue: 1,   duration: 300, useNativeDriver: true }),
        Animated.timing(translateX,  { toValue: whisper.endX, duration: WHISPER_LIFETIME_MS - 500, useNativeDriver: true }),
        Animated.timing(translateY,  { toValue: -rs(20), duration: WHISPER_LIFETIME_MS, useNativeDriver: true }),
      ]),
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => onDone(whisper.id));
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.whisperBubble,
        {
          top:       whisper.y,
          opacity,
          transform: [{ translateX }, { translateY }],
        }
      ]}
    >
      <Text style={styles.whisperText}>{whisper.text}</Text>
    </Animated.View>
  );
});

// ─── Gift Animation ───────────────────────────────────────────────────────────
const GiftFloat = React.memo(({ gift, onDone }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.5)).current;
  const posY    = useRef(new Animated.Value(H * 0.6)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale,   { toValue: 1.4, tension: 60, friction: 5, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(posY,    { toValue: H * 0.35, duration: 1200, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(scale,   { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
        Animated.timing(posY,    { toValue: H * 0.2, duration: 1000, useNativeDriver: true }),
      ]),
      Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start(() => onDone(gift.id));
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.giftFloat,
        { left: gift.x, opacity, transform: [{ translateY: posY }, { scale }] }
      ]}
    >
      <Text style={styles.giftFloatEmoji}>{gift.emoji}</Text>
      <Text style={styles.giftFloatLabel}>KES {gift.kes}</Text>
    </Animated.View>
  );
});

// ─── Preview Timer Banner ─────────────────────────────────────────────────────
const PreviewBanner = React.memo(({ secondsLeft, onPay, accentColor }) => {
  const urgent  = secondsLeft <= 60;
  const mm      = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss      = String(secondsLeft % 60).padStart(2, '0');
  const pulseOp = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!urgent) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOp, { toValue: 0.4, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseOp, { toValue: 1,   duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [urgent]);

  return (
    <Animated.View style={[
      styles.previewBanner,
      urgent && styles.previewBannerUrgent,
      { opacity: urgent ? pulseOp : 1 },
    ]}>
      <Text style={[styles.previewBannerText, urgent && { color: '#EF4444' }]}>
        👁 Preview ends in {mm}:{ss}
      </Text>
      <TouchableOpacity
        onPress={onPay}
        hitSlop={HIT_SLOP}
        style={[styles.previewPayBtn, { backgroundColor: accentColor }]}
      >
        <Text style={styles.previewPayText}>Stay</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Hot Seat Modal ───────────────────────────────────────────────────────────
const HotSeatModal = React.memo(({
  visible, circleId, eventId, onAccept, onDecline, showToast,
}) => {
  const [countdown, setCountdown] = useState(15);
  const countRef   = useRef(null);
  const scaleAnim  = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    setCountdown(15);
    Animated.parallel([
      Animated.spring(scaleAnim,   { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    countRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countRef.current);
          onDecline();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countRef.current);
  }, [visible]);

  const handleAccept = useCallback(async () => {
    clearInterval(countRef.current);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/events/${eventId}/hotseat/accept`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        onAccept(data);
      } else {
        showToast({ type: 'error', message: 'Could not join Hot Seat.' });
        onDecline();
      }
    } catch {
      showToast({ type: 'error', message: 'Could not join Hot Seat.' });
      onDecline();
    }
  }, [circleId, eventId, onAccept, onDecline, showToast]);

  const handleDecline = useCallback(async () => {
    clearInterval(countRef.current);
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/events/${eventId}/hotseat/decline`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {}
    onDecline();
  }, [circleId, eventId, onDecline]);

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.hotSeatBackdrop}>
        <Animated.View style={[
          styles.hotSeatSheet,
          { transform: [{ scale: scaleAnim }], opacity: opacityAnim }
        ]}>
          <Text style={styles.hotSeatEmoji}>🎤</Text>
          <Text style={styles.hotSeatTitle}>The Voice wants to talk to you</Text>
          <Text style={styles.hotSeatBody}>
            You'll be on stage together. Anonymous. The room will hear both of you.
          </Text>
          <Text style={styles.hotSeatCountdown}>{countdown}s to decide</Text>
          <View style={styles.hotSeatButtons}>
            <TouchableOpacity
              style={styles.hotSeatDeclineBtn}
              onPress={handleDecline}
              hitSlop={HIT_SLOP}
              activeOpacity={0.85}
            >
              <Text style={styles.hotSeatDeclineText}>Stay hidden</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.hotSeatAcceptBtn}
              onPress={handleAccept}
              hitSlop={HIT_SLOP}
              activeOpacity={0.85}
            >
              <Mic size={rs(16)} color="#fff" />
              <Text style={styles.hotSeatAcceptText}>Speak</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
});

// ─── Gift Sheet ───────────────────────────────────────────────────────────────
const GiftSheet = React.memo(({
  visible, circleId, eventId, onClose, onGiftSent, showToast, accentColor,
}) => {
  const [sending, setSending] = useState(null);
  const sheetY = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(sheetY, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }).start();
    } else {
      Animated.timing(sheetY, { toValue: 300, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  const handleGift = useCallback(async (tier) => {
    setSending(tier.id);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/events/${eventId}/gift`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ tier: tier.id }),
        }
      );
      if (res.ok) {
        onGiftSent(tier);
        onClose();
      } else {
        showToast({ type: 'error', message: 'Could not send gift.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not send gift.' });
    } finally {
      setSending(null);
    }
  }, [circleId, eventId, onGiftSent, onClose, showToast]);

  if (!visible) return null;

  return (
    <View style={styles.giftBackdrop}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        activeOpacity={1}
      />
      <Animated.View style={[
        styles.giftSheet,
        { transform: [{ translateY: sheetY }] }
      ]}>
        <View style={styles.giftSheetHandle} />
        <Text style={styles.giftSheetTitle}>Send anonymously</Text>
        <Text style={styles.giftSheetSub}>The Voice will never know it's you.</Text>
        <View style={styles.giftGrid}>
          {GIFT_TIERS.map(tier => (
            <TouchableOpacity
              key={tier.id}
              style={[
                styles.giftTile,
                { borderColor: sending === tier.id ? accentColor : T.border }
              ]}
              onPress={() => handleGift(tier)}
              disabled={!!sending}
              hitSlop={HIT_SLOP}
              activeOpacity={0.85}
            >
              {sending === tier.id
                ? <ActivityIndicator size="small" color={accentColor} />
                : <>
                    <Text style={styles.giftTileEmoji}>{tier.emoji}</Text>
                    <Text style={styles.giftTileLabel}>{tier.label}</Text>
                    <Text style={styles.giftTilePrice}>KES {tier.kes}</Text>
                  </>
              }
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </View>
  );
});

// ─── Whisper Input ────────────────────────────────────────────────────────────
const WhisperInput = React.memo(({ onSend, visible, onToggle }) => {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  }, [text, onSend]);

  if (!visible) {
    return (
      <TouchableOpacity
        onPress={onToggle}
        hitSlop={HIT_SLOP}
        style={styles.whisperToggleBtn}
      >
        <Text style={styles.whisperToggleText}>whisper something…</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.whisperInputRow}>
      <TextInput
        ref={inputRef}
        value={text}
        onChangeText={t => setText(t.slice(0, 30))}
        placeholder="say it anonymously…"
        placeholderTextColor={T.textMuted}
        style={styles.whisperInput}
        maxLength={30}
        autoFocus
        onSubmitEditing={handleSend}
        returnKeyType="send"
      />
      <TouchableOpacity
        onPress={handleSend}
        disabled={!text.trim()}
        hitSlop={HIT_SLOP}
        style={[styles.whisperSendBtn, !text.trim() && { opacity: 0.4 }]}
      >
        <Text style={styles.whisperSendText}>↑</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onToggle} hitSlop={HIT_SLOP} style={styles.whisperCloseBtn}>
        <X size={rs(16)} color={T.textMuted} />
      </TouchableOpacity>
    </View>
  );
});

// ─── Vibe Temperature Bar ─────────────────────────────────────────────────────
const VibeBar = React.memo(({ vibeIndex, accentColor }) => {
  const vibe   = VIBE_STATES[vibeIndex] ?? VIBE_STATES[2];
  const widthAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const target = 0.2 + (vibeIndex / (VIBE_STATES.length - 1)) * 0.8;
    Animated.timing(widthAnim, { toValue: target, duration: 1000, useNativeDriver: false }).start();
  }, [vibeIndex]);

  const barWidth = widthAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.vibeBar}>
      <Text style={styles.vibeLabel}>{vibe.emoji} {vibe.label}</Text>
      <View style={styles.vibeTrack}>
        <Animated.View style={[
          styles.vibeProgress,
          { width: barWidth, backgroundColor: vibe.color }
        ]} />
      </View>
    </View>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CircleLiveScreen({ route, navigation }) {
  const {
    circleId, eventId, circle, event,
    agoraToken, agoraChannel, agoraUid, agoraAppId,
    isCreator = false,
  } = route.params ?? {};

  const { showToast } = useToast();
  const dispatch      = useDispatch();
  const accentColor   = circle?.aura_color ?? T.primary;

  // ── State ─────────────────────────────────────────────────────────────────
  const [isMuted,       setIsMuted]       = useState(!isCreator);
  const [isVideoOff,    setIsVideoOff]    = useState(false);
  const [viewerCount,   setViewerCount]   = useState(1);
  const [whispers,      setWhispers]      = useState([]);
  const [giftFloats,    setGiftFloats]    = useState([]);
  const [showGiftSheet, setShowGiftSheet] = useState(false);
  const [showWhisper,   setShowWhisper]   = useState(false);
  const [vibeIndex,     setVibeIndex]     = useState(2);
  const [previewSecs,   setPreviewSecs]   = useState(null);
  const [showPayWall,   setShowPayWall]   = useState(false);
  const [entryGate,     setEntryGate]     = useState(false);
  const [hotSeatVisible, setHotSeatVisible] = useState(false);
  const [ending,        setEnding]        = useState(false);
  const [pulseValue,    setPulseValue]    = useState(0);  // 0-100 energy meter
  const [showConfDrop,  setShowConfDrop]  = useState(false);
  const [confDropText,  setConfDropText]  = useState('');
  const [confDropSent,  setConfDropSent]  = useState(false);

  const pulseAnim     = useRef(new Animated.Value(0)).current;
  const energyAnim    = useRef(new Animated.Value(0)).current;
  const controlsOp   = useRef(new Animated.Value(1)).current;
  const controlsTimer = useRef(null);
  const previewTimer  = useRef(null);
  const hotSeatPoll   = useRef(null);
  const agoraEngine   = useRef(null);

  // ── Agora init ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!agoraToken || !agoraChannel || !agoraAppId) return;

    const initAgora = async () => {
      try {
        const { createAgoraRtcEngine, ChannelProfileType, ClientRoleType } =
          await import('react-native-agora');

        const engine = createAgoraRtcEngine();
        agoraEngine.current = engine;

        engine.initialize({ appId: agoraAppId });
        engine.setChannelProfile(ChannelProfileType.ChannelProfileLiveBroadcasting);
        engine.setClientRole(
          isCreator
            ? ClientRoleType.ClientRoleBroadcaster
            : ClientRoleType.ClientRoleAudience
        );

        if (isCreator) {
          engine.enableVideo();
          engine.startPreview();
        }

        engine.joinChannel(agoraToken, agoraChannel, agoraUid, {});

        engine.addListener('onUserJoined', () => {
          setViewerCount(prev => prev + 1);
        });
        engine.addListener('onUserOffline', () => {
          setViewerCount(prev => Math.max(1, prev - 1));
        });
      } catch {
        // Agora unavailable in Expo Go — fail silently, UI still renders
      }
    };

    initAgora();

    return () => {
      try {
        agoraEngine.current?.leaveChannel();
        agoraEngine.current?.release();
      } catch {}
    };
  }, [agoraToken, agoraChannel, agoraUid, agoraAppId, isCreator]);

  // ── Preview timer poll ────────────────────────────────────────────────────
  useEffect(() => {
    if (isCreator || !eventId) return;

    const pollPreview = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const res   = await fetch(
          `${API_BASE_URL}/api/v1/circles/${circleId}/events/${eventId}/preview/status`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (data.status === 'locked') {
          setShowPayWall(true);
          clearInterval(previewTimer.current);
        } else if (data.status === 'preview' && data.seconds_left != null) {
          setPreviewSecs(data.seconds_left);
        } else if (data.status === 'paid') {
          setPreviewSecs(null);
        }
      } catch {}
    };

    pollPreview();
    previewTimer.current = setInterval(pollPreview, PREVIEW_POLL_MS);
    return () => clearInterval(previewTimer.current);
  }, [isCreator, circleId, eventId]);

  // ── Hot Seat poll (audience only) ─────────────────────────────────────────
  useEffect(() => {
    if (isCreator) return;

    const pollHotSeat = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const res   = await fetch(
          `${API_BASE_URL}/api/v1/circles/${circleId}/events/${eventId}/hotseat/check`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.invited) setHotSeatVisible(true);
        }
      } catch {}
    };

    hotSeatPoll.current = setInterval(pollHotSeat, HOT_SEAT_POLL_MS);
    return () => clearInterval(hotSeatPoll.current);
  }, [isCreator, circleId, eventId]);

  // ── Auto-hide controls ────────────────────────────────────────────────────
  const resetControlsTimer = useCallback(() => {
    clearTimeout(controlsTimer.current);
    Animated.timing(controlsOp, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    controlsTimer.current = setTimeout(() => {
      if (!showGiftSheet && !showWhisper) {
        Animated.timing(controlsOp, { toValue: 0.3, duration: 800, useNativeDriver: true }).start();
      }
    }, 4000);
  }, [showGiftSheet, showWhisper]);

  useEffect(() => {
    resetControlsTimer();
    return () => clearTimeout(controlsTimer.current);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleMuteToggle = useCallback(() => {
    try { agoraEngine.current?.muteLocalAudioStream(!isMuted); } catch {}
    setIsMuted(prev => !prev);
  }, [isMuted]);

  const handleVideoToggle = useCallback(() => {
    try { agoraEngine.current?.muteLocalVideoStream(!isVideoOff); } catch {}
    setIsVideoOff(prev => !prev);
  }, [isVideoOff]);

  const handleSendWhisper = useCallback((text) => {
    const id      = `w_${Date.now()}`;
    const startX  = Math.random() * (W * 0.3);
    const endX    = startX + (Math.random() - 0.5) * W * 0.4;
    const y       = H * 0.3 + Math.random() * H * 0.3;
    setWhispers(prev => [...prev, { id, text, startX, endX, y }]);
    setShowWhisper(false);
    // Shift vibe toward Alive
    setVibeIndex(prev => Math.min(prev + 1, VIBE_STATES.length - 1));
  }, []);

  const removeWhisper = useCallback((id) => {
    setWhispers(prev => prev.filter(w => w.id !== id));
  }, []);

  const handleGiftSent = useCallback((tier) => {
    const id = `g_${Date.now()}`;
    const x  = W * 0.1 + Math.random() * W * 0.6;
    setGiftFloats(prev => [...prev, { ...tier, id, x }]);
    // Surge energy meter
    setPulseValue(prev => Math.min(prev + 30, 100));
    Animated.sequence([
      Animated.timing(energyAnim, { toValue: 1, duration: 600, useNativeDriver: false }),
      Animated.timing(energyAnim, { toValue: pulseValue / 100, duration: 400, useNativeDriver: false }),
    ]).start();
  }, [pulseValue]);

  const removeGiftFloat = useCallback((id) => {
    setGiftFloats(prev => prev.filter(g => g.id !== id));
  }, []);

  const handlePulsePress = useCallback(() => {
    setPulseValue(prev => {
      const next = Math.min(prev + 8, 100);
      Animated.timing(energyAnim, {
        toValue: next / 100,
        duration: 300,
        useNativeDriver: false,
      }).start();
      // Surge animation
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
      if (next >= 100) {
        showToast({ type: 'success', message: '⚡ Circle Surge!' });
        setTimeout(() => setPulseValue(0), 1500);
      }
      return next;
    });
    setVibeIndex(prev => Math.min(prev + 1, VIBE_STATES.length - 1));
    resetControlsTimer();
  }, [resetControlsTimer, showToast]);

  const handleEndLive = useCallback(async () => {
    setEnding(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/events/${eventId}/end-live`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        try { agoraEngine.current?.leaveChannel(); } catch {}
        navigation.replace('CircleDashboard', { circleId });
      } else {
        showToast({ type: 'error', message: 'Could not end live.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not end live.' });
    } finally {
      setEnding(false);
    }
  }, [circleId, eventId, navigation, showToast]);

  const handleHotSeatPull = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/events/${eventId}/hotseat/pull`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        showToast({ type: 'success', message: 'Hot Seat request sent.' });
      } else {
        showToast({ type: 'error', message: 'No one to pull right now.' });
      }
    } catch {}
  }, [circleId, eventId, showToast]);

  const handleHotSeatAccepted = useCallback((data) => {
    setHotSeatVisible(false);
    // Re-join as publisher with new token
    try {
      const ClientRoleBroadcaster = 1;
      agoraEngine.current?.setClientRole(ClientRoleBroadcaster);
      agoraEngine.current?.leaveChannel();
      agoraEngine.current?.joinChannel(data.token, data.channel, data.uid, {});
    } catch {}
    showToast({ type: 'success', message: "You're on stage. Speak your truth." });
  }, [showToast]);

  const handleSendConfDrop = useCallback(async () => {
    if (!confDropText.trim()) return;
    setConfDropSent(true);
    setShowConfDrop(false);
    // Whisper it to the room as a special message
    handleSendWhisper(`🕯️ "${confDropText.trim()}"`);
    setConfDropText('');
  }, [confDropText, handleSendWhisper]);

  const handleLeaveAudience = useCallback(() => {
    clearInterval(previewTimer.current);
    clearInterval(hotSeatPoll.current);
    try { agoraEngine.current?.leaveChannel(); } catch {}
    navigation.goBack();
  }, [navigation]);

  // ── Energy bar width ──────────────────────────────────────────────────────
  const energyBarWidth = energyAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
  });

  const pulseScale = pulseAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [1, 1.3],
  });

  // ── Paywall ───────────────────────────────────────────────────────────────
  if (showPayWall) {
    return (
      <View style={[styles.safe, styles.paywallWrap]}>
        <Text style={styles.paywallEmoji}>🔒</Text>
        <Text style={styles.paywallTitle}>Your preview ended.</Text>
        <Text style={styles.paywallBody}>
          You were there. Now pay to stay.{'\n'}
          The circle is still alive.
        </Text>
        <TouchableOpacity
          style={[styles.paywallBtn, { backgroundColor: accentColor }]}
          onPress={() => {
            setShowPayWall(false);
            navigation.replace('CircleProfile', { circleId });
          }}
          hitSlop={HIT_SLOP}
          activeOpacity={0.85}
        >
          <Text style={styles.paywallBtnText}>Pay to return</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleLeaveAudience}
          hitSlop={HIT_SLOP}
          style={{ marginTop: SPACING.sm }}
        >
          <Text style={styles.paywallLeave}>Leave the circle</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.safe}>

      {/* Video stream area — full screen */}
      <View style={styles.videoArea}>
        {/* Placeholder when no Agora (Expo Go) */}
        <View style={[styles.videoPlaceholder, { backgroundColor: T.surface }]}>
          <Text style={styles.videoPlaceholderEmoji}>{circle?.avatar_emoji ?? '🎭'}</Text>
          <Text style={styles.videoPlaceholderText}>{circle?.name}</Text>
        </View>
      </View>

      {/* Dark overlay */}
      <View style={styles.videoOverlay} pointerEvents="none" />

      <SafeAreaView style={styles.safeOverlay} edges={['top', 'left', 'right', 'bottom']}>

        {/* ── Top bar ── */}
        <Animated.View style={[styles.topBar, { opacity: controlsOp }]}>
          <View style={styles.topBarLeft}>
            <View style={[styles.liveDot, { backgroundColor: accentColor }]} />
            <Text style={styles.liveLabel}>LIVE</Text>
            <View style={styles.viewerChip}>
              <Users size={rs(11)} color={T.textSecondary} />
              <Text style={styles.viewerCountText}>{viewerCount}</Text>
            </View>
          </View>

          <Text style={styles.topBarTitle} numberOfLines={1}>
            {event?.title ?? circle?.name}
          </Text>

          <TouchableOpacity
            onPress={isCreator ? handleEndLive : handleLeaveAudience}
            hitSlop={HIT_SLOP}
            style={styles.leaveBtn}
          >
            {ending
              ? <ActivityIndicator size="small" color={T.text} />
              : <X size={rs(20)} color={T.text} />
            }
          </TouchableOpacity>
        </Animated.View>

        {/* ── Preview timer ── */}
        {!isCreator && previewSecs !== null && (
          <PreviewBanner
            secondsLeft={previewSecs}
            onPay={() => setEntryGate(true)}
            accentColor={accentColor}
          />
        )}

        {/* ── Circle entry coin gate ── */}
        <CoinGate
          visible={entryGate}
          reason="circle_entry"
          cost={20}
          actionLabel="Stay in this Circle"
          actionEmoji="🎙️"
          description="Circle live entry"
          onConfirm={() => {
            setPreviewSecs(null);
            dispatch(awardMilestone('first_circle'));
          }}
          onClose={() => setEntryGate(false)}
        />

        {/* ── Vibe temperature ── */}
        <View style={styles.vibeWrap}>
          <VibeBar vibeIndex={vibeIndex} accentColor={accentColor} />
        </View>

        {/* ── Whisper layer ── */}
        <View style={styles.whisperLayer} pointerEvents="none">
          {whispers.map(w => (
            <WhisperBubble key={w.id} whisper={w} onDone={removeWhisper} />
          ))}
        </View>

        {/* ── Gift floats ── */}
        <View style={styles.giftLayer} pointerEvents="none">
          {giftFloats.map(g => (
            <GiftFloat key={g.id} gift={g} onDone={removeGiftFloat} />
          ))}
        </View>

        {/* ── Energy meter (audience) ── */}
        {!isCreator && (
          <View style={styles.energySection}>
            <View style={styles.energyTrack}>
              <Animated.View style={[
                styles.energyFill,
                { width: energyBarWidth, backgroundColor: accentColor }
              ]} />
            </View>
            <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
              <TouchableOpacity
                style={[styles.pulseBtn, { borderColor: accentColor + '50' }]}
                onPress={handlePulsePress}
                hitSlop={HIT_SLOP}
                activeOpacity={0.7}
              >
                <Heart size={rs(22)} color={accentColor} fill={accentColor} />
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {/* ── Bottom controls ── */}
        <Animated.View style={[styles.bottomBar, { opacity: controlsOp }]}>

          {/* Whisper input */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <WhisperInput
              visible={showWhisper}
              onSend={handleSendWhisper}
              onToggle={() => setShowWhisper(prev => !prev)}
            />
          </KeyboardAvoidingView>

          {/* Action buttons */}
          <View style={styles.actionRow}>

            {isCreator ? (
              // ── Creator controls ──
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, isMuted && styles.actionBtnActive]}
                  onPress={handleMuteToggle}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.85}
                >
                  {isMuted
                    ? <MicOff size={rs(22)} color="#EF4444" />
                    : <Mic size={rs(22)} color={T.text} />
                  }
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, isVideoOff && styles.actionBtnActive]}
                  onPress={handleVideoToggle}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.85}
                >
                  {isVideoOff
                    ? <VideoOff size={rs(22)} color="#EF4444" />
                    : <Video size={rs(22)} color={T.text} />
                  }
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleHotSeatPull}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.85}
                >
                  <Text style={styles.actionBtnEmoji}>🎤</Text>
                </TouchableOpacity>

                {!confDropSent && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => setShowConfDrop(true)}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.actionBtnEmoji}>🕯️</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.endLiveBtn]}
                  onPress={handleEndLive}
                  disabled={ending}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.85}
                >
                  {ending
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.endLiveText}>End</Text>
                  }
                </TouchableOpacity>
              </>
            ) : (
              // ── Audience controls ──
              <>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => setShowWhisper(prev => !prev)}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.85}
                >
                  <Text style={styles.actionBtnEmoji}>💬</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.giftBtn, { borderColor: accentColor + '50' }]}
                  onPress={() => setShowGiftSheet(true)}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.85}
                >
                  <Gift size={rs(20)} color={accentColor} />
                  <Text style={[styles.giftBtnText, { color: accentColor }]}>Gift</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Animated.View>

      </SafeAreaView>

      {/* ── Gift sheet ── */}
      <GiftSheet
        visible={showGiftSheet}
        circleId={circleId}
        eventId={eventId}
        onClose={() => setShowGiftSheet(false)}
        onGiftSent={handleGiftSent}
        showToast={showToast}
        accentColor={accentColor}
      />

      {/* ── Hot Seat modal ── */}
      <HotSeatModal
        visible={hotSeatVisible}
        circleId={circleId}
        eventId={eventId}
        onAccept={handleHotSeatAccepted}
        onDecline={() => setHotSeatVisible(false)}
        showToast={showToast}
      />

      {/* ── Confession Drop modal ── */}
      <Modal visible={showConfDrop} transparent animationType="fade">
        <View style={styles.confDropBackdrop}>
          <View style={styles.confDropSheet}>
            <Text style={styles.confDropEmoji}>🕯️</Text>
            <Text style={styles.confDropTitle}>Drop a confession</Text>
            <Text style={styles.confDropSub}>
              One truth. Disappears when the live ends.{'\n'}Nobody will know it was you.
            </Text>
            <TextInput
              value={confDropText}
              onChangeText={setConfDropText}
              placeholder="Say the unsayable…"
              placeholderTextColor={T.textMuted}
              style={styles.confDropInput}
              multiline
              maxLength={120}
              textAlignVertical="top"
              autoFocus
            />
            <Text style={styles.charCount}>{confDropText.length}/120</Text>
            <TouchableOpacity
              onPress={handleSendConfDrop}
              disabled={!confDropText.trim()}
              style={[
                styles.confDropSendBtn,
                { backgroundColor: accentColor },
                !confDropText.trim() && { opacity: 0.4 },
              ]}
              activeOpacity={0.85}
            >
              <Text style={styles.confDropSendText}>Drop it</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowConfDrop(false)}
              hitSlop={HIT_SLOP}
            >
              <Text style={styles.confDropCancelText}>Keep it in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },

  // Video
  videoArea: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: T.background,
  },
  videoPlaceholder: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SPACING.sm,
  },
  videoPlaceholderEmoji: { fontSize: rf(60) },
  videoPlaceholderText: {
    fontSize:   FONT.md,
    color:      T.textMuted,
    fontStyle:  'italic',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,8,15,0.45)',
  },

  // Safe overlay
  safeOverlay: {
    flex:            1,
    justifyContent:  'space-between',
  },

  // Top bar
  topBar: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.xs,
  },
  liveDot: {
    width:        rs(8),
    height:       rs(8),
    borderRadius: rs(4),
  },
  liveLabel: {
    fontSize:      rf(10),
    fontWeight:    '800',
    color:         T.text,
    letterSpacing: 1,
  },
  viewerChip: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(4),
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: rp(8),
    paddingVertical:   rp(3),
    borderRadius:    RADIUS.xs,
  },
  viewerCountText: {
    fontSize:   FONT.xs,
    color:      T.textSecondary,
    fontWeight: '600',
  },
  topBarTitle: {
    flex:       1,
    fontSize:   FONT.sm,
    fontWeight: '600',
    color:      T.text,
    textAlign:  'center',
    marginHorizontal: SPACING.sm,
    fontFamily: 'PlayfairDisplay-Bold',
  },
  leaveBtn: {
    width:           rs(36),
    height:          rs(36),
    borderRadius:    rs(18),
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems:      'center',
    justifyContent:  'center',
  },

  // Preview banner
  previewBanner: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(8),
    backgroundColor: 'rgba(241,196,15,0.10)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,196,15,0.20)',
  },
  previewBannerUrgent: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderBottomColor: 'rgba(239,68,68,0.20)',
  },
  previewBannerText: {
    fontSize:   FONT.sm,
    color:      '#F1C40F',
    fontWeight: '600',
  },
  previewPayBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(6),
    borderRadius:      RADIUS.xs,
  },
  previewPayText: {
    fontSize:   FONT.xs,
    fontWeight: '700',
    color:      '#fff',
  },

  // Vibe
  vibeWrap: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.xs,
  },
  vibeBar: {
    gap: rp(5),
  },
  vibeLabel: {
    fontSize:   FONT.xs,
    color:      T.textMuted,
    fontWeight: '500',
  },
  vibeTrack: {
    height:          rp(3),
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius:    rp(2),
    overflow:        'hidden',
  },
  vibeProgress: {
    height: '100%',
    borderRadius: rp(2),
  },

  // Whisper layer
  whisperLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  whisperBubble: {
    position:        'absolute',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius:    RADIUS.sm,
    paddingHorizontal: rp(10),
    paddingVertical:   rp(5),
    maxWidth:        W * 0.6,
  },
  whisperText: {
    fontSize:  FONT.xs,
    color:     T.text,
    fontStyle: 'italic',
  },

  // Gift layer
  giftLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
  },
  giftFloat: {
    position:   'absolute',
    alignItems: 'center',
    gap:        rp(2),
  },
  giftFloatEmoji: { fontSize: rf(36) },
  giftFloatLabel: {
    fontSize:   FONT.xs,
    color:      T.text,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: rp(6),
    borderRadius: RADIUS.xs,
  },

  // Energy section
  energySection: {
    paddingHorizontal: SPACING.md,
    alignItems:        'center',
    gap:               SPACING.xs,
    marginBottom:      SPACING.sm,
  },
  energyTrack: {
    width:           '80%',
    height:          rp(4),
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius:    rp(2),
    overflow:        'hidden',
  },
  energyFill: {
    height:       '100%',
    borderRadius: rp(2),
  },
  pulseBtn: {
    width:           rs(52),
    height:          rs(52),
    borderRadius:    rs(26),
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth:     1,
    alignItems:      'center',
    justifyContent:  'center',
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: SPACING.md,
    paddingBottom:     SPACING.sm,
    gap:               SPACING.sm,
  },

  // Whisper input
  whisperToggleBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius:    RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(10),
    borderWidth:     1,
    borderColor:     T.border,
  },
  whisperToggleText: {
    fontSize:  FONT.sm,
    color:     T.textMuted,
    fontStyle: 'italic',
  },
  whisperInputRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.xs,
  },
  whisperInput: {
    flex:              1,
    backgroundColor:   'rgba(255,255,255,0.08)',
    borderRadius:      RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(10),
    fontSize:          FONT.sm,
    color:             T.text,
    borderWidth:       1,
    borderColor:       T.border,
    fontStyle:         'italic',
  },
  whisperSendBtn: {
    width:           rs(36),
    height:          rs(36),
    borderRadius:    rs(18),
    backgroundColor: T.primary,
    alignItems:      'center',
    justifyContent:  'center',
  },
  whisperSendText: {
    fontSize:   FONT.md,
    color:      '#fff',
    fontWeight: '700',
  },
  whisperCloseBtn: {
    width:           rs(36),
    height:          rs(36),
    borderRadius:    rs(18),
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems:      'center',
    justifyContent:  'center',
  },

  // Action row
  actionRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            SPACING.sm,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    width:           rs(44),
    height:          rs(44),
    borderRadius:    rs(22),
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     T.border,
  },
  actionBtnActive: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor:     'rgba(239,68,68,0.30)',
  },
  actionBtnEmoji: { fontSize: rf(20) },
  endLiveBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(11),
    borderRadius:    RADIUS.sm,
  },
  endLiveText: {
    fontSize:   FONT.sm,
    fontWeight: '700',
    color:      '#fff',
  },
  giftBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(5),
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth:     1,
    borderRadius:    RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(10),
  },
  giftBtnText: {
    fontSize:   FONT.sm,
    fontWeight: '700',
  },

  // Hot Seat modal
  hotSeatBackdrop: {
    flex:            1,
    backgroundColor: 'rgba(6,8,15,0.85)',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         SPACING.lg,
  },
  hotSeatSheet: {
    backgroundColor:  T.surfaceAlt,
    borderRadius:     RADIUS.xl,
    padding:          SPACING.lg,
    alignItems:       'center',
    gap:              SPACING.sm,
    borderWidth:      1,
    borderColor:      T.border,
    width:            '100%',
  },
  hotSeatEmoji:  { fontSize: rf(44) },
  hotSeatTitle:  {
    fontSize:   rf(20),
    fontWeight: '700',
    color:      T.text,
    textAlign:  'center',
    fontFamily: 'PlayfairDisplay-Bold',
  },
  hotSeatBody: {
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    textAlign: 'center',
    lineHeight: rf(22),
    fontStyle: 'italic',
  },
  hotSeatCountdown: {
    fontSize:   FONT.xs,
    color:      T.textMuted,
    fontWeight: '600',
  },
  hotSeatButtons: {
    flexDirection: 'row',
    gap:           SPACING.sm,
    marginTop:     SPACING.xs,
    width:         '100%',
  },
  hotSeatDeclineBtn: {
    flex:            1,
    alignItems:      'center',
    paddingVertical: rp(13),
    borderRadius:    RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth:     1,
    borderColor:     T.border,
  },
  hotSeatDeclineText: {
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    fontWeight: '600',
  },
  hotSeatAcceptBtn: {
    flex:            2,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             SPACING.xs,
    paddingVertical: rp(13),
    borderRadius:    RADIUS.md,
    backgroundColor: T.primary,
  },
  hotSeatAcceptText: {
    fontSize:   FONT.md,
    fontWeight: '700',
    color:      '#fff',
  },

  // Gift sheet
  giftBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,8,15,0.7)',
    justifyContent:  'flex-end',
    zIndex:          20,
  },
  giftSheet: {
    backgroundColor:      T.surfaceAlt,
    borderTopLeftRadius:  RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding:              SPACING.lg,
    paddingBottom:        rs(40),
    gap:                  SPACING.sm,
    borderTopWidth:       1,
    borderColor:          T.border,
  },
  giftSheetHandle: {
    width:           rs(40),
    height:          rp(4),
    borderRadius:    rp(2),
    backgroundColor: T.border,
    alignSelf:       'center',
    marginBottom:    SPACING.xs,
  },
  giftSheetTitle: {
    fontSize:   FONT.lg,
    fontWeight: '700',
    color:      T.text,
    textAlign:  'center',
    fontFamily: 'PlayfairDisplay-Bold',
  },
  giftSheetSub: {
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  giftGrid: {
    flexDirection: 'row',
    gap:           SPACING.sm,
    marginTop:     SPACING.xs,
  },
  giftTile: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: T.surface,
    borderRadius:   RADIUS.md,
    borderWidth:    1,
    paddingVertical: SPACING.md,
    gap:            rp(4),
  },
  giftTileEmoji: { fontSize: rf(28) },
  giftTileLabel: {
    fontSize:   FONT.xs,
    color:      T.text,
    fontWeight: '600',
  },
  giftTilePrice: {
    fontSize: FONT.xs,
    color:    T.textMuted,
  },

  // Confession Drop
  confDropBackdrop: {
    flex:            1,
    backgroundColor: 'rgba(6,8,15,0.9)',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         SPACING.lg,
  },
  confDropSheet: {
    backgroundColor: T.surfaceAlt,
    borderRadius:    RADIUS.xl,
    padding:         SPACING.lg,
    alignItems:      'center',
    gap:             SPACING.sm,
    borderWidth:     1,
    borderColor:     T.border,
    width:           '100%',
  },
  confDropEmoji:  { fontSize: rf(36) },
  confDropTitle:  {
    fontSize:   rf(20),
    fontWeight: '700',
    color:      T.text,
    fontFamily: 'PlayfairDisplay-Bold',
  },
  confDropSub: {
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    textAlign: 'center',
    lineHeight: rf(20),
    fontStyle: 'italic',
  },
  confDropInput: {
    width:             '100%',
    backgroundColor:   'rgba(255,255,255,0.04)',
    borderRadius:      RADIUS.sm,
    padding:           SPACING.sm,
    fontSize:          FONT.md,
    color:             T.text,
    borderWidth:       1,
    borderColor:       T.border,
    minHeight:         rs(80),
    fontStyle:         'italic',
  },
  charCount: {
    fontSize:  FONT.xs,
    color:     T.textMuted,
    alignSelf: 'flex-end',
  },
  confDropSendBtn: {
    width:           '100%',
    alignItems:      'center',
    paddingVertical: rp(14),
    borderRadius:    RADIUS.md,
    marginTop:       SPACING.xs,
  },
  confDropSendText: {
    fontSize:   FONT.md,
    fontWeight: '700',
    color:      '#fff',
  },
  confDropCancelText: {
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    textAlign: 'center',
    paddingVertical: rp(6),
  },

  // Paywall
  paywallWrap: {
    alignItems:      'center',
    justifyContent:  'center',
    padding:         SPACING.lg,
    gap:             SPACING.md,
  },
  paywallEmoji: { fontSize: rf(52) },
  paywallTitle: {
    fontSize:   rf(24),
    fontWeight: '700',
    color:      T.text,
    textAlign:  'center',
    fontFamily: 'PlayfairDisplay-Bold',
  },
  paywallBody: {
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    textAlign: 'center',
    lineHeight: rf(22),
    fontStyle: 'italic',
  },
  paywallBtn: {
    marginTop:       SPACING.sm,
    paddingHorizontal: SPACING.xl ?? SPACING.lg,
    paddingVertical:   rp(14),
    borderRadius:    RADIUS.md,
  },
  paywallBtnText: {
    fontSize:   FONT.md,
    fontWeight: '700',
    color:      '#fff',
  },
  paywallLeave: {
    fontSize:  FONT.sm,
    color:     T.textMuted,
    fontStyle: 'italic',
  },
});
