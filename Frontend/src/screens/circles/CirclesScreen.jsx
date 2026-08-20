/**
 * CirclesScreen.jsx
 * Browse and discover Circles — anonymous audio/live rooms.
 *
 * Design: Dark city at night. Each Circle is a light in the darkness.
 * Live circles pulse. Everything breathes slowly.
 * The user feels like they're about to step into something real.
 */
import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Animated, RefreshControl, TextInput, Dimensions, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Plus, Search, Radio, X, Coins, ChevronRight } from 'lucide-react-native';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import T from '../../utils/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Static data ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'all',        label: 'All',        emoji: '✨' },
  { id: 'love',       label: 'Love',       emoji: '💔' },
  { id: 'fun',        label: 'Fun',        emoji: '😈' },
  { id: 'confession', label: 'Confess',    emoji: '🕯️' },
  { id: 'support',    label: 'Comfort',    emoji: '🤍' },
  { id: 'debate',     label: 'Hot Takes',  emoji: '🔥' },
  { id: 'music',      label: 'Music',      emoji: '🎵' },
  { id: 'spicy',      label: 'Spicy',      emoji: '🌶️' },
  { id: 'midnight',   label: 'Midnight',   emoji: '🌙' },
];

const TABS = ['Discover', 'My Circles'];

const EMPTY_COPY = {
  discover: {
    title:    'The dark is quiet tonight.',
    subtitle: 'No circles have opened yet.\nBe the first voice in the room.',
    cta:      'Open the Room',
  },
  mine: {
    title:    "You haven't entered any circles.",
    subtitle: 'Find a circle that speaks to you\nand step inside.',
    cta:      "See Who's Talking",
  },
};

