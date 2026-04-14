/**
 * DropsInboxScreen — active confession cards + drop connections.
 * All 17 Anonixx dev rules applied.
 */
import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, Animated, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, ChevronRight, Clock, Eye, Flame,
  Lock, MessageCircle, Plus, Share2, Zap,
} from 'lucide-react-native';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP, BUTTON_HEIGHT, SCREEN,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';

// ─── Theme (Rule 14) ─────────────────────────────────────────
const T = {
  background:  '#0b0f18',
  surface:     '#151924',
  surfaceAlt:  '#1a1f2e',
  primary:     '#FF634A',
  primaryDim:  'rgba(255,99,74,0.15)',
  text:        '#EAEAF0',
  textSecondary:'#9A9AA3',
  textMuted:   '#4a5068',
  border:      'rgba(255,255,255,0.06)',
  inputBg:     'rgba(255,255,255,0.04)',
};

// ─── Static data (Rule 5) ────────────────────────────────────
const CATEGORY_COLORS = {
  love:       '#FF6B8A',
  fun:        '#FFB347',
  adventure:  '#47B8FF',
  friendship: '#47FFB8',
  spicy:      '#FF4747',
};

const TABS = ['Cards', 'Connections', 'Received'];

// ─── Module-level components (Rules 5, 6) ────────────────────
const EmptyCards = React.memo(({ onPress }) => (
  <View style={empty.wrap}>
    <Text style={empty.glyph}>🔥</Text>
    <Text style={empty.title}>nothing dropped yet</Text>
    <Text style={empty.sub}>
      write something you've never said out loud.{'\n'}someone will unlock it.
    </Text>
    <TouchableOpacity style={empty.btn} onPress={onPress} activeOpacity={0.85}>
      <Plus size={rs(15)} color="#fff" strokeWidth={2.5} />
      <Text style={empty.btnText}>create a drop</Text>
    </TouchableOpacity>
  </View>
));

const EmptyConnections = React.memo(({ onPress }) => (
  <View style={empty.wrap}>
    <Text style={empty.glyph}>💬</Text>
    <Text style={empty.title}>no one's come through yet</Text>
    <Text style={empty.sub}>
      when someone pays to unlock your drop,{'\n'}they show up here.
    </Text>
    <TouchableOpacity style={empty.btn} onPress={onPress} activeOpacity={0.85}>
      <Text style={empty.btnText}>browse confessions</Text>
    </TouchableOpacity>
  </View>
));

const EmptyReceived = React.memo(() => (
  <View style={empty.wrap}>
    <Text style={empty.glyph}>👀</Text>
    <Text style={empty.title}>nothing waiting for you… yet</Text>
    <Text style={empty.sub}>
      when someone sends you an anonymous{'\n'}confession, it shows up here.
    </Text>
  </View>
));

