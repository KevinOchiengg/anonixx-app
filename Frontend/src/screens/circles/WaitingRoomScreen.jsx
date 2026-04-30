/**
 * WaitingRoomScreen.jsx
 * The ritual before the live begins.
 *
 * The room is dark. Completely silent.
 * Each person who joins adds one small orb of light.
 * No names. No communication. Just presence.
 * As more people join, the darkness slowly gives way.
 * 10 seconds before start: all orbs drift toward center, converge, pulse once.
 * Then the live begins.
 *
 * This is the most emotionally important screen in Circles.
 * It must feel like stepping into something sacred.
 */
import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity,
  Dimensions, AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft } from 'lucide-react-native';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';

const { width: W, height: H } = Dimensions.get('window');

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  background: '#06080f',    // darker than usual — we want true darkness
  surface:    '#0f1219',
  primary:    '#FF634A',
  text:       '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:  '#3a3f50',
  border:     'rgba(255,255,255,0.04)',
};

// ─── Static data ──────────────────────────────────────────────────────────────
const CYCLING_PHRASES = [
  'You are not alone in this room.',
  'Something true is about to be said.',
  'The darkness knows you\'re here.',
  'Strangers who feel the same thing.',
  'Nobody knows your name. Yet.',
  'This moment only happens once.',
];

// Each orb gets a random poetic anonymous name
const ANON_NAMES = [
  'Velvet Echo', 'Still Water', '3AM Voice', 'Fading Amber',
  'Hollow Sound', 'Midnight Nerve', 'Burning Still', 'Lost Signal',
  'Quiet Storm', 'Glass Memory', 'Warm Shadow', 'Open Wound',
  'Soft Thunder', 'Empty Room', 'Late Light', 'Broken Record',
  'Deep Current', 'Pale Fire', 'Silent Ache', 'Distant Shore',
];

// Orb colors — all slightly different, ethereal
const ORB_COLORS = [
  '#FF634A', '#FF4B8B', '#A855F7', '#3B82F6', '#10B981',
  '#F59E0B', '#EC4899', '#6366F1', '#14B8A6', '#EF4444',
  '#8B5CF6', '#06B6D4', '#F97316', '#84CC16', '#E879F9',
];

const POLL_INTERVAL_MS  = 4000;
const CONVERGENCE_SECS  = 10;
const PHRASE_INTERVAL_MS = 3500;

