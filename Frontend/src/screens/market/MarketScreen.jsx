/**
 * MarketScreen.jsx
 * Anonixx Mini Market — staff-curated paid content list.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Lock,
  ShoppingBag,
  Sparkles,
} from 'lucide-react-native';
import { useDispatch, useSelector } from 'react-redux';

import {
  fetchMarketItems,
  selectMarketFeed,
} from '../../store/slices/marketSlice';
import {
  HIT_SLOP,
  rf,
  rp,
  rs,
  RADIUS,
} from '../../utils/responsive';
import { THEME } from '../../utils/theme';

// ─── Item card ────────────────────────────────────────────────────────────────
const MarketListCard = React.memo(({ item, onPress }) => {
  const isUnlocked = item.is_unlocked;

  return (
    <TouchableOpacity
      onPress={() => onPress(item.id)}
      activeOpacity={0.88}
      style={styles.card}
    >
      {/* Cover */}
      <View style={styles.coverWrap}>
        {item.media_url ? (
          <Image source={{ uri: item.media_url }} style={styles.cover} />
        ) : (
          <LinearGradient
            colors={['#1a1530', '#0b0f18']}
            style={styles.cover}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Sparkles size={rs(28)} color={THEME.gold} />
          </LinearGradient>
        )}

        {/* Overlay badge */}
        {isUnlocked ? (
          <View style={[styles.overlayBadge, styles.badgeUnlocked]}>
            <CheckCircle2 size={rs(11)} color="#fff" />
            <Text style={styles.overlayBadgeText}>Unlocked</Text>
          </View>
        ) : (
          <View style={[styles.overlayBadge, styles.badgeExclusive]}>
            <View style={styles.dot} />
            <Text style={styles.overlayBadgeText}>EXCLUSIVE</Text>
          </View>
        )}
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.category}>
          {(item.category || 'EXCLUSIVE').toUpperCase()}
        </Text>

        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>

        <Text style={styles.teaser} numberOfLines={2}>
          {item.teaser}
        </Text>

        {/* Footer row */}
        <View style={styles.footer}>
          <View style={styles.statRow}>
            <Eye size={rs(12)} color={THEME.textSub} />
            <Text style={styles.statText}>{item.views ?? 0}</Text>
          </View>

          {isUnlocked ? (
            <View style={styles.unlockedPill}>
              <Text style={styles.unlockedPillText}>Open →</Text>
            </View>
          ) : (
            <View style={styles.pricePill}>
              <Lock size={rs(11)} color={THEME.gold} />
              <Text style={styles.priceText}>{item.price_coins} coins</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ─── Empty state ──────────────────────────────────────────────────────────────
const EmptyState = React.memo(() => (
  <View style={styles.emptyWrap}>
    <ShoppingBag size={rs(40)} color={THEME.border} />
    <Text style={styles.emptyTitle}>The market is empty</Text>
    <Text style={styles.emptySub}>
      Check back soon — Anonixx posts exclusive intel and stories regularly.
    </Text>
  </View>
));

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function MarketScreen({ navigation }) {
  const dispatch = useDispatch();
  const items    = useSelector(selectMarketFeed);
  const loading  = useSelector((s) => s.market.loading);

  useEffect(() => {
    dispatch(fetchMarketItems({ offset: 0 }));
  }, []);

  const handleRefresh = useCallback(() => {
    dispatch(fetchMarketItems({ offset: 0 }));
  }, [dispatch]);

  const handleOpen = useCallback((id) => {
    navigation.navigate('MarketItem', { itemId: id });
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }) => <MarketListCard item={item} onPress={handleOpen} />,
    [handleOpen]
  );

  const keyExtractor = useCallback((item, idx) => item.id ?? String(idx), []);

  const ListHeader = useMemo(() => (
    <View style={styles.heroWrap}>
      <LinearGradient
        colors={['#1a1530', '#0b0f18']}
        style={styles.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.heroEyebrow}>ANONIXX MARKET</Text>
        <Text style={styles.heroTitle}>Things you{'\n'}weren't meant to see.</Text>
        <Text style={styles.heroSub}>
          Curated drops. Unlocked with coins. Yours forever.
        </Text>
      </LinearGradient>
    </View>
  ), []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Nav bar */}
      <View style={styles.navbar}>
        {navigation?.canGoBack?.() ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={HIT_SLOP}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <ArrowLeft size={rs(20)} color={THEME.text} />
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}
        <Text style={styles.navTitle}>Market</Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={loading ? null : <EmptyState />}
        ListFooterComponent={
          loading && items.length > 0 ? (
            <ActivityIndicator color={THEME.primary} style={{ marginVertical: rp(16) }} />
          ) : null
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={5}
        refreshControl={
          <RefreshControl
            refreshing={loading && items.length === 0}
            onRefresh={handleRefresh}
            tintColor={THEME.primary}
          />
        }
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  navbar: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: rp(16),
    paddingVertical:   rp(12),
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  navTitle: {
    color:      THEME.text,
    fontSize:   rf(17),
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  backBtn: {
    width:           rs(36),
    height:          rs(36),
    alignItems:      'center',
    justifyContent:  'center',
  },
  listContent: { paddingBottom: rp(32) },

  // Hero
  heroWrap: {
    marginHorizontal: rp(16),
    marginTop:        rp(12),
    marginBottom:     rp(16),
    borderRadius:     rs(20),
    overflow:         'hidden',
    borderWidth:      1,
    borderColor:      THEME.goldBorder,
  },
  hero: {
    paddingVertical:   rp(28),
    paddingHorizontal: rp(22),
  },
  heroEyebrow: {
    color:         THEME.gold,
    fontSize:      rf(10),
    fontWeight:    '800',
    letterSpacing: 2.4,
    marginBottom:  rp(10),
  },
  heroTitle: {
    color:         THEME.text,
    fontSize:      rf(28),
    fontWeight:    '900',
    fontFamily:    Platform.OS === 'ios' ? 'Georgia' : 'serif',
    lineHeight:    rf(34),
    marginBottom:  rp(10),
  },
  heroSub: {
    color:      THEME.textSub,
    fontSize:   rf(13),
    lineHeight: rf(20),
  },

  // Card
  card: {
    marginHorizontal: rp(16),
    marginBottom:     rp(14),
    backgroundColor:  THEME.surface,
    borderRadius:     rs(18),
    overflow:         'hidden',
    borderWidth:      1,
    borderColor:      THEME.border,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  coverWrap: {
    position:        'relative',
    height:          rs(160),
    backgroundColor: THEME.surfaceDark,
  },
  cover: {
    width:          '100%',
    height:         '100%',
    alignItems:     'center',
    justifyContent: 'center',
  },
  overlayBadge: {
    position:          'absolute',
    top:               rp(10),
    left:              rp(10),
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rs(5),
    paddingHorizontal: rp(9),
    paddingVertical:   rp(4),
    borderRadius:      rs(10),
  },
  badgeExclusive: { backgroundColor: 'rgba(255,99,74,0.92)' },
  badgeUnlocked:  { backgroundColor: 'rgba(76,175,80,0.92)' },
  overlayBadgeText: {
    color:         '#fff',
    fontSize:      rf(10),
    fontWeight:    '800',
    letterSpacing: 0.6,
  },
  dot: {
    width:           rs(6),
    height:          rs(6),
    borderRadius:    rs(3),
    backgroundColor: '#fff',
  },

  // Body
  body: {
    padding: rp(14),
  },
  category: {
    color:         THEME.textSub,
    fontSize:      rf(10),
    fontWeight:    '700',
    letterSpacing: 1.5,
    marginBottom:  rp(6),
  },
  title: {
    color:         THEME.text,
    fontSize:      rf(17),
    fontWeight:    '700',
    fontFamily:    Platform.OS === 'ios' ? 'Georgia' : 'serif',
    lineHeight:    rf(22),
    marginBottom:  rp(8),
  },
  teaser: {
    color:        THEME.textSub,
    fontSize:     rf(13),
    lineHeight:   rf(19),
    marginBottom: rp(12),
  },
  footer: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  statRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rs(5),
  },
  statText: {
    color:    THEME.textSub,
    fontSize: rf(11),
  },
  pricePill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rs(5),
    backgroundColor:   THEME.goldBg,
    borderWidth:       1,
    borderColor:       THEME.goldBorder,
    borderRadius:      rs(20),
    paddingHorizontal: rp(10),
    paddingVertical:   rp(5),
  },
  priceText: {
    color:      THEME.gold,
    fontSize:   rf(12),
    fontWeight: '700',
  },
  unlockedPill: {
    backgroundColor:   'rgba(76,175,80,0.12)',
    borderWidth:       1,
    borderColor:       'rgba(76,175,80,0.4)',
    borderRadius:      rs(20),
    paddingHorizontal: rp(10),
    paddingVertical:   rp(5),
  },
  unlockedPillText: {
    color:      '#4CAF50',
    fontSize:   rf(12),
    fontWeight: '700',
  },

  // Empty
  emptyWrap: {
    alignItems:        'center',
    paddingTop:        rp(48),
    paddingHorizontal: rp(40),
  },
  emptyTitle: {
    color:        THEME.textSub,
    fontSize:     rf(16),
    fontWeight:   '600',
    marginTop:    rp(12),
    marginBottom: rp(6),
  },
  emptySub: {
    color:      THEME.textSub,
    fontSize:   rf(13),
    textAlign:  'center',
    lineHeight: rf(20),
    opacity:    0.7,
  },
});