const ReceivedDropItem = React.memo(({ item, onPress }) => {
  const color = CATEGORY_COLORS[item.category] || '#FF634A';
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn  = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, tension: 200, friction: 10 }).start();
  }, [scaleAnim]);
  const onPressOut = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, tension: 200, friction: 10 }).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={recv.wrap}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={1}
      >
        <View style={recv.header}>
          <View style={[recv.catDot, { backgroundColor: color }]} />
          <Text style={[recv.catLabel, { color }]}>{item.category}</Text>
          {item.is_expired ? (
            <View style={recv.expiredPill}>
              <Text style={recv.expiredText}>expired</Text>
            </View>
          ) : (
            <View style={recv.timerPill}>
              <Clock size={rs(10)} color="#9A9AA3" strokeWidth={2} />
              <Text style={recv.timerText}>{item.time_left}</Text>
            </View>
          )}
        </View>

        <Text style={recv.teaser} numberOfLines={2}>
          {item.already_unlocked
            ? `"${item.confession || 'media confession'}"`
            : 'Someone has something to say to you… 👀'}
        </Text>

        <View style={recv.footer}>
          {item.already_unlocked ? (
            <View style={recv.unlockedBadge}>
              <Text style={recv.unlockedText}>✓ unlocked · tap to chat</Text>
            </View>
          ) : (
            <View style={recv.lockRow}>
              <Lock size={rs(13)} color={color} strokeWidth={2} />
              <Text style={[recv.lockText, { color }]}>unlock for ${item.price}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const DropCard = React.memo(({ item, onShare, onPress }) => {
  const color    = CATEGORY_COLORS[item.category] || T.primary;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn  = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, tension: 200, friction: 10 }).start();
  }, [scaleAnim]);
  const onPressOut = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 200, friction: 10 }).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={card.wrap}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={1}
      >
        {/* Header row */}
        <View style={card.header}>
          <View style={[card.catDot, { backgroundColor: color }]} />
          <Text style={[card.catLabel, { color }]}>{item.category}</Text>
          {item.is_night_mode && (
            <View style={card.nightPill}>
              <Text style={card.nightPillText}>🌙 night mode</Text>
            </View>
          )}
          <View style={card.timerPill}>
            <Clock size={rs(10)} color={T.textSecondary} strokeWidth={2} />
            <Text style={card.timerText}>{item.time_left}</Text>
          </View>
        </View>

        {/* Confession */}
        <Text style={card.confession} numberOfLines={2}>
          "{item.confession}"
        </Text>

        {/* Stats + share */}
        <View style={card.footer}>
          <View style={card.stat}>
            <Zap size={rs(13)} color={color} strokeWidth={2} />
            <Text style={[card.statNum, { color }]}>{item.unlock_count}</Text>
            <Text style={card.statLabel}>unlocks</Text>
          </View>
          <View style={card.stat}>
            <Eye size={rs(13)} color={T.textSecondary} strokeWidth={2} />
            <Text style={card.statNum}>{item.admirer_count}</Text>
            <Text style={card.statLabel}>views</Text>
          </View>
          {item.reactions?.length > 0 && (
            <Text style={card.reactions}>
              {item.reactions.slice(-3).join(' ')}
            </Text>
          )}
          <TouchableOpacity
            style={[card.shareBtn, { borderColor: `${color}40` }]}
            onPress={() => onShare(item)}
            hitSlop={HIT_SLOP}
            activeOpacity={0.75}
          >
            <Share2 size={rs(12)} color={color} strokeWidth={2} />
            <Text style={[card.shareBtnText, { color }]}>share</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const ConnectionItem = React.memo(({ item, onPress }) => {
  const initial = item.other_anonymous_name?.[0]?.toUpperCase() || '?';
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn  = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, tension: 200, friction: 10 }).start();
  }, [scaleAnim]);
  const onPressOut = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 200, friction: 10 }).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={conn.wrap}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={1}
      >
        <View style={conn.avatar}>
          <Text style={conn.avatarText}>{initial}</Text>
          {item.is_revealed && <View style={conn.revealDot} />}
        </View>

        <View style={conn.info}>
          <View style={conn.nameRow}>
            <Text style={conn.name} numberOfLines={1}>{item.other_anonymous_name}</Text>
            {item.is_revealed && (
              <View style={conn.revealBadge}>
                <Text style={conn.revealBadgeText}>revealed</Text>
              </View>
            )}
          </View>
          <Text style={conn.confession} numberOfLines={1}>"{item.confession}"</Text>
          {item.last_message ? (
            <Text style={conn.lastMsg} numberOfLines={1}>
              {item.is_sender ? 'you: ' : ''}{item.last_message}
            </Text>
          ) : null}
        </View>

        <View style={conn.right}>
          <Text style={conn.msgCount}>{item.message_count} msgs</Text>
          <ChevronRight size={rs(14)} color={T.textMuted} strokeWidth={2} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Screen ───────────────────────────────────────────────────
