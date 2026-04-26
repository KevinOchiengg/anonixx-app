/**
 * ConnectScreen.jsx
 *
 * Connect tab home. Surfaces incoming connection requests + the Drops hero
 * (compose CTA, Browse / Inbox / Vibe Score quick-nav).
 *
 * Visual language follows DropsComposeScreen — shared T tokens, PlayfairDisplay
 * italic titles, DMSans body, coral accent.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, RefreshControl, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import {
  Flame, Inbox, Menu, ShoppingBag, Sparkles, UserCheck,
} from 'lucide-react-native';

import HamburgerMenu from '../../components/ui/HamburgerMenu';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { T } from '../../utils/colorTokens';
import {
  rs, rf, rp, rh, SPACING, FONT, RADIUS, HIT_SLOP, BUTTON_HEIGHT,
} from '../../utils/responsive';

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
const DropsHero = React.memo(({ navigation }) => {
  const handleCompose     = useCallback(() => navigation.navigate('DropsCompose'),         [navigation]);
  const handleBrowse      = useCallback(() => navigation.navigate('ConfessionMarketplace'), [navigation]);
  const handleInbox       = useCallback(() => navigation.navigate('DropsInbox'),            [navigation]);
  const handleVibe        = useCallback(() => navigation.navigate('VibeScore'),             [navigation]);

  return (
    <View style={hero.wrap}>
      {/* Eyebrow */}
      <Text style={hero.eyebrow}>ANONIXX DROPS</Text>

      {/* Editorial title */}
      <Text style={hero.title}>Drop a confession.</Text>
      <Text style={hero.titleAlt}>See who catches it.</Text>

      {/* Body copy */}
      <Text style={hero.body}>
        Share the thing you can't say out loud. Let the right stranger reach back.
      </Text>

      {/* Primary CTA */}
      <TouchableOpacity
        style={hero.dropBtn}
        onPress={handleCompose}
        activeOpacity={0.9}
        hitSlop={HIT_SLOP}
      >
        <Flame size={rs(16)} color="#fff" strokeWidth={2.5} />
        <Text style={hero.dropBtnText}>Drop It</Text>
      </TouchableOpacity>

      {/* Quick-nav tiles */}
      <View style={hero.tiles}>
        <QuickTile
          Icon={ShoppingBag}
          label="Browse"
          sub="confessions"
          onPress={handleBrowse}
        />
        <QuickTile
          Icon={Inbox}
          label="My Drops"
          sub="inbox & reveals"
          onPress={handleInbox}
        />
        <QuickTile
          Icon={Sparkles}
          label="Vibe Score"
          sub="your rating"
          onPress={handleVibe}
        />
      </View>
    </View>
  );
});

// ─── Quick Tile ───────────────────────────────────────────────
const QuickTile = React.memo(({ Icon, label, sub, onPress }) => (
  <TouchableOpacity
    style={tile.wrap}
    onPress={onPress}
    activeOpacity={0.85}
    hitSlop={HIT_SLOP}
  >
    <View style={tile.iconBox}>
      <Icon size={rs(16)} color={T.primary} strokeWidth={2} />
    </View>
    <Text style={tile.label}>{label}</Text>
    <Text style={tile.sub}>{sub}</Text>
  </TouchableOpacity>
));

// ─── Section Label ────────────────────────────────────────────
const SectionLabel = React.memo(({ count }) => (
  <View style={sec.row}>
    <UserCheck size={rs(13)} color={T.textSec} strokeWidth={2} />
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
  const isAccepting = accepting === request.request_id;

  const handleAccept = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 70, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 70, useNativeDriver: true }),
    ]).start(() => onAccept(request.request_id));
  }, [scaleAnim, onAccept, request.request_id]);

  const handleDecline = useCallback(() => {
    onDecline(request.request_id);
  }, [onDecline, request.request_id]);

  return (
    <Animated.View style={[card.wrap, { transform: [{ scale: scaleAnim }] }]}>
      {/* Top — avatar, name, time */}
      <View style={card.top}>
        <View style={card.avatarWrap}>
          <View style={[card.avatarGlow, { backgroundColor: avatarColor + '22' }]} />
          <View style={[card.avatar, { borderColor: avatarColor + '66' }]}>
            <Text style={card.avatarEmoji}>{getAvatar(request.from_avatar)}</Text>
          </View>
        </View>

        <View style={card.info}>
          <Text style={card.name} numberOfLines={1}>
            {request.from_anonymous_name}
          </Text>
          <Text style={card.subtitle}>wants to connect anonymously</Text>
          {request.from_vibe_tags?.length > 0 && (
            <View style={card.tags}>
              {request.from_vibe_tags.slice(0, 3).map(tag => (
                <View
                  key={tag}
                  style={[card.tag, { borderColor: avatarColor + '55' }]}
                >
                  <Text style={[card.tagText, { color: avatarColor }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <Text style={card.time}>{timeAgo(request.created_at)}</Text>
      </View>

      {/* Actions */}
      <View style={card.actions}>
        <TouchableOpacity
          style={[card.acceptBtn, { backgroundColor: avatarColor }]}
          onPress={handleAccept}
          disabled={isAccepting}
          activeOpacity={0.88}
          hitSlop={HIT_SLOP}
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
          hitSlop={HIT_SLOP}
        >
          <Text style={card.ignoreText}>Pass</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});

// ─── Empty State ──────────────────────────────────────────────
const EmptyRequests = React.memo(() => (
  <View style={empty.wrap}>
    <View style={empty.iconWrap}>
      <UserCheck size={rs(30)} color={T.textMute} strokeWidth={1.5} />
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

  // Entrance fade
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 320, useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

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
      // silent — surface only on explicit user action
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
      <SectionLabel count={requestCount} />
    </>
  );

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Top bar — brand + hamburger */}
      <View style={styles.topBar}>
        <Text style={styles.logo}>anonixx</Text>
        <TouchableOpacity
          onPress={() => setMenuVisible(true)}
          style={styles.menuBtn}
          hitSlop={HIT_SLOP}
          activeOpacity={0.7}
        >
          <Menu size={rs(20)} color={T.textSec} />
        </TouchableOpacity>
      </View>

      <Animated.View style={[{ flex: 1, opacity: fadeAnim }]}>
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
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={T.primary}
                colors={[T.primary]}
              />
            }
            removeClippedSubviews
            windowSize={9}
            initialNumToRender={6}
          />
        )}
      </Animated.View>

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
  safe:     { flex: 1, backgroundColor: T.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: rh(40) },
  listContent: { paddingBottom: rs(100) },

  topBar: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  logo: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.primary,
    letterSpacing: 0.3,
  },
  menuBtn: {
    width:           rs(36),
    height:          rs(36),
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    rs(18),
    backgroundColor: T.surfaceAlt,
  },
});

