/**
 * CircleDashboardScreen.jsx
 * The creator's private view of their circle's performance.
 * Earnings, event history, member growth, payout status.
 *
 * Design: Dark financial intimacy. Like reading a letter
 * from someone who's been counting every moment you showed up.
 * Numbers feel earned, not transactional.
 */
import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, RefreshControl, ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, TrendingUp, Users, Gift,
  Clock, CheckCircle, AlertCircle, Radio,
} from 'lucide-react-native';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import StarryBackground from '../../components/common/StarryBackground';

const { width: W } = Dimensions.get('window');

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  surfaceAlt:    '#1a1f2e',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.12)',
  primaryBorder: 'rgba(255,99,74,0.25)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#5a5f70',
  border:        'rgba(255,255,255,0.06)',
  success:       '#4CAF50',
  successDim:    'rgba(76,175,80,0.10)',
  successBorder: 'rgba(76,175,80,0.25)',
  mpesa:         '#00A651',
  mpesaDim:      'rgba(0,166,81,0.10)',
  mpesaBorder:   'rgba(0,166,81,0.25)',
  warning:       '#F1C40F',
  warningDim:    'rgba(241,196,15,0.10)',
  warningBorder: 'rgba(241,196,15,0.25)',
};

// ─── Static data ──────────────────────────────────────────────────────────────
const PAYOUT_STATUS = {
  pending:   { label: 'Coming Monday',  color: T.warning,  icon: Clock,        bg: T.warningDim,  border: T.warningBorder },
  completed: { label: 'Sent to M-Pesa', color: T.success,  icon: CheckCircle,  bg: T.successDim,  border: T.successBorder },
  failed:    { label: 'Payout failed',  color: '#EF4444',  icon: AlertCircle,  bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.25)' },
};

// ─── Animated Number ──────────────────────────────────────────────────────────
const AnimatedNumber = React.memo(({ value, prefix = '', suffix = '' }) => {
  const animValue = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    Animated.timing(animValue, {
      toValue:  value,
      duration: 1200,
      useNativeDriver: false,
    }).start();

    animValue.addListener(({ value: v }) => {
      setDisplay(Math.floor(v));
    });

    return () => animValue.removeAllListeners();
  }, [value]);

  return (
    <Text style={styles.bigNumber}>
      {prefix}{display.toLocaleString()}{suffix}
    </Text>
  );
});

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = React.memo(({ label, value, sub, icon: Icon, accentColor, index }) => {
  const scale   = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, delay: index * 80, tension: 60, friction: 8,  useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, delay: index * 80, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[
      styles.statCard,
      { borderColor: accentColor + '25', transform: [{ scale }], opacity }
    ]}>
      <View style={[styles.statIconWrap, { backgroundColor: accentColor + '15' }]}>
      <StarryBackground />
        <Icon size={rs(18)} color={accentColor} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </Animated.View>
  );
});

