import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Dimensions, FlatList, RefreshControl, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Flame, Inbox, Menu, ShoppingBag, Sparkles, UserCheck } from 'lucide-react-native';
import HamburgerMenu from '../../components/ui/HamburgerMenu';
import { rs, rf, rp, rh, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';

const { width: SW, height: SH } = Dimensions.get('window');

// Coral particles scattered behind the screen content
const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  id:      i,
  top:     Math.random() * SH,
  left:    Math.random() * SW,
  size:    Math.random() * rs(3) + rs(1),
  opacity: Math.random() * 0.13 + 0.04,
}));

const CoralParticles = React.memo(() => (
  <>
    {PARTICLES.map(p => (
      <View key={p.id} style={{
        position:        'absolute',
        top:             p.top,
        left:            p.left,
        width:           p.size,
        height:          p.size,
        borderRadius:    p.size,
        backgroundColor: '#FF634A',
        opacity:         p.opacity,
        pointerEvents:   'none',
      }} />
    ))}
  </>
));
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';

// ─── Theme ────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  surfaceAlt:    '#1a1f2e',
  surfaceDeep:   '#0e1320',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.12)',
  primaryMid:    'rgba(255,99,74,0.20)',
  primaryBorder: 'rgba(255,99,74,0.30)',
  primaryGlow:   'rgba(255,99,74,0.08)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#4a5068',
  border:        'rgba(255,255,255,0.06)',
  borderStrong:  'rgba(255,255,255,0.10)',
  success:       '#4CAF50',
  successDim:    'rgba(76,175,80,0.12)',
  successBorder: 'rgba(76,175,80,0.25)',
};

const AVATAR_MAP = {
  ghost: '👻', shadow: '🌑', flame: '🔥', void: '🕳️',
  storm: '⛈️', smoke: '💨', eclipse: '🌘', shard: '🔷',
  moth: '🦋', raven: '🐦‍⬛',
};
const getAvatar = (name) => AVATAR_MAP[name] || '👤';