// ─── Hero Styles ──────────────────────────────────────────────
const hero = StyleSheet.create({
  wrap: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.lg,
    paddingBottom:     SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  eyebrow: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.textSec,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginBottom:  SPACING.xs,
  },
  title: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(30),
    color:         T.text,
    letterSpacing: 0.2,
    lineHeight:    rf(38),
  },
  titleAlt: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(30),
    color:         T.primary,
    letterSpacing: 0.2,
    lineHeight:    rf(38),
    marginBottom:  SPACING.sm,
  },
  body: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    letterSpacing: 0.2,
    lineHeight:    rf(20),
    marginBottom:  SPACING.md,
  },

  dropBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               rp(8),
    height:            BUTTON_HEIGHT,
    borderRadius:      RADIUS.md,
    backgroundColor:   T.primary,
    shadowColor:       T.primary,
    shadowOffset:      { width: 0, height: rs(4) },
    shadowOpacity:     0.4,
    shadowRadius:      rs(12),
    elevation:         6,
    marginBottom:      SPACING.md,
  },
  dropBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.md,
    color:         '#fff',
    letterSpacing: 0.5,
  },

  tiles: {
    flexDirection: 'row',
    gap:           SPACING.sm,
  },
});

// ─── Quick Tile ───────────────────────────────────────────────
const tile = StyleSheet.create({
  wrap: {
    flex:              1,
    paddingHorizontal: rp(10),
    paddingVertical:   rp(12),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   T.surfaceAlt,
    alignItems:        'center',
    gap:               rp(6),
  },
  iconBox: {
    width:           rs(32),
    height:          rs(32),
    borderRadius:    rs(10),
    backgroundColor: T.primaryDim,
    borderWidth:     1,
    borderColor:     T.primaryBorder,
    alignItems:      'center',
    justifyContent:  'center',
  },
  label: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    color:         T.text,
    letterSpacing: 0.3,
    marginTop:     rp(2),
  },
  sub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(9),
    color:         T.textMute,
    letterSpacing: 0.2,
  },
});

// ─── Section Label ────────────────────────────────────────────
const sec = StyleSheet.create({
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.lg,
    paddingBottom:     SPACING.sm,
  },
  label: {
    flex:          1,
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginLeft:    rp(4),
  },
  badge: {
    backgroundColor:   T.primary,
    borderRadius:      rs(9),
    minWidth:          rs(20),
    height:            rs(20),
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: rp(6),
  },
  badgeText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         '#fff',
    letterSpacing: 0.3,
  },
});

// ─── Request Card ─────────────────────────────────────────────
const card = StyleSheet.create({
  wrap: {
    marginHorizontal: SPACING.md,
    marginBottom:     SPACING.sm,
    backgroundColor:  T.surface,
    borderRadius:     RADIUS.lg,
    borderWidth:      1,
    borderColor:      T.border,
    padding:          SPACING.md,
    gap:              SPACING.sm,
  },
  top: {
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
    width:           rs(52),
    height:          rs(52),
    borderRadius:    rs(26),
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1.5,
    backgroundColor: T.background,
  },
  avatarEmoji: { fontSize: rf(24) },

  info: { flex: 1, gap: rp(3) },
  name: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.md,
    color:         T.text,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontFamily: 'DMSans-Italic',
    fontSize:   rf(11),
    color:      T.textMute,
  },
  tags: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           rp(5),
    marginTop:     rp(4),
  },
  tag: {
    paddingHorizontal: rp(8),
    paddingVertical:   rp(2),
    borderRadius:      RADIUS.sm,
    borderWidth:       1,
    backgroundColor:   T.surfaceAlt,
  },
  tagText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(9),
    letterSpacing: 0.3,
  },
  time: {
    fontFamily: 'DMSans-Regular',
    fontSize:   rf(10),
    color:      T.textMute,
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
    minHeight:       rs(40),
  },
  acceptText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         '#fff',
    letterSpacing: 0.4,
  },
  ignoreBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(10),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
  },
  ignoreText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      FONT.sm,
    color:         T.textMute,
    letterSpacing: 0.3,
  },
});

// ─── Empty State ──────────────────────────────────────────────
const empty = StyleSheet.create({
  wrap: {
    alignItems:        'center',
    paddingVertical:   rh(40),
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
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    letterSpacing: 0.3,
    textAlign:     'center',
  },
  body: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    textAlign:     'center',
    lineHeight:    rf(22),
    letterSpacing: 0.2,
  },
});
