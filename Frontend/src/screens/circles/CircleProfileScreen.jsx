/**
 * CircleProfileScreen.jsx
 * The lobby before entering a Circle's content feed.
 *
 * Design: The circle's aura color bleeds through the darkness.
 * Anticipation. Intimacy. You're about to step into something real.
 */
import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, RefreshControl, ActivityIndicator, Dimensions, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch } from 'react-redux';
import { ArrowLeft, Users, ChevronRight, UserPlus, UserCheck } from 'lucide-react-native';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';
import PulseLoader from '../../components/common/PulseLoader';
import { awardMilestone } from '../../store/slices/coinsSlice';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CircleProfileScreen({ route, navigation }) {
  const { circleId }  = route.params;
  const { showToast } = useToast();
  const dispatch       = useDispatch();

  const [circle,     setCircle]     = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [following,  setFollowing]  = useState(false);

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
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) setCircle(await res.json());
    } catch {
      showToast({ type: 'error', message: 'Could not load this circle.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [circleId, showToast]);

  useEffect(() => { loadCircle(); }, [loadCircle]);

  // ── Follow / unfollow ─────────────────────────────────────────────────────
  const handleFollow = useCallback(async () => {
    setFollowing(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/follow`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast({ type: 'success', message: "You're in. Come back for what they post next." });
        if (data.first_follow) dispatch(awardMilestone('first_circle'));
        loadCircle();
      } else {
        showToast({ type: 'error', message: 'Could not follow. Try again.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not follow. Try again.' });
    } finally {
      setFollowing(false);
    }
  }, [circleId, loadCircle, showToast, dispatch]);

  const handleUnfollow = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/unfollow`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        showToast({ type: 'success', message: "Unfollowed. You can always come back." });
        loadCircle();
      }
    } catch {}
  }, [circleId, loadCircle, showToast]);

  const handleOpenFeed = useCallback(() => {
    navigation.navigate('CircleContent', { circleId, circle });
  }, [navigation, circleId, circle]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const auraColor   = circle?.aura_color ?? T.primary;
  const isCreator    = circle?.is_creator   ?? false;
  const isAdmin      = circle?.is_admin     ?? false;
  const isFollowing  = circle?.is_following ?? false;

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]} edges={['top']}>
        <PulseLoader size={52} color={T.primary} />
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
        {/* Banner image — optional, set at creation */}
        {circle.banner_url && (
          <Image source={{ uri: circle.banner_url }} style={styles.bannerImage} resizeMode="cover" />
        )}

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
              {circle.avatar_url ? (
                <Image source={{ uri: circle.avatar_url }} style={styles.heroAvatarImg} />
              ) : (
                <Text style={styles.heroEmoji}>{circle.avatar_emoji ?? '🎭'}</Text>
              )}
            </View>
          </View>

          {/* Name + status */}
          <View style={styles.heroInfo}>
            <Text style={[styles.heroName, { color: T.text }]}>
              {circle.name}
            </Text>
            <Text style={styles.heroStatus}>
              {circle.member_range} · {circle.category}
            </Text>
          </View>

          {/* Bio */}
          <Text style={styles.heroBio}>{circle.bio}</Text>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Users size={rs(14)} color={T.textSecondary} />
              <Text style={styles.statText}>{circle.follower_count} followers</Text>
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

          {/* Circle content feed — open to everyone */}
          <TouchableOpacity
            style={[styles.roomBtn, { borderColor: auraColor + '40' }]}
            onPress={handleOpenFeed}
            hitSlop={HIT_SLOP}
            activeOpacity={0.85}
          >
            <View style={styles.roomBtnLeft}>
              <Text style={styles.roomBtnText}>Circle feed</Text>
            </View>
            <View style={styles.roomBtnCtaRow}>
              <Text style={[styles.roomBtnCta, { color: auraColor }]}>Open</Text>
              <ChevronRight size={rs(15)} color={auraColor} />
            </View>
          </TouchableOpacity>

          {/* Follow / unfollow */}
          {!isCreator && (
            isFollowing ? (
              <View style={styles.memberStatus}>
                <View style={styles.followingRow}>
                  <UserCheck size={rs(14)} color={T.textSecondary} />
                  <Text style={styles.memberStatusText}>Following this circle</Text>
                </View>
                <TouchableOpacity onPress={handleUnfollow} hitSlop={HIT_SLOP}>
                  <Text style={styles.leaveText}>Unfollow</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.joinBtn, { borderColor: auraColor + '40' }]}
                onPress={handleFollow}
                disabled={following}
                hitSlop={HIT_SLOP}
                activeOpacity={0.85}
              >
                {following
                  ? <ActivityIndicator size="small" color={auraColor} />
                  : (
                    <View style={styles.followBtnRow}>
                      <UserPlus size={rs(16)} color={auraColor} />
                      <Text style={[styles.joinBtnText, { color: auraColor }]}>
                        Follow this circle
                      </Text>
                    </View>
                  )
                }
              </TouchableOpacity>
            )
          )}

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: T.background },
  centered:{ justifyContent: 'center', alignItems: 'center' },

  loadingText: {
    marginTop:  SPACING.sm,
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textSecondary,
  },
  errorText: {
    fontFamily: 'PlayfairDisplay-Italic',
    fontSize:  rf(18),
    color:     T.textSecondary,
    textAlign: 'center',
  },
  backLink: {
    marginTop: SPACING.sm,
    fontFamily: 'DMSans-Bold',
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

  scroll: {
    paddingBottom: rs(60),
  },

  bannerImage: {
    width:  '100%',
    height: rs(150),
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
    overflow:       'hidden',
  },
  heroAvatarImg: { width: '100%', height: '100%' },
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
  heroStatus: {
    fontFamily: 'DMSans-Regular',
    fontSize: FONT.sm,
    color:    T.textSecondary,
    letterSpacing: 0.2,
  },
  heroBio: {
    fontFamily: 'PlayfairDisplay-Italic',
    fontSize:   rf(15),
    color:      T.textSecondary,
    textAlign:  'center',
    lineHeight: rf(23),
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    letterSpacing: 0.2,
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
    fontFamily: 'DMSans-SemiBold',
    fontSize:   FONT.sm,
    color:      T.textSecondary,
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

  // Room button
  roomBtn: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
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
    fontFamily: 'DMSans-SemiBold',
    fontSize:   FONT.sm,
    color:      T.text,
  },
  roomBtnCtaRow: { flexDirection: 'row', alignItems: 'center', gap: rp(2) },
  roomBtnCta: {
    fontFamily: 'DMSans-Bold',
    fontSize:   FONT.sm,
  },

  // Follow / unfollow
  followBtnRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(8),
  },
  joinBtn: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    height:          BUTTON_HEIGHT,
    alignItems:      'center',
    justifyContent:  'center',
  },
  joinBtnText: {
    fontFamily: 'DMSans-Bold',
    fontSize:   FONT.md,
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
  followingRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(7),
  },
  memberStatusText: {
    fontFamily: 'DMSans-Regular',
    fontSize:   FONT.sm,
    color:      T.textSecondary,
  },
  leaveText: {
    fontFamily: 'DMSans-Bold',
    fontSize:   FONT.sm,
    color:      T.textMuted,
  },
});
