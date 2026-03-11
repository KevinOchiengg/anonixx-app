/**
 * DropLandingScreen
 * What someone sees when they tap a shared card deep link.
 * anonixx://drop/{drop_id}
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Animated, TextInput, Alert,
  KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Clock, Flame, Heart, Lock, MessageCircle,
  Moon, Send, Users, Zap, CheckCircle,
} from 'lucide-react-native';
import { API_BASE_URL } from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const { width, height } = Dimensions.get('window');

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  surfaceAlt: '#1a1f2e',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
};

const CATEGORY_COLORS = {
  love: '#FF6B8A', fun: '#FFB347', adventure: '#47B8FF',
  friendship: '#47FFB8', spicy: '#FF4747',
};

const CATEGORY_EMOJIS = {
  love: '💔', fun: '😈', adventure: '🌍', friendship: '🤝', spicy: '🌶️',
};

const PAYMENT_STEPS = {
  IDLE: 'idle',
  ENTERING_PHONE: 'entering_phone',
  WAITING: 'waiting',
  POLLING: 'polling',
  SUCCESS: 'success',
  FAILED: 'failed',
};

export default function DropLandingScreen({ route, navigation }) {
  const { dropId } = route.params;
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();

  const [drop, setDrop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reaction, setReaction] = useState('');
  const [reacted, setReacted] = useState(false);
  const [reactLoading, setReactLoading] = useState(false);

  const [payStep, setPayStep] = useState(PAYMENT_STEPS.IDLE);
  const [phone, setPhone] = useState('');
  const [checkoutId, setCheckoutId] = useState(null);
  const [pollInterval, setPollInterval] = useState(null);
  const [connectionId, setConnectionId] = useState(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;

  const catColor = drop ? (CATEGORY_COLORS[drop.category] || THEME.primary) : THEME.primary;
  const catEmoji = drop ? (CATEGORY_EMOJIS[drop.category] || '✨') : '✨';

  useEffect(() => {
    loadDrop();
    startPulse();
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    return () => { if (pollInterval) clearInterval(pollInterval); };
  }, []);

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  };

  const loadDrop = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/drops/${dropId}/landing`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) {
        setDrop(data);
        if (data.already_unlocked) {
          setPayStep(PAYMENT_STEPS.SUCCESS);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleReact = async () => {
    if (!reaction.trim()) return;
    if (!isAuthenticated) {
      Alert.alert('Sign in required', 'You need an account to react.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => navigation.navigate('Auth', { screen: 'Login' }) },
      ]);
      return;
    }
    setReactLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/drops/${dropId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reaction: reaction.trim() }),
      });
      if (res.ok) {
        setReacted(true);
        setReaction('');
      } else {
        const data = await res.json();
        Alert.alert('', data.detail || 'Already reacted');
      }
    } catch (e) { console.error(e); }
    finally { setReactLoading(false); }
  };

  const handleUnlockMpesa = async () => {
    if (!phone.trim()) return;
    setPayStep(PAYMENT_STEPS.WAITING);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/drops/${dropId}/unlock/mpesa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone_number: phone.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setCheckoutId(data.checkout_request_id);
        setPayStep(PAYMENT_STEPS.POLLING);
        startPolling();
      } else {
        Alert.alert('Payment Failed', data.detail || 'Try again');
        setPayStep(PAYMENT_STEPS.ENTERING_PHONE);
      }
    } catch (e) {
      Alert.alert('Error', 'Something went wrong');
      setPayStep(PAYMENT_STEPS.ENTERING_PHONE);
    }
  };

  const startPolling = () => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 24) { // 2 mins
        clearInterval(interval);
        setPayStep(PAYMENT_STEPS.FAILED);
        return;
      }
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/api/v1/drops/${dropId}/unlock/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.unlocked) {
          clearInterval(interval);
          setConnectionId(data.connection_id);
          setPayStep(PAYMENT_STEPS.SUCCESS);
          Animated.spring(successScale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
        }
      } catch (e) {}
    }, 5000);
    setPollInterval(interval);
  };

  const handleGoToChat = () => {
    if (connectionId) {
      navigation.replace('DropChat', { connectionId });
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={THEME.primary} size="large" />
      </View>
    );
  }

  if (!drop) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>This drop doesn't exist.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Success / already unlocked ─────────────────────────────
  if (payStep === PAYMENT_STEPS.SUCCESS) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.successContent} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.successIcon, { transform: [{ scale: successScale }] }]}>
            <CheckCircle size={64} color={catColor} />
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
          >
            <MessageCircle size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>Start Chatting</Text>
          </TouchableOpacity>

          <Text style={styles.revealHint}>
            💡 You can reveal your real identity later in chat — for $1
          </Text>
        </ScrollView>
      </View>
    );
  }

  // ── Payment flow ───────────────────────────────────────────
  if (payStep === PAYMENT_STEPS.POLLING) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={catColor} size="large" />
        <Text style={[styles.pollingTitle, { marginTop: 20 }]}>Waiting for payment...</Text>
        <Text style={styles.pollingSubtitle}>Enter your M-Pesa PIN on your phone</Text>
        <TouchableOpacity
          style={[styles.cancelPollBtn]}
          onPress={() => { if (pollInterval) clearInterval(pollInterval); setPayStep(PAYMENT_STEPS.ENTERING_PHONE); }}
        >
          <Text style={styles.cancelPollText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main landing screen ────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={THEME.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Main confession card */}
          <Animated.View style={[styles.mainCard, { borderColor: catColor, transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.cardTop}>
              {drop.is_night_mode && (
                <View style={styles.nightBadge}>
                  <Moon size={12} color="#9B8BFF" />
                  <Text style={styles.nightBadgeText}>Night Drop</Text>
                </View>
              )}
              <View style={styles.catRow}>
                <Text style={styles.catEmoji}>{catEmoji}</Text>
                <Text style={[styles.catLabel, { color: catColor }]}>
                  {drop.category?.toUpperCase()}
                </Text>
                {drop.is_group && (
                  <View style={[styles.groupBadge, { backgroundColor: `${catColor}22` }]}>
                    <Users size={12} color={catColor} />
                    <Text style={[styles.groupBadgeText, { color: catColor }]}>
                      Group · {drop.group_size}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.confession}>"{drop.confession}"</Text>

              <View style={styles.cardMeta}>
                <View style={styles.metaItem}>
                  <Clock size={13} color={THEME.textSecondary} />
                  <Text style={styles.metaText}>
                    {drop.is_expired ? 'Expired' : drop.time_left}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Flame size={13} color={catColor} />
                  <Text style={[styles.metaText, { color: catColor }]}>
                    {drop.unlock_count} unlocked
                  </Text>
                </View>
              </View>

              {/* Reactions display */}
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

          {/* Expired state */}
          {drop.is_expired ? (
            <View style={styles.expiredBox}>
              <Clock size={28} color={THEME.textSecondary} />
              <Text style={styles.expiredTitle}>This drop has expired</Text>
              <Text style={styles.expiredSub}>The person may have created a new one.</Text>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: THEME.primary }]}
                onPress={() => navigation.navigate('ConfessionMarketplace')}
              >
                <Text style={styles.primaryBtnText}>Browse Active Drops</Text>
              </TouchableOpacity>
            </View>
          ) : drop.is_own_drop ? (
            <View style={styles.ownDropBox}>
              <Text style={styles.ownDropText}>This is your drop. Share it to get connections.</Text>
            </View>
          ) : (
            <>
              {/* Pre-payment reaction */}
              {!reacted ? (
                <View style={styles.reactSection}>
                  <Text style={styles.sectionTitle}>Send a free reaction first</Text>
                  <Text style={styles.sectionSub}>One emoji or word — they'll see it, but not who sent it.</Text>
                  <View style={styles.reactRow}>
                    <TextInput
                      style={styles.reactInput}
                      value={reaction}
                      onChangeText={setReaction}
                      placeholder="😍 or 'yes'"
                      placeholderTextColor={THEME.textSecondary}
                      maxLength={10}
                    />
                    <TouchableOpacity
                      style={[styles.reactBtn, { backgroundColor: catColor }, !reaction.trim() && { opacity: 0.4 }]}
                      onPress={handleReact}
                      disabled={!reaction.trim() || reactLoading}
                    >
                      {reactLoading
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Send size={16} color="#fff" />}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.reactedBox}>
                  <CheckCircle size={18} color={catColor} />
                  <Text style={[styles.reactedText, { color: catColor }]}>Reaction sent 👀 They'll see it.</Text>
                </View>
              )}

              {/* Unlock section */}
              <View style={styles.unlockSection}>
                <View style={[styles.lockIconWrap, { backgroundColor: `${catColor}15` }]}>
                  <Lock size={32} color={catColor} />
                </View>
                <Text style={styles.unlockTitle}>
                  Connect for ${drop.price}
                </Text>
                <Text style={styles.unlockSub}>
                  Pay once to unlock anonymous chat with {drop.is_group ? 'this group' : 'this person'}.
                  You stay anonymous unless you choose to reveal.
                </Text>

                {!isAuthenticated ? (
                  <View style={styles.authPrompt}>
                    <Text style={styles.authPromptText}>
                      You need an account to connect.
                    </Text>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: catColor }]}
                      onPress={() => navigation.navigate('Auth', { screen: 'Register' })}
                    >
                      <Text style={styles.primaryBtnText}>Create Free Account</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => navigation.navigate('Auth', { screen: 'Login' })}
                      style={styles.loginLink}
                    >
                      <Text style={styles.loginLinkText}>Already have an account? Log in</Text>
                    </TouchableOpacity>
                  </View>
                ) : payStep === PAYMENT_STEPS.ENTERING_PHONE ? (
                  <View style={styles.phoneInput}>
                    <Text style={styles.phoneLabel}>M-Pesa number</Text>
                    <View style={styles.phoneRow}>
                      <TextInput
                        style={styles.phoneField}
                        value={phone}
                        onChangeText={setPhone}
                        placeholder="2547XXXXXXXX"
                        placeholderTextColor={THEME.textSecondary}
                        keyboardType="phone-pad"
                        maxLength={12}
                      />
                      <TouchableOpacity
                        style={[styles.payBtn, { backgroundColor: catColor }, !phone.trim() && { opacity: 0.4 }]}
                        onPress={handleUnlockMpesa}
                        disabled={!phone.trim()}
                      >
                        <Text style={styles.payBtnText}>Pay</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={() => setPayStep(PAYMENT_STEPS.IDLE)}
                      style={styles.backToOptions}
                    >
                      <Text style={styles.backToOptionsText}>← Back</Text>
                    </TouchableOpacity>
                  </View>
                ) : payStep === PAYMENT_STEPS.FAILED ? (
                  <View style={styles.failedBox}>
                    <Text style={styles.failedText}>Payment timed out. Please try again.</Text>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: catColor }]}
                      onPress={() => setPayStep(PAYMENT_STEPS.ENTERING_PHONE)}
                    >
                      <Text style={styles.primaryBtnText}>Try Again</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.payOptions}>
                    <TouchableOpacity
                      style={[styles.mpesaBtn, { borderColor: catColor }]}
                      onPress={() => setPayStep(PAYMENT_STEPS.ENTERING_PHONE)}
                    >
                      <Text style={styles.mpesaIcon}>📱</Text>
                      <View>
                        <Text style={[styles.mpesaBtnTitle, { color: catColor }]}>Pay with M-Pesa</Text>
                        <Text style={styles.mpesaBtnSub}>STK push to your phone</Text>
                      </View>
                      <Zap size={18} color={catColor} style={{ marginLeft: 'auto' }} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Social proof */}
              {drop.admirer_count > 0 && (
                <View style={styles.admirerBox}>
                  <Heart size={14} color={THEME.primary} fill={THEME.primary} />
                  <Text style={styles.admirerText}>
                    {drop.admirer_count} {drop.admirer_count === 1 ? 'person has' : 'people have'} viewed this
                  </Text>
                </View>
              )}
            </>
          )}

          {/* Join CTA at bottom */}
          <View style={styles.joinCta}>
            <Text style={styles.joinCtaText}>Make your own anonymous confession card →</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Auth', { screen: 'Register' })}
            >
              <Text style={[styles.joinCtaLink, { color: catColor }]}>Join Anonixx free</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: THEME.surface,
  },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  successContent: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 60, alignItems: 'center' },

  // Main card
  mainCard: {
    backgroundColor: THEME.surface, borderRadius: 24,
    borderWidth: 1.5, marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5, shadowRadius: 24, elevation: 12,
  },
  cardTop: { padding: 24 },
  nightBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(155,139,255,0.12)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 12,
  },
  nightBadgeText: { fontSize: 11, color: '#9B8BFF', fontWeight: '600' },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  catEmoji: { fontSize: 20 },
  catLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  groupBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  groupBadgeText: { fontSize: 11, fontWeight: '600' },
  confession: {
    fontSize: 22, lineHeight: 32, color: THEME.text,
    fontStyle: 'italic', marginBottom: 20, letterSpacing: 0.2,
  },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 13, color: THEME.textSecondary, fontWeight: '500' },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  reactionBubble: {
    backgroundColor: THEME.surfaceAlt, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  reactionText: { fontSize: 16 },
  cardBrand: {
    fontSize: 10, color: THEME.textSecondary, opacity: 0.4,
    textAlign: 'right', letterSpacing: 2, textTransform: 'uppercase',
  },

  // React section
  reactSection: {
    backgroundColor: THEME.surface, borderRadius: 18, padding: 18,
    marginBottom: 16, borderWidth: 1, borderColor: THEME.border,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: THEME.text, marginBottom: 4 },
  sectionSub: { fontSize: 13, color: THEME.textSecondary, marginBottom: 14, lineHeight: 18 },
  reactRow: { flexDirection: 'row', gap: 10 },
  reactInput: {
    flex: 1, backgroundColor: THEME.surfaceAlt, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: THEME.text,
    borderWidth: 1, borderColor: THEME.border,
  },
  reactBtn: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  reactedBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: THEME.surface, borderRadius: 14,
    padding: 14, marginBottom: 16, borderWidth: 1, borderColor: THEME.border,
  },
  reactedText: { fontSize: 14, fontWeight: '600' },

  // Unlock section
  unlockSection: {
    backgroundColor: THEME.surface, borderRadius: 18, padding: 22,
    marginBottom: 16, borderWidth: 1, borderColor: THEME.border, alignItems: 'center',
  },
  lockIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  unlockTitle: { fontSize: 20, fontWeight: '800', color: THEME.text, marginBottom: 8 },
  unlockSub: { fontSize: 14, color: THEME.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },

  payOptions: { width: '100%', gap: 10 },
  mpesaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: THEME.surfaceAlt, borderRadius: 16, padding: 16,
    borderWidth: 1.5,
  },
  mpesaIcon: { fontSize: 24 },
  mpesaBtnTitle: { fontSize: 15, fontWeight: '700' },
  mpesaBtnSub: { fontSize: 12, color: THEME.textSecondary, marginTop: 2 },

  phoneInput: { width: '100%' },
  phoneLabel: { fontSize: 13, color: THEME.textSecondary, marginBottom: 8, fontWeight: '500' },
  phoneRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  phoneField: {
    flex: 1, backgroundColor: THEME.surfaceAlt, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: THEME.text,
    borderWidth: 1, borderColor: THEME.border,
  },
  payBtn: {
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  payBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  backToOptions: { alignItems: 'center', paddingVertical: 4 },
  backToOptionsText: { fontSize: 13, color: THEME.textSecondary },

  failedBox: { alignItems: 'center', gap: 12, width: '100%' },
  failedText: { fontSize: 14, color: THEME.textSecondary, textAlign: 'center' },

  authPrompt: { width: '100%', gap: 12 },
  authPromptText: { fontSize: 14, color: THEME.textSecondary, textAlign: 'center' },
  loginLink: { alignItems: 'center' },
  loginLinkText: { fontSize: 13, color: THEME.textSecondary },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, borderRadius: 16, width: '100%',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Admirer box
  admirerBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    justifyContent: 'center', marginBottom: 16,
  },
  admirerText: { fontSize: 13, color: THEME.textSecondary },

  // Expired
  expiredBox: { alignItems: 'center', padding: 28, gap: 12 },
  expiredTitle: { fontSize: 18, fontWeight: '700', color: THEME.text },
  expiredSub: { fontSize: 14, color: THEME.textSecondary, textAlign: 'center' },

  // Own drop
  ownDropBox: {
    backgroundColor: THEME.surface, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: THEME.border, alignItems: 'center', marginBottom: 20,
  },
  ownDropText: { fontSize: 14, color: THEME.textSecondary, textAlign: 'center' },

  // Join CTA
  joinCta: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  joinCtaText: { fontSize: 13, color: THEME.textSecondary },
  joinCtaLink: { fontSize: 14, fontWeight: '700' },

  // Success
  successIcon: { marginBottom: 24 },
  successTitle: { fontSize: 26, fontWeight: '800', color: THEME.text, marginBottom: 12, textAlign: 'center' },
  successSub: { fontSize: 15, color: THEME.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  dropCardSmall: {
    backgroundColor: THEME.surface, borderRadius: 16, padding: 18,
    borderWidth: 1, marginBottom: 28, width: '100%',
  },
  dropCardSmallLabel: { fontSize: 12, color: THEME.textSecondary, fontWeight: '600', marginBottom: 8, letterSpacing: 0.5 },
  dropCardSmallText: { fontSize: 16, color: THEME.text, fontStyle: 'italic', lineHeight: 24 },
  revealHint: { fontSize: 13, color: THEME.textSecondary, textAlign: 'center', marginTop: 16, lineHeight: 20 },

  // Polling
  pollingTitle: { fontSize: 18, fontWeight: '700', color: THEME.text, textAlign: 'center' },
  pollingSubtitle: { fontSize: 14, color: THEME.textSecondary, textAlign: 'center', marginTop: 8 },
  cancelPollBtn: { marginTop: 24, padding: 12 },
  cancelPollText: { fontSize: 14, color: THEME.textSecondary },

  // Error
  errorText: { fontSize: 16, color: THEME.textSecondary, marginBottom: 20 },
  backBtnText: { fontSize: 15, color: THEME.primary, fontWeight: '600' },
});
