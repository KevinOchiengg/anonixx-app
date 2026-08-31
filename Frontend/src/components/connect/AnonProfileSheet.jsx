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
import { X, UserCheck, Crown, MapPin, Link2, Coins } from 'lucide-react-native';

// Matches UNLOCK_COST in CalmPostCard.jsx / PostUnlockScreen.jsx — same
// coin-gated Link Up flow, just entered from the profile sheet instead of
// the post card directly.
const UNLOCK_COST = 50;
import { API_BASE_URL } from '../../config/api';
import { useToast } from '../ui/Toast';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';
import T from '../../utils/theme';

const { height: H, width: W } = Dimensions.get('window');

// ─── Static data ──────────────────────────────────────────────
const GENDER_BADGE = {
  male:     { symbol: '♂', label: 'Male' },
  female:   { symbol: '♀', label: 'Female' },
  nonbinary: { symbol: '⚧', label: 'Non-binary' },
};

const AVATAR_MAP = {
  ghost:   '👻', shadow: '🌑', flame: '🔥',   void:    '🕳️',
  storm:   '⛈️', smoke:  '💨', eclipse: '🌘',  shard:   '🔷',
  moth:    '🦋', raven:  '🐦', mirror: '🪞',   ember:   '🕯️',
  current: '⚡', still:  '🌊', hollow: '🫙',   signal:  '📡',
};

// Mirrors INTENT_LABELS in Backend/app/api/v1/drops.py / CARD_INTENTS in
// DropCardRenderer.jsx — same vocabulary, just with an emoji for the pill.
const HERE_FOR_EMOJI = {
  'Relationship':  '🌹',
  'Sex for Fun':   '🔥',
  'Sex for Token': '🪙',
  'General':       '🌑',
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
  visible, anonymousName, userId, post, onClose, navigation,
}) {
  const { showToast }  = useToast();
  const [profile,      setProfile]      = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

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
      // Prefer the id route — anonymous names are randomly generated and not
      // unique, so a name lookup can land on a different user entirely (and
      // then is_self resolves against the wrong person). Fall back to the
      // name route only when a card didn't give us an id.
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

  // ── Link up — the only way to actually reach someone. Coin-gated on
  // PostUnlockScreen itself; this just gets you there with the post that
  // opened this sheet in the first place. ──────────────────────
  const handleLinkUp = useCallback(() => {
    if (!post) return;
    closeSheet();
    setTimeout(() => {
      navigation?.navigate('PostUnlock', { post });
    }, 300);
  }, [post, closeSheet, navigation]);

  const accentColor = profile?.avatar_color ?? T.primary;

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

              {/* Identity cluster — name, presence, chips and tier belong
                  together, so they're grouped with tight internal spacing
                  rather than each taking the parent's full section gap. */}
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

                {/* gender / age / location */}
                <View style={styles.chipRow}>
                  {profile.gender && GENDER_BADGE[profile.gender] && (
                    <View style={[styles.chip, { borderColor: accentColor + '40' }]}>
                      <Text style={[styles.chipText, { color: accentColor }]}>
                        {GENDER_BADGE[profile.gender].symbol} {GENDER_BADGE[profile.gender].label}
                      </Text>
                    </View>
                  )}
                  {profile.age != null && (
                    <View style={[styles.chip, { borderColor: accentColor + '40' }]}>
                      <Text style={[styles.chipText, { color: accentColor }]}>
                        {profile.age}
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

                {profile.here_for && (
                  <View style={[styles.tierPill, { borderColor: accentColor + '40' }]}>
                    <Text style={styles.tierEmoji}>{HERE_FOR_EMOJI[profile.here_for] || '💫'}</Text>
                    <Text style={[styles.tierName, { color: accentColor }]}>
                      {profile.here_for}
                    </Text>
                  </View>
                )}
              </View>

              {/* Stats card — one bounded surface so the numbers read as a
                  set instead of floating loose in the scroll. */}
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

              {/* Your own profile — you can't link up with yourself, so this
                  becomes a preview of how everyone else sees you. */}
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
              ) : (
              <TouchableOpacity
                style={[styles.connectBtn, { backgroundColor: accentColor }]}
                onPress={handleLinkUp}
                hitSlop={HIT_SLOP}
                activeOpacity={0.85}
              >
                <View style={styles.connectBtnInner}>
                  <Link2 size={rs(16)} color="#fff" />
                  <Text style={styles.connectBtnText}>Link up</Text>
                  <View style={styles.linkUpCostPill}>
                    <Coins size={rs(11)} color="#fff" />
                    <Text style={styles.linkUpCostText}>{UNLOCK_COST}</Text>
                  </View>
                </View>
              </TouchableOpacity>
              )}

              {/* Sub-copy */}
              {!profile.is_self && (
                <Text style={styles.connectSub}>They won't know it's you until they link up too.</Text>
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

  // Vibe tier pill
  tierPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(7),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(7),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    backgroundColor:   'rgba(255,255,255,0.04)',
  },
  tierEmoji: { fontSize: rf(14) },
  tierName:  { fontSize: FONT.sm, fontWeight: '700', letterSpacing: 0.3 },

  // Stats
  // The card owns the surface; the row inside is just layout. Stats share
  // the width evenly so 3 or 4 of them stay centred and don't overflow.
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
  linkUpCostPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(3),
    paddingHorizontal: rp(8),
    paddingVertical:   rp(3),
    borderRadius:      RADIUS.full,
    backgroundColor:   'rgba(255,255,255,0.18)',
  },
  linkUpCostText: {
    color:      '#fff',
    fontSize:   FONT.xs,
    fontWeight: '700',
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