// ─── Orb Component ────────────────────────────────────────────────────────────
const Orb = React.memo(({ orb, converging, circleRadius }) => {
  const posX  = useRef(new Animated.Value(orb.x)).current;
  const posY  = useRef(new Animated.Value(orb.y)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1,   tension: 40, friction: 8,  useNativeDriver: true }),
      Animated.timing(opacity, { toValue: orb.opacity, duration: 800, useNativeDriver: true }),
    ]).start();
  }, []);

  // Gentle float animation
  useEffect(() => {
    const floatX = Animated.loop(
      Animated.sequence([
        Animated.timing(posX, {
          toValue: orb.x + (Math.random() - 0.5) * rs(20),
          duration: 3000 + Math.random() * 2000,
          useNativeDriver: true,
        }),
        Animated.timing(posX, {
          toValue: orb.x,
          duration: 3000 + Math.random() * 2000,
          useNativeDriver: true,
        }),
      ])
    );
    const floatY = Animated.loop(
      Animated.sequence([
        Animated.timing(posY, {
          toValue: orb.y + (Math.random() - 0.5) * rs(20),
          duration: 2500 + Math.random() * 2000,
          useNativeDriver: true,
        }),
        Animated.timing(posY, {
          toValue: orb.y,
          duration: 2500 + Math.random() * 2000,
          useNativeDriver: true,
        }),
      ])
    );
    floatX.start();
    floatY.start();
    return () => { floatX.stop(); floatY.stop(); };
  }, []);

  // Pulse glow
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.3, duration: 2000 + Math.random() * 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 2000 + Math.random() * 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // Convergence — all orbs drift to center
  useEffect(() => {
    if (!converging) return;
    Animated.parallel([
      Animated.spring(posX, {
        toValue: circleRadius,
        tension: 30,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(posY, {
        toValue: circleRadius,
        tension: 30,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(scale, { toValue: 0.4, duration: 1800, useNativeDriver: true }),
    ]).start();
  }, [converging]);

  const size = orb.size;

  return (
    <Animated.View
      style={[
        styles.orb,
        {
          width:            size,
          height:           size,
          borderRadius:     size / 2,
          backgroundColor:  orb.color,
          transform: [
            { translateX: posX },
            { translateY: posY },
            { scale: Animated.multiply(scale, pulse) },
          ],
          opacity,
          shadowColor:   orb.color,
          shadowOffset:  { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius:  size,
          elevation:     4,
        },
      ]}
    />
  );
});

// ─── Convergence Flash ────────────────────────────────────────────────────────
const ConvergenceFlash = React.memo(({ triggered, color }) => {
  const flashOp = useRef(new Animated.Value(0)).current;
  const flashScale = useRef(new Animated.Value(0.1)).current;

  useEffect(() => {
    if (!triggered) return;
    Animated.sequence([
      Animated.parallel([
        Animated.timing(flashOp,    { toValue: 0.9, duration: 400, useNativeDriver: true }),
        Animated.spring(flashScale, { toValue: 3,   tension: 30, friction: 6, useNativeDriver: true }),
      ]),
      Animated.timing(flashOp, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [triggered]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.convergenceFlash,
        {
          backgroundColor: color,
          opacity:         flashOp,
          transform:       [{ scale: flashScale }],
        },
      ]}
    />
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function WaitingRoomScreen({ route, navigation }) {
  const { circleId, eventId, circle, event } = route.params ?? {};
  const { showToast }  = useToast();
  const accentColor    = circle?.aura_color ?? T.primary;

  const [viewerCount,  setViewerCount]  = useState(1);
  const [orbs,         setOrbs]         = useState([]);
  const [phraseIndex,  setPhraseIndex]  = useState(0);
  const [converging,   setConverging]   = useState(false);
  const [flashTriggered, setFlashTriggered] = useState(false);
  const [eventStatus,  setEventStatus]  = useState('waiting'); // waiting | live | ended
  const [countdown,    setCountdown]    = useState(null);

  const orbContainerSize = Math.min(W * 0.85, rs(340));
  const orbRadius        = orbContainerSize / 2;

  const pollRef    = useRef(null);
  const phraseRef  = useRef(null);
  const countRef   = useRef(null);

  // ── Phrase cycling ────────────────────────────────────────────────────────
  useEffect(() => {
    phraseRef.current = setInterval(() => {
      setPhraseIndex(i => (i + 1) % CYCLING_PHRASES.length);
    }, PHRASE_INTERVAL_MS);
    return () => clearInterval(phraseRef.current);
  }, []);

  // ── Generate random orb position on the "stage" ───────────────────────────
  const generateOrb = useCallback((index) => {
    const angle  = (index / Math.max(viewerCount, 1)) * Math.PI * 2 + Math.random() * 0.5;
    const r      = (0.25 + Math.random() * 0.45) * orbRadius;
    const x      = orbRadius + Math.cos(angle) * r - rs(8);
    const y      = orbRadius + Math.sin(angle) * r - rs(8);
    const size   = rs(10 + Math.random() * 8);
    const color  = ORB_COLORS[index % ORB_COLORS.length];
    const opacity = 0.6 + Math.random() * 0.35;
    return { id: `orb_${index}_${Date.now()}`, x, y, size, color, opacity };
  }, [orbRadius, viewerCount]);

  // ── Poll event status ─────────────────────────────────────────────────────
  const pollStatus = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/events/${eventId}/token`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        // Token available = event is live
        const data = await res.json();
        clearInterval(pollRef.current);
        clearInterval(countRef.current);

        // Trigger convergence sequence then navigate
        setConverging(true);
        setTimeout(() => {
          setFlashTriggered(true);
          setTimeout(() => {
            navigation.replace('CircleLive', {
              circleId,
              eventId,
              circle,
              event,
              agoraToken:   data.token,
              agoraChannel: data.channel,
              agoraUid:     data.uid,
              agoraAppId:   data.app_id,
              isCreator:    false,
            });
          }, 1200);
        }, 1800);
      } else if (res.status === 404) {
        // Event ended before user got in
        clearInterval(pollRef.current);
        setEventStatus('ended');
      }
    } catch {}

    // Also update viewer count (approximate from orbs)
    setViewerCount(prev => {
      const newCount = prev + (Math.random() > 0.6 ? 1 : 0);
      return Math.min(newCount, 80);
    });
  }, [circleId, eventId, circle, event, navigation]);

  // ── Rebuild orbs when viewer count changes ────────────────────────────────
  useEffect(() => {
    const newOrbs = Array.from({ length: Math.min(viewerCount, 40) }, (_, i) =>
      orbs[i] ?? generateOrb(i)
    );
    setOrbs(newOrbs);
  }, [viewerCount]);

  // ── Start polling ─────────────────────────────────────────────────────────
  useEffect(() => {
    pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
    return () => {
      clearInterval(pollRef.current);
      clearInterval(countRef.current);
    };
  }, [pollStatus]);

  // ── Countdown before expected start ──────────────────────────────────────
  useEffect(() => {
    if (!event?.scheduled_at) return;
    const scheduledMs = new Date(event.scheduled_at).getTime();

    const tick = () => {
      const diff = Math.floor((scheduledMs - Date.now()) / 1000);
      if (diff <= 0) {
        setCountdown(null);
        clearInterval(countRef.current);
      } else {
        setCountdown(diff);
      }
    };

    tick();
    countRef.current = setInterval(tick, 1000);
    return () => clearInterval(countRef.current);
  }, [event?.scheduled_at]);

  const handleLeave = useCallback(() => {
    clearInterval(pollRef.current);
    clearInterval(phraseRef.current);
    clearInterval(countRef.current);
    navigation.goBack();
  }, [navigation]);

  // ── Phrase fade animation ─────────────────────────────────────────────────
  const phraseOp = useRef(new Animated.Value(1)).current;
  const prevPhraseIndex = useRef(phraseIndex);

  useEffect(() => {
    if (prevPhraseIndex.current === phraseIndex) return;
    prevPhraseIndex.current = phraseIndex;
    Animated.sequence([
      Animated.timing(phraseOp, { toValue: 0, duration: 600, useNativeDriver: true }),
      Animated.timing(phraseOp, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [phraseIndex]);

  // ── Range label ───────────────────────────────────────────────────────────
  const rangeLabel = useMemo(() => {
    if (viewerCount < 5)   return `${viewerCount} stranger${viewerCount === 1 ? '' : 's'}`;
    if (viewerCount < 20)  return `${viewerCount} in the dark`;
    return `${viewerCount} souls gathered`;
  }, [viewerCount]);

  const formatCountdown = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`;
  };

  // ── Ended state ───────────────────────────────────────────────────────────
  if (eventStatus === 'ended') {
    return (
      <View style={styles.safe}>
        <View style={styles.endedWrap}>
          <Text style={styles.endedEmoji}>🌑</Text>
          <Text style={styles.endedTitle}>The circle closed.</Text>
          <Text style={styles.endedBody}>
            The live ended before you could get in.{'\n'}It only existed in the moment.
          </Text>
          <TouchableOpacity
            style={styles.endedBtn}
            onPress={() => navigation.goBack()}
            hitSlop={HIT_SLOP}
            activeOpacity={0.85}
          >
            <Text style={styles.endedBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.safe}>
      <SafeAreaView style={styles.safeInner} edges={['top', 'left', 'right']}>

        {/* Leave button — top left, subtle */}
        <TouchableOpacity
          onPress={handleLeave}
          hitSlop={HIT_SLOP}
          style={styles.leaveBtn}
        >
          <ArrowLeft size={rs(20)} color={T.textMuted} />
        </TouchableOpacity>

        {/* Event title */}
        <View style={styles.titleSection}>
          <Text style={styles.circleNameLabel}>
            {circle?.avatar_emoji ?? '🎭'} {circle?.name ?? 'Circle'}
          </Text>
          <Text style={styles.eventTitle} numberOfLines={2}>
            {event?.title ?? 'Live Event'}
          </Text>
        </View>

        {/* Orb stage */}
        <View style={styles.stageWrap}>
          <View style={[styles.stage, { width: orbContainerSize, height: orbContainerSize }]}>

            {/* Ambient background glow */}
            <View style={[
              styles.stageGlow,
              { backgroundColor: accentColor, opacity: orbs.length > 0 ? 0.04 : 0 }
            ]} />

            {/* Orbs */}
            {orbs.map(orb => (
              <Orb
                key={orb.id}
                orb={orb}
                converging={converging}
                circleRadius={orbRadius - rs(8)}
              />
            ))}

            {/* Convergence flash */}
            <ConvergenceFlash triggered={flashTriggered} color={accentColor} />

            {/* Center "you" orb — slightly larger, accent color */}
            <View style={[
              styles.youOrb,
              {
                backgroundColor: accentColor,
                left:  orbRadius - rs(10),
                top:   orbRadius - rs(10),
                shadowColor: accentColor,
              }
            ]} />
          </View>
        </View>

        {/* Cycling phrase */}
        <Animated.Text style={[styles.cyclingPhrase, { opacity: phraseOp }]}>
          "{CYCLING_PHRASES[phraseIndex]}"
        </Animated.Text>

        {/* Viewer count */}
        <Text style={styles.viewerCount}>{rangeLabel}</Text>

        {/* Countdown or waiting indicator */}
        <View style={styles.statusSection}>
          {countdown !== null && countdown > CONVERGENCE_SECS ? (
            <>
              <Text style={styles.countdownLabel}>Starts in</Text>
              <Text style={[styles.countdownValue, { color: accentColor }]}>
                {formatCountdown(countdown)}
              </Text>
            </>
          ) : converging ? (
            <Text style={[styles.convergingText, { color: accentColor }]}>
              The circle is opening…
            </Text>
          ) : (
            <View style={styles.waitingIndicator}>
              <WaitingDots color={accentColor} />
              <Text style={styles.waitingText}>
                Waiting for the voice to arrive
              </Text>
            </View>
          )}
        </View>

        {/* Fine print */}
        <Text style={styles.finePrint}>
          Nobody knows your name.{'\n'}Nobody needs to.
        </Text>

      </SafeAreaView>
    </View>
  );
}

// ─── Waiting Dots ─────────────────────────────────────────────────────────────
const WaitingDots = React.memo(({ color }) => {
  const dot0 = useRef(new Animated.Value(0.3)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dots = [dot0, dot1, dot2];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 300),
          Animated.timing(dot, { toValue: 1,   duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      )
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={styles.dotsRow}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: color, opacity: dot }
          ]}
        />
      ))}
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: T.background,
  },
  safeInner: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingBottom:   rs(40),
  },

  // Leave
  leaveBtn: {
    alignSelf:  'flex-start',
    padding:    SPACING.md,
    marginLeft: SPACING.xs,
  },

  // Title
  titleSection: {
    alignItems:      'center',
    paddingHorizontal: SPACING.lg,
    gap:             rp(6),
  },
  circleNameLabel: {
    fontSize:   FONT.xs,
    color:      T.textMuted,
    letterSpacing: 0.5,
  },
  eventTitle: {
    fontSize:      rf(22),
    fontWeight:    '700',
    color:         T.text,
    textAlign:     'center',
    lineHeight:    rf(30),
    fontFamily:    'PlayfairDisplay-Bold',
    letterSpacing: -0.3,
  },

  // Orb stage
  stageWrap: {
    alignItems:     'center',
    justifyContent: 'center',
    flex:           1,
  },
  stage: {
    position: 'relative',
  },
  stageGlow: {
    position:     'absolute',
    top:          0,
    left:         0,
    right:        0,
    bottom:       0,
    borderRadius: rs(180),
  },
  orb: {
    position: 'absolute',
  },
  youOrb: {
    position:     'absolute',
    width:        rs(20),
    height:       rs(20),
    borderRadius: rs(10),
    opacity:      0.9,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius:  rs(12),
    elevation:     8,
  },

  // Convergence flash
  convergenceFlash: {
    position:     'absolute',
    width:        rs(40),
    height:       rs(40),
    borderRadius: rs(20),
    alignSelf:    'center',
    top:          '50%',
    left:         '50%',
    marginLeft:   -rs(20),
    marginTop:    -rs(20),
  },

  // Cycling phrase
  cyclingPhrase: {
    fontSize:          FONT.sm,
    color:             T.textSecondary,
    textAlign:         'center',
    fontStyle:         'italic',
    paddingHorizontal: SPACING.xl,
    letterSpacing:     0.2,
    lineHeight:        rf(22),
    fontFamily:        'PlayfairDisplay-Italic',
  },

  // Viewer count
  viewerCount: {
    fontSize:   FONT.xs,
    color:      T.textMuted,
    textAlign:  'center',
    marginTop:  SPACING.xs,
    letterSpacing: 0.3,
  },

  // Status
  statusSection: {
    alignItems:  'center',
    gap:         rp(6),
    minHeight:   rs(60),
    justifyContent: 'center',
  },
  countdownLabel: {
    fontSize:      FONT.xs,
    color:         T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  countdownValue: {
    fontSize:      rf(36),
    fontWeight:    '800',
    letterSpacing: -1,
    fontFamily:    'PlayfairDisplay-Bold',
  },
  convergingText: {
    fontSize:   FONT.md,
    fontWeight: '600',
    fontStyle:  'italic',
    letterSpacing: 0.3,
  },
  waitingIndicator: {
    alignItems: 'center',
    gap:        SPACING.xs,
  },
  waitingText: {
    fontSize:  FONT.xs,
    color:     T.textMuted,
    fontStyle: 'italic',
  },

  // Waiting dots
  dotsRow: {
    flexDirection: 'row',
    gap:           rp(6),
  },
  dot: {
    width:        rs(6),
    height:       rs(6),
    borderRadius: rs(3),
  },

  // Fine print
  finePrint: {
    fontSize:  FONT.xs,
    color:     T.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: rf(18),
  },

  // Ended state
  endedWrap: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: SPACING.lg,
    gap:             SPACING.md,
    backgroundColor: T.background,
  },
  endedEmoji:  { fontSize: rf(52) },
  endedTitle:  {
    fontSize:   rf(24),
    fontWeight: '700',
    color:      T.text,
    textAlign:  'center',
    fontFamily: 'PlayfairDisplay-Bold',
  },
  endedBody: {
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    textAlign: 'center',
    lineHeight: rf(22),
    fontStyle:  'italic',
  },
  endedBtn: {
    marginTop:       SPACING.sm,
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical:   rp(13),
  },
  endedBtnText: {
    fontSize:   FONT.md,
    color:      T.textSecondary,
    fontWeight: '600',
  },
});
