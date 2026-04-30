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
  Animated, RefreshControl, TextInput, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Plus, Search, Radio, X } from 'lucide-react-native';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  live:          '#FF634A',
  liveDim:       'rgba(255,99,74,0.15)',
  open:          '#4CAF50',
  openDim:       'rgba(76,175,80,0.12)',
};

// ─── Static data ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'all',        label: 'All',        emoji: '✨' },
  { id: 'love',       label: 'Love',       emoji: '💔' },
  { id: 'fun',        label: 'Fun',        emoji: '😈' },
  { id: 'confession', label: 'Confess',    emoji: '🕯️' },
  { id: 'support',    label: 'Healing',    emoji: '🤍' },
  { id: 'debate',     label: 'Debate',     emoji: '🔥' },
  { id: 'music',      label: 'Music',      emoji: '🎵' },
  { id: 'spicy',      label: 'Spicy',      emoji: '🌶️' },
  { id: 'midnight',   label: 'Midnight',   emoji: '🌙' },
];

const TABS = ['Discover', 'My Circles'];

const EMPTY_COPY = {
  discover: {
    title:    'The dark is quiet tonight.',
    subtitle: 'No circles have opened yet.\nBe the first voice in the room.',
    cta:      'Open a Circle',
  },
  mine: {
    title:    "You haven't entered any circles.",
    subtitle: 'Find a circle that speaks to you\nand step inside.',
    cta:      'Discover Circles',
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
          <View style={[styles.cardGlowBorder, { borderColor: auraColor + '40' }]} />
        )}

        <View style={[
          styles.card,
          isLive && { borderColor: auraColor + '30' },
        ]}>
          {/* Left accent bar */}
          <View style={[styles.cardAccent, { backgroundColor: auraColor }]} />

          <View style={styles.cardBody}>
            {/* Avatar + status */}
            <View style={styles.cardLeft}>
              <View style={[styles.avatarWrap, { backgroundColor: auraColor + '20' }]}>
                <Text style={styles.avatarEmoji}>{circle.avatar_emoji ?? '🎭'}</Text>
                {isLive && <LivePulse />}
                {isOpen && <View style={styles.openIndicator} />}
              </View>
            </View>

            {/* Content */}
            <View style={styles.cardContent}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {circle.name}
                </Text>
                {isLive && (
                  <View style={styles.liveBadge}>
                    <Radio size={rs(9)} color={T.live} />
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                )}
                {isOpen && !isLive && (
                  <View style={styles.openBadge}>
                    <Text style={styles.openBadgeText}>OPEN</Text>
                  </View>
                )}
              </View>

              <Text style={styles.cardBio} numberOfLines={2}>
                {circle.bio}
              </Text>

              <View style={styles.cardMeta}>
                <Text style={styles.cardMetaText}>
                  {circle.member_range} · {circle.category}
                </Text>
                {circle.is_creator && (
                  <View style={styles.yourBadge}>
                    <Text style={styles.yourBadgeText}>yours</Text>
                  </View>
                )}
                {circle.is_member && !circle.is_creator && (
                  <View style={styles.memberBadge}>
                    <Text style={styles.memberBadgeText}>member</Text>
                  </View>
                )}
              </View>
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
      <View style={styles.skeletonAvatar} />
      <View style={styles.skeletonContent}>
        <View style={[styles.skeletonLine, { width: '60%' }]} />
        <View style={[styles.skeletonLine, { width: '90%', marginTop: rp(8) }]} />
        <View style={[styles.skeletonLine, { width: '40%', marginTop: rp(6) }]} />
      </View>
    </Animated.View>
  );
});

const SKELETONS = [0, 1, 2, 3, 4];

