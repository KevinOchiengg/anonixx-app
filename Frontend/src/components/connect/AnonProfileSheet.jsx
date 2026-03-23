/**
 * AnonProfileSheet.jsx
 * Anonymous user profile — slides up to 80% of screen.
 * Full content always visible. No truncation. No cramping.
 *
 * Design: Like opening a letter from a stranger.
 * You know their energy before you know their name.
 * The aura color sets the entire atmosphere of the sheet.
 */
import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Animated, Dimensions, Modal, PanResponder, ScrollView,
  StyleSheet, Text, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { X, MessageCircle, UserCheck, Clock } from 'lucide-react-native';
import { useSelector } from 'react-redux';
import { API_BASE_URL } from '../../config/api';
import { useToast } from '../ui/Toast';
import CoinGate from '../payments/CoinGate';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';

const { height: H, width: W } = Dimensions.get('window');

// ─── Theme ────────────────────────────────────────────────────
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
  borderStrong:  'rgba(255,255,255,0.10)',
  avatarBg:      '#1e2330',
};

// ─── Static data ──────────────────────────────────────────────
const AVATAR_MAP = {
  ghost:   '👻', shadow: '🌑', flame: '🔥',   void:    '🕳️',
  storm:   '⛈️', smoke:  '💨', eclipse: '🌘',  shard:   '🔷',
  moth:    '🦋', raven:  '🐦', mirror: '🪞',   ember:   '🕯️',
  current: '⚡', still:  '🌊', hollow: '🫙',   signal:  '📡',
};

const CONNECT_COPY = {
  default:  { label: 'I want to know you',  sub: "They won't know it's you." },
  pending:  { label: 'Waiting for them…',    sub: 'Your request is out there.' },
  chatting: { label: 'Open the conversation', sub: 'You\'re already connected.' },
};

// ─── Stat Item ────────────────────────────────────────────────
const StatItem = React.memo(({ value, label }) => (
  <View style={styles.statItem}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
));

// ─── Vibe Tag ─────────────────────────────────────────────────
const VibeTag = React.memo(({ tag, accentColor }) => (
  <View style={[styles.vibeTag, {
    backgroundColor: accentColor + '15',
    borderColor:     accentColor + '35',
  }]}>
    <Text style={[styles.vibeTagText, { color: accentColor }]}>{tag}</Text>
  </View>
));

