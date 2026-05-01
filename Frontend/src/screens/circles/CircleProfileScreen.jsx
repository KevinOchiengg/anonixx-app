/**
 * CircleProfileScreen.jsx
 * The lobby before entering a Circle.
 * Like standing outside a door, hearing sounds from inside.
 *
 * Design: The circle's aura color bleeds through the darkness.
 * Anticipation. Intimacy. You're about to step into something real.
 */
import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, RefreshControl, ActivityIndicator, Modal,
  TextInput, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Radio, Mic, Users, Calendar,
  TrendingUp, Settings, ChevronRight, Clock,
} from 'lucide-react-native';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Static data ──────────────────────────────────────────────────────────────
const GIFT_TIERS = [
  { id: 'spark',   emoji: '🔥', label: 'Spark',   kes: 10  },
  { id: 'bolt',    emoji: '⚡', label: 'Bolt',    kes: 50  },
  { id: 'crystal', emoji: '💎', label: 'Crystal', kes: 200 },
  { id: 'crown',   emoji: '👑', label: 'Crown',   kes: 500 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-KE', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatCountdown(iso) {
  if (!iso) return '';
  const diff = new Date(iso) - Date.now();
  if (diff <= 0) return 'Starting now';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `in ${Math.floor(h / 24)}d`;
  if (h > 0)  return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

// ─── Live Pulse ───────────────────────────────────────────────────────────────
const LivePulse = React.memo(({ color }) => {
  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const op1   = useRef(new Animated.Value(0.7)).current;
  const op2   = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(ring1, { toValue: 2.2, duration: 1400, useNativeDriver: true }),
        Animated.timing(ring1, { toValue: 1,   duration: 0,    useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(op1, { toValue: 0, duration: 1400, useNativeDriver: true }),
        Animated.timing(op1, { toValue: 0.7, duration: 0,  useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(ring2, { toValue: 2.2, duration: 1400, useNativeDriver: true }),
        Animated.timing(ring2, { toValue: 1,   duration: 0,    useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(op2, { toValue: 0, duration: 1400, useNativeDriver: true }),
        Animated.timing(op2, { toValue: 0.4, duration: 0,  useNativeDriver: true }),
      ]),
    ]));
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={styles.livePulseWrap}>
      <Animated.View style={[
        styles.livePulseRing,
        { borderColor: color, transform: [{ scale: ring1 }], opacity: op1 }
      ]} />
      <Animated.View style={[
        styles.livePulseRing,
        { borderColor: color, transform: [{ scale: ring2 }], opacity: op2 }
      ]} />
    </View>
  );
});

// ─── Event Card ───────────────────────────────────────────────────────────────
const EventCard = React.memo(({ event, isCreator, onEnter, onGoLive }) => {
  const isLive      = event.status === 'live';
  const isScheduled = event.status === 'scheduled';

  return (
    <View style={styles.eventCard}>
      <View style={styles.eventCardLeft}>
        <View style={[
          styles.eventStatusDot,
          { backgroundColor: isLive ? T.live : T.textMuted }
        ]} />
      </View>
      <View style={styles.eventCardContent}>
        <View style={styles.eventTitleRow}>
          <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
          {isLive && (
            <View style={styles.eventLiveBadge}>
              <Text style={styles.eventLiveBadgeText}>LIVE</Text>
            </View>
          )}
        </View>
        <Text style={styles.eventMeta}>
          {isLive ? 'Happening now' : formatDate(event.scheduled_at)}
          {event.entry_fee > 0 ? ` · KES ${event.entry_fee}` : ' · Free'}
        </Text>
        {isScheduled && (
          <Text style={styles.eventCountdown}>
            {formatCountdown(event.scheduled_at)}
          </Text>
        )}
      </View>
      <View style={styles.eventCardRight}>
        {isLive && !isCreator && (
          <TouchableOpacity
            style={styles.eventEnterBtn}
            onPress={() => onEnter(event)}
            hitSlop={HIT_SLOP}
            activeOpacity={0.85}
          >
            <Text style={styles.eventEnterText}>Enter</Text>
          </TouchableOpacity>
        )}
        {isScheduled && isCreator && (
          <TouchableOpacity
            style={styles.eventGoLiveBtn}
            onPress={() => onGoLive(event)}
            hitSlop={HIT_SLOP}
            activeOpacity={0.85}
          >
            <Radio size={rs(12)} color="#fff" />
            <Text style={styles.eventGoLiveText}>Go Live</Text>
          </TouchableOpacity>
        )}
        {!isLive && !isCreator && (
          <Clock size={rs(16)} color={T.textMuted} />
        )}
      </View>
    </View>
  );
});

// ─── Payment Modal ────────────────────────────────────────────────────────────
const PaymentModal = React.memo(({
  visible, event, onSuccess, onClose, showToast, circleId,
}) => {
  const [phone,    setPhone]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [polling,  setPolling]  = useState(false);
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const handlePay = useCallback(async () => {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/events/${event?.id}/pay`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ phone_number: phone.trim() }),
        }
      );
      const data = await res.json();
      if (res.ok && data.checkout_request_id) {
        setPolling(true);
        let attempts = 0;
        pollRef.current = setInterval(async () => {
          attempts++;
          if (attempts > 24) {
            clearInterval(pollRef.current);
            setPolling(false);
            showToast({ type: 'error', message: 'Payment timed out. Try again.' });
            return;
          }
          try {
            const t2  = await AsyncStorage.getItem('token');
            const r2  = await fetch(
              `${API_BASE_URL}/api/v1/circles/${circleId}/events/${event?.id}/pay/status/${data.checkout_request_id}`,
              { headers: { Authorization: `Bearer ${t2}` } }
            );
            const d2 = await r2.json();
            if (d2.status === 'completed') {
              clearInterval(pollRef.current);
              setPolling(false);
              onSuccess();
            } else if (d2.status === 'failed') {
              clearInterval(pollRef.current);
              setPolling(false);
              showToast({ type: 'error', message: 'Payment failed or was cancelled.' });
            }
          } catch {}
        }, 5000);
      } else if (res.status === 402) {
        showToast({ type: 'error', message: 'Your preview ended. Pay to return.' });
      } else {
        showToast({ type: 'error', message: 'Could not initiate payment.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not initiate payment.' });
    } finally {
      setLoading(false);
    }
  }, [phone, event, circleId, onSuccess, showToast]);

  const handleClose = useCallback(() => {
    clearInterval(pollRef.current);
    setPolling(false);
    setPhone('');
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />

          {polling ? (
            <View style={styles.pollingBox}>
              <ActivityIndicator size="large" color={T.primary} />
              <Text style={styles.pollingTitle}>Check your phone</Text>
              <Text style={styles.pollingBody}>
                Enter your M-Pesa PIN to step inside.
              </Text>
              <TouchableOpacity onPress={handleClose} hitSlop={HIT_SLOP}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.modalTitle}>{event?.title}</Text>
              <Text style={styles.modalSub}>
                KES {event?.entry_fee?.toLocaleString()} · one night only
              </Text>

              <Text style={styles.modalFieldLabel}>M-Pesa Number</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="07XX XXX XXX"
                placeholderTextColor={T.textMuted}
                keyboardType="phone-pad"
                maxLength={13}
                style={styles.modalInput}
              />
              <Text style={styles.modalHint}>
                An STK push will appear on this number.
              </Text>

              <TouchableOpacity
                style={[styles.modalPayBtn, !phone.trim() && { opacity: 0.45 }]}
                onPress={handlePay}
                disabled={!phone.trim() || loading}
                hitSlop={HIT_SLOP}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalPayBtnText}>
                      Pay KES {event?.entry_fee?.toLocaleString()} — Let me in
                    </Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleClose}
                hitSlop={HIT_SLOP}
                style={{ alignItems: 'center', paddingVertical: SPACING.xs }}
              >
                <Text style={styles.cancelText}>Not now</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CircleProfileScreen({ route, navigation }) {
  const { circleId }  = route.params;
  const { showToast } = useToast();

  const [circle,     setCircle]     = useState(null);
  const [events,     setEvents]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining,    setJoining]    = useState(false);
  const [payEvent,   setPayEvent]   = useState(null);

  // Entrance animations
  const headerOp  = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(0.95)).current;
  const contentY  = useRef(new Animated.Value(30)).current;
  const contentOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(headerOp,  { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(heroScale, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(contentOp, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(contentY,  { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const loadCircle = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const token   = await AsyncStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [circleRes, eventsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/circles/${circleId}`,        { headers }),
        fetch(`${API_BASE_URL}/api/v1/circles/${circleId}/events`, { headers }),
      ]);
      if (circleRes.ok)  setCircle(await circleRes.json());
      if (eventsRes.ok)  setEvents((await eventsRes.json()).events ?? []);
    } catch {
      showToast({ type: 'error', message: 'Could not load this circle.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [circleId, showToast]);

  useEffect(() => { loadCircle(); }, [loadCircle]);

  // ── Join / Leave ──────────────────────────────────────────────────────────
  const handleJoin = useCallback(async () => {
    setJoining(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/join`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        showToast({ type: 'success', message: "You're in the circle." });
        loadCircle();
      } else {
        showToast({ type: 'error', message: 'Could not join. Try again.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not join. Try again.' });
    } finally {
      setJoining(false);
    }
  }, [circleId, loadCircle, showToast]);

  const handleLeave = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/leave`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        showToast({ type: 'success', message: "You've left the circle." });
        loadCircle();
      }
    } catch {}
  }, [circleId, loadCircle, showToast]);

  // ── Audio room ────────────────────────────────────────────────────────────
  const handleEnterRoom = useCallback(() => {
    navigation.navigate('CircleAudioRoom', { circleId, circle });
  }, [navigation, circleId, circle]);

  const handleOpenRoom = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/room/open`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        showToast({ type: 'success', message: 'The room is open.' });
        loadCircle();
      } else {
        showToast({ type: 'error', message: 'Could not open room.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not open room.' });
    }
  }, [circleId, loadCircle, showToast]);

  const handleCloseRoom = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/room/close`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      showToast({ type: 'success', message: 'Room closed.' });
      loadCircle();
    } catch {}
  }, [circleId, loadCircle, showToast]);

  // ── Live event ────────────────────────────────────────────────────────────
  const handleEnterLive = useCallback((event) => {
    if (event.entry_fee > 0) {
      setPayEvent(event);
    } else {
      navigation.navigate('WaitingRoom', {
        circleId, eventId: event.id, circle, event,
      });
    }
  }, [navigation, circleId, circle]);

  const handleGoLive = useCallback(async (event) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/events/${event.id}/go-live`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        showToast({ type: 'success', message: "You're live." });
        navigation.navigate('CircleLive', {
          circleId, eventId: event.id, circle, isCreator: true,
        });
      } else {
        showToast({ type: 'error', message: 'Could not go live.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not go live.' });
    }
  }, [circleId, circle, navigation, showToast]);

  const handlePaySuccess = useCallback(() => {
    setPayEvent(null);
    navigation.navigate('WaitingRoom', {
      circleId, eventId: payEvent?.id, circle, event: payEvent,
    });
  }, [navigation, circleId, circle, payEvent]);

  const handleScheduleEvent = useCallback(() => {
    navigation.navigate('ScheduleEvent', { circleId, circle });
  }, [navigation, circleId, circle]);

  const handleDashboard = useCallback(() => {
    navigation.navigate('CircleDashboard', { circleId });
  }, [navigation, circleId]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const auraColor  = circle?.aura_color ?? T.primary;
  const isCreator  = circle?.is_creator ?? false;
  const isAdmin    = circle?.is_admin   ?? false;
  const isMember   = circle?.is_member  ?? false;
  const isLive     = circle?.is_live    ?? false;
  const isRoomOpen = circle?.room_open  ?? false;

  const liveEvent = useMemo(
    () => events.find(e => e.status === 'live'),
    [events]
  );
  const upcomingEvents = useMemo(
    () => events.filter(e => e.status === 'scheduled'),
    [events]
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]} edges={['top']}>
        <ActivityIndicator size="large" color={T.primary} />
        <Text style={styles.loadingText}>Stepping into the circle…</Text>
      </SafeAreaView>
    );
  }

  if (!circle) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]} edges={['top']}>
        <Text style={styles.errorText}>This circle no longer exists.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>

      {/* Aura background glow */}
      <View style={[styles.auraGlow, { backgroundColor: auraColor }]} />

      {/* Header */}
      <Animated.View style={[styles.header, { opacity: headerOp }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={HIT_SLOP}
          style={styles.backBtn}
        >
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>

        <View style={styles.headerActions}>
          {isCreator && (
            <>
              <TouchableOpacity
                onPress={handleDashboard}
                hitSlop={HIT_SLOP}
                style={styles.headerIconBtn}
              >
                <TrendingUp size={rs(18)} color={T.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleScheduleEvent}
                hitSlop={HIT_SLOP}
                style={styles.headerIconBtn}
              >
                <Calendar size={rs(18)} color={T.textSecondary} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadCircle(true)}
            tintColor={T.primary}
            colors={[T.primary]}
          />
        }
      >
        {/* Hero section */}
        <Animated.View style={[
          styles.hero,
          { transform: [{ scale: heroScale }] }
        ]}>
          {/* Avatar */}
          <View style={styles.heroAvatarWrap}>
            <View style={[
              styles.heroAvatarInner,
              { backgroundColor: auraColor + '20', borderColor: auraColor + '30' }
            ]}>
              <Text style={styles.heroEmoji}>{circle.avatar_emoji ?? '🎭'}</Text>
            </View>
            {isLive && <LivePulse color={auraColor} />}
          </View>

          {/* Name + status */}
          <View style={styles.heroInfo}>
            <Text style={[styles.heroName, { color: T.text }]}>
              {circle.name}
            </Text>

            {isLive && (
              <View style={[styles.heroBadge, { backgroundColor: auraColor + '20', borderColor: auraColor + '40' }]}>
                <Radio size={rs(11)} color={auraColor} />
                <Text style={[styles.heroBadgeText, { color: auraColor }]}>
                  Live now
                </Text>
              </View>
            )}
            {isRoomOpen && !isLive && (
              <View style={styles.openHeroBadge}>
                <View style={styles.openDot} />
                <Text style={styles.openHeroBadgeText}>Room open</Text>
              </View>
            )}
            {!isLive && !isRoomOpen && (
              <Text style={styles.heroStatus}>
                {circle.member_range} · {circle.category}
              </Text>
            )}
          </View>

          {/* Bio */}
          <Text style={styles.heroBio}>{circle.bio}</Text>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Users size={rs(14)} color={T.textSecondary} />
              <Text style={styles.statText}>{circle.member_range}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statText}>{circle.category}</Text>
            </View>
            {(isCreator || isAdmin) && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={[styles.statText, { color: auraColor }]}>
                    {isCreator ? 'Creator' : 'Admin'}
                  </Text>
                </View>
              </>
            )}
          </View>
        </Animated.View>

        {/* Content */}
        <Animated.View style={[
          styles.content,
          { transform: [{ translateY: contentY }], opacity: contentOp }
        ]}>

          {/* ── Primary CTA ── */}
          {isLive && liveEvent && (
            <View style={styles.liveSection}>
              <View style={[styles.liveBanner, { borderColor: auraColor + '30' }]}>
                <View style={styles.liveBannerLeft}>
                  <LivePulse color={auraColor} />
                  <View>
                    <Text style={[styles.liveBannerTitle, { color: auraColor }]}>
                      {liveEvent.title}
                    </Text>
                    <Text style={styles.liveBannerSub}>
                      {liveEvent.entry_fee > 0
                        ? `KES ${liveEvent.entry_fee} to enter`
                        : 'Free to enter'}
                    </Text>
                  </View>
                </View>
                {!isCreator && (
                  <TouchableOpacity
                    style={[styles.enterLiveBtn, { backgroundColor: auraColor }]}
                    onPress={() => handleEnterLive(liveEvent)}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.enterLiveBtnText}>
                      {liveEvent.entry_fee > 0 ? 'Pay & Enter' : 'Enter'}
                    </Text>
                  </TouchableOpacity>
                )}
                {isCreator && (
                  <TouchableOpacity
                    style={[styles.enterLiveBtn, { backgroundColor: auraColor }]}
                    onPress={() => navigation.navigate('CircleLive', {
                      circleId, eventId: liveEvent.id, circle, isCreator: true,
                    })}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.enterLiveBtnText}>Manage</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Audio room CTA */}
          {isRoomOpen && !isLive && (isMember || isCreator) && (
            <TouchableOpacity
              style={[styles.roomBtn, { borderColor: T.open + '40' }]}
              onPress={handleEnterRoom}
              hitSlop={HIT_SLOP}
              activeOpacity={0.85}
            >
              <View style={styles.roomBtnLeft}>
                <View style={styles.openDot} />
                <Mic size={rs(18)} color={T.open} />
                <Text style={styles.roomBtnText}>The room is open</Text>
              </View>
              <Text style={styles.roomBtnCta}>Step inside →</Text>
            </TouchableOpacity>
          )}

          {/* Join / Leave */}
          {!isCreator && !isMember && (
            <TouchableOpacity
              style={[styles.joinBtn, { borderColor: auraColor + '40' }]}
              onPress={handleJoin}
              disabled={joining}
              hitSlop={HIT_SLOP}
              activeOpacity={0.85}
            >
              {joining
                ? <ActivityIndicator size="small" color={auraColor} />
                : <Text style={[styles.joinBtnText, { color: auraColor }]}>
                    Join this circle — it's free
                  </Text>
              }
            </TouchableOpacity>
          )}

          {!isCreator && isMember && !isLive && !isRoomOpen && (
            <View style={styles.memberStatus}>
              <Text style={styles.memberStatusText}>
                You're in this circle
              </Text>
              <TouchableOpacity onPress={handleLeave} hitSlop={HIT_SLOP}>
                <Text style={styles.leaveText}>Leave</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Creator controls ── */}
          {isCreator && (
            <View style={styles.creatorSection}>
              <Text style={styles.sectionLabel}>Your Circle</Text>
              <View style={styles.creatorGrid}>
                {!isLive && !isRoomOpen && (
                  <TouchableOpacity
                    style={styles.creatorBtn}
                    onPress={handleOpenRoom}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.85}
                  >
                    <Mic size={rs(20)} color={T.open} />
                    <Text style={styles.creatorBtnText}>Open Room</Text>
                    <Text style={styles.creatorBtnSub}>Start audio</Text>
                  </TouchableOpacity>
                )}
                {isRoomOpen && (
                  <TouchableOpacity
                    style={[styles.creatorBtn, { borderColor: T.open + '30' }]}
                    onPress={handleCloseRoom}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.85}
                  >
                    <Mic size={rs(20)} color={T.textSecondary} />
                    <Text style={styles.creatorBtnText}>Close Room</Text>
                    <Text style={styles.creatorBtnSub}>End audio</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.creatorBtn}
                  onPress={handleScheduleEvent}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.85}
                >
                  <Calendar size={rs(20)} color={auraColor} />
                  <Text style={styles.creatorBtnText}>Schedule Live</Text>
                  <Text style={styles.creatorBtnSub}>Plan an event</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.creatorBtn}
                  onPress={handleDashboard}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.85}
                >
                  <TrendingUp size={rs(20)} color={auraColor} />
                  <Text style={styles.creatorBtnText}>Dashboard</Text>
                  <Text style={styles.creatorBtnSub}>Earnings</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Upcoming Events ── */}
          {(upcomingEvents.length > 0 || isCreator) && (
            <View style={styles.eventsSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>Upcoming</Text>
                {isCreator && (
                  <TouchableOpacity onPress={handleScheduleEvent} hitSlop={HIT_SLOP}>
                    <Text style={styles.sectionAction}>+ Schedule</Text>
                  </TouchableOpacity>
                )}
              </View>

              {upcomingEvents.length === 0 ? (
                <View style={styles.noEvents}>
                  <Text style={styles.noEventsText}>
                    {isCreator
                      ? 'Schedule a live event. Your members are waiting.'
                      : 'No events scheduled yet. Check back soon.'}
                  </Text>
                </View>
              ) : (
                upcomingEvents.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    isCreator={isCreator}
                    onEnter={handleEnterLive}
                    onGoLive={handleGoLive}
                  />
                ))
              )}
            </View>
          )}

        </Animated.View>
      </ScrollView>

      {/* Payment modal */}
      <PaymentModal
        visible={!!payEvent}
        event={payEvent}
        circleId={circleId}
        onSuccess={handlePaySuccess}
        onClose={() => setPayEvent(null)}
        showToast={showToast}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: T.background },
  centered:{ justifyContent: 'center', alignItems: 'center' },

  loadingText: {
    marginTop:  SPACING.sm,
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    fontStyle:  'italic',
  },
  errorText: {
    fontSize:  FONT.md,
    color:     T.textSecondary,
    textAlign: 'center',
  },
  backLink: {
    marginTop: SPACING.sm,
    fontSize:  FONT.sm,
    color:     T.primary,
  },

  // Aura glow
  auraGlow: {
    position:     'absolute',
    top:          -rs(80),
    alignSelf:    'center',
    width:        SCREEN_WIDTH,
    height:       rs(200),
    opacity:      0.06,
    borderRadius: rs(100),
  },

  // Header
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
  },
  backBtn: { padding: rp(4) },
  headerActions: {
    flexDirection: 'row',
    gap:           SPACING.xs,
  },
  headerIconBtn: {
    width:           rs(36),
    height:          rs(36),
    borderRadius:    rs(18),
    backgroundColor: T.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     T.border,
  },

  scroll: {
    paddingBottom: rs(60),
  },

  // Hero
  hero: {
    alignItems:      'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom:   SPACING.lg,
    paddingTop:      SPACING.sm,
  },
  heroAvatarWrap: {
    position:       'relative',
    marginBottom:   SPACING.md,
  },
  heroAvatarInner: {
    width:          rs(90),
    height:         rs(90),
    borderRadius:   rs(45),
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    2,
  },
  heroEmoji: { fontSize: rf(40) },
  heroInfo:  { alignItems: 'center', marginBottom: SPACING.sm },
  heroName:  {
    fontSize:      rf(26),
    fontWeight:    '800',
    textAlign:     'center',
    letterSpacing: -0.5,
    marginBottom:  SPACING.xs,
    fontFamily:    'PlayfairDisplay-Bold',
  },
  heroBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(5),
    paddingHorizontal: rp(12),
    paddingVertical:   rp(5),
    borderRadius:    RADIUS.sm,
    borderWidth:     1,
  },
  heroBadgeText: {
    fontSize:    FONT.xs,
    fontWeight:  '700',
    letterSpacing: 0.5,
  },
  openHeroBadge: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(6),
  },
  openDot: {
    width:           rs(8),
    height:          rs(8),
    borderRadius:    rs(4),
    backgroundColor: T.open,
  },
  openHeroBadgeText: {
    fontSize:   FONT.xs,
    color:      T.open,
    fontWeight: '600',
  },
  heroStatus: {
    fontSize: FONT.sm,
    color:    T.textSecondary,
  },
  heroBio: {
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    textAlign:  'center',
    lineHeight: rf(22),
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontStyle:  'italic',
  },
  statsRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            SPACING.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(5),
  },
  statText: {
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    fontWeight: '500',
  },
  statDivider: {
    width:           1,
    height:          rp(14),
    backgroundColor: T.border,
  },

  // Content
  content: {
    paddingHorizontal: SPACING.md,
    gap:               SPACING.md,
  },

  // Live banner
  liveSection: {},
  liveBanner: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    padding:         SPACING.md,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    gap:             SPACING.sm,
  },
  liveBannerLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.sm,
    flex:          1,
  },
  liveBannerTitle: {
    fontSize:   FONT.md,
    fontWeight: '700',
    marginBottom: rp(2),
  },
  liveBannerSub: {
    fontSize: FONT.xs,
    color:    T.textSecondary,
  },
  enterLiveBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(10),
    borderRadius:      RADIUS.sm,
  },
  enterLiveBtnText: {
    fontSize:   FONT.sm,
    fontWeight: '700',
    color:      '#fff',
  },

  // Room button
  roomBtn: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.openBorder,
    padding:         SPACING.md,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
  },
  roomBtnLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.xs,
  },
  roomBtnText: {
    fontSize:   FONT.sm,
    color:      T.text,
    fontWeight: '600',
  },
  roomBtnCta: {
    fontSize:   FONT.sm,
    color:      T.open,
    fontWeight: '700',
  },

  // Join / Leave
  joinBtn: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    height:          BUTTON_HEIGHT,
    alignItems:      'center',
    justifyContent:  'center',
  },
  joinBtnText: {
    fontSize:   FONT.md,
    fontWeight: '700',
  },
  memberStatus: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    backgroundColor:   T.surface,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
  },
  memberStatusText: {
    fontSize:   FONT.sm,
    color:      T.textSecondary,
  },
  leaveText: {
    fontSize:   FONT.sm,
    color:      T.textMuted,
  },

  // Creator section
  creatorSection: {},
  creatorGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           SPACING.sm,
    marginTop:     SPACING.xs,
  },
  creatorBtn: {
    flex:            1,
    minWidth:        '45%',
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.border,
    padding:         SPACING.md,
    gap:             rp(4),
  },
  creatorBtnText: {
    fontSize:   FONT.sm,
    fontWeight: '700',
    color:      T.text,
    marginTop:  rp(6),
  },
  creatorBtnSub: {
    fontSize: FONT.xs,
    color:    T.textMuted,
  },

  // Events section
  eventsSection: {},
  sectionHeader: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    marginBottom:    SPACING.sm,
  },
  sectionLabel: {
    fontSize:      FONT.xs,
    fontWeight:    '700',
    color:         T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionAction: {
    fontSize:   FONT.sm,
    color:      T.primary,
    fontWeight: '600',
  },
  noEvents: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.border,
    padding:         SPACING.md,
  },
  noEventsText: {
    fontSize:  FONT.sm,
    color:     T.textMuted,
    fontStyle: 'italic',
  },

  // Event card
  eventCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.border,
    padding:         SPACING.md,
    gap:             SPACING.sm,
    marginBottom:    SPACING.xs,
  },
  eventCardLeft: {
    alignItems:     'center',
    justifyContent: 'center',
    width:          rs(12),
  },
  eventStatusDot: {
    width:        rs(8),
    height:       rs(8),
    borderRadius: rs(4),
  },
  eventCardContent: { flex: 1 },
  eventTitleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.xs,
    marginBottom:  rp(4),
  },
  eventTitle: {
    flex:       1,
    fontSize:   FONT.sm,
    fontWeight: '700',
    color:      T.text,
  },
  eventLiveBadge: {
    backgroundColor: T.liveDim ?? 'rgba(255,99,74,0.12)',
    paddingHorizontal: rp(6),
    paddingVertical:   rp(2),
    borderRadius:    RADIUS.xs,
    borderWidth:     1,
    borderColor:     T.primaryBorder,
  },
  eventLiveBadgeText: {
    fontSize:    rf(9),
    fontWeight:  '800',
    color:       T.live,
    letterSpacing: 0.6,
  },
  eventMeta: {
    fontSize: FONT.xs,
    color:    T.textSecondary,
  },
  eventCountdown: {
    fontSize:   FONT.xs,
    color:      T.primary,
    fontWeight: '600',
    marginTop:  rp(3),
  },
  eventCardRight: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  eventEnterBtn: {
    backgroundColor: T.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(8),
    borderRadius:    RADIUS.xs,
  },
  eventEnterText: {
    fontSize:   FONT.xs,
    fontWeight: '700',
    color:      '#fff',
  },
  eventGoLiveBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(4),
    backgroundColor: T.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(8),
    borderRadius:    RADIUS.xs,
  },
  eventGoLiveText: {
    fontSize:   FONT.xs,
    fontWeight: '700',
    color:      '#fff',
  },

  // Live pulse
  livePulseWrap: {
    position:       'absolute',
    top:            -rs(20),
    left:           -rs(20),
    right:          -rs(20),
    bottom:         -rs(20),
    alignItems:     'center',
    justifyContent: 'center',
  },
  livePulseRing: {
    position:     'absolute',
    width:        rs(90),
    height:       rs(90),
    borderRadius: rs(45),
    borderWidth:  1.5,
  },

  // Modal
  modalBackdrop: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent:  'flex-end',
  },
  modalSheet: {
    backgroundColor:  T.surface,
    borderTopLeftRadius:  RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding:          SPACING.lg,
    paddingBottom:    rs(40),
    gap:              SPACING.sm,
    borderTopWidth:   1,
    borderColor:      T.border,
  },
  modalHandle: {
    width:           rs(40),
    height:          rp(4),
    borderRadius:    rp(2),
    backgroundColor: T.border,
    alignSelf:       'center',
    marginBottom:    SPACING.xs,
  },
  modalTitle: {
    fontSize:   FONT.xl,
    fontWeight: '800',
    color:      T.text,
    textAlign:  'center',
    fontFamily: 'PlayfairDisplay-Bold',
  },
  modalSub: {
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    textAlign: 'center',
  },
  modalFieldLabel: {
    fontSize:      FONT.xs,
    fontWeight:    '600',
    color:         T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop:     SPACING.xs,
  },
  modalInput: {
    backgroundColor:  'rgba(255,255,255,0.04)',
    borderRadius:     RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(13),
    fontSize:         FONT.md,
    color:            T.text,
    borderWidth:      1,
    borderColor:      T.border,
  },
  modalHint: {
    fontSize: FONT.xs,
    color:    T.textMuted,
  },
  modalPayBtn: {
    backgroundColor: T.primary,
    height:          BUTTON_HEIGHT,
    borderRadius:    RADIUS.md,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       SPACING.xs,
    shadowColor:     T.primary,
    shadowOffset:    { width: 0, height: rs(4) },
    shadowOpacity:   0.35,
    shadowRadius:    rs(10),
    elevation:       6,
  },
  modalPayBtnText: {
    fontSize:   FONT.md,
    fontWeight: '700',
    color:      '#fff',
  },
  pollingBox: {
    alignItems:    'center',
    paddingVertical: SPACING.lg,
    gap:           SPACING.sm,
  },
  pollingTitle: {
    fontSize:   FONT.lg,
    fontWeight: '700',
    color:      T.text,
  },
  pollingBody: {
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    textAlign: 'center',
  },
  cancelText: {
    fontSize:   FONT.sm,
    color:      T.textMuted,
    paddingVertical: SPACING.xs,
  },
});
