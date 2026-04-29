/**
 * DropLandingScreen
 *
 * What someone sees when they tap a shared card deep link.
 *   anonixx://drop/{drop_id}
 *
 * Rebuilt to match the DropsComposeScreen design language:
 *   • shared `T` palette from utils/colorTokens
 *   • DropScreenHeader (with Flag right-action for report)
 *   • PlayfairDisplay-Italic for confessions, titles, success copy
 *   • DMSans for chrome
 *   • tier-2 (After Dark) tokens replace local "night" palette
 *   • category accent colors preserved (each mood has its own hue)
 */
import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Animated, TextInput,
  KeyboardAvoidingView, Platform, Dimensions, Modal,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Clock, Flame, Flag, Heart, Lock, MessageCircle,
  Moon, Users, Zap, CheckCircle, X,
} from 'lucide-react-native';
import { useDispatch, useSelector } from 'react-redux';

import { T } from '../../utils/colorTokens';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP,
} from '../../utils/responsive';
import DropCardRenderer, { DROP_THEMES } from '../../components/drops/DropCardRenderer';
import DropReactions from '../../components/drops/DropReactions';
import DropExpiryTimer from '../../components/drops/DropExpiryTimer';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import { useToast } from '../../components/ui/Toast';
import { BACKENDS } from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Drop landing always fetches from production — links are shared to external
// users who cannot reach a local dev server.
const DROP_API = BACKENDS.production;

// ─── Static data (module level) ───────────────────────────────
// Each mood owns its own accent so the landing page "feels like" that category.
const CATEGORY_COLORS = {
  love:       '#FF6B8A',
  fun:        '#FFB347',
  adventure:  '#47B8FF',
  friendship: '#47FFB8',
  spicy:      '#FF4747',
};

const CATEGORY_EMOJIS = {
  love: '💔', fun: '😈', adventure: '🌍', friendship: '🤝', spicy: '🌶️',
};

const PAY = {
  IDLE:           'idle',
  ENTERING_PHONE: 'entering_phone',
  WAITING:        'waiting',
  POLLING:        'polling',
  SUCCESS:        'success',
  FAILED:         'failed',
};

// Section 19 — report reasons. Must match VALID_REPORT_REASONS in the backend.
const REPORT_REASONS = [
  { slug: 'abuse',             label: 'Abuse or threats' },
  { slug: 'doxxing',           label: 'Names or identifies someone' },
  { slug: 'self-harm-concern', label: "I'm worried about the person" },
  { slug: 'spam',              label: 'Spam or irrelevant' },
  { slug: 'explicit',          label: 'Explicit / unsafe content' },
  { slug: 'other',             label: 'Something else' },
];

const getCatColor = (cat) => CATEGORY_COLORS[cat] ?? T.primary;
const getCatEmoji = (cat) => CATEGORY_EMOJIS[cat] ?? '✨';

// Helpers for category-tinted panels
const tint = (hex, alphaHex) => `${hex}${alphaHex}`; // e.g. '22' = ~13% alpha