// ─── Empty State ──────────────────────────────────────────────────────────────
const EmptyState = React.memo(({ tab, onAction }) => {
  const copy   = EMPTY_COPY[tab === 0 ? 'discover' : 'mine'];
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={[styles.emptyWrap, { opacity: fadeIn }]}>
      <Text style={styles.emptyIcon}>🌑</Text>
      <Text style={styles.emptyTitle}>{copy.title}</Text>
      <Text style={styles.emptySubtitle}>{copy.subtitle}</Text>
      <TouchableOpacity
        style={styles.emptyCta}
        onPress={onAction}
        hitSlop={HIT_SLOP}
        activeOpacity={0.85}
      >
        <Text style={styles.emptyCtaText}>{copy.cta}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CirclesScreen({ navigation }) {
  const { showToast } = useToast();

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
    navigation.navigate('CreateCircle');
  }, [navigation]);

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
            </>
          )}
        </View>

        <View style={styles.headerRight}>
          {/* Search input expands */}
          <Animated.View style={[styles.searchWrap, { width: searchWidth }]}>
            {searchActive && (
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="search circles..."
                placeholderTextColor={T.textMuted}
                style={styles.searchInput}
                autoFocus
              />
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

          <TouchableOpacity
            onPress={handleCreatePress}
            hitSlop={HIT_SLOP}
            style={styles.createBtn}
            activeOpacity={0.85}
          >
            <Plus size={rs(18)} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
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
            <EmptyState tab={activeTab} onAction={handleEmptyAction} />
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
    fontStyle:  'italic',
    letterSpacing: 0.2,
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
  searchInput: {
    color:           T.text,
    fontSize:        FONT.sm,
    paddingVertical: rp(6),
    paddingHorizontal: SPACING.xs,
    backgroundColor: T.surfaceAlt,
    borderRadius:    RADIUS.sm,
    borderWidth:     1,
    borderColor:     T.border,
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
    color:       T.textMuted,
    letterSpacing: 0.3,
  },
  tabTextActive: {
    color:     T.text,
    fontWeight:'700',
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
    gap:             rp(5),
    paddingHorizontal: SPACING.sm,
    paddingVertical: rp(7),
    borderRadius:    RADIUS.sm,
    backgroundColor: T.surfaceAlt,
    borderWidth:     1,
    borderColor:     T.border,
  },
  chipActive: {
    backgroundColor: T.primaryDim,
    borderColor:     T.primaryBorder,
  },
  chipEmoji: { fontSize: rf(13) },
  chipLabel: {
    fontSize:   FONT.xs,
    color:      T.textSecondary,
    fontWeight: '600',
  },
  chipLabelActive: { color: T.primary },

  // List
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.xs,
    paddingBottom:     rs(100),
    gap:               SPACING.sm,
  },

  // Circle card
  cardWrapper: {},
  cardGlowBorder: {
    position:     'absolute',
    top:          -1,
    left:         -1,
    right:        -1,
    bottom:       -1,
    borderRadius: RADIUS.md + 1,
    borderWidth:  1,
    zIndex:       0,
  },
  card: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.border,
    overflow:        'hidden',
    flexDirection:   'row',
  },
  cardAccent: {
    width:   rp(3),
    opacity: 0.7,
  },
  cardBody: {
    flex:           1,
    flexDirection:  'row',
    padding:        SPACING.md,
    gap:            SPACING.sm,
  },
  cardLeft: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  avatarWrap: {
    width:          rs(52),
    height:         rs(52),
    borderRadius:   rs(26),
    alignItems:     'center',
    justifyContent: 'center',
    position:       'relative',
  },
  avatarEmoji: { fontSize: rf(24) },
  cardContent: { flex: 1 },
  cardTitleRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            SPACING.xs,
    marginBottom:   rp(4),
  },
  cardName: {
    flex:          1,
    fontSize:      FONT.md,
    fontWeight:    '700',
    color:         T.text,
    letterSpacing: -0.2,
    fontFamily:    'PlayfairDisplay-Bold',
  },
  cardBio: {
    fontSize:    FONT.sm,
    color:       T.textSecondary,
    lineHeight:  rf(19),
    marginBottom: rp(8),
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.xs,
  },
  cardMetaText: {
    fontSize: FONT.xs,
    color:    T.textMuted,
    flex:     1,
  },

  // Badges
  liveBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(3),
    backgroundColor: 'rgba(255,99,74,0.15)',
    borderWidth:     1,
    borderColor:     'rgba(255,99,74,0.35)',
    paddingHorizontal: rp(7),
    paddingVertical:   rp(3),
    borderRadius:    RADIUS.xs,
  },
  liveBadgeText: {
    fontSize:    rf(9),
    fontWeight:  '800',
    color:       T.live,
    letterSpacing: 0.8,
  },
  openBadge: {
    backgroundColor: 'rgba(76,175,80,0.12)',
    borderWidth:     1,
    borderColor:     'rgba(76,175,80,0.3)',
    paddingHorizontal: rp(7),
    paddingVertical:   rp(3),
    borderRadius:    RADIUS.xs,
  },
  openBadgeText: {
    fontSize:    rf(9),
    fontWeight:  '800',
    color:       T.open,
    letterSpacing: 0.8,
  },
  yourBadge: {
    backgroundColor: T.primaryDim,
    borderWidth:     1,
    borderColor:     T.primaryBorder,
    paddingHorizontal: rp(7),
    paddingVertical:   rp(2),
    borderRadius:    RADIUS.xs,
  },
  yourBadgeText: {
    fontSize:   rf(9),
    fontWeight: '700',
    color:      T.primary,
  },
  memberBadge: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth:     1,
    borderColor:     T.border,
    paddingHorizontal: rp(7),
    paddingVertical:   rp(2),
    borderRadius:    RADIUS.xs,
  },
  memberBadgeText: {
    fontSize:   rf(9),
    fontWeight: '600',
    color:      T.textMuted,
  },

  // Live pulse
  pulseContainer: {
    position:       'absolute',
    bottom:         -rp(2),
    right:          -rp(2),
    width:          rs(16),
    height:         rs(16),
    alignItems:     'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position:        'absolute',
    width:           rs(16),
    height:          rs(16),
    borderRadius:    rs(8),
    borderWidth:     1.5,
    borderColor:     T.primary,
  },
  pulseDot: {
    width:           rs(8),
    height:          rs(8),
    borderRadius:    rs(4),
    backgroundColor: T.primary,
  },
  openIndicator: {
    position:        'absolute',
    bottom:          -rp(2),
    right:           -rp(2),
    width:           rs(10),
    height:          rs(10),
    borderRadius:    rs(5),
    backgroundColor: T.open,
    borderWidth:     1.5,
    borderColor:     T.background,
  },

  // Skeleton
  skeletonList: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.sm,
    gap:               SPACING.sm,
  },
  skeletonCard: {
    flexDirection:   'row',
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    padding:         SPACING.md,
    gap:             SPACING.sm,
    borderWidth:     1,
    borderColor:     T.border,
  },
  skeletonAvatar: {
    width:           rs(52),
    height:          rs(52),
    borderRadius:    rs(26),
    backgroundColor: T.surfaceAlt,
  },
  skeletonContent: { flex: 1, justifyContent: 'center' },
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
  },
  emptyCta: {
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
    color:      '#fff',
  },
});
