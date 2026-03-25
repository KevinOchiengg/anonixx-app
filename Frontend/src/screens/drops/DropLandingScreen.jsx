/**
 * DropLandingScreen
 * What someone sees when they tap a shared card deep link.
 * anonixx://drop/{drop_id}
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Animated, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Clock, Flame, Heart, Lock, MessageCircle,
  Moon, Send, Users, Zap, CheckCircle,
} from 'lucide-react-native';
import { rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP } from '../../utils/responsive';
import { useDispatch, useSelector } from 'react-redux';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { useAuth } from '../../context/AuthContext';

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  background:   '#0b0f18',
  surface:      '#151924',
  surfaceAlt:   '#1a1f2e',
  primary:      '#FF634A',
  text:         '#EAEAF0',
  textSecondary:'#9A9AA3',
  border:       'rgba(255,255,255,0.06)',
  night:        '#9B8BFF',
  nightDim:     'rgba(155,139,255,0.12)',
};

// ─── Static data (module level) ───────────────────────────────────────────────
const CATEGORY_COLORS = {
  love: '#FF6B8A', fun: '#FFB347', adventure: '#47B8FF',
  friendship: '#47FFB8', spicy: '#FF4747',
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

const getCatColor = (cat) => CATEGORY_COLORS[cat] ?? T.primary;
const getCatEmoji = (cat) => CATEGORY_EMOJIS[cat] ?? '✨';

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DropLandingScreen({ route, navigation }) {
  const dispatch           = useDispatch();
  const coinBalance        = useSelector((state) => state.coins.balance);
  const { dropId }         = route.params;
  const { isAuthenticated} = useAuth();
  const { showToast }      = useToast();

  const [drop, setDrop]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [fetchError, setFetchError] = useState(null); // 'not_found' | 'network'
  const [reaction, setReaction]   = useState('');
  const [reacted, setReacted]     = useState(false);
  const [reactLoading, setReactLoading] = useState(false);

  const [payStep, setPayStep]         = useState(PAY.IDLE);
  const [phone, setPhone]             = useState('');
  const [connectionId, setConnectionId] = useState(null);
  const [coinsLoading, setCoinsLoading] = useState(false);

  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const fadeAnim     = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const pollRef      = useRef(null);

  const catColor = getCatColor(drop?.category);
  const catEmoji = getCatEmoji(drop?.category);

  // ── Animations ───────────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => {
      pulse.stop();
      clearInterval(pollRef.current);
    };
  }, []);

  // ── Load drop ─────────────────────────────────────────────────────────────────
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
      const res   = await fetch(`${API_BASE_URL}/api/v1/drops/${dropId}/landing`, {
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

  // ── React ─────────────────────────────────────────────────────────────────────
  const handleReact = useCallback(async () => {
    if (!reaction.trim()) return;
    if (!isAuthenticated) {
      showToast({ type: 'info', message: 'Sign in to react.' });
      navigation.navigate('Auth', { screen: 'Login' });
      return;
    }
    setReactLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/drops/${dropId}/react`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ reaction: reaction.trim() }),
      });
      if (res.ok) {
        setReacted(true);
        setReaction('');
      } else {
        showToast({ type: 'error', message: 'Already reacted to this drop.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not send reaction.' });
    } finally {
      setReactLoading(false);
    }
  }, [reaction, isAuthenticated, dropId, navigation, showToast]);

  // ── Unlock via M-Pesa ─────────────────────────────────────────────────────────
  const handleUnlockMpesa = useCallback(async () => {
    if (!phone.trim()) return;
    setPayStep(PAY.WAITING);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/drops/${dropId}/unlock/mpesa`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ phone_number: phone.trim() }),
      });
      const data = await res.json();
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

  // ── Unlock via Coins ─────────────────────────────────────────────────────────
  const handleUnlockCoins = useCallback(async () => {
    if (coinsLoading) return;
    setCoinsLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/drops/${dropId}/unlock/coins`, {
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
        const res   = await fetch(`${API_BASE_URL}/api/v1/drops/${dropId}/unlock/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.unlocked) {
          clearInterval(pollRef.current);
          setConnectionId(data.connection_id);
          setPayStep(PAY.SUCCESS);
          Animated.spring(successScale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
        }
      } catch {}
    }, 5000);
  }, [dropId, successScale]);

  const cancelPolling = useCallback(() => {
    clearInterval(pollRef.current);
    setPayStep(PAY.ENTERING_PHONE);
  }, []);

  // ── Navigation ────────────────────────────────────────────────────────────────
  const handleGoToChat = useCallback(() => {
    if (connectionId) navigation.replace('DropChat', { connectionId });
  }, [connectionId, navigation]);

  const handleBrowseDrops  = useCallback(() => navigation.navigate('ConfessionMarketplace'), [navigation]);
  const handleRegister     = useCallback(() => navigation.navigate('Auth', { screen: 'Register' }), [navigation]);
  const handleLogin        = useCallback(() => navigation.navigate('Auth', { screen: 'Login' }), [navigation]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Loading
  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]} edges={['top', 'left', 'right']}>
        <ActivityIndicator color={T.primary} size="large" />
      </SafeAreaView>
    );
  }

  // Error state
  if (!drop && fetchError) {
    const isNetworkErr = fetchError === 'network';
    return (
      <SafeAreaView style={[styles.safe, styles.centered]} edges={['top', 'left', 'right']}>
        <Text style={styles.errorEmoji}>{isNetworkErr ? '📡' : '🌑'}</Text>
        <Text style={styles.errorText}>
          {isNetworkErr
            ? "Couldn't reach the server."
            : "This drop doesn't exist."}
        </Text>
        <Text style={styles.errorSub}>
          {isNetworkErr
            ? 'Check your connection and try again.'
            : 'It may have expired or been removed.'}
        </Text>
        {isNetworkErr && (
          <TouchableOpacity style={styles.retryBtn} onPress={loadDrop} hitSlop={HIT_SLOP}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main')} hitSlop={HIT_SLOP} style={{ marginTop: rp(8) }}>
          <Text style={styles.errorLink}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Polling state (full screen)
  if (payStep === PAY.POLLING) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]} edges={['top', 'left', 'right']}>
        <ActivityIndicator color={catColor} size="large" />
        <Text style={styles.pollingTitle}>Waiting for payment…</Text>
        <Text style={styles.pollingSubtitle}>Enter your M-Pesa PIN on your phone</Text>
        <TouchableOpacity onPress={cancelPolling} hitSlop={HIT_SLOP} style={styles.cancelPollBtn}>
          <Text style={styles.cancelPollText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Success state (full screen)
  if (payStep === PAY.SUCCESS) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.successContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.successIcon, { transform: [{ scale: successScale }] }]}>
            <CheckCircle size={rs(64)} color={catColor} />
          </Animated.View>
          <Text style={styles.successTitle}>You're connected 🔓</Text>
          <Text style={styles.successSub}>
            You can now chat anonymously with{' '}
            <Text style={{ color: catColor }}>{drop.is_group ? 'the group' : 'this person'}</Text>.
            Neither of you knows who the other is — yet.
          </Text>

          <View style={[styles.dropCardSmall, { borderColor: catColor }]}>
            <Text style={styles.dropCardSmallLabel}>{catEmoji} Their confession</Text>
            <Text style={styles.dropCardSmallText}>"{drop.confession}"</Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: catColor }]}
            onPress={handleGoToChat}
            hitSlop={HIT_SLOP}
          >
            <MessageCircle size={rs(20)} color="#fff" />
            <Text style={styles.primaryBtnText}>Start Chatting</Text>
          </TouchableOpacity>

          <Text style={styles.revealHint}>
            💡 You can reveal your real identity later in chat — for $1
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Main landing
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Back button */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={HIT_SLOP}
            style={styles.backBtn}
          >
            <ArrowLeft size={rs(22)} color={T.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Main confession card */}
            <Animated.View style={[
              styles.mainCard,
              { borderColor: catColor, transform: [{ scale: pulseAnim }] },
            ]}>
              <View style={styles.cardTop}>
                {drop.is_night_mode && (
                  <View style={styles.nightBadge}>
                    <Moon size={rs(12)} color={T.night} />
                    <Text style={styles.nightBadgeText}>Night Drop</Text>
                  </View>
                )}

                <View style={styles.catRow}>
                  <Text style={styles.catEmoji}>{catEmoji}</Text>
                  <Text style={[styles.catLabel, { color: catColor }]}>
                    {drop.category?.toUpperCase()}
                  </Text>
                  {drop.is_group && (
                    <View style={[styles.groupBadge, { backgroundColor: catColor + '22' }]}>
                      <Users size={rs(12)} color={catColor} />
                      <Text style={[styles.groupBadgeText, { color: catColor }]}>
                        Group · {drop.group_size}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.confession}>"{drop.confession}"</Text>

                <View style={styles.cardMeta}>
                  <View style={styles.metaItem}>
                    <Clock size={rs(13)} color={T.textSecondary} />
                    <Text style={styles.metaText}>
                      {drop.is_expired ? 'Expired' : drop.time_left}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Flame size={rs(13)} color={catColor} />
                    <Text style={[styles.metaText, { color: catColor }]}>
                      {drop.unlock_count} unlocked
                    </Text>
                  </View>
                </View>

                {drop.reactions?.length > 0 && (
                  <View style={styles.reactionsRow}>
                    {drop.reactions.slice(-8).map((r, i) => (
                      <View key={i} style={styles.reactionBubble}>
                        <Text style={styles.reactionText}>{r}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={styles.cardBrand}>anonixx</Text>
              </View>
            </Animated.View>

            {/* ── Expired ── */}
            {drop.is_expired ? (
              <View style={styles.expiredBox}>
                <Clock size={rs(28)} color={T.textSecondary} />
                <Text style={styles.expiredTitle}>This drop has expired</Text>
                <Text style={styles.expiredSub}>The person may have created a new one.</Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: T.primary }]}
                  onPress={handleBrowseDrops}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={styles.primaryBtnText}>Browse Active Drops</Text>
                </TouchableOpacity>
              </View>

            ) : drop.is_own_drop ? (
              <View style={styles.ownDropBox}>
                <Text style={styles.ownDropText}>
                  This is your drop. Share it to get connections.
                </Text>
              </View>

            ) : (
              <>
                {/* Reaction */}
                {!reacted ? (
                  <View style={styles.reactSection}>
                    <Text style={styles.sectionTitle}>Send a free reaction first</Text>
                    <Text style={styles.sectionSub}>
                      One emoji or word — they'll see it, but not who sent it.
                    </Text>
                    <View style={styles.reactRow}>
                      <TextInput
                        style={styles.reactInput}
                        value={reaction}
                        onChangeText={setReaction}
                        placeholder="😍 or 'yes'"
                        placeholderTextColor={T.textSecondary}
                        maxLength={10}
                      />
                      <TouchableOpacity
                        style={[
                          styles.reactBtn,
                          { backgroundColor: catColor },
                          !reaction.trim() && { opacity: 0.4 },
                        ]}
                        onPress={handleReact}
                        disabled={!reaction.trim() || reactLoading}
                        hitSlop={HIT_SLOP}
                      >
                        {reactLoading
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Send size={rs(16)} color="#fff" />
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.reactedBox}>
                    <CheckCircle size={rs(18)} color={catColor} />
                    <Text style={[styles.reactedText, { color: catColor }]}>
                      Reaction sent 👀 They'll see it.
                    </Text>
                  </View>
                )}

                {/* Unlock section */}
                <View style={styles.unlockSection}>
                  <View style={[styles.lockIconWrap, { backgroundColor: catColor + '15' }]}>
                    <Lock size={rs(32)} color={catColor} />
                  </View>
                  <Text style={styles.unlockTitle}>Connect for ${drop.price}</Text>
                  <Text style={styles.unlockSub}>
                    Pay once to unlock anonymous chat with{' '}
                    {drop.is_group ? 'this group' : 'this person'}.
                    You stay anonymous unless you choose to reveal.
                  </Text>

                  {!isAuthenticated ? (
                    <View style={styles.authPrompt}>
                      <Text style={styles.authPromptText}>
                        You need an account to connect.
                      </Text>
                      <TouchableOpacity
                        style={[styles.primaryBtn, { backgroundColor: catColor }]}
                        onPress={handleRegister}
                        hitSlop={HIT_SLOP}
                      >
                        <Text style={styles.primaryBtnText}>Create Free Account</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleLogin} hitSlop={HIT_SLOP} style={styles.loginLink}>
                        <Text style={styles.loginLinkText}>
                          Already have an account? Log in
                        </Text>
                      </TouchableOpacity>
                    </View>

                  ) : payStep === PAY.ENTERING_PHONE ? (
                    <View style={styles.phoneWrap}>
                      <Text style={styles.phoneLabel}>M-Pesa number</Text>
                      <View style={styles.phoneRow}>
                        <TextInput
                          style={styles.phoneField}
                          value={phone}
                          onChangeText={setPhone}
                          placeholder="2547XXXXXXXX"
                          placeholderTextColor={T.textSecondary}
                          keyboardType="phone-pad"
                          maxLength={12}
                        />
                        <TouchableOpacity
                          style={[
                            styles.payBtn,
                            { backgroundColor: catColor },
                            !phone.trim() && { opacity: 0.4 },
                          ]}
                          onPress={handleUnlockMpesa}
                          disabled={!phone.trim()}
                          hitSlop={HIT_SLOP}
                        >
                          <Text style={styles.payBtnText}>Pay</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        onPress={() => setPayStep(PAY.IDLE)}
                        hitSlop={HIT_SLOP}
                        style={styles.backToOptions}
                      >
                        <Text style={styles.backToOptionsText}>← Back</Text>
                      </TouchableOpacity>
                    </View>

                  ) : payStep === PAY.FAILED ? (
                    <View style={styles.failedBox}>
                      <Text style={styles.failedText}>Payment timed out. Please try again.</Text>
                      <TouchableOpacity
                        style={[styles.primaryBtn, { backgroundColor: catColor }]}
                        onPress={() => setPayStep(PAY.ENTERING_PHONE)}
                        hitSlop={HIT_SLOP}
                      >
                        <Text style={styles.primaryBtnText}>Try Again</Text>
                      </TouchableOpacity>
                    </View>

                  ) : (
                    <View style={styles.payOptions}>
                      {/* ── Coins option ── */}
                      <TouchableOpacity
                        style={[
                          styles.mpesaBtn,
                          { borderColor: coinBalance >= 30 ? '#fbbf24' : 'rgba(251,191,36,0.3)' },
                        ]}
                        onPress={handleUnlockCoins}
                        disabled={coinsLoading}
                        hitSlop={HIT_SLOP}
                      >
                        <Text style={styles.mpesaIcon}>🪙</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.mpesaBtnTitle, { color: '#fbbf24' }]}>
                            {coinsLoading ? 'Unlocking…' : 'Pay with Coins · 30'}
                          </Text>
                          <Text style={styles.mpesaBtnSub}>
                            {coinBalance >= 30
                              ? `Balance: ${coinBalance} coins`
                              : `Need ${30 - coinBalance} more coins — top up in Wallet`}
                          </Text>
                        </View>
                        <Zap size={rs(18)} color="#fbbf24" />
                      </TouchableOpacity>

                      {/* ── M-Pesa option ── */}
                      <TouchableOpacity
                        style={[styles.mpesaBtn, { borderColor: catColor }]}
                        onPress={() => setPayStep(PAY.ENTERING_PHONE)}
                        hitSlop={HIT_SLOP}
                      >
                        <Text style={styles.mpesaIcon}>📱</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.mpesaBtnTitle, { color: catColor }]}>
                            Pay with M-Pesa
                          </Text>
                          <Text style={styles.mpesaBtnSub}>STK push to your phone</Text>
                        </View>
                        <Zap size={rs(18)} color={catColor} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Social proof */}
                {drop.admirer_count > 0 && (
                  <View style={styles.admirerBox}>
                    <Heart size={rs(14)} color={T.primary} fill={T.primary} />
                    <Text style={styles.admirerText}>
                      {drop.admirer_count}{' '}
                      {drop.admirer_count === 1 ? 'person has' : 'people have'} viewed this
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* Join CTA */}
            <View style={styles.joinCta}>
              <Text style={styles.joinCtaText}>
                Make your own anonymous confession card →
              </Text>
              <TouchableOpacity onPress={handleRegister} hitSlop={HIT_SLOP}>
                <Text style={[styles.joinCtaLink, { color: catColor }]}>
                  Join Anonixx free
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: T.background },
  centered:{ justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  backBtn: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(20),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surface,
  },

  content: {
    paddingHorizontal: SPACING.md,
    paddingBottom: rs(60),
  },
  successContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: rs(40),
    paddingBottom: rs(60),
    alignItems: 'center',
  },

  // Confession card
  mainCard: {
    backgroundColor: T.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1.5,
    marginBottom: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: rs(12) },
    shadowOpacity: 0.5,
    shadowRadius: rs(24),
    elevation: 12,
  },
  cardTop:  { padding: SPACING.lg },
  nightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(4),
    backgroundColor: T.nightDim,
    borderRadius: RADIUS.xs,
    paddingHorizontal: rp(8),
    paddingVertical: rp(3),
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
  },
  nightBadgeText: { fontSize: FONT.xs, color: T.night, fontWeight: '600' },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  catEmoji: { fontSize: rf(20) },
  catLabel: { fontSize: FONT.xs, fontWeight: '800', letterSpacing: 1.5 },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(4),
    paddingHorizontal: rp(8),
    paddingVertical: rp(3),
    borderRadius: RADIUS.xs,
  },
  groupBadgeText: { fontSize: FONT.xs, fontWeight: '600' },
  confession: {
    fontSize: rf(22),
    lineHeight: rf(32),
    color: T.text,
    fontStyle: 'italic',
    marginBottom: SPACING.md,
    letterSpacing: 0.2,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: rp(5) },
  metaText: { fontSize: FONT.sm, color: T.textSecondary, fontWeight: '500' },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rp(6),
    marginBottom: SPACING.sm,
  },
  reactionBubble: {
    backgroundColor: T.surfaceAlt,
    borderRadius: RADIUS.sm,
    paddingHorizontal: rp(10),
    paddingVertical: rp(5),
  },
  reactionText: { fontSize: rf(16) },
  cardBrand: {
    fontSize: rf(10),
    color: T.textSecondary,
    opacity: 0.4,
    textAlign: 'right',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // React section
  reactSection: {
    backgroundColor: T.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: T.border,
  },
  sectionTitle: { fontSize: FONT.md, fontWeight: '700', color: T.text, marginBottom: rp(4) },
  sectionSub: {
    fontSize: FONT.sm,
    color: T.textSecondary,
    marginBottom: SPACING.sm,
    lineHeight: rf(18),
  },
  reactRow: { flexDirection: 'row', gap: SPACING.sm },
  reactInput: {
    flex: 1,
    backgroundColor: T.surfaceAlt,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: rp(11),
    fontSize: FONT.md,
    color: T.text,
    borderWidth: 1,
    borderColor: T.border,
  },
  reactBtn: {
    width: rs(46),
    height: rs(46),
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: T.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: T.border,
  },
  reactedText: { fontSize: FONT.sm, fontWeight: '600' },

  // Unlock section
  unlockSection: {
    backgroundColor: T.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
  },
  lockIconWrap: {
    width: rs(72),
    height: rs(72),
    borderRadius: rs(36),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  unlockTitle: { fontSize: FONT.xl, fontWeight: '800', color: T.text, marginBottom: rp(8) },
  unlockSub: {
    fontSize: FONT.sm,
    color: T.textSecondary,
    textAlign: 'center',
    lineHeight: rf(20),
    marginBottom: SPACING.md,
  },

  // Pay options
  payOptions: { width: '100%', gap: SPACING.sm },
  mpesaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: T.surfaceAlt,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1.5,
  },
  mpesaIcon:    { fontSize: rf(24) },
  mpesaBtnTitle:{ fontSize: FONT.md, fontWeight: '700' },
  mpesaBtnSub:  { fontSize: FONT.xs, color: T.textSecondary, marginTop: rp(2) },

  // Phone input
  phoneWrap:  { width: '100%' },
  phoneLabel: { fontSize: FONT.sm, color: T.textSecondary, marginBottom: SPACING.xs, fontWeight: '500' },
  phoneRow:   { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xs },
  phoneField: {
    flex: 1,
    backgroundColor: T.surfaceAlt,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: rp(12),
    fontSize: FONT.md,
    color: T.text,
    borderWidth: 1,
    borderColor: T.border,
  },
  payBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: rp(12),
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnText:      { fontSize: FONT.md, fontWeight: '700', color: '#fff' },
  backToOptions:   { alignItems: 'center', paddingVertical: rp(4) },
  backToOptionsText:{ fontSize: FONT.sm, color: T.textSecondary },

  failedBox:  { alignItems: 'center', gap: SPACING.sm, width: '100%' },
  failedText: { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center' },

  authPrompt:    { width: '100%', gap: SPACING.sm },
  authPromptText:{ fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center' },
  loginLink:     { alignItems: 'center' },
  loginLinkText: { fontSize: FONT.sm, color: T.textSecondary },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: rp(15),
    borderRadius: RADIUS.md,
    width: '100%',
  },
  primaryBtnText: { fontSize: FONT.md, fontWeight: '700', color: '#fff' },

  // Admirer
  admirerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  admirerText: { fontSize: FONT.sm, color: T.textSecondary },

  // Expired
  expiredBox: {
    alignItems: 'center',
    padding: SPACING.xl,
    gap: SPACING.sm,
  },
  expiredTitle: { fontSize: FONT.lg, fontWeight: '700', color: T.text },
  expiredSub:   { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center' },

  // Own drop
  ownDropBox: {
    backgroundColor: T.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  ownDropText: { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center' },

  // Join CTA
  joinCta: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.xs,
  },
  joinCtaText: { fontSize: FONT.sm, color: T.textSecondary },
  joinCtaLink: { fontSize: FONT.sm, fontWeight: '700' },

  // Success
  successIcon:        { marginBottom: SPACING.lg },
  successTitle:       { fontSize: rf(26), fontWeight: '800', color: T.text, marginBottom: SPACING.sm, textAlign: 'center' },
  successSub:         { fontSize: FONT.md, color: T.textSecondary, textAlign: 'center', lineHeight: rf(22), marginBottom: SPACING.xl },
  dropCardSmall:      { backgroundColor: T.surface, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, marginBottom: SPACING.xl, width: '100%' },
  dropCardSmallLabel: { fontSize: FONT.xs, color: T.textSecondary, fontWeight: '600', marginBottom: SPACING.xs, letterSpacing: 0.5 },
  dropCardSmallText:  { fontSize: FONT.md, color: T.text, fontStyle: 'italic', lineHeight: rf(24) },
  revealHint:         { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', marginTop: SPACING.md, lineHeight: rf(20) },

  // Polling
  pollingTitle:    { fontSize: FONT.lg, fontWeight: '700', color: T.text, textAlign: 'center', marginTop: SPACING.md },
  pollingSubtitle: { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', marginTop: SPACING.xs },
  cancelPollBtn:   { marginTop: SPACING.lg, padding: SPACING.sm },
  cancelPollText:  { fontSize: FONT.sm, color: T.textSecondary },

  // Error state
  errorEmoji: { fontSize: rf(40), marginBottom: SPACING.sm },
  errorText:  { fontSize: FONT.lg, color: T.text, fontWeight: '700', textAlign: 'center', marginBottom: rp(6) },
  errorSub:   { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', marginBottom: SPACING.md, lineHeight: rf(20) },
  errorLink:  { fontSize: FONT.sm, color: T.textSecondary },
  retryBtn: {
    backgroundColor: T.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical:   rp(12),
    borderRadius:      RADIUS.md,
    marginBottom:      SPACING.sm,
  },
  retryBtnText: { color: '#fff', fontSize: FONT.md, fontWeight: '700' },
});