function timeAgo(isoString) {
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Drops Hero ───────────────────────────────────────────────
const DropsHero = React.memo(({ navigation }) => (
  <View style={hero.wrap}>
    {/* Top row: title + drop button */}
    <View style={hero.topRow}>
      <View style={hero.titleBlock}>
        <View style={hero.titleRow}>
          <Text style={hero.title}>Drops</Text>
          <Text style={hero.flame}>🔥</Text>
        </View>
        <Text style={hero.sub}>Post a confession. Get paid connections.</Text>
      </View>

      <TouchableOpacity
        style={hero.dropBtn}
        onPress={() => navigation.navigate('ShareCard')}
        activeOpacity={0.85}
        hitSlop={HIT_SLOP}
      >
        <Flame size={rs(14)} color="#fff" strokeWidth={2.5} />
        <Text style={hero.dropBtnText}>Drop It</Text>
      </TouchableOpacity>
    </View>

    {/* Divider */}
    <View style={hero.divider} />

    {/* Action pills */}
    <View style={hero.actions}>
      <TouchableOpacity
        style={hero.actionPill}
        onPress={() => navigation.navigate('ConfessionMarketplace')}
        activeOpacity={0.8}
      >
        <View style={hero.actionIcon}>
          <ShoppingBag size={rs(15)} color={T.primary} strokeWidth={2} />
        </View>
        <View>
          <Text style={hero.actionLabel}>Browse</Text>
          <Text style={hero.actionSub}>confessions</Text>
        </View>
      </TouchableOpacity>

      <View style={hero.actionSep} />

      <TouchableOpacity
        style={hero.actionPill}
        onPress={() => navigation.navigate('DropsInbox')}
        activeOpacity={0.8}
      >
        <View style={hero.actionIcon}>
          <Inbox size={rs(15)} color={T.primary} strokeWidth={2} />
        </View>
        <View>
          <Text style={hero.actionLabel}>My Drops</Text>
          <Text style={hero.actionSub}>inbox & reveals</Text>
        </View>
      </TouchableOpacity>

      <View style={hero.actionSep} />

      <TouchableOpacity
        style={hero.actionPill}
        onPress={() => navigation.navigate('VibeScore')}
        activeOpacity={0.8}
      >
        <View style={hero.actionIcon}>
          <Sparkles size={rs(15)} color={T.primary} strokeWidth={2} />
        </View>
        <View>
          <Text style={hero.actionLabel}>Vibe Score</Text>
          <Text style={hero.actionSub}>your rating</Text>
        </View>
      </TouchableOpacity>
    </View>
  </View>
));

// ─── Section Header ───────────────────────────────────────────
const SectionHeader = React.memo(({ count }) => (
  <View style={sec.row}>
    <UserCheck size={rs(14)} color={T.textSecondary} strokeWidth={2} />
    <Text style={sec.label}>Pending Requests</Text>
    {count > 0 && (
      <View style={sec.badge}>
        <Text style={sec.badgeText}>{count}</Text>
      </View>
    )}
  </View>
));

// ─── Request Card ─────────────────────────────────────────────
const RequestCard = React.memo(({ request, onAccept, onDecline, accepting }) => {
  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const avatarColor = request.from_avatar_color || T.primary;

  const handleAccept = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 70, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 70, useNativeDriver: true }),
    ]).start(() => onAccept(request.request_id));
  }, [scaleAnim, onAccept, request.request_id]);

  const handleDecline = useCallback(() => {
    onDecline(request.request_id);
  }, [onDecline, request.request_id]);

  const isAccepting = accepting === request.request_id;

  return (
    <Animated.View style={[card.wrap, { transform: [{ scale: scaleAnim }] }]}>
      <View style={card.inner}>
        {/* Avatar + info row */}
        <View style={card.topRow}>
          {/* Avatar with glow */}
          <View style={card.avatarWrap}>
            <View style={[card.avatarGlow, { backgroundColor: avatarColor + '20' }]} />
            <View style={[card.avatar, { borderColor: avatarColor + '60' }]}>
              <Text style={card.avatarEmoji}>{getAvatar(request.from_avatar)}</Text>
            </View>
          </View>

          {/* Name + meta */}
          <View style={card.info}>
            <Text style={card.name}>{request.from_anonymous_name}</Text>
            <Text style={card.subtitle}>wants to connect anonymously</Text>
            {request.from_vibe_tags?.length > 0 && (
              <View style={card.tags}>
                {request.from_vibe_tags.slice(0, 3).map(tag => (
                  <View key={tag} style={[card.tag, { borderColor: avatarColor + '50' }]}>
                    <Text style={[card.tagText, { color: avatarColor }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Time */}
          <Text style={card.time}>{timeAgo(request.created_at)}</Text>
        </View>

        {/* Action row */}
        <View style={card.actions}>
          <TouchableOpacity
            style={[card.acceptBtn, { backgroundColor: avatarColor }]}
            onPress={handleAccept}
            disabled={isAccepting}
            activeOpacity={0.85}
          >
            {isAccepting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={card.acceptText}>Accept</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={card.ignoreBtn}
            onPress={handleDecline}
            activeOpacity={0.7}
          >
            <Text style={card.ignoreText}>Pass</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
});

// ─── Empty State ──────────────────────────────────────────────
const EmptyRequests = React.memo(() => (
  <View style={empty.wrap}>
    <View style={empty.iconWrap}>
      <UserCheck size={rs(32)} color={T.textMuted} strokeWidth={1.5} />
    </View>
    <Text style={empty.title}>No requests yet</Text>
    <Text style={empty.body}>
      When someone wants to connect with you anonymously, they'll appear here.
    </Text>
  </View>
));

// ─── Screen ───────────────────────────────────────────────────
export default function ConnectScreen({ navigation }) {
  const insets        = useSafeAreaInsets();
  const { showToast } = useToast();

  const [requests,        setRequests]        = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);
  const [accepting,       setAccepting]       = useState(null);
  const [requestCount,    setRequestCount]    = useState(0);
  const [menuVisible,     setMenuVisible]     = useState(false);

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res  = await fetch(`${API_BASE_URL}/api/v1/connect/requests/incoming`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setRequests(data.requests || []);
        setRequestCount(data.count || 0);
      }
    } catch {
      // silent
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadRequests(); }, [loadRequests]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  }, [loadRequests]);

  const handleAccept = useCallback(async (requestId) => {
    setAccepting(requestId);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res = await fetch(
        `${API_BASE_URL}/api/v1/connect/requests/${requestId}/accept`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        setRequests(prev => prev.filter(r => r.request_id !== requestId));
        setRequestCount(c => Math.max(0, c - 1));
        showToast({ type: 'success', message: 'Connection accepted. Open Messages to chat.' });
      } else {
        showToast({ type: 'error', message: 'Could not accept request.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not accept request.' });
    } finally {
      setAccepting(null);
    }
  }, [showToast]);

  const handleDecline = useCallback(async (requestId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      await fetch(
        `${API_BASE_URL}/api/v1/connect/requests/${requestId}/decline`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      setRequests(prev => prev.filter(r => r.request_id !== requestId));
      setRequestCount(c => Math.max(0, c - 1));
    } catch {
      showToast({ type: 'error', message: 'Could not ignore request.' });
    }
  }, [showToast]);

  const renderRequest = useCallback(({ item }) => (
    <RequestCard
      request={item}
      onAccept={handleAccept}
      onDecline={handleDecline}
      accepting={accepting}
    />
  ), [handleAccept, handleDecline, accepting]);

  const keyExtractor = useCallback((item) => item.request_id, []);

  const ListHeader = (
    <>
      <DropsHero navigation={navigation} />
      <SectionHeader count={requestCount} />
    </>
  );

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Coral particle background */}
      <CoralParticles />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLogo}>anonixx</Text>
        <TouchableOpacity
          onPress={() => setMenuVisible(true)}
          style={styles.menuBtn}
          hitSlop={HIT_SLOP}
        >
          <Menu size={rs(20)} color={T.textSecondary} />
        </TouchableOpacity>
      </View>

      {loadingRequests && !refreshing ? (
        <>
          <DropsHero navigation={navigation} />
          <View style={styles.centered}>
            <ActivityIndicator color={T.primary} />
          </View>
        </>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={keyExtractor}
          renderItem={renderRequest}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={<EmptyRequests />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={T.primary}
              colors={[T.primary]}
            />
          }
        />
      )}

      <HamburgerMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        navigation={navigation}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: rh(40) },
  listContent: { paddingBottom: rs(100) },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(14),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerLogo: {
    fontSize:      rs(18),
    fontWeight:    '800',
    color:         T.primary,
    letterSpacing: -0.3,
  },
  menuBtn: {
    width:          rs(36),
    height:         rs(36),
    alignItems:     'center',
    justifyContent: 'center',
    borderRadius:   rs(18),
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
});