// ─── Event Row ────────────────────────────────────────────────────────────────
const EventRow = React.memo(({ event, index, accentColor }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-rs(20))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,     { toValue: 1, delay: index * 60, duration: 350, useNativeDriver: true }),
      Animated.spring(translateX,  { toValue: 0, delay: index * 60, tension: 60, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[
      styles.eventRow,
      { opacity, transform: [{ translateX }] }
    ]}>
      <View style={[styles.eventDot, { backgroundColor: accentColor }]} />
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
        <Text style={styles.eventMeta}>
          {event.ended_at
            ? new Date(event.ended_at).toLocaleDateString('en-KE', {
                month: 'short', day: 'numeric',
              })
            : '—'
          }
          {event.entry_fee > 0 ? ` · KES ${event.entry_fee}` : ' · Free'}
        </Text>
      </View>
      <View style={styles.eventStats}>
        <View style={styles.eventStat}>
          <Users size={rs(11)} color={T.textMuted} />
          <Text style={styles.eventStatText}>{event.peak_viewers}</Text>
        </View>
        {event.total_gifts > 0 && (
          <View style={styles.eventStat}>
            <Text style={styles.eventStatGift}>🎁</Text>
            <Text style={[styles.eventStatText, { color: accentColor }]}>
              {event.total_gifts}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
});

// ─── Payout Row ───────────────────────────────────────────────────────────────
const PayoutRow = React.memo(({ payout }) => {
  const config    = PAYOUT_STATUS[payout.status] ?? PAYOUT_STATUS.pending;
  const StatusIcon = config.icon;

  return (
    <View style={styles.payoutRow}>
      <View style={[styles.payoutStatusDot, { backgroundColor: config.color }]} />
      <View style={styles.payoutInfo}>
        <Text style={styles.payoutAmount}>
          KES {payout.amount?.toLocaleString()}
        </Text>
        <Text style={styles.payoutDate}>{payout.date}</Text>
      </View>
      <View style={[styles.payoutBadge, { backgroundColor: config.bg, borderColor: config.border }]}>
        <StatusIcon size={rs(11)} color={config.color} />
        <Text style={[styles.payoutBadgeText, { color: config.color }]}>
          {config.label}
        </Text>
      </View>
    </View>
  );
});

// ─── Section Card ─────────────────────────────────────────────────────────────
const SectionCard = React.memo(({ title, children, accentColor, action, onAction }) => (
  <View style={styles.sectionCard}>
    <View style={[styles.sectionAccent, { backgroundColor: accentColor }]} />
    <View style={styles.sectionInner}>
      {title && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {action && onAction && (
            <TouchableOpacity onPress={onAction} hitSlop={HIT_SLOP}>
              <Text style={[styles.sectionAction, { color: accentColor }]}>{action}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {children}
    </View>
  </View>
));

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CircleDashboardScreen({ route, navigation }) {
  const { circleId }  = route.params ?? {};
  const { showToast } = useToast();

  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Entrance animations
  const headerOp  = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(0.96)).current;
  const contentY  = useRef(new Animated.Value(rs(20))).current;
  const contentOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(headerOp,  { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(heroScale, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(contentOp, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(contentY,  { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/dashboard`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        setData(await res.json());
      } else {
        showToast({ type: 'error', message: 'Could not load dashboard.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not load dashboard.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [circleId, showToast]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const handleSchedule = useCallback(() => {
    navigation.navigate('ScheduleEvent', {
      circleId,
      circle: data?.circle,
    });
  }, [navigation, circleId, data]);

  const accentColor = data?.circle?.aura_color ?? T.primary;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]} edges={['top']}>
        <ActivityIndicator size="large" color={T.primary} />
        <Text style={styles.loadingText}>Reading the numbers…</Text>
      </SafeAreaView>
    );
  }

  const circle        = data?.circle ?? {};
  const totalEarnings = data?.total_earnings_kes   ?? 0;
  const eventEarnings = data?.event_earnings_kes   ?? 0;
  const giftEarnings  = data?.gift_earnings_kes    ?? 0;
  const pendingPayout = data?.pending_payout_kes   ?? 0;
  const nextPayout    = data?.next_payout_date     ?? 'Next Monday';
  const pastEvents    = data?.past_events          ?? [];
  const payouts       = data?.payouts              ?? [];

  const perMember80 = circle.price
    ? Math.round(circle.price * 0.8)
    : null;

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>

      {/* Aura glow */}
      <View style={[styles.auraGlow, { backgroundColor: accentColor }]} />

      {/* Header */}
      <Animated.View style={[styles.header, { opacity: headerOp }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={HIT_SLOP}
          style={styles.backBtn}
        >
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {circle.name ?? 'Dashboard'}
          </Text>
          <Text style={styles.headerSub}>Creator Dashboard</Text>
        </View>
        <TouchableOpacity
          onPress={handleSchedule}
          hitSlop={HIT_SLOP}
          style={[styles.scheduleBtn, { borderColor: accentColor + '40' }]}
        >
          <Radio size={rs(14)} color={accentColor} />
          <Text style={[styles.scheduleBtnText, { color: accentColor }]}>
            Schedule
          </Text>
        </TouchableOpacity>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadDashboard(true)}
            tintColor={accentColor}
            colors={[accentColor]}
          />
        }
      >

        {/* ── Hero earnings ── */}
        <Animated.View style={[
          styles.heroCard,
          { borderColor: accentColor + '20', transform: [{ scale: heroScale }] }
        ]}>
          <View style={[styles.heroAccent, { backgroundColor: accentColor }]} />
          <View style={styles.heroInner}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroLabel}>Total earned</Text>
              <AnimatedNumber value={totalEarnings} prefix="KES " />
              <Text style={styles.heroSub}>after Anonixx's 20%</Text>
            </View>
            <View style={[styles.heroIconWrap, { backgroundColor: accentColor + '15' }]}>
              <TrendingUp size={rs(28)} color={accentColor} />
            </View>
          </View>
        </Animated.View>

        {/* ── Stat cards ── */}
        <Animated.View style={[
          styles.statsGrid,
          { opacity: contentOp, transform: [{ translateY: contentY }] }
        ]}>
          <StatCard
            label="From Events"
            value={`KES ${eventEarnings.toLocaleString()}`}
            sub="entry fees"
            icon={Radio}
            accentColor={accentColor}
            index={0}
          />
          <StatCard
            label="From Gifts"
            value={`KES ${giftEarnings.toLocaleString()}`}
            sub="anonymous"
            icon={Gift}
            accentColor={accentColor}
            index={1}
          />
          <StatCard
            label="Members"
            value={circle.member_range ?? '—'}
            sub={`${circle.member_count ?? 0} total`}
            icon={Users}
            accentColor={accentColor}
            index={2}
          />
          <StatCard
            label="Events Held"
            value={pastEvents.length}
            sub="completed"
            icon={CheckCircle}
            accentColor={accentColor}
            index={3}
          />
        </Animated.View>

        <Animated.View style={[
          styles.sections,
          { opacity: contentOp, transform: [{ translateY: contentY }] }
        ]}>

          {/* ── Pending payout ── */}
          {pendingPayout > 0 && (
            <View style={[styles.pendingCard, {
              backgroundColor: T.mpesaDim,
              borderColor:     T.mpesaBorder,
            }]}>
              <Text style={styles.pendingEmoji}>📲</Text>
              <View style={styles.pendingInfo}>
                <Text style={[styles.pendingAmount, { color: T.mpesa }]}>
                  KES {pendingPayout.toLocaleString()}
                </Text>
                <Text style={styles.pendingDate}>
                  M-Pesa payout on {nextPayout}
                </Text>
              </View>
              <View style={[styles.pendingBadge, {
                backgroundColor: T.mpesaDim,
                borderColor:     T.mpesaBorder,
              }]}>
                <Clock size={rs(11)} color={T.mpesa} />
                <Text style={[styles.pendingBadgeText, { color: T.mpesa }]}>
                  Pending
                </Text>
              </View>
            </View>
          )}

          {/* ── How it works ── */}
          <SectionCard title="How you earn" accentColor={accentColor}>
            <View style={styles.earningsBreakdown}>
              <View style={styles.earningsRow}>
                <Text style={styles.earningsLabel}>Event entry fee</Text>
                <Text style={styles.earningsValue}>Creator sets</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.earningsRow}>
                <Text style={styles.earningsLabel}>Anonixx takes</Text>
                <Text style={[styles.earningsValue, { color: T.textMuted }]}>20%</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.earningsRow}>
                <Text style={[styles.earningsLabel, { color: T.success, fontWeight: '700' }]}>
                  You keep
                </Text>
                <Text style={[styles.earningsValue, { color: T.success, fontWeight: '800' }]}>
                  80%
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.earningsRow}>
                <Text style={styles.earningsLabel}>Anonymous gifts</Text>
                <Text style={[styles.earningsValue, { color: T.success }]}>
                  80% yours
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.earningsRow}>
                <Text style={styles.earningsLabel}>Payout schedule</Text>
                <Text style={styles.earningsValue}>Every Monday</Text>
              </View>
              <View style={[styles.earningsNote, { borderColor: accentColor + '25' }]}>
                <Text style={styles.earningsNoteText}>
                  💸 Paid automatically to M-Pesa. No action needed from you.
                </Text>
              </View>
            </View>
          </SectionCard>

          {/* ── Past events ── */}
          <SectionCard
            title="Past Lives"
            accentColor={accentColor}
            action="+ Schedule"
            onAction={handleSchedule}
          >
            {pastEvents.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionEmoji}>🌑</Text>
                <Text style={styles.emptySectionText}>
                  No lives yet. Your first one will be the one they remember.
                </Text>
                <TouchableOpacity
                  style={[styles.emptySectionCta, { borderColor: accentColor + '40' }]}
                  onPress={handleSchedule}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.emptySectionCtaText, { color: accentColor }]}>
                    Schedule your first live
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              pastEvents.map((event, i) => (
                <EventRow
                  key={event.id}
                  event={event}
                  index={i}
                  accentColor={accentColor}
                />
              ))
            )}
          </SectionCard>

          {/* ── Payout history ── */}
          <SectionCard title="Payout History" accentColor={accentColor}>
            {payouts.length === 0 ? (
              <Text style={styles.emptyPayouts}>
                Your first payout will appear here after your first paid event.
              </Text>
            ) : (
              payouts.map((p, i) => (
                <PayoutRow key={i} payout={p} />
              ))
            )}
          </SectionCard>

          {/* ── Back to circle ── */}
          <TouchableOpacity
            style={styles.backToCircleBtn}
            onPress={() => navigation.navigate('CircleProfile', { circleId })}
            hitSlop={HIT_SLOP}
            activeOpacity={0.8}
          >
            <Text style={styles.backToCircleText}>← Back to circle</Text>
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: T.background },
  centered: { justifyContent: 'center', alignItems: 'center' },

  loadingText: {
    marginTop: SPACING.sm,
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    fontStyle: 'italic',
  },

  // Aura glow
  auraGlow: {
    position:     'absolute',
    top:          -rs(80),
    alignSelf:    'center',
    width:        W * 1.2,
    height:       rs(200),
    opacity:      0.06,
    borderRadius: rs(100),
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
  backBtn:      { padding: rp(4) },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  {
    fontSize:   FONT.md,
    fontWeight: '700',
    color:      T.text,
    fontFamily: 'PlayfairDisplay-Bold',
  },
  headerSub: {
    fontSize:  FONT.xs,
    color:     T.textMuted,
    marginTop: rp(2),
    fontStyle: 'italic',
  },
  scheduleBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(4),
    borderWidth:     1,
    borderRadius:    RADIUS.xs,
    paddingHorizontal: rp(9),
    paddingVertical:   rp(6),
  },
  scheduleBtnText: {
    fontSize:   FONT.xs,
    fontWeight: '700',
  },

  // Content
  content: {
    padding:       SPACING.md,
    paddingBottom: rs(60),
    gap:           SPACING.md,
  },

  // Hero card
  heroCard: {
    borderRadius: RADIUS.md,
    borderWidth:  1,
    overflow:     'hidden',
    position:     'relative',
    backgroundColor: T.surface,
  },
  heroAccent: {
    position: 'absolute',
    left:     0,
    top:      0,
    bottom:   0,
    width:    rp(4),
    opacity:  0.7,
  },
  heroInner: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    padding:         SPACING.md,
    paddingLeft:     rp(22),
  },
  heroLeft:   {},
  heroLabel:  {
    fontSize:      FONT.xs,
    color:         T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom:  rp(6),
  },
  bigNumber: {
    fontSize:      rf(32),
    fontWeight:    '800',
    color:         T.primary,
    letterSpacing: -0.5,
    fontFamily:    'PlayfairDisplay-Bold',
  },
  heroSub: {
    fontSize:  FONT.xs,
    color:     T.textMuted,
    marginTop: rp(4),
    fontStyle: 'italic',
  },
  heroIconWrap: {
    width:          rs(56),
    height:         rs(56),
    borderRadius:   rs(28),
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           SPACING.sm,
  },
  statCard: {
    width:           (W - SPACING.md * 2 - SPACING.sm) / 2,
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    padding:         SPACING.md,
    gap:             rp(4),
  },
  statIconWrap: {
    width:          rs(36),
    height:         rs(36),
    borderRadius:   rs(18),
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   rp(4),
  },
  statValue: {
    fontSize:   FONT.md,
    fontWeight: '800',
    color:      T.text,
  },
  statLabel: {
    fontSize: FONT.xs,
    color:    T.textSecondary,
  },
  statSub: {
    fontSize: FONT.xs,
    color:    T.textMuted,
    opacity:  0.8,
  },

  // Sections
  sections: { gap: SPACING.md },

  // Pending payout card
  pendingCard: {
    flexDirection:   'row',
    alignItems:      'center',
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    padding:         SPACING.md,
    gap:             SPACING.sm,
  },
  pendingEmoji:  { fontSize: rf(24) },
  pendingInfo:   { flex: 1 },
  pendingAmount: { fontSize: FONT.lg, fontWeight: '800' },
  pendingDate:   { fontSize: FONT.xs, color: T.textSecondary, marginTop: rp(2) },
  pendingBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(4),
    paddingHorizontal: rp(8),
    paddingVertical:   rp(4),
    borderRadius:    RADIUS.xs,
    borderWidth:     1,
  },
  pendingBadgeText: {
    fontSize:   FONT.xs,
    fontWeight: '600',
  },

  // Section card
  sectionCard: { position: 'relative' },
  sectionAccent: {
    position:     'absolute',
    left:         0,
    top:          0,
    bottom:       0,
    width:        rp(3),
    opacity:      0.6,
    borderTopLeftRadius:    RADIUS.md,
    borderBottomLeftRadius: RADIUS.md,
    zIndex:       1,
  },
  sectionInner: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    padding:         SPACING.md,
    paddingLeft:     rp(20),
    borderWidth:     1,
    borderColor:     T.border,
    gap:             SPACING.sm,
  },
  sectionHeader: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
  },
  sectionTitle: {
    fontSize:      FONT.xs,
    fontWeight:    '700',
    color:         T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionAction: {
    fontSize:   FONT.sm,
    fontWeight: '600',
  },

  // Earnings breakdown
  earningsBreakdown: { gap: rp(0) },
  earningsRow: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    paddingVertical: rp(8),
  },
  earningsLabel: {
    fontSize: FONT.sm,
    color:    T.textSecondary,
  },
  earningsValue: {
    fontSize:   FONT.sm,
    fontWeight: '600',
    color:      T.text,
  },
  divider: {
    height:          1,
    backgroundColor: T.border,
  },
  earningsNote: {
    marginTop:       SPACING.sm,
    backgroundColor: T.surfaceAlt,
    borderRadius:    RADIUS.sm,
    borderWidth:     1,
    padding:         SPACING.sm,
  },
  earningsNoteText: {
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    lineHeight: rf(20),
  },

  // Event row
  eventRow: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingVertical: rp(10),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    gap:             SPACING.sm,
  },
  eventDot: {
    width:        rs(8),
    height:       rs(8),
    borderRadius: rs(4),
  },
  eventInfo:  { flex: 1 },
  eventTitle: {
    fontSize:     FONT.sm,
    fontWeight:   '600',
    color:        T.text,
    marginBottom: rp(3),
  },
  eventMeta: {
    fontSize: FONT.xs,
    color:    T.textSecondary,
  },
  eventStats: {
    flexDirection: 'row',
    gap:           SPACING.xs,
    alignItems:    'center',
  },
  eventStat: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(3),
  },
  eventStatText: {
    fontSize:   FONT.xs,
    color:      T.textMuted,
    fontWeight: '600',
  },
  eventStatGift: { fontSize: rf(11) },

  // Payout row
  payoutRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SPACING.sm,
    paddingVertical: rp(10),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  payoutStatusDot: {
    width:        rp(8),
    height:       rp(8),
    borderRadius: rp(4),
  },
  payoutInfo:   { flex: 1 },
  payoutAmount: {
    fontSize:     FONT.sm,
    fontWeight:   '700',
    color:        T.text,
    marginBottom: rp(2),
  },
  payoutDate: {
    fontSize: FONT.xs,
    color:    T.textSecondary,
  },
  payoutBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(4),
    paddingHorizontal: rp(8),
    paddingVertical:   rp(4),
    borderRadius:    RADIUS.xs,
    borderWidth:     1,
  },
  payoutBadgeText: {
    fontSize:   FONT.xs,
    fontWeight: '600',
  },

  // Empty
  emptySection: {
    alignItems:    'center',
    paddingVertical: SPACING.md,
    gap:           SPACING.sm,
  },
  emptySectionEmoji: { fontSize: rf(32) },
  emptySectionText: {
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    textAlign: 'center',
    lineHeight: rf(22),
    fontStyle: 'italic',
  },
  emptySectionCta: {
    marginTop:       SPACING.xs,
    borderWidth:     1,
    borderRadius:    RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(10),
  },
  emptySectionCtaText: {
    fontSize:   FONT.sm,
    fontWeight: '700',
  },
  emptyPayouts: {
    fontSize:  FONT.sm,
    color:     T.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: SPACING.sm,
  },

  // Back to circle
  backToCircleBtn: {
    alignItems:    'center',
    paddingVertical: SPACING.sm,
  },
  backToCircleText: {
    fontSize:  FONT.sm,
    color:     T.textMuted,
    fontStyle: 'italic',
  },
});
