/**
 * VibeScoreScreen
 *
 * Your vibe score, tier, admirer count, confession streak, and event breakdown.
 *
 * Rebuilt to the DropsComposeScreen design language:
 *   • shared `T` palette
 *   • DropScreenHeader
 *   • responsive.js spacing + typography
 *   • PlayfairDisplay-Italic for score/tier/section titles, DMSans for chrome
 *   • 320 ms entrance fade
 *   • tier-specific color on the hero + roadmap preserved
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Eye, Flame, Heart, Star, Zap, Calendar,
} from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP,
} from '../../utils/responsive';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';

// ─── Static data ──────────────────────────────────────────────
const TIERS = [
  { name: 'Fresh',     emoji: '🌱', color: '#47FFB8', min: 0,   max: 49  },
  { name: 'Awakening', emoji: '✨', color: '#FFD700', min: 50,  max: 99  },
  { name: 'Rising',    emoji: '🌙', color: T.tier2,   min: 100, max: 199 },
  { name: 'Electric',  emoji: '⚡', color: '#47B8FF', min: 200, max: 499 },
  { name: 'Legendary', emoji: '🔥', color: T.primary, min: 500, max: 999 },
];

const EVENT_LABELS = {
  card_created:      { label: 'Cards created',      icon: Flame,    pts: '+2 pts each' },
  card_unlocked:     { label: 'Cards unlocked',     icon: Zap,      pts: '+5 pts each' },
  reaction_received: { label: 'Reactions received', icon: Heart,    pts: '+1 pt each'  },
  reveal_completed:  { label: 'Reveals completed',  icon: Eye,      pts: '+3 pts each' },
  streak_day:        { label: 'Streak days',        icon: Calendar, pts: '+2 pts each' },
};

const getTier = (score) =>
  TIERS.slice().reverse().find(t => score >= t.min) || TIERS[0];

const getProgress = (score) => {
  const tier     = getTier(score);
  const nextTier = TIERS[TIERS.indexOf(tier) + 1];
  if (!nextTier) return 1;
  return (score - tier.min) / (nextTier.min - tier.min);
};

// ─── Empty state ──────────────────────────────────────────────
const EmptyState = React.memo(({ onCreateDrop }) => (
  <View style={s.centered}>
    <Star size={rs(40)} color={T.textMute} strokeWidth={1.5} />
    <Text style={s.errorTitle}>No score yet</Text>
    <Text style={s.errorSub}>
      Start creating drops to build your vibe score.
    </Text>
    <TouchableOpacity
      style={s.primaryBtn}
      onPress={onCreateDrop}
      hitSlop={HIT_SLOP}
      activeOpacity={0.9}
    >
      <Flame size={rs(18)} color="#fff" strokeWidth={2.2} />
      <Text style={s.primaryBtnText}>Create your first Drop</Text>
    </TouchableOpacity>
  </View>
));

// ─── Main Screen ──────────────────────────────────────────────
export default function VibeScoreScreen({ navigation }) {
  const { showToast } = useToast();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim     = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/drops/vibe-score`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        const progress = getProgress(json.score);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue:         1,
            duration:        320,
            useNativeDriver: true,
          }),
          Animated.timing(progressAnim, {
            toValue:         progress,
            duration:        900,
            delay:           260,
            useNativeDriver: false,
          }),
        ]).start();
      } else {
        showToast({ type: 'error', message: "Couldn't load your vibe score." });
      }
    } catch {
      showToast({ type: 'error', message: 'Network error. Try again.' });
    } finally {
      setLoading(false);
    }
  }, [fadeAnim, progressAnim, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleCreateDrop = useCallback(() => {
    navigation.navigate('DropsCompose');
  }, [navigation]);

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={[s.safe, s.centered]} edges={['top', 'left', 'right']}>
        <ActivityIndicator color={T.primary} size="large" />
      </SafeAreaView>
    );
  }

  // ── Empty ─────────────────────────────────────────────────
  if (!data) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
        <DropScreenHeader title="Vibe Score" navigation={navigation} />
        <EmptyState onCreateDrop={handleCreateDrop} />
      </SafeAreaView>
    );
  }

  const tier      = getTier(data.score);
  const nextTier  = TIERS[TIERS.indexOf(tier) + 1];
  const ptsToNext = nextTier ? nextTier.min - data.score : 0;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <DropScreenHeader title="Vibe Score" navigation={navigation} />

      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Tier hero ── */}
        <View style={[s.heroCard, { borderColor: `${tier.color}55` }]}>
          <Text style={s.tierEmoji}>{tier.emoji}</Text>
          <Text style={[s.tierName, { color: tier.color }]}>{tier.name}</Text>
          <Text style={[s.score, { color: tier.color }]}>{data.score}</Text>
          <Text style={s.scoreLabel}>vibe points</Text>

          {/* Progress bar */}
          <View style={s.progressTrack}>
            <Animated.View style={[
              s.progressFill,
              {
                backgroundColor: tier.color,
                width: progressAnim.interpolate({
                  inputRange:  [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]} />
          </View>

          {nextTier ? (
            <Text style={s.progressLabel}>
              <Text style={{ color: tier.color, fontFamily: 'DMSans-Bold' }}>
                {ptsToNext} pts
              </Text>
              {' to '}
              <Text style={{ color: nextTier.color, fontFamily: 'DMSans-Bold' }}>
                {nextTier.emoji} {nextTier.name}
              </Text>
            </Text>
          ) : (
            <Text style={[s.progressLabel, { color: tier.color }]}>
              Maximum tier reached 🏆
            </Text>
          )}
        </View>

        {/* ── Tier roadmap ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Tier Journey</Text>
          <View style={s.tierRoadmap}>
            {TIERS.map((t, i) => {
              const reached   = data.score >= t.min;
              const isCurrent = t.name === tier.name;
              return (
                <View key={t.name} style={s.tierStep}>
                  <View style={[
                    s.tierDot,
                    { backgroundColor: reached ? t.color : T.surfaceAlt },
                    isCurrent && {
                      width:        rs(16),
                      height:       rs(16),
                      borderRadius: rs(8),
                      borderWidth:  2,
                      borderColor:  T.background,
                    },
                  ]} />
                  {i < TIERS.length - 1 && (
                    <View style={[
                      s.tierLine,
                      reached && TIERS[i + 1] && data.score >= TIERS[i + 1].min &&
                        { backgroundColor: TIERS[i + 1].color },
                    ]} />
                  )}
                  <Text style={s.tierStepEmoji}>{t.emoji}</Text>
                  <Text style={[
                    s.tierStepName,
                    isCurrent && { color: t.color, fontFamily: 'DMSans-Bold' },
                  ]}>
                    {t.name}
                  </Text>
                  <Text style={s.tierStepMin}>{t.min}+</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Stats ── */}
        <View style={s.statsGrid}>
          <View style={[s.statCard, { borderColor: 'rgba(255,107,138,0.32)' }]}>
            <Eye size={rs(22)} color="#FF6B8A" strokeWidth={1.8} />
            <Text style={[s.statBig, { color: '#FF6B8A' }]}>{data.admirer_count}</Text>
            <Text style={s.statCardLabel}>Admirers</Text>
            <Text style={s.statCardSub}>viewed your drops</Text>
          </View>
          <View style={[s.statCard, { borderColor: 'rgba(255,183,71,0.32)' }]}>
            <Flame size={rs(22)} color="#FFB347" strokeWidth={1.8} />
            <Text style={[s.statBig, { color: '#FFB347' }]}>{data.confession_streak}</Text>
            <Text style={s.statCardLabel}>Day Streak</Text>
            <Text style={s.statCardSub}>longest: {data.longest_streak}</Text>
          </View>
        </View>

        {/* ── Event breakdown ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>How you earned it</Text>
          <View style={s.eventList}>
            {Object.entries(EVENT_LABELS).map(([key, meta]) => {
              const count    = data.events?.[key] || 0;
              const IconComp = meta.icon;
              if (count === 0) return null;
              return (
                <View key={key} style={s.eventRow}>
                  <View style={s.eventLeft}>
                    <IconComp size={rs(18)} color={T.primary} strokeWidth={2} />
                    <View>
                      <Text style={s.eventLabel}>{meta.label}</Text>
                      <Text style={s.eventPts}>{meta.pts}</Text>
                    </View>
                  </View>
                  <Text style={s.eventCount}>{count}×</Text>
                </View>
              );
            })}
            {Object.values(data.events || {}).every(v => v === 0) && (
              <Text style={s.noEvents}>
                Start creating drops to earn points!
              </Text>
            )}
          </View>
        </View>

        {/* ── How to earn ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>How to earn points</Text>
          <View style={s.earnList}>
            {Object.entries(EVENT_LABELS).map(([key, meta], idx, arr) => {
              const IconComp = meta.icon;
              return (
                <View
                  key={key}
                  style={[
                    s.earnRow,
                    idx === arr.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <IconComp size={rs(16)} color={T.textSec} strokeWidth={2} />
                  <Text style={s.earnLabel}>{meta.label}</Text>
                  <Text style={[s.earnPts, { color: T.primary }]}>{meta.pts}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={s.primaryBtn}
          onPress={handleCreateDrop}
          hitSlop={HIT_SLOP}
          activeOpacity={0.9}
        >
          <Flame size={rs(18)} color="#fff" strokeWidth={2.2} />
          <Text style={s.primaryBtnText}>Create a Drop to earn points</Text>
        </TouchableOpacity>

        <View style={{ height: rs(40) }} />
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: T.background },
  centered: {
    flex:              1,
    justifyContent:    'center',
    alignItems:        'center',
    padding:           SPACING.xl,
    gap:               SPACING.sm,
  },

  content: {
    padding: SPACING.md,
    gap:     SPACING.lg,
  },

  // Empty
  errorTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    marginTop:     SPACING.xs,
    letterSpacing: 0.3,
  },
  errorSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    textAlign:     'center',
    lineHeight:    rf(21),
    marginBottom:  SPACING.md,
    letterSpacing: 0.3,
  },

  // ── Tier hero ──
  heroCard: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.xl,
    padding:         SPACING.xl,
    alignItems:      'center',
    borderWidth:     1.5,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: rs(8) },
    shadowOpacity:   0.4,
    shadowRadius:    rs(20),
    elevation:       10,
  },
  tierEmoji: {
    fontSize:     rf(52),
    marginBottom: SPACING.xs,
  },
  tierName: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(14),
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginBottom:  SPACING.sm,
  },
  score: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(64),
    lineHeight:    rf(72),
    letterSpacing: 0.5,
  },
  scoreLabel: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    marginBottom:  SPACING.lg,
    letterSpacing: 0.3,
  },
  progressTrack: {
    width:           '100%',
    height:          rs(6),
    backgroundColor: T.surfaceAlt,
    borderRadius:    rs(3),
    marginBottom:    rp(10),
    overflow:        'hidden',
  },
  progressFill: {
    height:       '100%',
    borderRadius: rs(3),
  },
  progressLabel: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(12),
    color:         T.textSec,
    letterSpacing: 0.3,
  },

  // ── Tier roadmap ──
  tierRoadmap: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    justifyContent:  'space-between',
    paddingVertical: SPACING.xs,
  },
  tierStep: {
    alignItems: 'center',
    flex:       1,
    position:   'relative',
  },
  tierDot: {
    width:        rs(12),
    height:       rs(12),
    borderRadius: rs(6),
    marginBottom: SPACING.xs,
  },
  tierLine: {
    position:        'absolute',
    top:             rs(5),
    left:            '55%',
    right:           '-45%',
    height:          2,
    backgroundColor: T.border,
  },
  tierStepEmoji: {
    fontSize:     rf(18),
    marginBottom: rp(4),
  },
  tierStepName: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(10),
    color:         T.textSec,
    textAlign:     'center',
    letterSpacing: 0.3,
  },
  tierStepMin: {
    fontFamily: 'DMSans-Italic',
    fontSize:   rf(10),
    color:      T.textMute,
    marginTop:  rp(2),
  },

  // ── Stats ──
  statsGrid: {
    flexDirection: 'row',
    gap:           SPACING.sm,
  },
  statCard: {
    flex:            1,
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    padding:         SPACING.md,
    alignItems:      'center',
    gap:             rp(6),
    borderWidth:     1,
  },
  statBig: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(32),
    letterSpacing: 0.3,
  },
  statCardLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.text,
    letterSpacing: 0.4,
  },
  statCardSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textMute,
    textAlign:     'center',
    letterSpacing: 0.3,
  },

  // ── Section ──
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.md,
    color:         T.text,
    letterSpacing: 0.3,
  },

  // ── Event breakdown ──
  eventList: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     T.border,
    overflow:        'hidden',
  },
  eventRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    padding:           SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  eventLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.sm,
  },
  eventLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.text,
    letterSpacing: 0.2,
  },
  eventPts: {
    fontFamily: 'DMSans-Italic',
    fontSize:   rf(11),
    color:      T.textSec,
    marginTop:  rp(2),
  },
  eventCount: {
    fontFamily: 'PlayfairDisplay-Italic',
    fontSize:   rf(18),
    color:      T.primary,
    letterSpacing: 0.3,
  },
  noEvents: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textSec,
    padding:    SPACING.md,
    textAlign:  'center',
  },

  // ── How to earn ──
  earnList: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     T.border,
    overflow:        'hidden',
  },
  earnRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               SPACING.sm,
    paddingVertical:   rp(14),
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  earnLabel: {
    flex:          1,
    fontFamily:    'DMSans-Regular',
    fontSize:      FONT.sm,
    color:         T.textSec,
    letterSpacing: 0.2,
  },
  earnPts: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    letterSpacing: 0.3,
  },

  // ── Primary button ──
  primaryBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             SPACING.xs,
    backgroundColor: T.primary,
    borderRadius:    RADIUS.lg,
    paddingVertical: rp(16),
    shadowColor:     T.primary,
    shadowOpacity:   0.35,
    shadowRadius:    12,
    shadowOffset:    { width: 0, height: 4 },
    elevation:       4,
  },
  primaryBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.md,
    color:         '#fff',
    letterSpacing: 0.4,
  },
});