// ─── Drops Hero Styles ────────────────────────────────────────
const hero = StyleSheet.create({
  wrap: {
    marginHorizontal: SPACING.md,
    marginTop:        SPACING.md,
    marginBottom:     SPACING.sm,
    backgroundColor:  T.surfaceDeep,
    borderRadius:     RADIUS.xl,
    borderWidth:      1,
    borderColor:      T.primaryBorder,
    overflow:         'hidden',
    padding:          SPACING.md,
  },
  topRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    marginBottom:   SPACING.sm,
  },
  titleBlock: { flex: 1, marginRight: SPACING.sm },
  titleRow:   { flexDirection: 'row', alignItems: 'center', gap: rp(6), marginBottom: rp(4) },
  title: {
    fontSize:      FONT.xl,
    fontWeight:    '900',
    color:         T.text,
    letterSpacing: -0.5,
  },
  flame: { fontSize: rf(20) },
  sub: {
    fontSize: FONT.xs,
    color:    T.textSecondary,
    lineHeight: rf(18),
  },

  dropBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(5),
    backgroundColor:   T.primary,
    borderRadius:      RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(10),
    flexShrink:        0,
  },
  dropBtnText: {
    fontSize:   FONT.sm,
    fontWeight: '800',
    color:      '#fff',
    letterSpacing: 0.2,
  },

  divider: {
    height:           1,
    backgroundColor:  T.primaryBorder,
    marginVertical:   SPACING.sm,
    opacity:          0.5,
  },

  actions: {
    flexDirection:  'row',
    alignItems:     'center',
  },
  actionSep: {
    width:           1,
    height:          rs(28),
    backgroundColor: T.border,
    marginHorizontal: SPACING.xs,
  },
  actionPill: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(8),
    paddingVertical: rp(6),
    paddingHorizontal: rp(4),
  },
  actionIcon: {
    width:           rs(32),
    height:          rs(32),
    borderRadius:    rs(10),
    backgroundColor: T.primaryDim,
    borderWidth:     1,
    borderColor:     T.primaryBorder,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  actionLabel: {
    fontSize:   FONT.xs,
    fontWeight: '700',
    color:      T.text,
  },
  actionSub: {
    fontSize: rs(9),
    color:    T.textMuted,
    marginTop: rp(1),
  },
});

