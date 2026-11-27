/** Anonymous profile sheet (80% height). Their aura colour sets the sheet's mood. */
import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Animated, Dimensions, Modal, PanResponder, ScrollView,
  StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  X, UserCheck, Crown, MapPin, Link2, CircleAlert,
} from 'lucide-react-native';

import { API_BASE_URL } from '../../config/api';
import { knockCopy, payIn, settleKnock } from '../../utils/knock';
import AuthorAvatar from '../common/AuthorAvatar';
import { useToast } from '../ui/Toast';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';
import T from '../../utils/theme';

const { height: H } = Dimensions.get('window');

// ─── Static data ──────────────────────────────────────────────
const GENDER_BADGE = {
  male:     { symbol: '♂', label: 'Male' },
  female:   { symbol: '♀', label: 'Female' },
  nonbinary: { symbol: '⚧', label: 'Non-binary' },
};

// ─── Stat Item ────────────────────────────────────────────────
const StatItem = React.memo(({ value, label }) => (
  <View style={styles.statItem}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
));

// ─── Main Component ───────────────────────────────────────────
export default function AnonProfileSheet({
  visible, anonymousName, userId, post, linkupTarget, onClose, navigation, byUser,
}) {
  const { showToast } = useToast();
  const [profile,      setProfile]      = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [pay,          setPay]          = useState(null);   // the Link Up coin details, shown in the sheet
  const [paying,       setPaying]       = useState(false);

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
        setError('Sign in to see who they are.');
        return;
      }
      // Look up by id (names aren't unique); by name only if there's no id.
      const url = userId
        ? `${API_BASE_URL}/api/v1/connect/profile/id/${encodeURIComponent(userId)}`
        : `${API_BASE_URL}/api/v1/connect/profile/${encodeURIComponent(anonymousName)}`;
      const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not load profile.');
      setProfile(data);
    } catch (e) {
      setError(e.message || 'Could not load profile.');
    } finally {
      setLoading(false);
    }
  }, [anonymousName, userId]);

  useEffect(() => {
    if (visible) { setPay(null); setPaying(false); }
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

  // ── Link up: opens PostUnlockScreen with the post (or a linkupTarget). ──
  // byUser (opened from a comment): sends a request on their latest post that they accept or
  // decline (coins leave only on accept), or opens the chat if you're already linked.
  const handleLinkUp = useCallback(async () => {
    if (!post && !linkupTarget && !(byUser && userId)) return;
    if (!byUser && !post) {
      closeSheet();
      setTimeout(() => navigation?.navigate('PostUnlock', { linkupTarget, viaProfile: true }), 300);
      return;
    }
    const token = await AsyncStorage.getItem('token');
    if (!token) { navigation?.navigate('AuthNav', { screen: 'Login' }); return; }
    if (!byUser) { setPay({ target: post, copy: knockCopy(post) }); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/chat-profile/${userId}/knock-target`, { headers: { Authorization: `Bearer ${token}` } });
      const t = await res.json().catch(() => ({}));
      if (!res.ok) { showToast({ type: 'warning', message: t?.detail || "Couldn't open their profile." }); return; }
      if (t.connection_id) {
        closeSheet();
        setTimeout(() => navigation?.navigate('DropChat', { connectionId: t.connection_id }), 300);
      } else if (!t.post) showToast({ type: 'info', message: `${anonymousName || 'They'} hasn't posted anything to link up on yet.` });
      else { const target = { ...t.post, ask: true }; setPay({ target, copy: knockCopy(target) }); }
    } catch {
      showToast({ type: 'warning', message: "Can't reach Anonixx right now." });
    }
  }, [post, linkupTarget, byUser, userId, anonymousName, closeSheet, navigation, showToast]);

  const confirmPay = useCallback(async () => {
    if (!pay || paying) return;
    setPaying(true);
    const { target } = pay;
    const r = await payIn(target.id, !!target.kind && target.kind !== 'hookup', !!target.ask);
    setPaying(false);
    closeSheet();
    setTimeout(() => settleKnock(navigation, target, r, showToast), 300);
  }, [pay, paying, closeSheet, navigation, showToast]);

  const accentColor = T.primary;

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
            <CircleAlert size={rs(36)} color={T.textMuted} strokeWidth={2} style={{ marginBottom: rp(8) }} />
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

        {/* Profile content */}
        {profile && !loading && (
          <Animated.View style={[styles.contentWrap, { opacity: contentOp }]}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              bounces={false}
            >

              {/* Avatar: their photo, else the name's first letter. */}
              <Animated.View style={[
                styles.avatarCircle,
                {
                  backgroundColor: accentColor + '20',
                  borderColor:     accentColor + '40',
                  transform:       [{ scale: avatarScale }],
                }
              ]}>
                {profile.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.portrait}>
                    <AuthorAvatar seed={profile.user_id || userId} name={profile.anonymous_name} gender={profile.gender} />
                  </View>
                )}
                {/* Pulse ring */}
                <View style={[
                  styles.avatarGlow,
                  { backgroundColor: accentColor + '12' }
                ]} />
              </Animated.View>

              {/* Name, presence, chips and tier, grouped tightly. */}
              <View style={styles.headerBlock}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{profile.anonymous_name}</Text>
                  {profile.is_premium && (
                    <Crown size={rs(15)} color={T.gold} fill={T.gold} />
                  )}
                </View>

                {(profile.is_online || profile.last_seen) && (
                  <View style={styles.presenceRow}>
                    {profile.is_online && <View style={styles.onlineDot} />}
                    <Text style={[styles.presenceText, profile.is_online && { color: T.success }]}>
                      {profile.is_online ? 'Online now' : profile.last_seen}
                    </Text>
                  </View>
                )}

                {/* Gender / location only (age is never shown). */}
                <View style={styles.chipRow}>
                  {profile.gender && GENDER_BADGE[profile.gender] && (
                    <View style={[styles.chip, { borderColor: accentColor + '40' }]}>
                      <Text style={[styles.chipText, { color: accentColor }]}>
                        {GENDER_BADGE[profile.gender].symbol} {GENDER_BADGE[profile.gender].label}
                      </Text>
                    </View>
                  )}
                  {!!profile.location && (
                    <View style={[styles.chip, { borderColor: accentColor + '40' }]}>
                      <MapPin size={rs(11)} color={accentColor} />
                      <Text style={[styles.chipText, { color: accentColor }]}>
                        {profile.location}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Stats card. */}
              <View style={styles.statsCard}>
                <View style={styles.statsRow}>
                  <StatItem value={profile.confession_count ?? 0} label="drops" />
                  <View style={styles.statDivider} />
                  <StatItem value={profile.connections_count ?? 0} label="link ups" />
                  <View style={styles.statDivider} />
                  <StatItem value={profile.reactions_received ?? 0} label="reactions" />
                  {profile.streak > 0 && (
                    <>
                      <View style={styles.statDivider} />
                      <StatItem value={`${profile.streak}d`} label="streak" />
                    </>
                  )}
                </View>
                <Text style={styles.memberSince}>
                  Member since {profile.join_date || '—'}
                </Text>
              </View>

              {/* Your own profile: a preview of how others see you. */}
              {profile.is_self ? (
                <View style={styles.selfBlock}>
                  <Text style={styles.selfNote}>This is how others see you.</Text>
                  <TouchableOpacity
                    style={[styles.connectBtn, { backgroundColor: accentColor }]}
                    onPress={() => {
                      onClose?.();
                      navigation?.navigate?.('Dashboard');
                    }}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.85}
                  >
                    <View style={styles.connectBtnInner}>
                      <UserCheck size={rs(16)} color="#fff" />
                      <Text style={styles.connectBtnText}>Go to your dashboard</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ) : pay ? (
                <View style={styles.payCard}>
                  <Text style={styles.payTitle}>{pay.copy.title}</Text>
                  <Text style={styles.connectSub}>{pay.copy.message}</Text>
                  {pay.copy.rows.map((row) => (
                    <View key={row.label} style={styles.payRow}>
                      <Text style={styles.payLabel}>{row.label}</Text>
                      <Text style={[styles.payValue, row.highlight && { color: T.primary }]}>{row.value}</Text>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={[styles.connectBtn, { backgroundColor: accentColor }]}
                    onPress={confirmPay} disabled={paying} hitSlop={HIT_SLOP} activeOpacity={0.85}
                  >
                    {paying ? <ActivityIndicator color="#fff" /> : <Text style={styles.connectBtnText}>{pay.copy.confirmLabel}</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setPay(null)} disabled={paying} hitSlop={HIT_SLOP} style={styles.payCancel}>
                    <Text style={styles.payCancelText}>Not now</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.connectBtn, { backgroundColor: accentColor }]}
                    onPress={handleLinkUp}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.85}
                  >
                    <View style={styles.connectBtnInner}>
                      <Link2 size={rs(16)} color="#fff" />
                      <Text style={styles.connectBtnText}>Link Up</Text>
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.connectSub}>{byUser ? 'They decide. Coins leave only if they let you in.' : "You go straight in. No reply in 7 days and your coins come back."}</Text>
                </>
              )}

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
  avatarImage: { width: '100%', height: '100%', borderRadius: rs(45) },
  portrait: { width: '100%', height: '100%', borderRadius: rs(45), overflow: 'hidden' },
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

  // Name/presence/chips/tier read as one unit — tight internal spacing, so
  // the parent's larger section gap only separates actual sections.
  headerBlock: {
    width:      '100%',
    alignItems: 'center',
    gap:        rp(8),
  },
  nameRow: {
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent:'center',
    gap:           rp(7),
  },

  // Presence
  presenceRow: {
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent:'center',
    gap:           rp(6),
  },
  onlineDot: {
    width: rs(7), height: rs(7), borderRadius: rs(4),
    backgroundColor: T.success,
  },
  presenceText: {
    fontSize:      FONT.xs,
    color:         T.textMuted,
    letterSpacing: 0.2,
  },

  // Identity chips — gender / age / location
  chipRow: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    justifyContent: 'center',
    alignItems:     'center',
    gap:            rp(6),
  },
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(4),
    paddingHorizontal: rp(11),
    paddingVertical:   rp(5),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    backgroundColor:   'rgba(255,255,255,0.04)',
  },
  chipText: {
    fontSize:      FONT.xs,
    fontWeight:    '600',
    letterSpacing: 0.2,
  },

  memberSince: {
    fontSize:      FONT.xs,
    color:         T.textMuted,
    textAlign:     'center',
    letterSpacing: 0.2,
  },

  // Own-profile preview
  selfBlock: {
    width: '100%',
    gap:   rp(10),
  },
  selfNote: {
    fontSize:      FONT.sm,
    color:         T.textMuted,
    textAlign:     'center',
    fontStyle:     'italic',
    letterSpacing: 0.2,
  },

  // Stats share the width evenly.
  statsCard: {
    width:             '100%',
    backgroundColor:   T.surfaceAlt,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    paddingVertical:   rp(16),
    paddingHorizontal: rp(12),
    gap:               rp(12),
  },
  statsRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-around',
    width:          '100%',
  },
  statItem:   { alignItems: 'center', gap: rp(4), flex: 1 },
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
  payCard:       { gap: rp(10) },
  payTitle:      { color: T.text, fontSize: FONT.lg, fontWeight: '800', textAlign: 'center' },
  payRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: rp(10), paddingHorizontal: rp(14), borderRadius: RADIUS.md, backgroundColor: 'rgba(255,255,255,0.04)' },
  payLabel:      { color: T.textSecondary, fontSize: FONT.sm },
  payValue:      { color: T.text, fontSize: FONT.sm, fontWeight: '800' },
  payCancel:     { alignSelf: 'center', paddingVertical: rp(6) },
  payCancelText: { color: T.textSecondary, fontSize: FONT.sm, fontWeight: '600' },
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