// ─── Main Screen ──────────────────────────────────────────────
export default function DropLandingScreen({ route, navigation }) {
  const dispatch           = useDispatch();
  const coinBalance        = useSelector((state) => state.coins.balance);
  const { dropId }         = route.params ?? {};
  const { isAuthenticated} = useAuth();
  const { showToast }      = useToast();

  const [drop, setDrop]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState(null); // 'not_found' | 'network'

  const [payStep, setPayStep]           = useState(PAY.IDLE);
  const [phone, setPhone]               = useState('');
  const [connectionId, setConnectionId] = useState(null);
  const [coinsLoading, setCoinsLoading] = useState(false);

  // Report flow (section 19)
  const [reportOpen, setReportOpen]               = useState(false);
  const [reportSubmitting, setReportSubmitting]   = useState(false);
  const [reportSupportCopy, setReportSupportCopy] = useState(null);

  const videoPlayer  = useVideoPlayer(null, p => { p.loop = false; });
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const fadeAnim     = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const pollRef      = useRef(null);

  // Load video source once drop is fetched
  useEffect(() => {
    if (drop?.media_type === 'video' && drop.media_url) {
      videoPlayer.replace({ uri: drop.media_url });
    }
  }, [drop?.media_url]);

  const catColor = getCatColor(drop?.category);
  const catEmoji = getCatEmoji(drop?.category);

  // ── Animations ────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => {
      pulse.stop();
      clearInterval(pollRef.current);
    };
  }, []);

  // ── Load drop ─────────────────────────────────────────────
  const loadDrop = useCallback(async () => {
    if (!dropId) {
      setFetchError('not_found');
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${DROP_API}/api/v1/drops/${dropId}/landing`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 404) {
        setFetchError('not_found');
        return;
      }
      if (!res.ok) {
        setFetchError('network');
        return;
      }
      const data = await res.json();
      setDrop(data);
      if (data.already_unlocked) setPayStep(PAY.SUCCESS);
    } catch {
      setFetchError('network');
    } finally {
      setLoading(false);
    }
  }, [dropId]);

  useEffect(() => { loadDrop(); }, [loadDrop]);

  // ── Unlock via M-Pesa ─────────────────────────────────────
  const handleUnlockMpesa = useCallback(async () => {
    if (!phone.trim()) return;
    setPayStep(PAY.WAITING);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${DROP_API}/api/v1/drops/${dropId}/unlock/mpesa`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ phone_number: phone.trim() }),
      });
      if (res.ok) {
        setPayStep(PAY.POLLING);
        startPolling();
      } else {
        showToast({ type: 'error', message: 'Payment could not be initiated. Try again.' });
        setPayStep(PAY.ENTERING_PHONE);
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Try again.' });
      setPayStep(PAY.ENTERING_PHONE);
    }
  }, [phone, dropId, showToast]);

  // ── Unlock via Coins ──────────────────────────────────────
  const handleUnlockCoins = useCallback(async () => {
    if (coinsLoading) return;
    setCoinsLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${DROP_API}/api/v1/drops/${dropId}/unlock/coins`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setConnectionId(data.connection_id);
        setPayStep(PAY.SUCCESS);
        Animated.spring(successScale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
      } else if (res.status === 402) {
        showToast({ type: 'warning', message: "Not enough coins. Top up your wallet first." });
      } else {
        showToast({ type: 'error', message: data.detail ?? 'Could not unlock. Try again.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Try again.' });
    } finally {
      setCoinsLoading(false);
    }
  }, [coinsLoading, dropId, showToast, successScale]);

  const startPolling = useCallback(() => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 24) {
        clearInterval(pollRef.current);
        setPayStep(PAY.FAILED);
        return;
      }
      try {
        const token = await AsyncStorage.getItem('token');
        const res   = await fetch(`${DROP_API}/api/v1/drops/${dropId}/unlock/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.unlocked) {
          clearInterval(pollRef.current);
          setConnectionId(data.connection_id);
          setPayStep(PAY.SUCCESS);
          Animated.spring(successScale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
        }
      } catch { /* keep polling */ }
    }, 5000);
  }, [dropId, successScale]);

  const cancelPolling = useCallback(() => {
    clearInterval(pollRef.current);
    setPayStep(PAY.ENTERING_PHONE);
  }, []);

  // ── Navigation ────────────────────────────────────────────
  const handleGoToChat    = useCallback(() => {
    if (connectionId) navigation.replace('DropChat', { connectionId });
  }, [connectionId, navigation]);
  const handleBrowseDrops = useCallback(() => navigation.navigate('ConfessionMarketplace'), [navigation]);
  const handleRegister    = useCallback(() => navigation.navigate('AuthNav', { screen: 'Register' }), [navigation]);
  const handleLogin       = useCallback(() => navigation.navigate('AuthNav', { screen: 'Login' }), [navigation]);

  // ── Report flow (section 19) ──────────────────────────────
  const handleOpenReport = useCallback(() => {
    if (!isAuthenticated) {
      showToast({ type: 'info', message: 'Sign in to report this drop.' });
      return;
    }
    setReportSupportCopy(null);
    setReportOpen(true);
  }, [isAuthenticated, showToast]);

  const handleCloseReport = useCallback(() => setReportOpen(false), []);

  const handleSubmitReport = useCallback(async (reasonSlug) => {
    if (reportSubmitting) return;
    setReportSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${DROP_API}/api/v1/drops/${dropId}/report`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: reasonSlug }),
      });
      if (!res.ok) {
        showToast({ type: 'error', message: "Couldn't send the report. Try again." });
        return;
      }
      const data = await res.json().catch(() => ({}));
      // Self-harm-concern returns a support line — surface it inline.
      if (data?.support_copy) {
        setReportSupportCopy(data.support_copy);
      } else {
        setReportOpen(false);
        showToast({
          type:    'success',
          message: data?.message || "Thanks. We'll review it quickly.",
        });
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Try again.' });
    } finally {
      setReportSubmitting(false);
    }
  }, [dropId, reportSubmitting, showToast]);

  // Header right-action: report flag (hidden for own / expired drops)
  const HeaderRight = useMemo(() => {
    if (!drop || drop.is_own_drop || drop.is_expired) return null;
    return (
      <TouchableOpacity
        onPress={handleOpenReport}
        hitSlop={HIT_SLOP}
        activeOpacity={0.7}
        style={s.reportBtn}
        accessibilityLabel="Report this drop"
      >
        <Flag size={rs(16)} color={T.textSec} strokeWidth={2} />
      </TouchableOpacity>
    );
  }, [drop, handleOpenReport]);

  // ──────────────────────────────────────────────────────────
  // Loading
  if (loading) {
    return (
      <SafeAreaView style={[s.safe, s.centered]} edges={['top', 'left', 'right']}>
        <ActivityIndicator color={T.primary} size="large" />
      </SafeAreaView>
    );
  }

  // Error state
  if (!drop && fetchError) {
    const isNetworkErr = fetchError === 'network';
    return (
      <SafeAreaView style={[s.safe, s.centered]} edges={['top', 'left', 'right']}>
        <Text style={s.errorEmoji}>{isNetworkErr ? '📡' : '🌑'}</Text>
        <Text style={s.errorText}>
          {isNetworkErr ? "Couldn't reach the server." : "This drop doesn't exist."}
        </Text>
        <Text style={s.errorSub}>
          {isNetworkErr
            ? 'Check your connection and try again.'
            : 'It may have expired or been removed.'}
        </Text>
        {isNetworkErr && (
          <TouchableOpacity style={s.retryBtn} onPress={loadDrop} hitSlop={HIT_SLOP} activeOpacity={0.85}>
            <Text style={s.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))}
          hitSlop={HIT_SLOP}
          style={{ marginTop: rp(8) }}
        >
          <Text style={s.errorLink}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Polling state (full screen)
  if (payStep === PAY.POLLING) {
    return (
      <SafeAreaView style={[s.safe, s.centered]} edges={['top', 'left', 'right']}>
        <ActivityIndicator color={catColor} size="large" />
        <Text style={s.pollingTitle}>Waiting for payment…</Text>
        <Text style={s.pollingSubtitle}>Enter your M-Pesa PIN on your phone</Text>
        <TouchableOpacity onPress={cancelPolling} hitSlop={HIT_SLOP} style={s.cancelPollBtn}>
          <Text style={s.cancelPollText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Success state (full screen)
  if (payStep === PAY.SUCCESS) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={s.successContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[s.successIcon, { transform: [{ scale: successScale }] }]}>
            <CheckCircle size={rs(64)} color={catColor} strokeWidth={1.6} />
          </Animated.View>
          <Text style={s.successEyebrow}>CONNECTED</Text>
          <Text style={s.successTitle}>You're in.</Text>
          <Text style={s.successSub}>
            You can now chat anonymously with{' '}
            <Text style={{ color: catColor, fontFamily: 'DMSans-Bold' }}>
              {drop.is_group ? 'the group' : 'this person'}
            </Text>
            . Neither of you knows who the other is — yet.
          </Text>

          <View style={[s.dropCardSmall, { borderColor: tint(catColor, '55') }]}>
            <Text style={s.dropCardSmallLabel}>{catEmoji} Their confession</Text>
            <Text style={s.dropCardSmallText}>"{drop.confession}"</Text>
          </View>

          <TouchableOpacity
            style={[s.primaryBtn, { backgroundColor: catColor, shadowColor: catColor }]}
            onPress={handleGoToChat}
            hitSlop={HIT_SLOP}
            activeOpacity={0.9}
          >
            <MessageCircle size={rs(18)} color="#fff" strokeWidth={2.2} />
            <Text style={s.primaryBtnText}>Start Chatting</Text>
          </TouchableOpacity>

          <Text style={s.revealHint}>
            You can reveal your real identity later in chat — for $1
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Main landing ──────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <DropScreenHeader
        title="Drop"
        navigation={navigation}
        right={HeaderRight}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeAnim }}>

            {/* ── Main confession card ── */}
            <Animated.View style={[s.mainCardWrap, { transform: [{ scale: pulseAnim }] }]}>
              {/* Context badges */}
              <View style={s.contextRow}>
                {drop.is_night_mode && (
                  <View style={s.nightBadge}>
                    <Moon size={rs(12)} color={T.tier2} strokeWidth={2} />
                    <Text style={s.nightBadgeText}>After Dark</Text>
                  </View>
                )}
                {drop.is_group && (
                  <View style={[
                    s.groupBadge,
                    { backgroundColor: tint(catColor, '22'), borderColor: tint(catColor, '55') },
                  ]}>
                    <Users size={rs(12)} color={catColor} strokeWidth={2} />
                    <Text style={[s.groupBadgeText, { color: catColor }]}>
                      Group · {drop.group_size}
                    </Text>
                  </View>
                )}
                {drop.intensity ? (
                  <View style={[s.intensityPill, { borderColor: tint(catColor, '66') }]}>
                    <Text style={[s.intensityPillText, { color: catColor }]}>
                      · {drop.intensity} ·
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* One-word recognition hint (section 11) */}
              {drop.recognition_hint && !drop.is_own_drop ? (
                <View style={s.hintBanner}>
                  <Text style={s.hintBannerKicker}>a hint they left for you</Text>
                  <Text style={[s.hintBannerWord, { color: catColor }]}>
                    "{drop.recognition_hint}"
                  </Text>
                  <Text style={s.hintBannerNote}>
                    You might recognize it. Or not. That's the whole thing.
                  </Text>
                </View>
              ) : null}

              {/* Video (native controls) plays above the card */}
              {drop.media_type === 'video' && drop.media_url ? (
                <View style={s.mediaWrap}>
                  <VideoView
                    player={videoPlayer}
                    style={s.mediaVideo}
                    contentFit="cover"
                    nativeControls
                  />
                </View>
              ) : null}

              <DropCardRenderer
                confession={drop.confession || ''}
                moodTag={drop.mood_tag || drop.category || 'longing'}
                emotionalContext={drop.emotional_context}
                teaseMode={!!drop.tease_mode && !drop.is_own_drop && !drop.already_unlocked}
                theme={drop.theme || 'cinematic-coral'}
                mediaUrl={drop.media_type === 'image' ? drop.media_url : null}
                layoutMode="split"
                confessionId={drop.id || dropId}
                seed={drop.id || dropId || drop.confession}
                cardWidth={SCREEN_WIDTH - SPACING.md * 2}
              />

              {/* Meta strip */}
              <View style={s.cardMeta}>
                <View style={s.metaItem}>
                  <Flame size={rs(13)} color={catColor} strokeWidth={2} />
                  <Text style={[s.metaText, { color: catColor }]}>
                    {drop.unlock_count || 0} unlocked
                  </Text>
                </View>
                <DropExpiryTimer
                  createdAt={drop.created_at}
                  accent={(DROP_THEMES[drop.theme] || DROP_THEMES['cinematic-coral']).accent}
                  align="right"
                />
              </View>

              {/* Emotional reactions */}
              {!drop.is_expired && !drop.is_own_drop && drop.id ? (
                <DropReactions
                  dropId={drop.id}
                  initialReaction={drop.user_reaction}
                  accent={(DROP_THEMES[drop.theme] || DROP_THEMES['cinematic-coral']).accent}
                />
              ) : null}
            </Animated.View>

            {/* ── Expired ── */}
            {drop.is_expired ? (
              <View style={s.expiredBox}>
                <Clock size={rs(28)} color={T.textSec} strokeWidth={1.6} />
                <Text style={s.expiredTitle}>This drop has expired</Text>
                <Text style={s.expiredSub}>The person may have created a new one.</Text>
                <TouchableOpacity
                  style={[s.primaryBtn, { backgroundColor: T.primary, shadowColor: T.primary }]}
                  onPress={handleBrowseDrops}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.9}
                >
                  <Text style={s.primaryBtnText}>Browse Active Drops</Text>
                </TouchableOpacity>
              </View>

            /* ── Own drop ── */
            ) : drop.is_own_drop ? (
              <View style={s.ownDropBox}>
                <Text style={s.ownDropText}>
                  This is your drop. Share it to get connections.
                </Text>
              </View>

            /* ── Unlock ── */
            ) : (
              <>
                <View style={s.unlockSection}>
                  {drop.is_origin_author ? (
                    /* ── Free unlock — viewer is the author of the inspiring post ── */
                    <View style={s.originAuthorWrap}>
                      <View style={[s.lockIconWrap, { backgroundColor: 'rgba(255,99,74,0.12)' }]}>
                        <Flame size={rs(32)} color={T.primary} strokeWidth={1.8} />
                      </View>
                      <Text style={s.originAuthorTitle}>They resonated with your confession</Text>
                      <Text style={s.originAuthorSub}>
                        This drop was inspired by something you wrote.{'\n'}
                        Connect at a discounted rate — {drop.origin_unlock_cost ?? 10} coins instead of {drop.price}.
                      </Text>
                      {coinBalance < (drop.origin_unlock_cost ?? 10) && (
                        <Text style={s.originAuthorLowCoins}>
                          You need {(drop.origin_unlock_cost ?? 10) - coinBalance} more coins — top up in Wallet.
                        </Text>
                      )}
                      <TouchableOpacity
                        style={[
                          s.primaryBtn,
                          { backgroundColor: T.primary, shadowColor: T.primary },
                          coinBalance < (drop.origin_unlock_cost ?? 10) && { opacity: 0.45 },
                        ]}
                        onPress={handleUnlockCoins}
                        disabled={coinsLoading || coinBalance < (drop.origin_unlock_cost ?? 10)}
                        hitSlop={HIT_SLOP}
                        activeOpacity={0.9}
                      >
                        {coinsLoading
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={s.primaryBtnText}>
                              Connect · {drop.origin_unlock_cost ?? 10} coins 🪙
                            </Text>
                        }
                      </TouchableOpacity>
                    </View>
                  ) : (
                    /* ── Regular paid unlock flow ── */
                    <>
                      <View style={[s.lockIconWrap, { backgroundColor: tint(catColor, '1E') }]}>
                        <Lock size={rs(32)} color={catColor} strokeWidth={1.8} />
                      </View>
                      <Text style={s.unlockTitle}>Connect for ${drop.price}</Text>
                      <Text style={s.unlockSub}>
                        Pay once to unlock anonymous chat with{' '}
                        {drop.is_group ? 'this group' : 'this person'}.
                        You stay anonymous unless you choose to reveal.
                      </Text>

                      {!isAuthenticated ? (
                        <View style={s.authPrompt}>
                          <Text style={s.authPromptText}>You need an account to connect.</Text>
                          <TouchableOpacity
                            style={[s.primaryBtn, { backgroundColor: catColor, shadowColor: catColor }]}
                            onPress={handleRegister}
                            hitSlop={HIT_SLOP}
                            activeOpacity={0.9}
                          >
                            <Text style={s.primaryBtnText}>Create Free Account</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={handleLogin} hitSlop={HIT_SLOP} style={s.loginLink}>
                            <Text style={s.loginLinkText}>
                              Already have an account? Log in
                            </Text>
                          </TouchableOpacity>
                        </View>

                      ) : payStep === PAY.ENTERING_PHONE ? (
                        <View style={s.phoneWrap}>
                          <Text style={s.phoneLabel}>M-Pesa number</Text>
                          <View style={s.phoneRow}>
                            <TextInput
                              style={s.phoneField}
                              value={phone}
                              onChangeText={setPhone}
                              placeholder="2547XXXXXXXX"
                              placeholderTextColor={T.textMute}
                              keyboardType="phone-pad"
                              maxLength={12}
                            />
                            <TouchableOpacity
                              style={[
                                s.payBtn,
                                { backgroundColor: catColor },
                                !phone.trim() && { opacity: 0.4 },
                              ]}
                              onPress={handleUnlockMpesa}
                              disabled={!phone.trim()}
                              hitSlop={HIT_SLOP}
                              activeOpacity={0.85}
                            >
                              <Text style={s.payBtnText}>Pay</Text>
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity
                            onPress={() => setPayStep(PAY.IDLE)}
                            hitSlop={HIT_SLOP}
                            style={s.backToOptions}
                          >
                            <Text style={s.backToOptionsText}>← Back</Text>
                          </TouchableOpacity>
                        </View>

                      ) : payStep === PAY.FAILED ? (
                        <View style={s.failedBox}>
                          <Text style={s.failedText}>Payment timed out. Please try again.</Text>
                          <TouchableOpacity
                            style={[s.primaryBtn, { backgroundColor: catColor, shadowColor: catColor }]}
                            onPress={() => setPayStep(PAY.ENTERING_PHONE)}
                            hitSlop={HIT_SLOP}
                            activeOpacity={0.9}
                          >
                            <Text style={s.primaryBtnText}>Try Again</Text>
                          </TouchableOpacity>
                        </View>

                      ) : (
                        <View style={s.payOptions}>
                          {/* ── Coins option ── */}
                          <TouchableOpacity
                            style={[
                              s.payChoice,
                              { borderColor: coinBalance >= 30 ? '#fbbf24' : 'rgba(251,191,36,0.28)' },
                            ]}
                            onPress={handleUnlockCoins}
                            disabled={coinsLoading}
                            hitSlop={HIT_SLOP}
                            activeOpacity={0.9}
                          >
                            <Text style={s.payChoiceIcon}>🪙</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={[s.payChoiceTitle, { color: '#fbbf24' }]}>
                                {coinsLoading ? 'Unlocking…' : 'Pay with Coins · 30'}
                              </Text>
                              <Text style={s.payChoiceSub}>
                                {coinBalance >= 30
                                  ? `Balance: ${coinBalance} coins`
                                  : `Need ${30 - coinBalance} more coins — top up in Wallet`}
                              </Text>
                            </View>
                            <Zap size={rs(18)} color="#fbbf24" strokeWidth={2} />
                          </TouchableOpacity>

                          {/* ── M-Pesa option ── */}
                          <TouchableOpacity
                            style={[s.payChoice, { borderColor: catColor }]}
                            onPress={() => setPayStep(PAY.ENTERING_PHONE)}
                            hitSlop={HIT_SLOP}
                            activeOpacity={0.9}
                          >
                            <Text style={s.payChoiceIcon}>📱</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={[s.payChoiceTitle, { color: catColor }]}>
                                Pay with M-Pesa
                              </Text>
                              <Text style={s.payChoiceSub}>STK push to your phone</Text>
                            </View>
                            <Zap size={rs(18)} color={catColor} strokeWidth={2} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </>
                  )}
                </View>

                {/* Social proof */}
                {drop.admirer_count > 0 && (
                  <View style={s.admirerBox}>
                    <Heart size={rs(14)} color={T.primary} fill={T.primary} />
                    <Text style={s.admirerText}>
                      {drop.admirer_count}{' '}
                      {drop.admirer_count === 1 ? 'person has' : 'people have'} viewed this
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* Join CTA */}
            <View style={s.joinCta}>
              <Text style={s.joinCtaText}>
                Make your own anonymous confession card →
              </Text>
              <TouchableOpacity onPress={handleRegister} hitSlop={HIT_SLOP}>
                <Text style={[s.joinCtaLink, { color: catColor }]}>
                  Join Anonixx free
                </Text>
              </TouchableOpacity>
            </View>

          </Animated.View>
        </ScrollView>

        {/* Report modal (section 19) */}
        <Modal
          visible={reportOpen}
          transparent
          animationType="fade"
          onRequestClose={handleCloseReport}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={s.reportBackdrop}
            onPress={handleCloseReport}
          >
            <TouchableOpacity activeOpacity={1} style={s.reportSheet}>
              <View style={s.reportHeader}>
                <Text style={s.reportTitle}>Why are you reporting this?</Text>
                <TouchableOpacity
                  onPress={handleCloseReport}
                  hitSlop={HIT_SLOP}
                  style={s.reportClose}
                >
                  <X size={rs(18)} color={T.textSec} strokeWidth={2} />
                </TouchableOpacity>
              </View>
              <Text style={s.reportSub}>
                Reports stay anonymous. Nobody is told it was you.
              </Text>

              {reportSupportCopy ? (
                <View style={s.supportBox}>
                  <Text style={s.supportText}>{reportSupportCopy}</Text>
                  <TouchableOpacity
                    style={[
                      s.primaryBtn,
                      { backgroundColor: catColor, shadowColor: catColor, marginTop: SPACING.sm },
                    ]}
                    onPress={handleCloseReport}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.9}
                  >
                    <Text style={s.primaryBtnText}>Okay</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.reasonList}>
                  {REPORT_REASONS.map(({ slug, label }) => (
                    <TouchableOpacity
                      key={slug}
                      style={[s.reasonRow, reportSubmitting && { opacity: 0.5 }]}
                      onPress={() => handleSubmitReport(slug)}
                      disabled={reportSubmitting}
                      hitSlop={HIT_SLOP}
                      activeOpacity={0.8}
                    >
                      <Text style={s.reasonText}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: T.background },
  centered: { justifyContent: 'center', alignItems: 'center' },

  // Header right button
  reportBtn: {
    width:           rs(32),
    height:          rs(32),
    borderRadius:    RADIUS.full,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: T.surfaceAlt,
    borderWidth:     1,
    borderColor:     T.border,
  },

  content: {
    paddingHorizontal: SPACING.md,
    paddingBottom:     rs(60),
    paddingTop:        SPACING.sm,
  },

  // ── Main card ──
  mainCardWrap: {
    marginBottom:  SPACING.lg,
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: rs(12) },
    shadowOpacity: 0.5,
    shadowRadius:  rs(24),
    elevation:     12,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(8),
    marginBottom:  SPACING.sm,
    flexWrap:      'wrap',
  },
  nightBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(4),
    backgroundColor:   T.tier2Dim,
    borderRadius:      RADIUS.sm,
    paddingHorizontal: rp(8),
    paddingVertical:   rp(3),
    borderWidth:       1,
    borderColor:       T.tier2Border,
  },
  nightBadgeText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.tier2,
    letterSpacing: 0.8,
  },
  groupBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(4),
    paddingHorizontal: rp(8),
    paddingVertical:   rp(3),
    borderRadius:      RADIUS.sm,
    borderWidth:       1,
  },
  groupBadgeText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    letterSpacing: 0.6,
  },
  intensityPill: {
    paddingHorizontal: rp(10),
    paddingVertical:   rp(3),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    backgroundColor:   'rgba(255,255,255,0.02)',
  },
  intensityPillText: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(10),
    letterSpacing: 2,
    textTransform: 'lowercase',
  },

  hintBanner: {
    alignSelf:         'stretch',
    marginBottom:      SPACING.md,
    paddingHorizontal: rp(16),
    paddingVertical:   rp(14),
    borderLeftWidth:   rs(2),
    borderLeftColor:   T.borderStrong,
    backgroundColor:   T.surfaceAlt,
    borderRadius:      RADIUS.sm,
  },
  hintBannerKicker: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.textSec,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  hintBannerWord: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(22),
    letterSpacing: 0.5,
    lineHeight:    rf(30),
    marginTop:     rp(6),
  },
  hintBannerNote: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 0.3,
    marginTop:     rp(6),
  },

  mediaWrap:  { marginBottom: SPACING.md, borderRadius: RADIUS.md, overflow: 'hidden' },
  mediaVideo: { width: '100%', height: rs(220), borderRadius: RADIUS.md },

  cardMeta: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.md,
    marginTop:     SPACING.sm,
    marginBottom:  SPACING.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(5),
  },
  metaText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    letterSpacing: 0.4,
  },

  // ── Unlock ──
  unlockSection: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    padding:         SPACING.lg,
    marginBottom:    SPACING.md,
    borderWidth:     1,
    borderColor:     T.border,
    alignItems:      'center',
  },
  lockIconWrap: {
    width:          rs(72),
    height:         rs(72),
    borderRadius:   rs(36),
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   SPACING.md,
  },
  unlockTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.xl,
    color:         T.text,
    marginBottom:  rp(8),
    letterSpacing: 0.3,
  },
  unlockSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    textAlign:     'center',
    lineHeight:    rf(20),
    marginBottom:  SPACING.md,
    letterSpacing: 0.3,
  },

  payOptions: { width: '100%', gap: SPACING.sm },
  payChoice: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SPACING.sm,
    backgroundColor: T.surfaceAlt,
    borderRadius:    RADIUS.md,
    padding:         SPACING.md,
    borderWidth:     1.5,
  },
  payChoiceIcon: { fontSize: rf(22) },
  payChoiceTitle: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    letterSpacing: 0.4,
  },
  payChoiceSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textSec,
    marginTop:     rp(2),
    letterSpacing: 0.2,
  },

  // Phone input
  phoneWrap:  { width: '100%' },
  phoneLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.textSec,
    marginBottom:  SPACING.xs,
    letterSpacing: 0.4,
  },
  phoneRow: {
    flexDirection: 'row',
    gap:           SPACING.sm,
    marginBottom:  SPACING.xs,
  },
  phoneField: {
    flex:              1,
    backgroundColor:   T.surfaceAlt,
    borderRadius:      RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(12),
    fontFamily:        'DMSans-Regular',
    fontSize:          FONT.md,
    color:             T.text,
    borderWidth:       1,
    borderColor:       T.border,
  },
  payBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(12),
    borderRadius:      RADIUS.md,
    alignItems:        'center',
    justifyContent:    'center',
  },
  payBtnText: {
    fontFamily: 'DMSans-Bold',
    fontSize:   FONT.md,
    color:      '#fff',
    letterSpacing: 0.4,
  },
  backToOptions:     { alignItems: 'center', paddingVertical: rp(4) },
  backToOptionsText: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textSec,
  },

  failedBox:  { alignItems: 'center', gap: SPACING.sm, width: '100%' },
  failedText: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textSec,
    textAlign:  'center',
  },

  authPrompt:     { width: '100%', gap: SPACING.sm },
  authPromptText: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textSec,
    textAlign:  'center',
  },
  loginLink:     { alignItems: 'center' },
  loginLinkText: {
    fontFamily: 'DMSans-Regular',
    fontSize:   FONT.sm,
    color:      T.textSec,
  },

  primaryBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             SPACING.xs,
    paddingVertical: rp(15),
    borderRadius:    RADIUS.md,
    width:           '100%',
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

  // Admirer
  admirerBox: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            SPACING.xs,
    justifyContent: 'center',
    marginBottom:   SPACING.md,
  },
  admirerText: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textSec,
  },

  // Expired
  expiredBox: {
    alignItems: 'center',
    padding:    SPACING.xl,
    gap:        SPACING.sm,
  },
  expiredTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    letterSpacing: 0.3,
  },
  expiredSub: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textSec,
    textAlign:  'center',
  },

  // Origin-author free unlock
  originAuthorWrap: {
    width:        '100%',
    alignItems:   'center',
    gap:          SPACING.sm,
  },
  originAuthorTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    textAlign:     'center',
    letterSpacing: 0.2,
  },
  originAuthorSub: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textSec,
    textAlign:  'center',
    lineHeight: rf(20),
  },
  originAuthorLowCoins: {
    fontFamily: 'DMSans-Regular',
    fontSize:   rf(11),
    color:      '#fbbf24',
    textAlign:  'center',
  },

  // Own drop
  ownDropBox: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    padding:         SPACING.md,
    borderWidth:     1,
    borderColor:     T.border,
    alignItems:      'center',
    marginBottom:    SPACING.md,
  },
  ownDropText: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textSec,
    textAlign:  'center',
  },

  // Join CTA
  joinCta: {
    alignItems:      'center',
    paddingVertical: SPACING.lg,
    gap:             SPACING.xs,
  },
  joinCtaText: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textSec,
  },
  joinCtaLink: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    letterSpacing: 0.4,
  },

  // ── Success screen ──
  successContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop:        rs(40),
    paddingBottom:     rs(60),
    alignItems:        'center',
  },
  successIcon: { marginBottom: SPACING.lg },
  successEyebrow: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.textMute,
    letterSpacing: 2,
    marginBottom:  SPACING.sm,
  },
  successTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(32),
    color:         T.text,
    marginBottom:  SPACING.sm,
    textAlign:     'center',
    letterSpacing: 0.3,
  },
  successSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.md,
    color:         T.textSec,
    textAlign:     'center',
    lineHeight:    rf(22),
    marginBottom:  SPACING.xl,
    letterSpacing: 0.2,
  },
  dropCardSmall: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    padding:         SPACING.md,
    borderWidth:     1,
    marginBottom:    SPACING.xl,
    width:           '100%',
  },
  dropCardSmallLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.textSec,
    marginBottom:  SPACING.xs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  dropCardSmallText: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.md,
    color:         T.text,
    lineHeight:    rf(24),
    letterSpacing: 0.2,
  },
  revealHint: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textMute,
    textAlign:     'center',
    marginTop:     SPACING.md,
    lineHeight:    rf(20),
    letterSpacing: 0.3,
  },

  // ── Polling ──
  pollingTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    textAlign:     'center',
    marginTop:     SPACING.md,
    letterSpacing: 0.3,
  },
  pollingSubtitle: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textSec,
    textAlign:  'center',
    marginTop:  SPACING.xs,
  },
  cancelPollBtn: { marginTop: SPACING.lg, padding: SPACING.sm },
  cancelPollText: {
    fontFamily: 'DMSans-Regular',
    fontSize:   FONT.sm,
    color:      T.textSec,
  },

  // ── Error ──
  errorEmoji: { fontSize: rf(40), marginBottom: SPACING.sm },
  errorText: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    textAlign:     'center',
    marginBottom:  rp(6),
    letterSpacing: 0.3,
  },
  errorSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    textAlign:     'center',
    marginBottom:  SPACING.md,
    lineHeight:    rf(20),
    letterSpacing: 0.3,
  },
  errorLink: {
    fontFamily: 'DMSans-Regular',
    fontSize:   FONT.sm,
    color:      T.textSec,
  },
  retryBtn: {
    backgroundColor:   T.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical:   rp(12),
    borderRadius:      RADIUS.md,
    marginBottom:      SPACING.sm,
  },
  retryBtnText: {
    fontFamily:    'DMSans-Bold',
    color:         '#fff',
    fontSize:      FONT.md,
    letterSpacing: 0.4,
  },

  // ── Report modal ──
  reportBackdrop: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent:  'flex-end',
  },
  reportSheet: {
    backgroundColor:      T.surface,
    borderTopLeftRadius:  RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal:    SPACING.lg,
    paddingTop:           SPACING.md,
    paddingBottom:        SPACING.xl,
    borderTopWidth:       1,
    borderTopColor:       T.border,
  },
  reportHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  reportTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    flex:          1,
    letterSpacing: 0.3,
  },
  reportClose: {
    width:           rs(32),
    height:          rs(32),
    borderRadius:    rs(16),
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: T.surfaceAlt,
    borderWidth:     1,
    borderColor:     T.border,
  },
  reportSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    marginTop:     rp(6),
    marginBottom:  SPACING.md,
    lineHeight:    rf(20),
    letterSpacing: 0.2,
  },
  reasonList: { gap: rp(6) },
  reasonRow: {
    backgroundColor:   T.surfaceAlt,
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(14),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
  },
  reasonText: {
    fontFamily: 'DMSans-Regular',
    fontSize:   FONT.md,
    color:      T.text,
    letterSpacing: 0.2,
  },
  supportBox: {
    backgroundColor:   T.primaryDim,
    borderColor:       T.primaryBorder,
    borderWidth:       1,
    borderRadius:      RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.md,
    marginTop:         SPACING.sm,
  },
  supportText: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.text,
    lineHeight:    rf(22),
    letterSpacing: 0.3,
  },
});
