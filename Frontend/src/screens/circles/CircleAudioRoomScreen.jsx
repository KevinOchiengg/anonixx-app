/**
 * CircleAudioRoomScreen.jsx
 * The always-on anonymous audio room.
 * No cameras. No faces. Just voices in the dark.
 *
 * Creator/admins speak freely.
 * Members raise their hand to speak.
 * Everyone else listens.
 *
 * Design: Radio station at 2am. Dark, intimate, alive.
 * Voices are represented as pulsing auras — no names, no photos.
 * The room breathes with the conversation.
 */
import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ScrollView, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Mic, MicOff, Hand, Users, X } from 'lucide-react-native';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

const { width: W } = Dimensions.get('window');

// ─── Static data ──────────────────────────────────────────────────────────────
const SPEAKER_COLORS = [
  '#FF634A', '#FF4B8B', '#A855F7', '#3B82F6',
  '#10B981', '#F59E0B', '#EC4899', '#14B8A6',
];

const ROOM_PHRASES = [
  'The room is listening.',
  'Something true is being said.',
  'Voices without faces.',
  'You can speak here.',
  'Nobody knows who you are.',
];

const POLL_MS = 5000;

// ─── Speaker Aura ─────────────────────────────────────────────────────────────
const SpeakerAura = React.memo(({ speaker, index, isSpeaking, isCreator }) => {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const entranceScale = useRef(new Animated.Value(0)).current;
  const entranceOp    = useRef(new Animated.Value(0)).current;

  // Entrance
  useEffect(() => {
    Animated.parallel([
      Animated.spring(entranceScale, {
        toValue: 1, delay: index * 80,
        tension: 60, friction: 8, useNativeDriver: true,
      }),
      Animated.timing(entranceOp, {
        toValue: 1, duration: 350,
        delay: index * 80, useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Speaking pulse
  useEffect(() => {
    if (!isSpeaking) {
      pulseScale.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.15, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1,    duration: 400, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isSpeaking]);

  const color  = SPEAKER_COLORS[index % SPEAKER_COLORS.length];
  const size   = rs(isCreator ? 72 : 58);

  return (
    <Animated.View style={[
      styles.speakerWrap,
      { opacity: entranceOp, transform: [{ scale: entranceScale }] }
    ]}>
      {/* Pulse rings when speaking */}
      {isSpeaking && (
        <>
          <Animated.View style={[
            styles.speakerRing,
            {
              width:        size + rs(16),
              height:       size + rs(16),
              borderRadius: (size + rs(16)) / 2,
              borderColor:  color,
              marginLeft:   -rs(8),
              marginTop:    -rs(8),
              transform:    [{ scale: pulseScale }],
              opacity:      0.4,
            }
          ]} />
          <Animated.View style={[
            styles.speakerRing,
            {
              width:        size + rs(30),
              height:       size + rs(30),
              borderRadius: (size + rs(30)) / 2,
              borderColor:  color,
              marginLeft:   -rs(15),
              marginTop:    -rs(15),
              transform:    [{ scale: pulseScale }],
              opacity:      0.2,
            }
          ]} />
        </>
      )}

      {/* Avatar circle */}
      <Animated.View style={[
        styles.speakerAvatar,
        {
          width:           size,
          height:          size,
          borderRadius:    size / 2,
          backgroundColor: color + '20',
          borderColor:     isSpeaking ? color : color + '40',
          borderWidth:     isSpeaking ? 2 : 1,
          transform:       [{ scale: pulseScale }],
        }
      ]}>
        <Text style={{ fontSize: rf(isCreator ? 28 : 22) }}>
          {speaker.emoji ?? '🎭'}
        </Text>
        {isCreator && (
          <View style={[styles.crownBadge, { backgroundColor: color }]}>
            <Text style={styles.crownEmoji}>👑</Text>
          </View>
        )}
      </Animated.View>

      {/* Mute indicator */}
      {speaker.muted && (
        <View style={styles.mutedBadge}>
          <MicOff size={rs(10)} color={T.textMuted} />
        </View>
      )}

      {/* Anonymous name */}
      <Text style={[styles.speakerName, { color: isSpeaking ? color : T.textMuted }]}>
        {speaker.anon_name ?? 'Listener'}
      </Text>
    </Animated.View>
  );
});

// ─── Listener Orb ─────────────────────────────────────────────────────────────
const ListenerOrb = React.memo(({ index, color }) => {
  const floatY  = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  // Stable random values — computed once at mount, not on every render
  const size        = useRef(rs(10 + Math.random() * 6)).current;
  const targetOp    = useRef(0.5 + Math.random() * 0.3).current;
  const floatTarget = useRef(-rs(4 + Math.random() * 4)).current;
  const floatDur1   = useRef(2000 + Math.random() * 1000).current;
  const floatDur2   = useRef(2000 + Math.random() * 1000).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: targetOp,
      duration: 600,
      delay: index * 40,
      useNativeDriver: true,
    }).start();

    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, {
          toValue:  floatTarget,
          duration: floatDur1,
          useNativeDriver: true,
        }),
        Animated.timing(floatY, {
          toValue:  0,
          duration: floatDur2,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={[
      styles.listenerOrb,
      {
        width:           size,
        height:          size,
        borderRadius:    size / 2,
        backgroundColor: color,
        opacity,
        shadowColor:     color,
        shadowOpacity:   0.6,
        shadowRadius:    size / 2,
        transform:       [{ translateY: floatY }],
      }
    ]} />
  );
});

// ─── Hand Raise Row (creator only) ────────────────────────────────────────────
const HandRaiseRow = React.memo(({ count, onViewRaises }) => {
  if (count === 0) return null;
  const bounceAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: 1.12, duration: 400, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 1,    duration: 400, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <TouchableOpacity
      style={styles.handRaiseBanner}
      onPress={onViewRaises}
      hitSlop={HIT_SLOP}
      activeOpacity={0.85}
    >
      <Animated.Text style={[
        styles.handRaiseEmoji,
        { transform: [{ scale: bounceAnim }] }
      ]}>✋</Animated.Text>
      <Text style={styles.handRaiseText}>
        {count} {count === 1 ? 'person wants' : 'people want'} to speak
      </Text>
      <Text style={styles.handRaiseAction}>Approve →</Text>
    </TouchableOpacity>
  );
});

// ─── Whisper Bar ──────────────────────────────────────────────────────────────
const WhisperBar = React.memo(({ onSend }) => {
  const [text,   setText]   = useState('');
  const [active, setActive] = useState(false);

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
    setActive(false);
  }, [text, onSend]);

  if (!active) {
    return (
      <TouchableOpacity
        onPress={() => setActive(true)}
        style={styles.whisperBarToggle}
        hitSlop={HIT_SLOP}
      >
        <Text style={styles.whisperBarPlaceholder}>whisper to the room…</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.whisperBarRow}>
      <TextInput
        value={text}
        onChangeText={t => setText(t.slice(0, 30))}
        placeholder="say it…"
        placeholderTextColor={T.textMuted}
        style={styles.whisperBarInput}
        autoFocus
        maxLength={30}
        returnKeyType="send"
        onSubmitEditing={handleSend}
      />
      <TouchableOpacity
        onPress={handleSend}
        disabled={!text.trim()}
        style={[styles.whisperBarSend, !text.trim() && { opacity: 0.4 }]}
        hitSlop={HIT_SLOP}
      >
        <Text style={styles.whisperBarSendText}>↑</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => { setActive(false); setText(''); }}
        hitSlop={HIT_SLOP}
        style={styles.whisperBarClose}
      >
        <X size={rs(16)} color={T.textMuted} />
      </TouchableOpacity>
    </View>
  );
});

// ─── Whisper Float ────────────────────────────────────────────────────────────
const WhisperFloat = React.memo(({ whisper, onDone }) => {
  const opacity   = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1,    duration: 300,  useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -rs(30), duration: 3500, useNativeDriver: true }),
      ]),
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => onDone(whisper.id));
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.whisperFloat,
        { left: whisper.x, top: whisper.y, opacity, transform: [{ translateY }] }
      ]}
    >
      <Text style={styles.whisperFloatText}>{whisper.text}</Text>
    </Animated.View>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CircleAudioRoomScreen({ route, navigation }) {
  const { circleId, circle } = route.params ?? {};
  const { showToast }        = useToast();
  const accentColor          = circle?.aura_color ?? T.primary;
  const isCreator            = circle?.is_creator ?? false;
  const isAdmin              = circle?.is_admin   ?? false;
  const canManage            = isCreator || isAdmin;

  const [roomStatus,   setRoomStatus]   = useState(null);
  const [speakers,     setSpeakers]     = useState([]);
  const [listenerCount, setListenerCount] = useState(0);
  const [isMuted,      setIsMuted]      = useState(true);
  const [myHandStatus, setMyHandStatus] = useState(null); // null | pending | approved
  const [pendingRaises, setPendingRaises] = useState(0);
  const [isKicked,     setIsKicked]     = useState(false);
  const [whispers,     setWhispers]     = useState([]);
  const [phraseIndex,  setPhraseIndex]  = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [closingRoom,  setClosingRoom]  = useState(false);
  const [showRaises,   setShowRaises]   = useState(false);
  const [pendingList,  setPendingList]  = useState([]);

  const agoraEngine  = useRef(null);
  const pollRef      = useRef(null);
  const phraseRef    = useRef(null);
  const headerOp     = useRef(new Animated.Value(0)).current;
  const stageOp      = useRef(new Animated.Value(0)).current;
  const phraseOp     = useRef(new Animated.Value(1)).current;

  // Entrance
  useEffect(() => {
    Animated.sequence([
      Animated.timing(headerOp, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(stageOp,  { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  // Phrase cycling
  useEffect(() => {
    phraseRef.current = setInterval(() => {
      Animated.sequence([
        Animated.timing(phraseOp, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(phraseOp, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]).start();
      setPhraseIndex(i => (i + 1) % ROOM_PHRASES.length);
    }, 4000);
    return () => clearInterval(phraseRef.current);
  }, []);

  // ── Fetch room token + init Agora ─────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        // Request microphone permission first
        if (Platform.OS !== 'web') {
          const { Audio } = await import('expo-av');
          const { status } = await Audio.requestPermissionsAsync();
          if (status !== 'granted') {
            showToast({ type: 'error', message: 'Microphone permission is required to join the room.' });
            navigation.goBack();
            return;
          }
        }

        const token = await AsyncStorage.getItem('token');
        const res   = await fetch(
          `${API_BASE_URL}/api/v1/circles/${circleId}/room/token`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showToast({ type: 'error', message: err.detail || 'Could not join the room.' });
          navigation.goBack();
          return;
        }
        const data = await res.json();

        try {
          const {
            createAgoraRtcEngine,
            ChannelProfileType,
            ClientRoleType,
          } = await import('react-native-agora');

          const engine = createAgoraRtcEngine();
          agoraEngine.current = engine;
          engine.initialize({ appId: data.app_id });
          engine.enableAudio();
          engine.setChannelProfile(
            ChannelProfileType.ChannelProfileLiveBroadcasting
          );
          engine.setClientRole(
            data.role === 'publisher'
              ? ClientRoleType.ClientRoleBroadcaster
              : ClientRoleType.ClientRoleAudience
          );
          engine.muteLocalAudioStream(data.role !== 'publisher');
          engine.joinChannel(data.token, data.channel, data.uid, {});

          if (data.role === 'publisher') setIsMuted(false);
        } catch {
          // Expo Go — Agora unavailable, UI still renders
        }
      } catch {
        showToast({ type: 'error', message: 'Could not join the room.' });
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    init();

    return () => {
      try {
        agoraEngine.current?.leaveChannel();
        agoraEngine.current?.release();
      } catch {}
    };
  }, [circleId, navigation, showToast]);

  // ── Poll room status ──────────────────────────────────────────────────────
  const pollRoomStatus = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/room/status`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setRoomStatus(data);
        setPendingRaises(data.pending_raises ?? 0);
        setMyHandStatus(data.my_hand_status ?? null);
        setIsKicked(data.is_kicked ?? false);
        setListenerCount(data.speaker_count ?? 1);

        if (data.is_kicked) {
          clearInterval(pollRef.current);
          showToast({ type: 'error', message: 'You were removed from the room.' });
          navigation.goBack();
        }

        if (!data.room_open) {
          clearInterval(pollRef.current);
          showToast({ type: 'success', message: 'The room has closed.' });
          navigation.goBack();
        }
      }
    } catch {}
  }, [circleId, navigation, showToast]);

  useEffect(() => {
    pollRoomStatus();
    pollRef.current = setInterval(pollRoomStatus, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [pollRoomStatus]);

  // ── Upgrade Agora role when hand raise is approved ────────────────────────
  const prevHandStatus = useRef(null);
  useEffect(() => {
    const prev = prevHandStatus.current;
    prevHandStatus.current = myHandStatus;

    if (prev !== 'approved' && myHandStatus === 'approved' && agoraEngine.current) {
      (async () => {
        try {
          const { ClientRoleType } = await import('react-native-agora');
          agoraEngine.current.setClientRole(ClientRoleType.ClientRoleBroadcaster);
          agoraEngine.current.muteLocalAudioStream(false);
          setIsMuted(false);
          showToast({ type: 'success', message: "You're now a speaker. Unmuted!" });
        } catch {}
      })();
    }
  }, [myHandStatus, showToast]);

  // ── Raise / lower hand ────────────────────────────────────────────────────
  const handleRaiseHand = useCallback(async () => {
    if (myHandStatus === 'pending') return;
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/room/raise`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        setMyHandStatus('pending');
        showToast({ type: 'success', message: 'Hand raised. Waiting for the host.' });
      }
    } catch {}
  }, [circleId, myHandStatus, showToast]);

  // ── Mute toggle ───────────────────────────────────────────────────────────
  const handleMuteToggle = useCallback(() => {
    try { agoraEngine.current?.muteLocalAudioStream(!isMuted); } catch {}
    setIsMuted(prev => !prev);
  }, [isMuted]);

  // ── Load pending raises ───────────────────────────────────────────────────
  const handleViewRaises = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/room/raises`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setPendingList(data.raises || []);
      }
    } catch {}
    setShowRaises(true);
  }, [circleId]);

  const handleApprove = useCallback(async (userId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/room/approve/${userId}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        showToast({ type: 'success', message: 'Speaker approved.' });
        setPendingList(prev => prev.filter(u => u.id !== userId));
        setPendingRaises(prev => Math.max(0, prev - 1));
      }
    } catch {}
  }, [circleId, showToast]);

  // ── Close room ────────────────────────────────────────────────────────────
  const handleCloseRoom = useCallback(async () => {
    setClosingRoom(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/room/close`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        try { agoraEngine.current?.leaveChannel(); } catch {}
        navigation.goBack();
      } else {
        showToast({ type: 'error', message: 'Could not close room.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not close room.' });
    } finally {
      setClosingRoom(false);
    }
  }, [circleId, navigation, showToast]);

  // ── Leave room ────────────────────────────────────────────────────────────
  const handleLeave = useCallback(() => {
    clearInterval(pollRef.current);
    try { agoraEngine.current?.leaveChannel(); } catch {}
    navigation.goBack();
  }, [navigation]);

  // ── Send whisper ──────────────────────────────────────────────────────────
  const handleSendWhisper = useCallback((text) => {
    const id = `w_${Date.now()}`;
    const x  = rs(20) + Math.random() * (W - rs(160));
    const y  = rs(200) + Math.random() * rs(100);
    setWhispers(prev => [...prev.slice(-8), { id, text, x, y }]);
  }, []);

  const removeWhisper = useCallback((id) => {
    setWhispers(prev => prev.filter(w => w.id !== id));
  }, []);

  // ── Build speaker list (placeholder until RTM) ────────────────────────────
  const displaySpeakers = speakers.length > 0 ? speakers : [
    {
      id:        'creator',
      emoji:     circle?.avatar_emoji ?? '🎭',
      anon_name: 'The Voice',
      muted:     false,
      speaking:  true,
    },
  ];

  const listenerOrbs = Array.from(
    { length: Math.min(listenerCount, 30) }, (_, i) => i
  );

  // ──────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color={accentColor} />
        <Text style={styles.loadingText}>Stepping into the room…</Text>
      </View>
    );
  }

  return (
    <View style={styles.safe}>

      {/* Atmospheric background */}
      <View style={[styles.bgGlow, { backgroundColor: accentColor }]} />

      <SafeAreaView style={styles.safeInner} edges={['top', 'left', 'right', 'bottom']}>

        {/* ── Header ── */}
        <Animated.View style={[styles.header, { opacity: headerOp }]}>
          <TouchableOpacity
            onPress={handleLeave}
            hitSlop={HIT_SLOP}
            style={styles.backBtn}
          >
            <ArrowLeft size={rs(22)} color={T.text} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <View style={[styles.openDot, { backgroundColor: T.open }]} />
            <Text style={styles.headerTitle} numberOfLines={1}>
              {circle?.name ?? 'Room'}
            </Text>
          </View>

          {canManage ? (
            <TouchableOpacity
              onPress={handleCloseRoom}
              disabled={closingRoom}
              hitSlop={HIT_SLOP}
              style={styles.closeRoomBtn}
            >
              {closingRoom
                ? <ActivityIndicator size="small" color={T.textMuted} />
                : <Text style={styles.closeRoomText}>Close</Text>
              }
            </TouchableOpacity>
          ) : (
            <View style={{ width: rs(52) }} />
          )}
        </Animated.View>

        {/* ── Hand raise banner (creator/admin) ── */}
        {canManage && (
          <HandRaiseRow
            count={pendingRaises}
            onViewRaises={handleViewRaises}
          />
        )}

        {/* ── Stage — speakers ── */}
        <Animated.View style={[styles.stage, { opacity: stageOp }]}>
          <ScrollView
            horizontal={false}
            contentContainerStyle={styles.speakersGrid}
            showsVerticalScrollIndicator={false}
          >
            {displaySpeakers.map((speaker, i) => (
              <SpeakerAura
                key={speaker.id ?? i}
                speaker={speaker}
                index={i}
                isSpeaking={speaker.speaking && !speaker.muted}
                isCreator={i === 0}
              />
            ))}
          </ScrollView>

          {/* Cycling phrase */}
          <Animated.Text style={[styles.roomPhrase, { opacity: phraseOp }]}>
            "{ROOM_PHRASES[phraseIndex]}"
          </Animated.Text>
        </Animated.View>

        {/* ── Listener orbs section ── */}
        <View style={styles.listenersSection}>
          <View style={styles.listenersMeta}>
            <Users size={rs(13)} color={T.textMuted} />
            <Text style={styles.listenersCount}>
              {listenerCount} listening
            </Text>
          </View>
          <View style={styles.orbsRow}>
            {listenerOrbs.map(i => (
              <ListenerOrb
                key={i}
                index={i}
                color={SPEAKER_COLORS[i % SPEAKER_COLORS.length]}
              />
            ))}
          </View>
        </View>

        {/* ── Whisper floats ── */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {whispers.map(w => (
            <WhisperFloat key={w.id} whisper={w} onDone={removeWhisper} />
          ))}
        </View>

        {/* ── Bottom controls ── */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.bottomSection}
        >
          {/* Whisper bar */}
          <WhisperBar onSend={handleSendWhisper} />

          {/* Action row */}
          <View style={styles.actionRow}>

            {/* Mute — only for approved speakers / creator */}
            {(canManage || myHandStatus === 'approved') && (
              <TouchableOpacity
                style={[styles.actionBtn, isMuted && styles.actionBtnMuted]}
                onPress={handleMuteToggle}
                hitSlop={HIT_SLOP}
                activeOpacity={0.85}
              >
                {isMuted
                  ? <MicOff size={rs(22)} color="#EF4444" />
                  : <Mic    size={rs(22)} color={T.text} />
                }
                <Text style={[styles.actionBtnLabel, isMuted && { color: '#EF4444' }]}>
                  {isMuted ? 'Unmute' : 'Mute'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Hand raise — non-speakers only */}
            {!canManage && myHandStatus !== 'approved' && (
              <TouchableOpacity
                style={[
                  styles.raiseHandBtn,
                  myHandStatus === 'pending' && {
                    backgroundColor: accentColor + '18',
                    borderColor:     accentColor + '40',
                  }
                ]}
                onPress={handleRaiseHand}
                disabled={myHandStatus === 'pending'}
                hitSlop={HIT_SLOP}
                activeOpacity={0.85}
              >
                <Hand size={rs(20)} color={
                  myHandStatus === 'pending' ? accentColor : T.textSecondary
                } />
                <Text style={[
                  styles.raiseHandLabel,
                  myHandStatus === 'pending' && { color: accentColor },
                ]}>
                  {myHandStatus === 'pending' ? 'Hand raised…' : 'Ask to speak'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Approved — on stage */}
            {!canManage && myHandStatus === 'approved' && (
              <View style={[styles.onStageBadge, { borderColor: accentColor + '40' }]}>
                <View style={[styles.onStageDot, { backgroundColor: accentColor }]} />
                <Text style={[styles.onStageText, { color: accentColor }]}>
                  You're on stage
                </Text>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>

      </SafeAreaView>

      {/* ── Pending raises sheet ── */}
      {showRaises && (
        <View style={styles.raisesBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setShowRaises(false)}
            activeOpacity={1}
          />
          <View style={styles.raisesSheet}>
            <View style={styles.raisesHandle} />
            <Text style={styles.raisesTitle}>
              {pendingRaises} want{pendingRaises === 1 ? 's' : ''} to speak
            </Text>
            {pendingList.length === 0 ? (
              <Text style={styles.raisesEmpty}>
                Pending raises will appear here.
              </Text>
            ) : (
              pendingList.map(u => (
                <View key={u.id} style={styles.raiseRow}>
                  <Text style={styles.raiseRowName}>{u.anon_name}</Text>
                  <TouchableOpacity
                    style={[styles.approveBtn, { backgroundColor: accentColor }]}
                    onPress={() => handleApprove(u.id)}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.approveBtnText}>Let them speak</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <TouchableOpacity
              onPress={() => setShowRaises(false)}
              hitSlop={HIT_SLOP}
              style={styles.raisesClose}
            >
              <Text style={styles.raisesCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: T.background },
  centered:{ justifyContent: 'center', alignItems: 'center' },
  safeInner: { flex: 1 },

  loadingText: {
    marginTop: SPACING.sm,
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    fontStyle: 'italic',
  },

  // Background
  bgGlow: {
    position:     'absolute',
    top:          -rs(120),
    alignSelf:    'center',
    width:        W * 1.4,
    height:       rs(300),
    opacity:      0.04,
    borderRadius: rs(150),
  },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  backBtn: { padding: rp(4) },
  headerCenter: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.xs,
    flex:          1,
    justifyContent: 'center',
  },
  openDot: {
    width:        rs(8),
    height:       rs(8),
    borderRadius: rs(4),
  },
  headerTitle: {
    fontSize:   FONT.md,
    fontWeight: '700',
    color:      T.text,
    fontFamily: 'PlayfairDisplay-Bold',
  },
  closeRoomBtn: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius:    RADIUS.xs,
    borderWidth:     1,
    borderColor:     'rgba(239,68,68,0.25)',
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(6),
  },
  closeRoomText: {
    fontSize:   FONT.xs,
    color:      '#EF4444',
    fontWeight: '700',
  },

  // Hand raise banner
  handRaiseBanner: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SPACING.xs,
    backgroundColor: 'rgba(255,99,74,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: T.primaryBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(10),
  },
  handRaiseEmoji: { fontSize: rf(16) },
  handRaiseText: {
    flex:     1,
    fontSize: FONT.sm,
    color:    T.text,
  },
  handRaiseAction: {
    fontSize:   FONT.xs,
    color:      T.primary,
    fontWeight: '700',
  },

  // Stage
  stage: {
    flex:    1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    gap:     SPACING.lg,
  },
  speakersGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    justifyContent: 'center',
    gap:            SPACING.lg,
    paddingVertical: SPACING.md,
  },

  // Speaker
  speakerWrap: {
    alignItems: 'center',
    gap:        rp(8),
    position:   'relative',
  },
  speakerRing: {
    position:  'absolute',
    borderWidth: 1.5,
    top:       0,
    left:      0,
  },
  speakerAvatar: {
    alignItems:     'center',
    justifyContent: 'center',
    position:       'relative',
  },
  crownBadge: {
    position:      'absolute',
    bottom:        -rp(4),
    right:         -rp(4),
    width:         rs(20),
    height:        rs(20),
    borderRadius:  rs(10),
    alignItems:    'center',
    justifyContent: 'center',
  },
  crownEmoji: { fontSize: rf(10) },
  mutedBadge: {
    position:        'absolute',
    top:             -rp(4),
    right:           -rp(4),
    backgroundColor: T.surface,
    borderRadius:    rs(8),
    width:           rs(16),
    height:          rs(16),
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     T.border,
  },
  speakerName: {
    fontSize:   FONT.xs,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // Room phrase
  roomPhrase: {
    fontSize:   FONT.sm,
    color:      T.textMuted,
    fontStyle:  'italic',
    textAlign:  'center',
    paddingHorizontal: SPACING.lg,
    fontFamily: 'PlayfairDisplay-Italic',
  },

  // Listeners section
  listenersSection: {
    paddingHorizontal: SPACING.md,
    paddingBottom:     SPACING.sm,
    gap:               SPACING.xs,
  },
  listenersMeta: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(5),
  },
  listenersCount: {
    fontSize: FONT.xs,
    color:    T.textMuted,
  },
  orbsRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           rp(6),
  },
  listenerOrb: {
    shadowOffset: { width: 0, height: 0 },
    elevation:    3,
  },

  // Whisper float
  whisperFloat: {
    position:        'absolute',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius:    RADIUS.sm,
    paddingHorizontal: rp(10),
    paddingVertical:   rp(5),
    maxWidth:        W * 0.55,
  },
  whisperFloatText: {
    fontSize:  FONT.xs,
    color:     T.text,
    fontStyle: 'italic',
  },

  // Bottom section
  bottomSection: {
    paddingHorizontal: SPACING.md,
    paddingBottom:     SPACING.sm,
    gap:               SPACING.sm,
    borderTopWidth:    1,
    borderTopColor:    T.border,
    paddingTop:        SPACING.sm,
  },

  // Whisper bar
  whisperBarToggle: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.sm,
    borderWidth:     1,
    borderColor:     T.border,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(10),
  },
  whisperBarPlaceholder: {
    fontSize:  FONT.sm,
    color:     T.textMuted,
    fontStyle: 'italic',
  },
  whisperBarRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.xs,
  },
  whisperBarInput: {
    flex:              1,
    backgroundColor:   T.surface,
    borderRadius:      RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(10),
    fontSize:          FONT.sm,
    color:             T.text,
    borderWidth:       1,
    borderColor:       T.border,
    fontStyle:         'italic',
  },
  whisperBarSend: {
    width:           rs(36),
    height:          rs(36),
    borderRadius:    rs(18),
    backgroundColor: T.primary,
    alignItems:      'center',
    justifyContent:  'center',
  },
  whisperBarSendText: {
    fontSize:   FONT.md,
    color:      '#fff',
    fontWeight: '700',
  },
  whisperBarClose: {
    width:           rs(36),
    height:          rs(36),
    borderRadius:    rs(18),
    backgroundColor: T.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
  },

  // Action row
  actionRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SPACING.sm,
    justifyContent:  'center',
  },
  actionBtn: {
    alignItems:      'center',
    justifyContent:  'center',
    gap:             rp(4),
    backgroundColor: T.surfaceAlt,
    borderWidth:     1,
    borderColor:     T.border,
    borderRadius:    RADIUS.md,
    paddingVertical:   rp(10),
    paddingHorizontal: SPACING.md,
  },
  actionBtnMuted: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderColor:     'rgba(239,68,68,0.25)',
  },
  actionBtnLabel: {
    fontSize:   FONT.xs,
    color:      T.textSecondary,
    fontWeight: '600',
  },
  raiseHandBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SPACING.xs,
    backgroundColor: T.surfaceAlt,
    borderWidth:     1,
    borderColor:     T.border,
    borderRadius:    RADIUS.md,
    paddingVertical:   rp(12),
    paddingHorizontal: SPACING.md,
    flex:            1,
    justifyContent:  'center',
  },
  raiseHandLabel: {
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    fontWeight: '600',
  },
  onStageBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SPACING.xs,
    backgroundColor: T.surfaceAlt,
    borderWidth:     1,
    borderRadius:    RADIUS.md,
    paddingVertical:   rp(12),
    paddingHorizontal: SPACING.md,
    flex:            1,
    justifyContent:  'center',
  },
  onStageDot: {
    width:        rs(8),
    height:       rs(8),
    borderRadius: rs(4),
  },
  onStageText: {
    fontSize:   FONT.sm,
    fontWeight: '700',
  },

  // Raises sheet
  raisesBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,8,15,0.75)',
    justifyContent:  'flex-end',
    zIndex:          20,
  },
  raisesSheet: {
    backgroundColor:      T.surfaceAlt,
    borderTopLeftRadius:  RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding:              SPACING.lg,
    paddingBottom:        rs(40),
    gap:                  SPACING.sm,
    borderTopWidth:       1,
    borderColor:          T.border,
  },
  raisesHandle: {
    width:           rs(40),
    height:          rp(4),
    borderRadius:    rp(2),
    backgroundColor: T.border,
    alignSelf:       'center',
    marginBottom:    SPACING.xs,
  },
  raisesTitle: {
    fontSize:   FONT.lg,
    fontWeight: '700',
    color:      T.text,
    fontFamily: 'PlayfairDisplay-Bold',
  },
  raisesEmpty: {
    fontSize:  FONT.sm,
    color:     T.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  raiseRow: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  raiseRowName: {
    fontSize:   FONT.sm,
    color:      T.text,
    fontWeight: '600',
  },
  approveBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(8),
    borderRadius:      RADIUS.xs,
  },
  approveBtnText: {
    fontSize:   FONT.xs,
    fontWeight: '700',
    color:      '#fff',
  },
  raisesClose: {
    alignItems:    'center',
    paddingVertical: SPACING.xs,
    marginTop:     SPACING.xs,
  },
  raisesCloseText: {
    fontSize: FONT.sm,
    color:    T.textMuted,
  },
});
