/**
 * DailyRewardBanner.jsx
 * Compact streak + daily claim banner for home/wallet screens.
 *
 * Usage:
 *   <DailyRewardBanner />
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Coins, Flame, Lock, Zap } from 'lucide-react-native';
import { useDispatch, useSelector } from 'react-redux';

import { claimDailyReward, fetchStreak } from '../../store/slices/coinsSlice';
import { useToast } from '../ui/Toast';
import { HIT_SLOP, rf, rp, rs } from '../../utils/responsive';
import { THEME } from '../../utils/theme';

// ─── Static milestone labels ──────────────────────────────────
const MILESTONE_KEYS = [7, 14, 30, 60, 100];

// ─── Milestone pip row ────────────────────────────────────────
const MilestonePips = React.memo(({ streak, nextMilestone }) => (
  <View style={pipStyles.row}>
    {MILESTONE_KEYS.map((m) => {
      const reached = streak >= m;
      const isNext  = m === nextMilestone;
      return (
        <View key={m} style={[pipStyles.pip, reached && pipStyles.pipReached, isNext && pipStyles.pipNext]}>
          <Text style={[pipStyles.pipLabel, reached && pipStyles.pipLabelReached]}>{m}</Text>
        </View>
      );
    })}
  </View>
));

const pipStyles = StyleSheet.create({
  row:            { flexDirection: 'row', gap: rs(6), marginTop: rp(8) },
  pip:            { paddingHorizontal: rp(8), paddingVertical: rp(3), borderRadius: rs(10), backgroundColor: THEME.surfaceAlt, borderWidth: 1, borderColor: THEME.border },
  pipReached:     { backgroundColor: 'rgba(251,191,36,0.18)', borderColor: 'rgba(251,191,36,0.4)' },
  pipNext:        { borderColor: '#FF634A', borderStyle: 'dashed' },
  pipLabel:       { fontSize: rf(10), color: THEME.textSub, fontWeight: '600' },
  pipLabelReached: { color: THEME.gold },
});

// ─── Banner ───────────────────────────────────────────────────
export default React.memo(function DailyRewardBanner() {
  const dispatch   = useDispatch();
  const { showToast } = useToast();

  const {
    streak,
    canClaimToday,
    streakInDanger,
    hoursUntilNext,
    nextMilestone,
    nextMilestoneBonus,
    monthlyClaims,
    claimLoading,
  } = useSelector((state) => state.coins);

  // Entrance animation
  const slideY  = useRef(new Animated.Value(-24)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const flicker = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    dispatch(fetchStreak());
    Animated.parallel([
      Animated.spring(slideY,  { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }),
      Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  // Danger flicker animation
  useEffect(() => {
    if (!streakInDanger) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [streakInDanger]);

  const handleClaim = useCallback(async () => {
    const result = await dispatch(claimDailyReward(null));
    if (claimDailyReward.fulfilled.match(result)) {
      const { coins_earned, streak: newStreak, milestone_bonus } = result.payload;
      if (milestone_bonus > 0) {
        showToast({
          type:    'success',
          title:   `🔥 ${newStreak}-day streak!`,
          message: `+${coins_earned} coins (${milestone_bonus} milestone bonus!)`,
        });
      } else {
        showToast({ type: 'success', message: `+${coins_earned} coins — Day ${newStreak} streak 🔥` });
      }
    } else {
      const msg = result.payload?.detail ?? 'Could not claim reward.';
      showToast({ type: 'warning', message: msg });
    }
  }, [dispatch, showToast]);

  const streakLabel = useMemo(() => {
    if (streak === 0) return 'Start your streak today';
    if (streakInDanger) return '⚠️ Streak at risk — claim now!';
    return `${streak}-day streak`;
  }, [streak, streakInDanger]);

  const gradientColors = useMemo(() => {
    if (streakInDanger) return ['#7f1d1d', '#1a0505'];
    if (canClaimToday)  return ['#1a2e1a', '#0f1a0f'];
    return [THEME.surface, THEME.surfaceAlt];
  }, [streakInDanger, canClaimToday]);

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ translateY: slideY }], opacity }]}>
      <LinearGradient
        colors={gradientColors}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Left: streak info */}
        <View style={styles.leftCol}>
          <Animated.View style={{ opacity: streakInDanger ? flicker : 1 }}>
            <Flame
              size={rs(22)}
              color={streakInDanger ? THEME.danger : streak > 0 ? THEME.gold : THEME.textSub}
            />
          </Animated.View>
          <View style={styles.streakTextWrap}>
            <Text style={[styles.streakLabel, streakInDanger && styles.streakLabelDanger]}>
              {streakLabel}
            </Text>
            {nextMilestone ? (
              <Text style={styles.milestoneHint}>
                +{nextMilestoneBonus} coins at day {nextMilestone}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Right: CTA */}
        <View style={styles.rightCol}>
          {canClaimToday ? (
            <TouchableOpacity
              onPress={handleClaim}
              disabled={claimLoading}
              activeOpacity={0.85}
              hitSlop={HIT_SLOP}
              style={styles.claimBtn}
            >
              <LinearGradient
                colors={['#22c55e', '#16a34a']}
                style={styles.claimBtnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {claimLoading ? (
                  <Text style={styles.claimBtnText}>…</Text>
                ) : (
                  <>
                    <Zap size={rs(13)} color="#fff" />
                    <Text style={styles.claimBtnText}>Claim +5</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={styles.lockedPill}>
              <Lock size={rs(12)} color={THEME.textSub} />
              <Text style={styles.lockedText}>
                {hoursUntilNext > 0 ? `${hoursUntilNext}h` : 'Claimed'}
              </Text>
            </View>
          )}

          <View style={styles.monthlyPill}>
            <Coins size={rs(11)} color={THEME.gold} />
            <Text style={styles.monthlyText}>{monthlyClaims}/28</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Milestone pips */}
      {streak > 0 || canClaimToday ? (
        <View style={styles.pipsWrap}>
          <MilestonePips streak={streak} nextMilestone={nextMilestone} />
        </View>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: rp(16),
    marginVertical:   rp(10),
    borderRadius:     rs(16),
    overflow:         'hidden',
    borderWidth:      1,
    borderColor:      THEME.border,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  gradient: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: rp(16),
    paddingVertical:   rp(14),
  },
  leftCol: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rs(10),
    flex:          1,
  },
  streakTextWrap: { flex: 1 },
  streakLabel: {
    color:      THEME.text,
    fontSize:   rf(14),
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  streakLabelDanger: { color: THEME.danger },
  milestoneHint: {
    color:    THEME.textSub,
    fontSize: rf(11),
    marginTop: rp(2),
  },
  rightCol: {
    alignItems: 'flex-end',
    gap:        rp(6),
  },
  claimBtn:     {},
  claimBtnGrad: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rs(5),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(7),
    borderRadius:      rs(20),
  },
  claimBtnText: {
    color:      '#fff',
    fontSize:   rf(12),
    fontWeight: '700',
  },
  lockedPill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rs(4),
    backgroundColor: THEME.surfaceAlt,
    borderRadius:    rs(20),
    paddingHorizontal: rp(10),
    paddingVertical:   rp(5),
    borderWidth:       1,
    borderColor:       THEME.border,
  },
  lockedText: {
    color:    THEME.textSub,
    fontSize: rf(11),
    fontWeight: '600',
  },
  monthlyPill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rs(4),
  },
  monthlyText: {
    color:    THEME.textSub,
    fontSize: rf(10),
  },
  pipsWrap: {
    paddingHorizontal: rp(16),
    paddingBottom:     rp(12),
    backgroundColor:   THEME.surface,
  },
});