export default function DropsInboxScreen({ navigation }) {
  const { showToast } = useToast();

  const [activeTab,  setActiveTab]  = useState(0);
  const [data,       setData]       = useState({ active_drops: [], connections: [], received: [] });
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Animations (Rule 14)
  const fadeAnim     = useRef(new Animated.Value(0)).current;
  const slideAnim    = useRef(new Animated.Value(rs(18))).current;
  const tabIndicator = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    load();
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 420, delay: 60, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, delay: 60, useNativeDriver: true }),
    ]).start();
  }, []);

  // Rule 11 — try/catch, Rule 3 — no console
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [inboxRes, receivedRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/drops/inbox`,    { headers }),
        fetch(`${API_BASE_URL}/api/v1/drops/received`, { headers }),
      ]);

      const inbox    = inboxRes.ok    ? await inboxRes.json()    : { active_drops: [], connections: [] };
      const received = receivedRes.ok ? await receivedRes.json() : { received: [] };

      setData({
        active_drops: inbox.active_drops   || [],
        connections:  inbox.connections    || [],
        received:     received.received    || [],
      });
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const switchTab = useCallback((i) => {
    setActiveTab(i);
    Animated.spring(tabIndicator, {
      toValue: i * (SCREEN.width / 3),
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [tabIndicator]);

  // Rule 16 — HTTPS share link (tappable in messaging apps)
  const handleShare = useCallback(async (item) => {
    try {
      const url = `${API_BASE_URL}/api/v1/drops/${item.id}/open`;
      await Share.share({
        message: `someone dropped a confession on Anonixx — tap to see it:\n${url}`,
        title:   'Anonixx Drop',
      });
    } catch {
      // user cancelled — silent
    }
  }, []);

  const handleCardPress   = useCallback(() => navigation.navigate('ShareCard'), [navigation]);
  const handleConnPress   = useCallback((id) => navigation.navigate('DropChat', { connectionId: id }), [navigation]);
  const handleRecvPress   = useCallback((id) => navigation.navigate('DropLanding', { dropId: id }), [navigation]);
  const handleNewDrop     = useCallback(() => navigation.navigate('ShareCard'), [navigation]);
  const handleMarketplace = useCallback(() => navigation.navigate('ConfessionMarketplace'), [navigation]);
  const handleVibeScore   = useCallback(() => navigation.navigate('VibeScore'), [navigation]);

  // Memoised render functions (Rules 6, 7)
  const renderCard = useCallback(({ item }) => (
    <DropCard
      item={item}
      onShare={handleShare}
      onPress={handleCardPress}
    />
  ), [handleShare, handleCardPress]);

  const renderConn = useCallback(({ item }) => (
    <ConnectionItem
      item={item}
      onPress={() => handleConnPress(item.id)}
    />
  ), [handleConnPress]);

  const renderReceived = useCallback(({ item }) => (
    <ReceivedDropItem
      item={item}
      onPress={() => handleRecvPress(item.id)}
    />
  ), [handleRecvPress]);

  const keyExtractor = useCallback((item) => item.id, []);

  // Counts for tab badges
  const cardCount     = useMemo(() => data.active_drops.length, [data.active_drops]);
  const connCount     = useMemo(() => data.connections.length,  [data.connections]);
  const receivedCount = useMemo(() => data.received.filter(r => !r.already_unlocked).length, [data.received]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.loadWrap}>
          <ActivityIndicator color={T.primary} />
          <Text style={styles.loadText}>pulling your drops…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Animated.View style={[styles.inner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.goBack()}
            hitSlop={HIT_SLOP}
          >
            <ArrowLeft size={rs(20)} color={T.text} strokeWidth={2} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>drops inbox</Text>
          </View>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleNewDrop}
            hitSlop={HIT_SLOP}
          >
            <Plus size={rs(20)} color={T.primary} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* Vibe score strip */}
        <TouchableOpacity
          style={styles.vibeStrip}
          onPress={handleVibeScore}
          activeOpacity={0.8}
        >
          <Flame size={rs(15)} color={T.primary} strokeWidth={2} />
          <Text style={styles.vibeStripText}>your vibe score & admirers</Text>
          <ChevronRight size={rs(14)} color={T.textMuted} strokeWidth={2} />
        </TouchableOpacity>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {TABS.map((tab, i) => (
            <TouchableOpacity
              key={tab}
              style={styles.tab}
              onPress={() => switchTab(i)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>
                {tab}
              </Text>
              {((i === 0 && cardCount > 0) || (i === 1 && connCount > 0) || (i === 2 && receivedCount > 0)) && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>
                    {i === 0 ? cardCount : i === 1 ? connCount : receivedCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
          <Animated.View
            style={[styles.tabIndicator, { transform: [{ translateX: tabIndicator }] }]}
          />
        </View>

        {/* Lists */}
        {activeTab === 0 ? (
          <FlatList
            data={data.active_drops}
            keyExtractor={keyExtractor}
            renderItem={renderCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            maxToRenderPerBatch={5}
            windowSize={3}
            initialNumToRender={6}
            ListEmptyComponent={<EmptyCards onPress={handleNewDrop} />}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} />
            }
          />
        ) : activeTab === 1 ? (
          <FlatList
            data={data.connections}
            keyExtractor={keyExtractor}
            renderItem={renderConn}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            maxToRenderPerBatch={5}
            windowSize={3}
            initialNumToRender={8}
            ListEmptyComponent={<EmptyConnections onPress={handleMarketplace} />}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} />
            }
          />
        ) : (
          <FlatList
            data={data.received}
            keyExtractor={keyExtractor}
            renderItem={renderReceived}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            maxToRenderPerBatch={5}
            windowSize={3}
            initialNumToRender={8}
            ListEmptyComponent={<EmptyReceived />}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} />
            }
          />
        )}

      </Animated.View>
    </SafeAreaView>
  );
}

// ─── Drop Card Styles ─────────────────────────────────────────
const card = StyleSheet.create({
  wrap: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    padding:         rp(16),
    borderWidth:     1,
    borderColor:     T.border,
    marginBottom:    SPACING.sm,
  },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            rp(6),
    marginBottom:   rp(10),
  },
  catDot: {
    width:        rs(7),
    height:       rs(7),
    borderRadius: rs(4),
  },
  catLabel: {
    fontSize:      rf(11),
    fontWeight:    '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flex:          1,
  },
  nightPill: {
    backgroundColor: 'rgba(155,139,255,0.12)',
    borderRadius:    RADIUS.sm,
    paddingHorizontal: rp(6),
    paddingVertical:   rp(2),
  },
  nightPillText: { fontSize: rf(10), color: '#9B8BFF' },
  timerPill: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              rp(3),
    backgroundColor:  T.surfaceAlt,
    borderRadius:     RADIUS.sm,
    paddingHorizontal: rp(6),
    paddingVertical:   rp(2),
  },
  timerText: { fontSize: rf(10), color: T.textSecondary },
  confession: {
    fontSize:     rf(15),
    color:        T.textSecondary,
    fontStyle:    'italic',
    lineHeight:   rf(23),
    marginBottom: rp(14),
  },
  footer: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(12),
  },
  stat: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(4),
  },
  statNum: {
    fontSize:   rf(13),
    fontWeight: '700',
    color:      T.text,
  },
  statLabel: {
    fontSize: rf(11),
    color:    T.textSecondary,
  },
  reactions: {
    fontSize:      rf(14),
    letterSpacing: 2,
  },
  shareBtn: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              rp(4),
    marginLeft:       'auto',
    paddingHorizontal: rp(10),
    paddingVertical:   rp(5),
    borderRadius:     RADIUS.sm,
    borderWidth:      1,
  },
  shareBtnText: {
    fontSize:   rf(11),
    fontWeight: '600',
  },
});

// ─── Connection Item Styles ───────────────────────────────────
const conn = StyleSheet.create({
  wrap: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    padding:         rp(14),
    borderWidth:     1,
    borderColor:     T.border,
    gap:             rp(12),
    marginBottom:    SPACING.sm,
  },
  avatar: {
    width:           rs(46),
    height:          rs(46),
    borderRadius:    rs(23),
    backgroundColor: T.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
    position:        'relative',
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.06)',
  },
  avatarText: {
    fontSize:   rf(18),
    fontWeight: '700',
    color:      T.text,
  },
  revealDot: {
    position:        'absolute',
    bottom:          0,
    right:           0,
    width:           rs(13),
    height:          rs(13),
    borderRadius:    rs(7),
    backgroundColor: '#47FFB8',
    borderWidth:     2,
    borderColor:     T.surface,
  },
  info:    { flex: 1, gap: rp(2) },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: rp(6) },
  name: {
    fontSize:   rf(14),
    fontWeight: '700',
    color:      T.text,
    flexShrink: 1,
  },
  revealBadge: {
    backgroundColor:   'rgba(71,255,184,0.12)',
    borderRadius:      RADIUS.sm,
    paddingHorizontal: rp(6),
    paddingVertical:   rp(2),
  },
  revealBadgeText: {
    fontSize:   rf(9),
    color:      '#47FFB8',
    fontWeight: '600',
  },
  confession: {
    fontSize:  rf(11),
    color:     T.textSecondary,
    fontStyle: 'italic',
  },
  lastMsg: {
    fontSize: rf(12),
    color:    T.textSecondary,
  },
  right: {
    alignItems: 'flex-end',
    gap:        rp(4),
  },
  msgCount: {
    fontSize: rf(11),
    color:    T.textMuted,
  },
});

// ─── Empty State Styles ───────────────────────────────────────
const empty = StyleSheet.create({
  wrap: {
    flex:             1,
    alignItems:       'center',
    justifyContent:   'center',
    paddingVertical:  rp(60),
    paddingHorizontal: SPACING.xl,
  },
  glyph: {
    fontSize:     rf(44),
    marginBottom: SPACING.md,
  },
  title: {
    fontSize:     rf(17),
    fontWeight:   '700',
    color:        T.text,
    marginBottom: rp(8),
    textAlign:    'center',
  },
  sub: {
    fontSize:     rf(13),
    color:        T.textSecondary,
    textAlign:    'center',
    lineHeight:   rf(21),
    marginBottom: SPACING.lg,
  },
  btn: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              rp(6),
    backgroundColor:  T.primary,
    borderRadius:     RADIUS.md,
    paddingHorizontal: rp(20),
    paddingVertical:   rp(12),
    shadowColor:      T.primary,
    shadowOffset:     { width: 0, height: rs(4) },
    shadowOpacity:    0.35,
    shadowRadius:     rs(10),
    elevation:        5,
  },
  btnText: {
    fontSize:   rf(13),
    fontWeight: '700',
    color:      '#fff',
  },
});

// ─── Received Drop Styles ────────────────────────────────────
const recv = StyleSheet.create({
  wrap: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    padding:         rp(16),
    borderWidth:     1,
    borderColor:     T.border,
    marginBottom:    SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(6),
    marginBottom:  rp(10),
  },
  catDot: {
    width:        rs(7),
    height:       rs(7),
    borderRadius: rs(4),
  },
  catLabel: {
    fontSize:      rf(11),
    fontWeight:    '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flex:          1,
  },
  timerPill: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              rp(3),
    backgroundColor:  T.surfaceAlt,
    borderRadius:     RADIUS.sm,
    paddingHorizontal: rp(6),
    paddingVertical:   rp(2),
  },
  timerText:    { fontSize: rf(10), color: T.textSecondary },
  expiredPill:  { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: RADIUS.sm, paddingHorizontal: rp(6), paddingVertical: rp(2) },
  expiredText:  { fontSize: rf(10), color: T.textMuted },
  teaser: {
    fontSize:     rf(15),
    color:        T.text,
    fontStyle:    'italic',
    lineHeight:   rf(23),
    marginBottom: rp(12),
  },
  footer: { flexDirection: 'row', alignItems: 'center' },
  lockRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(5),
  },
  lockText:    { fontSize: rf(13), fontWeight: '600' },
  unlockedBadge: {
    backgroundColor:   'rgba(71,255,184,0.10)',
    borderRadius:      RADIUS.sm,
    paddingHorizontal: rp(8),
    paddingVertical:   rp(4),
  },
  unlockedText: { fontSize: rf(12), color: '#47FFB8', fontWeight: '600' },
});

// ─── Screen Styles ────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: T.background,
  },
  inner: {
    flex: 1,
  },
  loadWrap: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SPACING.sm,
  },
  loadText: {
    fontSize:  rf(13),
    color:     T.textSecondary,
    fontStyle: 'italic',
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(12),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  iconBtn: {
    width:           rs(38),
    height:          rs(38),
    borderRadius:    rs(19),
    backgroundColor: T.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
  },
  headerTitle: {
    fontSize:      rf(17),
    fontWeight:    '700',
    color:         T.text,
    letterSpacing: 0.2,
  },
  vibeStrip: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              rp(8),
    marginHorizontal: SPACING.md,
    marginTop:        SPACING.md,
    marginBottom:     SPACING.sm,
    backgroundColor:  T.surfaceAlt,
    borderRadius:     RADIUS.md,
    padding:          rp(13),
    borderWidth:      1,
    borderColor:      T.border,
  },
  vibeStripText: {
    flex:       1,
    fontSize:   rf(13),
    fontWeight: '500',
    color:      T.text,
  },
  tabBar: {
    flexDirection:     'row',
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    position:          'relative',
  },
  tab: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical: rp(13),
    gap:            rp(6),
  },
  tabText: {
    fontSize:   rf(14),
    fontWeight: '500',
    color:      T.textSecondary,
  },
  tabTextActive: {
    color:      T.text,
    fontWeight: '700',
  },
  tabBadge: {
    backgroundColor:   T.primary,
    borderRadius:      rs(8),
    minWidth:          rs(17),
    height:            rs(17),
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: rp(3),
  },
  tabBadgeText: {
    fontSize:   rf(10),
    fontWeight: '700',
    color:      '#fff',
  },
  tabIndicator: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    width:           SCREEN.width / 3,
    height:          rs(2),
    backgroundColor: T.primary,
    borderRadius:    rs(1),
  },
  listContent: {
    padding:  SPACING.md,
    flexGrow: 1,
  },
});