// ─── Live Pulse Animation ─────────────────────────────────────────────────────
const LivePulse = React.memo(() => {
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;
  const op1    = useRef(new Animated.Value(0.6)).current;
  const op2    = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse1, { toValue: 1.8, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulse1, { toValue: 1,   duration: 0,    useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(op1, { toValue: 0, duration: 1200, useNativeDriver: true }),
          Animated.timing(op1, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(pulse2, { toValue: 1.8, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulse2, { toValue: 1,   duration: 0,    useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(op2, { toValue: 0, duration: 1200, useNativeDriver: true }),
          Animated.timing(op2, { toValue: 0.3, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={styles.pulseContainer}>
      <Animated.View style={[
        styles.pulseRing,
        { transform: [{ scale: pulse1 }], opacity: op1 }
      ]} />
      <Animated.View style={[
        styles.pulseRing,
        { transform: [{ scale: pulse2 }], opacity: op2 }
      ]} />
      <View style={styles.pulseDot} />
    </View>
  );
});

// ─── Circle Card ──────────────────────────────────────────────────────────────
const CircleCard = React.memo(({ circle, index, onPress }) => {
  const scale    = useRef(new Animated.Value(0.92)).current;
  const opacity  = useRef(new Animated.Value(0)).current;
  const pressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        delay: index * 60,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        delay: index * 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handlePressIn = useCallback(() => {
    Animated.spring(pressAnim, {
      toValue: 0.96,
      tension: 100,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, []);

  const handlePressOut = useCallback(() => {
    Animated.spring(pressAnim, {
      toValue: 1,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, []);

  const handlePress = useCallback(() => onPress(circle.id), [circle.id, onPress]);

  const isLive    = circle.is_live;
  const isOpen    = circle.room_open && !isLive;
  const auraColor = circle.aura_color ?? T.primary;

  return (
    <Animated.View style={[
      styles.cardWrapper,
      { transform: [{ scale: Animated.multiply(scale, pressAnim) }], opacity }
    ]}>
      <TouchableOpacity
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        hitSlop={HIT_SLOP}
        activeOpacity={1}
      >
        {/* Glow border when live */}
        {isLive && (
          <View style={[styles.cardGlowBorder, { borderColor: auraColor + '45' }]} />
        )}

        <View style={[styles.card, { borderColor: auraColor + (isLive ? '55' : '22') }]}>
          {/* Banner — the circle's own photo, or its aura color as a gradient
              wash when it hasn't set one. Every circle reads as "designed"
              either way, never a blank strip. */}
          <View style={styles.banner}>
            {circle.banner_url ? (
              <Image source={{ uri: circle.banner_url }} style={styles.bannerImg} resizeMode="cover" />
            ) : (
              <LinearGradient
                colors={[auraColor + 'E6', auraColor + '66', T.surface]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1.1 }}
                style={styles.bannerImg}
              />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(6,7,12,0.92)']}
              locations={[0.35, 1]}
              style={styles.bannerScrim}
              pointerEvents="none"
            />

            {(isLive || isOpen) && (
              <View style={styles.bannerTopRow} pointerEvents="none">
                {isLive ? (
                  <View style={styles.liveBadge}>
                    <Radio size={rs(9)} color={T.live} />
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                ) : (
                  <View style={styles.openBadge}>
                    <View style={styles.openDot} />
                    <Text style={styles.openBadgeText}>OPEN</Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.bannerBottomRow}>
              <View style={styles.avatarRing}>
                <View style={[styles.avatarWrap, { backgroundColor: auraColor + '35' }]}>
                  <View style={styles.avatarClip}>
                    {circle.avatar_url ? (
                      <Image source={{ uri: circle.avatar_url }} style={styles.avatarImg} />
                    ) : (
                      <Text style={styles.avatarEmoji}>{circle.avatar_emoji ?? '🎭'}</Text>
                    )}
                  </View>
                  {isLive && <LivePulse />}
                </View>
              </View>
              <Text style={styles.bannerName} numberOfLines={1}>
                {circle.name}
              </Text>
            </View>
          </View>

          {/* Body */}
          <View style={styles.cardBody}>
            <Text style={styles.cardBio} numberOfLines={2}>
              {circle.bio}
            </Text>

            <View style={styles.cardFooterRow}>
              <Text style={styles.cardMetaText} numberOfLines={1}>
                {circle.member_range} · {circle.category}
              </Text>

              {circle.is_creator ? (
                <View style={styles.yourBadge}>
                  <Text style={styles.yourBadgeText}>yours</Text>
                </View>
              ) : circle.is_member ? (
                <View style={styles.memberBadge}>
                  <Text style={styles.memberBadgeText}>inside</Text>
                </View>
              ) : circle.join_cost > 0 ? (
                <View style={styles.pricePill}>
                  <Coins size={rs(11)} color={T.gold} strokeWidth={2} />
                  <Text style={styles.pricePillText}>{circle.join_cost}</Text>
                  <ChevronRight size={rs(11)} color={T.gold} strokeWidth={2.5} />
                </View>
              ) : (
                <View style={styles.freePill}>
                  <Text style={styles.freePillText}>Free entry</Text>
                  <ChevronRight size={rs(11)} color={T.textSecondary} strokeWidth={2.5} />
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Category Chip ────────────────────────────────────────────────────────────
const CategoryChip = React.memo(({ cat, active, onPress }) => {
  const handlePress = useCallback(() => onPress(cat.id), [cat.id, onPress]);
  return (
    <TouchableOpacity
      onPress={handlePress}
      hitSlop={HIT_SLOP}
      style={[styles.chip, active && styles.chipActive]}
      activeOpacity={0.8}
    >
      <Text style={styles.chipEmoji}>{cat.emoji}</Text>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
        {cat.label}
      </Text>
    </TouchableOpacity>
  );
});

// ─── Skeleton Card ────────────────────────────────────────────────────────────
const SkeletonCard = React.memo(({ index }) => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, delay: index * 100, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] });

  return (
    <Animated.View style={[styles.skeletonCard, { opacity }]}>
      <View style={styles.skeletonBanner} />
      <View style={styles.skeletonContent}>
        <View style={[styles.skeletonLine, { width: '90%' }]} />
        <View style={[styles.skeletonLine, { width: '55%', marginTop: rp(8) }]} />
        <View style={[styles.skeletonLine, { width: '30%', marginTop: rp(10) }]} />
      </View>
    </Animated.View>
  );
});

const SKELETONS = [0, 1, 2, 3, 4];

// ─── Empty State ──────────────────────────────────────────────────────────────
const EmptyState = React.memo(({ tab, onAction, isAdmin }) => {
  const isDiscover = tab === 0;
  const copy   = EMPTY_COPY[isDiscover ? 'discover' : 'mine'];
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  // Discover-tab CTA only makes sense for admins (they're the only ones who
  // can open a circle) — regular users get the "My Circles" tab CTA instead,
  // which just switches tabs and always applies to everyone.
  const showCta = !isDiscover || isAdmin;

  return (
    <Animated.View style={[styles.emptyWrap, { opacity: fadeIn }]}>
      <Text style={styles.emptyIcon}>🌑</Text>
      <Text style={styles.emptyTitle}>{copy.title}</Text>
      <Text style={styles.emptySubtitle}>
        {isDiscover && !isAdmin ? 'Check back soon — new circles open regularly.' : copy.subtitle}
      </Text>
      {showCta && (
        <TouchableOpacity
          style={styles.emptyCta}
          onPress={onAction}
          hitSlop={HIT_SLOP}
          activeOpacity={0.85}
        >
          <Text style={styles.emptyCtaText}>{copy.cta}</Text>
          <ChevronRight size={rs(16)} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CirclesScreen({ navigation }) {
  const { showToast } = useToast();
  const { user }      = useAuth();
  const isAdmin        = !!user?.is_admin;

  const [activeTab,     setActiveTab]     = useState(0);
  const [activeCategory, setActiveCategory] = useState('all');
  const [circles,       setCircles]       = useState([]);
  const [myCircles,     setMyCircles]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [searchActive,  setSearchActive]  = useState(false);
  const [searchQuery,   setSearchQuery]   = useState('');

  // Entrance animation
  const headerY   = useRef(new Animated.Value(-20)).current;
  const headerOp  = useRef(new Animated.Value(0)).current;
  const searchAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOp, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(headerY, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchCircles = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const params = new URLSearchParams({ skip: '0', limit: '40' });
      if (activeCategory !== 'all') params.set('category', activeCategory);

      const [discoverRes, myRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/circles/?${params}`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circles/my/joined`, { headers }),
      ]);

      if (discoverRes.ok) {
        const data = await discoverRes.json();
        setCircles(data.circles ?? []);
      }
      if (myRes.ok) {
        const data = await myRes.json();
        setMyCircles(data.circles ?? []);
      }
    } catch {
      showToast({ type: 'error', message: 'Could not load circles.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory, showToast]);

  useEffect(() => { fetchCircles(); }, [fetchCircles]);

  // Live activity — a small proof-of-life line under the header, since
  // "who's actually here right now" is the thing that makes a discovery
  // screen feel alive instead of a static directory.
  const liveCount = useMemo(
    () => circles.filter(c => c.is_live).length,
    [circles]
  );

  // ── Search filter ─────────────────────────────────────────────────────────
  const displayCircles = useMemo(() => {
    const base = activeTab === 0 ? circles : myCircles;
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.bio?.toLowerCase().includes(q) ||
      c.category?.toLowerCase().includes(q)
    );
  }, [activeTab, circles, myCircles, searchQuery]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCirclePress = useCallback((circleId) => {
    navigation.navigate('CircleProfile', { circleId });
  }, [navigation]);

  const handleCreatePress = useCallback(() => {
    if (!isAdmin) {
      showToast({ type: 'info', message: 'Circles are curated by the Anonixx team — you can join, not create.' });
      return;
    }
    navigation.navigate('CreateCircle');
  }, [navigation, isAdmin, showToast]);

  const handleTabPress = useCallback((i) => setActiveTab(i), []);
  const handleCategoryPress = useCallback((id) => setActiveCategory(id), []);

  const handleSearchToggle = useCallback(() => {
    const toValue = searchActive ? 0 : 1;
    setSearchActive(prev => !prev);
    if (searchActive) setSearchQuery('');
    Animated.spring(searchAnim, {
      toValue,
      tension: 60,
      friction: 10,
      useNativeDriver: false,
    }).start();
  }, [searchActive]);

  const handleEmptyAction = useCallback(() => {
    if (activeTab === 0) handleCreatePress();
    else setActiveTab(0);
  }, [activeTab, handleCreatePress]);

  const keyExtractor = useCallback((item) => item.id, []);

  const renderCircle = useCallback(({ item, index }) => (
    <CircleCard
      circle={item}
      index={index}
      onPress={handleCirclePress}
    />
  ), [handleCirclePress]);

  const searchWidth = searchAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '75%'],
  });

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>

      {/* Atmospheric background glow */}
      <View style={styles.bgGlow} />

      {/* Header */}
      <Animated.View style={[
        styles.header,
        { transform: [{ translateY: headerY }], opacity: headerOp }
      ]}>
        <View style={styles.headerLeft}>
          {!searchActive && (
            <>
              <Text style={styles.headerTitle}>Circles</Text>
              <Text style={styles.headerSub}>
                where strangers speak their truth
              </Text>
              {activeTab === 0 && liveCount > 0 && (
                <View style={styles.liveNowRow}>
                  <View style={styles.liveNowDot} />
                  <Text style={styles.liveNowText}>
                    {liveCount} {liveCount === 1 ? 'circle is' : 'circles are'} live right now
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        <View style={styles.headerRight}>
          {/* Search input expands */}
          <Animated.View style={[styles.searchWrap, { width: searchWidth }]}>
            {searchActive && (
              <View style={styles.searchInputRow}>
                <Search size={rs(14)} color={T.textMuted} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="find your circle..."
                  placeholderTextColor={T.textMuted}
                  style={styles.searchInput}
                  autoFocus
                />
              </View>
            )}
          </Animated.View>

          <TouchableOpacity
            onPress={handleSearchToggle}
            hitSlop={HIT_SLOP}
            style={styles.iconBtn}
          >
            {searchActive
              ? <X size={rs(20)} color={T.textSecondary} />
              : <Search size={rs(20)} color={T.textSecondary} />
            }
          </TouchableOpacity>

          {isAdmin && (
            <TouchableOpacity
              onPress={handleCreatePress}
              hitSlop={HIT_SLOP}
              style={styles.createBtn}
              activeOpacity={0.85}
            >
              <Plus size={rs(18)} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        {TABS.map((tab, i) => (
          <TouchableOpacity
            key={tab}
            onPress={() => handleTabPress(i)}
            hitSlop={HIT_SLOP}
            style={[styles.tab, activeTab === i && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>
              {tab}
            </Text>
            {activeTab === i && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Category chips — only on Discover */}
      {activeTab === 0 && (
        <FlatList
          data={CATEGORIES}
          keyExtractor={c => c.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContainer}
          renderItem={({ item }) => (
            <CategoryChip
              cat={item}
              active={activeCategory === item.id}
              onPress={handleCategoryPress}
            />
          )}
        />
      )}

      {/* Main list */}
      {loading ? (
        <View style={styles.skeletonList}>
          {SKELETONS.map(i => <SkeletonCard key={i} index={i} />)}
        </View>
      ) : (
        <FlatList
          data={displayCircles}
          keyExtractor={keyExtractor}
          renderItem={renderCircle}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchCircles(true)}
              tintColor={T.primary}
              colors={[T.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState tab={activeTab} onAction={handleEmptyAction} isAdmin={isAdmin} />
          }
          // Performance
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={8}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: T.background,
  },

  // Atmospheric glow
  bgGlow: {
    position:        'absolute',
    top:             -rs(60),
    left:            SCREEN_WIDTH / 2 - rs(120),
    width:           rs(240),
    height:          rs(240),
    borderRadius:    rs(120),
    backgroundColor: T.primary,
    opacity:         0.04,
  },

  // Header
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop:      SPACING.sm,
    paddingBottom:   SPACING.xs,
  },
  headerLeft:  { flex: 1 },
  headerTitle: {
    fontSize:      rf(26),
    fontWeight:    '800',
    color:         T.primary,
    letterSpacing: -0.5,
    fontFamily:    'PlayfairDisplay-Bold',
  },
  headerSub: {
    fontSize:   FONT.xs,
    color:      T.textMuted,
    marginTop:  rp(2),
    fontFamily: 'PlayfairDisplay-Italic',
    letterSpacing: 0.2,
  },
  liveNowRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(5),
    marginTop:     rp(6),
  },
  liveNowDot: {
    width:           rs(6),
    height:          rs(6),
    borderRadius:    rs(3),
    backgroundColor: T.live,
  },
  liveNowText: {
    fontSize:      rf(11),
    color:         T.live,
    fontFamily:    'DMSans-SemiBold',
    letterSpacing: 0.1,
  },
  headerRight: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            SPACING.xs,
  },
  searchWrap: {
    overflow:        'hidden',
    justifyContent:  'center',
  },
  searchInputRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(6),
    paddingVertical: rp(6),
    paddingHorizontal: SPACING.xs,
    backgroundColor: T.surfaceAlt,
    borderRadius:    RADIUS.sm,
    borderWidth:     1,
    borderColor:     T.border,
  },
  searchInput: {
    flex:            1,
    color:           T.text,
    fontSize:        FONT.sm,
    fontFamily:      'DMSans-Regular',
    padding:         0,
  },
  iconBtn: {
    width:           rs(36),
    height:          rs(36),
    borderRadius:    rs(18),
    backgroundColor: T.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     T.border,
  },
  createBtn: {
    width:           rs(36),
    height:          rs(36),
    borderRadius:    rs(18),
    backgroundColor: T.primary,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     T.primary,
    shadowOffset:    { width: 0, height: rs(4) },
    shadowOpacity:   0.4,
    shadowRadius:    rs(8),
    elevation:       6,
  },

  // Tabs
  tabRow: {
    flexDirection:   'row',
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    marginTop:       SPACING.xs,
  },
  tab: {
    paddingVertical:   SPACING.sm,
    paddingHorizontal: SPACING.md,
    position:          'relative',
  },
  tabActive: {},
  tabText: {
    fontSize:    FONT.sm,
    fontWeight:  '600',
    fontFamily:  'DMSans-SemiBold',
    color:       T.textMuted,
    letterSpacing: 0.3,
  },
  tabTextActive: {
    color:      T.text,
    fontWeight: '700',
    fontFamily: 'DMSans-Bold',
  },
  tabUnderline: {
    position:        'absolute',
    bottom:          -1,
    left:            SPACING.md,
    right:           SPACING.md,
    height:          rp(2),
    borderRadius:    rp(1),
    backgroundColor: T.primary,
  },

  // Category chips
  chipsContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    gap:               SPACING.xs,
  },
  chip: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             rp(5),
    height:          rs(32),
    paddingHorizontal: rp(14),
    borderRadius:    RADIUS.full,
    backgroundColor: T.surfaceAlt,
    borderWidth:     1,
    borderColor:     T.border,
  },
  chipActive: {
    backgroundColor: T.primaryDim,
    borderColor:     T.primaryBorder,
    shadowColor:     T.primary,
    shadowOffset:    { width: 0, height: rs(2) },
    shadowOpacity:   0.25,
    shadowRadius:    rs(6),
    elevation:       3,
  },
  chipEmoji: { fontSize: rf(12), lineHeight: rf(15) },
  chipLabel: {
    fontSize:   FONT.xs,
    lineHeight: rf(15),
    color:      T.textSecondary,
    fontWeight: '600',
    fontFamily: 'DMSans-SemiBold',
  },
  chipLabelActive: { color: T.primary },

  // List
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.xs,
    paddingBottom:     rs(100),
    gap:               SPACING.sm,
  },

  // Circle card — banner-led "poster" cards, the circle's own photo (or its
  // aura color as a gradient wash) doing the work a plain row list can't.
  cardWrapper: {},
  cardGlowBorder: {
    position:     'absolute',
    top:          -1,
    left:         -1,
    right:        -1,
    bottom:       -1,
    borderRadius: RADIUS.lg + 1,
    borderWidth:  1,
    zIndex:       0,
  },
  card: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     T.border,
    overflow:        'hidden',
  },

  // Banner
  banner: {
    width:  '100%',
    height: rs(118),
    position: 'relative',
  },
  bannerImg: { width: '100%', height: '100%' },
  bannerScrim: { ...StyleSheet.absoluteFillObject },
  bannerTopRow: {
    position: 'absolute',
    top:      SPACING.sm,
    right:    SPACING.sm,
  },
  bannerBottomRow: {
    position: 'absolute',
    left:  SPACING.sm,
    right: SPACING.sm,
    bottom: rp(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(9),
  },
  bannerName: {
    flex:          1,
    fontSize:      FONT.md,
    fontWeight:    '700',
    color:         '#fff',
    letterSpacing: -0.2,
    fontFamily:    'PlayfairDisplay-Bold',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: rp(4),
  },

  // Avatar — sits on the banner's scrim, ringed so it reads as "cut into" the photo
  avatarRing: {
    width:           rs(48),
    height:          rs(48),
    borderRadius:    rs(24),
    borderWidth:     2,
    borderColor:     'rgba(255,255,255,0.85)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  avatarWrap: {
    width:          rs(42),
    height:         rs(42),
    borderRadius:   rs(21),
    alignItems:     'center',
    justifyContent: 'center',
    position:       'relative',
  },
  avatarClip: {
    width:          '100%',
    height:         '100%',
    borderRadius:   rs(21),
    overflow:       'hidden',
    alignItems:     'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: rf(19) },
  avatarImg:   { width: '100%', height: '100%' },

  // Body
  cardBody: {
    padding: SPACING.md,
    gap:     rp(10),
  },
  cardBio: {
    fontSize:    FONT.sm,
    color:       T.textSecondary,
    lineHeight:  rf(19),
    fontFamily:  'PlayfairDisplay-Italic',
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent: 'space-between',
    gap:           SPACING.xs,
  },
  cardMetaText: {
    fontSize:   FONT.xs,
    color:      T.textMuted,
    fontFamily: 'DMSans-Regular',
    flex:       1,
  },

  // Badges — live over the banner
  liveBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(3),
    backgroundColor: 'rgba(255,99,74,0.22)',
    borderWidth:     1,
    borderColor:     'rgba(255,99,74,0.5)',
    paddingHorizontal: rp(7),
    paddingVertical:   rp(3),
    borderRadius:    RADIUS.sm,
  },
  liveBadgeText: {
    fontSize:    rf(9),
    fontWeight:  '800',
    fontFamily:  'DMSans-Bold',
    color:       '#fff',
    letterSpacing: 0.8,
  },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(4),
    backgroundColor: 'rgba(76,175,80,0.22)',
    borderWidth:     1,
    borderColor:     'rgba(76,175,80,0.5)',
    paddingHorizontal: rp(7),
    paddingVertical:   rp(3),
    borderRadius:    RADIUS.sm,
  },
  openDot: {
    width: rs(5), height: rs(5), borderRadius: rs(3), backgroundColor: T.open,
  },
  openBadgeText: {
    fontSize:    rf(9),
    fontWeight:  '800',
    fontFamily:  'DMSans-Bold',
    color:       '#fff',
    letterSpacing: 0.8,
  },
  yourBadge: {
    backgroundColor: T.primaryDim,
    borderWidth:     1,
    borderColor:     T.primaryBorder,
    paddingHorizontal: rp(8),
    paddingVertical:   rp(3),
    borderRadius:    RADIUS.sm,
  },
  yourBadgeText: {
    fontSize:   rf(9),
    fontWeight: '700',
    fontFamily: 'DMSans-Bold',
    color:      T.primary,
  },
  memberBadge: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth:     1,
    borderColor:     T.border,
    paddingHorizontal: rp(8),
    paddingVertical:   rp(3),
    borderRadius:    RADIUS.sm,
  },
  memberBadgeText: {
    fontSize:   rf(9),
    fontWeight: '600',
    fontFamily: 'DMSans-SemiBold',
    color:      T.textMuted,
  },

  // Price — the one thing a discovery card for paid communities can't hide
  pricePill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(4),
    backgroundColor: T.goldBg,
    borderWidth:     1,
    borderColor:     T.goldBorder,
    paddingHorizontal: rp(8),
    paddingVertical:   rp(3),
    borderRadius:    RADIUS.sm,
  },
  pricePillText: {
    fontSize:   rf(11),
    fontWeight: '800',
    fontFamily: 'DMSans-Bold',
    color:      T.gold,
  },
  freePill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(3),
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth:     1,
    borderColor:     T.border,
    paddingHorizontal: rp(8),
    paddingVertical:   rp(3),
    borderRadius:    RADIUS.sm,
  },
  freePillText: {
    fontSize:   rf(10),
    fontWeight: '700',
    fontFamily: 'DMSans-Bold',
    color:      T.textSecondary,
  },

  // Live pulse — sits on the avatar's corner, scaled to the smaller banner avatar
  pulseContainer: {
    position:       'absolute',
    bottom:         -rp(1),
    right:          -rp(1),
    width:          rs(13),
    height:         rs(13),
    alignItems:     'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position:        'absolute',
    width:           rs(13),
    height:          rs(13),
    borderRadius:    rs(7),
    borderWidth:     1.5,
    borderColor:     T.primary,
  },
  pulseDot: {
    width:           rs(7),
    height:          rs(7),
    borderRadius:    rs(4),
    backgroundColor: T.primary,
  },

  // Skeleton — mirrors the banner-led card shape while loading
  skeletonList: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.sm,
    gap:               SPACING.sm,
  },
  skeletonCard: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     T.border,
    overflow:        'hidden',
  },
  skeletonBanner: {
    width:           '100%',
    height:          rs(118),
    backgroundColor: T.surfaceAlt,
  },
  skeletonContent: { padding: SPACING.md },
  skeletonLine: {
    height:          rp(10),
    borderRadius:    rp(5),
    backgroundColor: T.surfaceAlt,
  },

  // Empty state
  emptyWrap: {
    alignItems:     'center',
    paddingVertical: rs(60),
    paddingHorizontal: SPACING.lg,
    gap:             SPACING.sm,
  },
  emptyIcon: {
    fontSize:     rf(48),
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize:      rf(20),
    fontWeight:    '700',
    color:         T.text,
    textAlign:     'center',
    fontFamily:    'PlayfairDisplay-Bold',
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    textAlign:  'center',
    lineHeight: rf(22),
    fontFamily: 'DMSans-Regular',
  },
  emptyCta: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(6),
    marginTop:       SPACING.md,
    backgroundColor: T.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical:   rp(13),
    borderRadius:    RADIUS.md,
    shadowColor:     T.primary,
    shadowOffset:    { width: 0, height: rs(4) },
    shadowOpacity:   0.35,
    shadowRadius:    rs(10),
    elevation:       6,
  },
  emptyCtaText: {
    fontSize:   FONT.md,
    fontWeight: '700',
    fontFamily: 'DMSans-Bold',
    color:      '#fff',
  },
});