// ─── Section Header Styles ────────────────────────────────────
const sec = StyleSheet.create({
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.md,
    paddingBottom:     rp(10),
  },
  label: {
    fontSize:      FONT.xs,
    fontWeight:    '700',
    color:         T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flex:          1,
  },
  badge: {
    backgroundColor:   T.primary,
    borderRadius:      rs(9),
    minWidth:          rs(18),
    height:            rs(18),
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: rp(5),
  },
  badgeText: { color: '#fff', fontSize: rs(10), fontWeight: '700' },
});

// ─── Request Card Styles ──────────────────────────────────────
const card = StyleSheet.create({
  wrap: {
    marginHorizontal: SPACING.md,
    marginBottom:     SPACING.sm,
    backgroundColor:  T.surface,
    borderRadius:     RADIUS.lg,
    borderWidth:      1,
    borderColor:      T.border,
    overflow:         'hidden',
  },
  inner: {
    padding: SPACING.md,
    gap:     SPACING.sm,
  },

  topRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           SPACING.sm,
  },
  avatarWrap: {
    position:   'relative',
    flexShrink: 0,
  },
  avatarGlow: {
    position:     'absolute',
    top:          -4,
    left:         -4,
    right:        -4,
    bottom:       -4,
    borderRadius: rs(34),
  },
  avatar: {
    width:          rs(52),
    height:         rs(52),
    borderRadius:   rs(26),
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1.5,
    backgroundColor: T.surfaceDeep,
  },
  avatarEmoji: { fontSize: rf(24) },

  info: { flex: 1, gap: rp(4) },
  name: {
    fontSize:   FONT.md,
    fontWeight: '700',
    color:      T.text,
  },
  subtitle: {
    fontSize: FONT.xs,
    color:    T.textMuted,
    fontStyle: 'italic',
  },
  tags: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           rp(5),
    marginTop:     rp(2),
  },
  tag: {
    paddingHorizontal: rp(8),
    paddingVertical:   rp(2),
    borderRadius:      RADIUS.sm,
    borderWidth:       1,
    backgroundColor:   'rgba(255,255,255,0.03)',
  },
  tagText: {
    fontSize:   rs(10),
    fontWeight: '600',
  },
  time: {
    fontSize:  rs(10),
    color:     T.textMuted,
    flexShrink: 0,
  },

  actions: {
    flexDirection: 'row',
    gap:           SPACING.sm,
    alignItems:    'center',
  },
  acceptBtn: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    paddingVertical: rp(10),
    borderRadius:    RADIUS.md,
    minHeight:       rs(38),
  },
  acceptText: {
    fontSize:   FONT.sm,
    fontWeight: '800',
    color:      '#fff',
    letterSpacing: 0.3,
  },
  ignoreBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(10),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
  },
  ignoreText: {
    fontSize:   FONT.sm,
    color:      T.textMuted,
    fontWeight: '500',
  },
});

// ─── Empty State Styles ───────────────────────────────────────
const empty = StyleSheet.create({
  wrap: {
    alignItems:        'center',
    paddingVertical:   rh(32),
    paddingHorizontal: SPACING.xl,
    gap:               SPACING.sm,
  },
  iconWrap: {
    width:           rs(64),
    height:          rs(64),
    borderRadius:    rs(32),
    backgroundColor: T.surface,
    borderWidth:     1,
    borderColor:     T.border,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    SPACING.xs,
  },
  title: {
    fontSize:   FONT.lg,
    fontWeight: '700',
    color:      T.text,
    textAlign:  'center',
  },
  body: {
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    textAlign:  'center',
    lineHeight: rf(22),
  },
});