// ─── Main Component ───────────────────────────────────────────
export default function AnonProfileSheet({
  visible, anonymousName, onClose, navigation,
}) {
  const { showToast }  = useToast();
  const balance        = useSelector((state) => state.coins.balance);
  const [profile,      setProfile]      = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [gateVisible,  setGateVisible]  = useState(false);

  const slideAnim     = useRef(new Animated.Value(H)).current;
  const backdropOp    = useRef(new Animated.Value(0)).current;
  const avatarScale   = useRef(new Animated.Value(0.8)).current;
  const contentOp     = useRef(new Animated.Value(0)).current;

  // ── Pan responder (swipe to close) ───────────────────────
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => {
      if (g.dy > 0) slideAnim.setValue(g.dy);
    },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 80) closeSheet();
      else Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, friction: 10,
      }).start();
    },
  })).current;

  // ── Open / close ──────────────────────────────────────────
  const openSheet = useCallback(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, friction: 10, tension: 60,
      }),
      Animated.timing(backdropOp, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      // Animate content in after sheet opens
      Animated.parallel([
        Animated.spring(avatarScale, {
          toValue: 1, tension: 60, friction: 8, useNativeDriver: true,
        }),
        Animated.timing(contentOp, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();
    });
  }, []);

  const closeSheet = useCallback(() => {
    avatarScale.setValue(0.8);
    contentOp.setValue(0);
    Animated.parallel([
      Animated.timing(slideAnim,  { toValue: H, duration: 260, useNativeDriver: true }),
      Animated.timing(backdropOp, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start(() => onClose());
  }, [onClose]);

  // ── Load profile ──────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    if (!anonymousName) return;
    setLoading(true);
    setError(null);
    setProfile(null);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        setError('Sign in to view profiles.');
        return;
      }
      const res  = await fetch(
        `${API_BASE_URL}/api/v1/connect/profile/${encodeURIComponent(anonymousName)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not load profile.');
      setProfile(data);
    } catch (e) {
      setError(e.message || 'Could not load profile.');
    } finally {
      setLoading(false);
    }
  }, [anonymousName]);

  useEffect(() => {
    if (visible && anonymousName) {
      openSheet();
      loadProfile();
    } else if (!visible) {
      slideAnim.setValue(H);
      backdropOp.setValue(0);
      avatarScale.setValue(0.8);
      contentOp.setValue(0);
    }
  }, [visible, anonymousName]);

  // ── Send the actual request (called after coin gate confirms) ──
  const sendConnectRequest = useCallback(async () => {
    setConnectLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showToast({ type: 'error', message: 'Sign in to connect.' });
        return;
      }
      const res  = await fetch(`${API_BASE_URL}/api/v1/connect/request`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ to_anonymous_name: anonymousName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not send request.');
      setProfile(p => ({ ...p, connect_status: 'pending' }));
      showToast({ type: 'success', message: 'Request sent. Now wait.' });
    } catch (e) {
      showToast({ type: 'error', message: e.message || 'Could not send request.' });
    } finally {
      setConnectLoading(false);
    }
  }, [anonymousName, showToast]);

  // ── Connect button handler ─────────────────────────────────
  const handleConnect = useCallback(() => {
    if (!profile || connectLoading) return;

    // Already chatting → open chat directly (free)
    if (profile.connect_status === 'chatting' && profile.chat_id) {
      closeSheet();
      setTimeout(() => {
        navigation?.navigate('Chat', {
          chatId:    profile.chat_id,
          otherName: anonymousName,
        });
      }, 300);
      return;
    }

    if (profile.connect_status === 'pending') return;

    // New request → pay 60 coins via CoinGate
    setGateVisible(true);
  }, [profile, connectLoading, anonymousName, closeSheet, navigation]);

  const accentColor = profile?.avatar_color ?? T.primary;
  const connectStatus = profile?.connect_status ?? 'default';
  const connectCopy   = CONNECT_COPY[connectStatus] ?? CONNECT_COPY.default;
  const isDisabled    = connectStatus === 'pending' || connectLoading;

  // ──────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOp }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeSheet} />
      </Animated.View>

      {/* Sheet — 80% height */}
      <Animated.View style={[
        styles.sheet,
        { transform: [{ translateY: slideAnim }] }
      ]}>

        {/* Aura glow from accent color */}
        <View style={[styles.auraGlow, { backgroundColor: accentColor }]} />

        {/* Drag handle area */}
        <View style={styles.handleArea} {...panResponder.panHandlers}>
          <View style={styles.handle} />
        </View>

        {/* Close button */}
        <TouchableOpacity
          onPress={closeSheet}
          hitSlop={HIT_SLOP}
          style={styles.closeBtn}
        >
          <X size={rs(18)} color={T.textMuted} />
        </TouchableOpacity>

        {/* Loading */}
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator color={T.primary} size="large" />
            <Text style={styles.loadingText}>Reading the aura…</Text>
          </View>
        )}

        {/* Error */}
        {error && !loading && (
          <View style={styles.centered}>
            <Text style={styles.errorEmoji}>🌑</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={loadProfile}
              hitSlop={HIT_SLOP}
            >
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Coin gate — sits outside the sheet so it overlays correctly */}
        <CoinGate
          visible={gateVisible}
          reason="connect_unlock"
          cost={60}
          actionLabel="Send connect request"
          actionEmoji="🔗"
          description={`Connect with ${anonymousName}`}
          onConfirm={sendConnectRequest}
          onClose={() => setGateVisible(false)}
        />

        {/* Profile content */}
        {profile && !loading && (
          <Animated.View style={[styles.contentWrap, { opacity: contentOp }]}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              bounces={false}
            >

              {/* Avatar */}
              <Animated.View style={[
                styles.avatarCircle,
                {
                  backgroundColor: accentColor + '20',
                  borderColor:     accentColor + '40',
                  transform:       [{ scale: avatarScale }],
                }
              ]}>
                <Text style={styles.avatarEmoji}>
                  {AVATAR_MAP[profile.avatar] ?? '👤'}
                </Text>
                {/* Pulse ring */}
                <View style={[
                  styles.avatarGlow,
                  { backgroundColor: accentColor + '12' }
                ]} />
              </Animated.View>

              {/* Name */}
              <Text style={styles.name}>{profile.anonymous_name}</Text>

              {/* Vibe tags */}
              {profile.vibe_tags?.length > 0 && (
                <View style={styles.vibesRow}>
                  {profile.vibe_tags.map(tag => (
                    <VibeTag key={tag} tag={tag} accentColor={accentColor} />
                  ))}
                </View>
              )}

              {/* Stats */}
              <View style={styles.statsRow}>
                <StatItem
                  value={profile.confession_count ?? 0}
                  label="confessions"
                />
                <View style={styles.statDivider} />
                <StatItem
                  value={profile.join_date || '—'}
                  label="member since"
                />
                {profile.connections_count != null && (
                  <>
                    <View style={styles.statDivider} />
                    <StatItem
                      value={profile.connections_count}
                      label="connections"
                    />
                  </>
                )}
              </View>

              {/* Bio / mood if present */}
              {profile.mood && (
                <View style={[styles.moodCard, { borderColor: accentColor + '25' }]}>
                  <Text style={styles.moodLabel}>current mood</Text>
                  <Text style={styles.moodText}>{profile.mood}</Text>
                </View>
              )}

              {/* Connect button */}
              <TouchableOpacity
                style={[
                  styles.connectBtn,
                  { backgroundColor: accentColor },
                  isDisabled       && styles.connectBtnDisabled,
                  connectStatus === 'chatting' && [
                    styles.connectBtnChatting,
                    { borderColor: accentColor },
                  ],
                ]}
                onPress={handleConnect}
                disabled={isDisabled}
                hitSlop={HIT_SLOP}
                activeOpacity={0.85}
              >
                {connectLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={styles.connectBtnInner}>
                    {connectStatus === 'chatting' && (
                      <MessageCircle size={rs(16)} color={accentColor} />
                    )}
                    {connectStatus === 'pending' && (
                      <Clock size={rs(16)} color={T.textSecondary} />
                    )}
                    {connectStatus === 'default' && (
                      <UserCheck size={rs(16)} color="#fff" />
                    )}
                    <Text style={[
                      styles.connectBtnText,
                      isDisabled && { color: T.textSecondary },
                      connectStatus === 'chatting' && { color: accentColor },
                    ]}>
                      {connectCopy.label}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Sub-copy */}
              <Text style={styles.connectSub}>{connectCopy.sub}</Text>

            </ScrollView>
          </Animated.View>
        )}
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },

  sheet: {
    position:             'absolute',
    bottom:               0,
    left:                 0,
    right:                0,
    height:               H * 0.80,        // ← 80% of screen
    backgroundColor:      T.surface,
    borderTopLeftRadius:  RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth:       1,
    borderColor:          T.borderStrong,
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -rs(8) },
    shadowOpacity:        0.5,
    shadowRadius:         rs(24),
    elevation:            20,
    overflow:             'hidden',
  },

  // Aura glow
  auraGlow: {
    position:     'absolute',
    top:          -rs(60),
    alignSelf:    'center',
    width:        W,
    height:       rs(160),
    opacity:      0.07,
    borderRadius: rs(80),
  },

  // Handle
  handleArea: {
    alignItems:    'center',
    paddingTop:    rp(12),
    paddingBottom: rp(4),
  },
  handle: {
    width:           rs(40),
    height:          rp(4),
    borderRadius:    rp(2),
    backgroundColor: T.borderStrong,
  },

  // Close button
  closeBtn: {
    position:        'absolute',
    top:             rp(14),
    right:           rp(16),
    width:           rs(32),
    height:          rs(32),
    borderRadius:    rs(16),
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems:      'center',
    justifyContent:  'center',
    zIndex:          10,
  },

  // Loading / error
  centered: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SPACING.sm,
    paddingBottom:  rs(60),
  },
  loadingText: {
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    fontStyle: 'italic',
  },
  errorEmoji: { fontSize: rf(40) },
  errorText:  {
    color:     T.textSecondary,
    fontSize:  FONT.sm,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
  },
  retryBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(8),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       T.primary,
  },
  retryText: { color: T.primary, fontSize: FONT.sm, fontWeight: '600' },

  // Content
  contentWrap:   { flex: 1 },
  scrollContent: {
    alignItems:        'center',
    paddingHorizontal: SPACING.lg,
    paddingTop:        SPACING.sm,
    paddingBottom:     rs(40),
    gap:               SPACING.md,
  },

  // Avatar
  avatarCircle: {
    width:          rs(90),
    height:         rs(90),
    borderRadius:   rs(45),
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1.5,
    position:       'relative',
    marginBottom:   SPACING.xs,
  },
  avatarEmoji: { fontSize: rf(40) },
  avatarGlow: {
    position:     'absolute',
    width:        rs(110),
    height:       rs(110),
    borderRadius: rs(55),
    top:          -rs(10),
    left:         -rs(10),
  },

  // Name
  name: {
    fontSize:      rf(24),
    fontWeight:    '700',
    color:         T.text,
    letterSpacing: 0.3,
    textAlign:     'center',
    fontFamily:    'PlayfairDisplay-Bold',
  },

  // Vibe tags
  vibesRow: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    justifyContent: 'center',
    gap:            rp(8),
  },
  vibeTag: {
    paddingHorizontal: rp(14),
    paddingVertical:   rp(7),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
  },
  vibeTagText: {
    fontSize:      FONT.sm,
    letterSpacing: 0.2,
    fontWeight:    '500',
  },

  // Stats
  statsRow: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   T.surfaceAlt,
    borderRadius:      RADIUS.md,
    paddingVertical:   rp(16),
    paddingHorizontal: rp(24),
    gap:               rp(20),
    borderWidth:       1,
    borderColor:       T.border,
    width:             '100%',
    justifyContent:    'center',
  },
  statItem:   { alignItems: 'center', gap: rp(4) },
  statValue:  { fontSize: FONT.lg, fontWeight: '700', color: T.text },
  statLabel:  {
    fontSize:      FONT.xs,
    color:         T.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statDivider: {
    width:           1,
    height:          rp(28),
    backgroundColor: T.border,
  },

  // Mood card
  moodCard: {
    width:             '100%',
    backgroundColor:   T.surfaceAlt,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    padding:           SPACING.md,
    gap:               rp(4),
  },
  moodLabel: {
    fontSize:      FONT.xs,
    color:         T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  moodText: {
    fontSize:  FONT.md,
    color:     T.text,
    fontStyle: 'italic',
    lineHeight: rf(22),
    fontFamily: 'PlayfairDisplay-Italic',
  },

  // Connect button
  connectBtn: {
    width:          '100%',
    height:         BUTTON_HEIGHT,
    borderRadius:   RADIUS.md,
    alignItems:     'center',
    justifyContent: 'center',
    shadowOffset:   { width: 0, height: rs(4) },
    shadowOpacity:  0.35,
    shadowRadius:   rs(10),
    elevation:      6,
    marginTop:      SPACING.xs,
  },
  connectBtnDisabled: {
    backgroundColor: T.surfaceAlt,
    shadowOpacity:   0,
    elevation:       0,
  },
  connectBtnChatting: {
    backgroundColor: 'transparent',
    borderWidth:     1.5,
    shadowOpacity:   0,
    elevation:       0,
  },
  connectBtnInner: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.xs,
  },
  connectBtnText: {
    color:         '#fff',
    fontSize:      FONT.md,
    fontWeight:    '700',
    letterSpacing: 0.3,
  },

  // Sub-copy
  connectSub: {
    color:             T.textMuted,
    fontSize:          FONT.xs,
    textAlign:         'center',
    fontStyle:         'italic',
    lineHeight:        rf(18),
    paddingHorizontal: SPACING.md,
  },
});
