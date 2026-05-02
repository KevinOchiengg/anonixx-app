/**
 * MarketItemScreen.jsx
 * Anonixx Mini Market — single item with teaser + paywall + unlock flow.
 *
 * Route params: { itemId: string }
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  ScrollView,
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
  Coins,
  Eye,
  Lock,
  ShoppingBag,
  Sparkles,
  X,
  Zap,
} from 'lucide-react-native';
import { useDispatch, useSelector } from 'react-redux';

import {
  fetchMarketItem,
  unlockMarketItem,
  selectMarketItem,
  selectIsUnlocking,
} from '../../store/slices/marketSlice';
import { fetchBalance } from '../../store/slices/coinsSlice';
import { useToast } from '../../components/ui/Toast';
import {
  HIT_SLOP,
  BUTTON_HEIGHT,
  rf,
  rp,
  rs,
} from '../../utils/responsive';
import { THEME } from '../../utils/theme';

// ─── Confirm sheet ────────────────────────────────────────────────────────────
const ConfirmUnlockSheet = React.memo(({
  visible, item, balance, onConfirm, onCancel, isUnlocking,
}) => {
  if (!visible || !item) return null;

  const enough = balance >= (item.price_coins ?? 0);

  return (
    <View style={confirmStyles.overlay}>
      <View style={confirmStyles.sheet}>
        <TouchableOpacity
          onPress={onCancel}
          hitSlop={HIT_SLOP}
          style={confirmStyles.closeBtn}
          activeOpacity={0.7}
        >
          <X size={rs(18)} color={THEME.textSub} />
        </TouchableOpacity>

        <View style={confirmStyles.iconWrap}>
          <LinearGradient
            colors={[THEME.gold, '#d97706']}
            style={confirmStyles.iconCircle}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Lock size={rs(28)} color="#fff" />
          </LinearGradient>
        </View>

        <Text style={confirmStyles.title}>Unlock this drop?</Text>
        <Text style={confirmStyles.subtitle} numberOfLines={2}>
          {item.title}
        </Text>

        <View style={confirmStyles.priceRow}>
          <Coins size={rs(20)} color={THEME.gold} />
          <Text style={confirmStyles.priceNum}>{item.price_coins}</Text>
          <Text style={confirmStyles.priceLabel}>coins</Text>
        </View>

        <View style={confirmStyles.balancePill}>
          <Text style={confirmStyles.balanceText}>
            You have <Text style={{ color: THEME.gold, fontWeight: '700' }}>{balance}</Text> coins
          </Text>
        </View>

        <TouchableOpacity
          onPress={onConfirm}
          disabled={!enough || isUnlocking}
          activeOpacity={0.85}
          style={confirmStyles.confirmBtn}
        >
          <LinearGradient
            colors={
              !enough ? ['#3a3f50', '#2a2f3e']
              : isUnlocking ? ['#555', '#444']
              : [THEME.primary, '#e8432a']
            }
            style={confirmStyles.confirmGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isUnlocking ? (
              <Text style={confirmStyles.confirmText}>Unlocking…</Text>
            ) : !enough ? (
              <Text style={confirmStyles.confirmText}>Not enough coins</Text>
            ) : (
              <>
                <Zap size={rs(16)} color="#fff" />
                <Text style={confirmStyles.confirmText}>Unlock now</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={onCancel} hitSlop={HIT_SLOP} activeOpacity={0.7}>
          <Text style={confirmStyles.cancelText}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const confirmStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: rp(24),
    zIndex: 100,
  },
  sheet: {
    width:            '100%',
    backgroundColor:  THEME.surface,
    borderRadius:     rs(24),
    padding:          rp(24),
    alignItems:       'center',
    borderWidth:      1,
    borderColor:      THEME.border,
  },
  closeBtn: {
    position:        'absolute',
    top:             rp(12),
    right:           rp(12),
    width:           rs(32),
    height:          rs(32),
    borderRadius:    rs(16),
    backgroundColor: THEME.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
  },
  iconWrap: { marginBottom: rp(16), marginTop: rp(8) },
  iconCircle: {
    width:          rs(72),
    height:         rs(72),
    borderRadius:   rs(36),
    alignItems:     'center',
    justifyContent: 'center',
  },
  title: {
    color:        THEME.text,
    fontSize:     rf(22),
    fontWeight:   '800',
    fontFamily:   Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: rp(6),
    textAlign:    'center',
  },
  subtitle: {
    color:        THEME.textSub,
    fontSize:     rf(13),
    textAlign:    'center',
    lineHeight:   rf(19),
    marginBottom: rp(20),
  },
  priceRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rs(8),
    marginBottom:  rp(12),
  },
  priceNum: {
    color:      THEME.gold,
    fontSize:   rf(36),
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    includeFontPadding: false,
  },
  priceLabel: {
    color:      THEME.textSub,
    fontSize:   rf(14),
    fontWeight: '500',
  },
  balancePill: {
    backgroundColor:   THEME.surfaceAlt,
    borderRadius:      rs(20),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(7),
    marginBottom:      rp(20),
  },
  balanceText: {
    color:    THEME.textSub,
    fontSize: rf(13),
  },
  confirmBtn: {
    width:        '100%',
    marginBottom: rp(12),
  },
  confirmGrad: {
    height:         BUTTON_HEIGHT,
    borderRadius:   rs(14),
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            rs(8),
  },
  confirmText: {
    color:      '#fff',
    fontSize:   rf(15),
    fontWeight: '700',
  },
  cancelText: {
    color:    THEME.textSub,
    fontSize: rf(13),
    paddingVertical: rp(8),
    textDecorationLine: 'underline',
  },
});

// ─── Locked content placeholder ───────────────────────────────────────────────
const LockedSection = React.memo(({ price, onUnlock }) => {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.05, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 1100, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={lockedStyles.wrap}>
      {/* Faux blurred lines */}
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            lockedStyles.fauxLine,
            { width: `${85 - i * 8}%`, opacity: 0.3 - i * 0.05 },
          ]}
        />
      ))}

      {/* CTA overlay */}
      <View style={lockedStyles.ctaOverlay}>
        <Animated.View style={[lockedStyles.lockIconWrap, { transform: [{ scale: pulse }] }]}>
          <LinearGradient
            colors={[THEME.gold, '#d97706']}
            style={lockedStyles.lockIcon}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Lock size={rs(22)} color="#fff" />
          </LinearGradient>
        </Animated.View>
        <Text style={lockedStyles.heading}>The rest is locked</Text>
        <Text style={lockedStyles.subtext}>
          Unlock the full drop for {price} coins.{'\n'}
          One payment, yours forever.
        </Text>
        <TouchableOpacity
          onPress={onUnlock}
          activeOpacity={0.85}
          style={lockedStyles.unlockBtn}
        >
          <LinearGradient
            colors={[THEME.primary, '#e8432a']}
            style={lockedStyles.unlockGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Zap size={rs(16)} color="#fff" />
            <Text style={lockedStyles.unlockText}>Unlock for {price} coins</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const lockedStyles = StyleSheet.create({
  wrap: {
    backgroundColor:  THEME.surface,
    borderRadius:     rs(20),
    padding:          rp(20),
    marginHorizontal: rp(16),
    marginTop:        rp(20),
    overflow:         'hidden',
    minHeight:        rs(280),
    borderWidth:      1,
    borderColor:      THEME.border,
  },
  fauxLine: {
    height:          rs(10),
    borderRadius:    rs(5),
    backgroundColor: THEME.textMuted,
    marginBottom:    rp(12),
  },
  ctaOverlay: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    bottom:          0,
    backgroundColor: 'rgba(11,15,24,0.92)',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         rp(20),
  },
  lockIconWrap: { marginBottom: rp(14) },
  lockIcon: {
    width:          rs(64),
    height:         rs(64),
    borderRadius:   rs(32),
    alignItems:     'center',
    justifyContent: 'center',
  },
  heading: {
    color:        THEME.text,
    fontSize:     rf(20),
    fontWeight:   '800',
    fontFamily:   Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: rp(8),
  },
  subtext: {
    color:        THEME.textSub,
    fontSize:     rf(13),
    textAlign:    'center',
    lineHeight:   rf(20),
    marginBottom: rp(18),
  },
  unlockBtn: { width: '100%' },
  unlockGrad: {
    height:         BUTTON_HEIGHT,
    borderRadius:   rs(14),
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            rs(8),
  },
  unlockText: {
    color:      '#fff',
    fontSize:   rf(15),
    fontWeight: '700',
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function MarketItemScreen({ navigation, route }) {
  const dispatch       = useDispatch();
  const { showToast }  = useToast();
  const { itemId }     = route.params || {};

  const item        = useSelector(selectMarketItem(itemId));
  const isUnlocking = useSelector(selectIsUnlocking(itemId));
  const balance     = useSelector((s) => s.coins.balance);

  const [confirmVisible, setConfirmVisible] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (itemId) dispatch(fetchMarketItem(itemId));
    dispatch(fetchBalance());
  }, [itemId]);

  useEffect(() => {
    if (item) {
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 320, useNativeDriver: true,
      }).start();
    }
  }, [item]);

  const handleUnlock = useCallback(async () => {
    setConfirmVisible(false);
    const result = await dispatch(unlockMarketItem(itemId));
    if (unlockMarketItem.fulfilled.match(result)) {
      if (!result.payload.already_unlocked) {
        showToast({ type: 'success', message: 'Unlocked! Enjoy.' });
      }
    } else {
      const detail = result.payload?.detail ?? 'Could not unlock. Try again.';
      showToast({ type: 'error', message: detail });
    }
  }, [dispatch, itemId, showToast]);

  if (!item) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={THEME.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const isUnlocked = item.is_unlocked;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Nav bar */}
      <View style={styles.navbar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={HIT_SLOP}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <ArrowLeft size={rs(20)} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>
          {(item.category || 'Exclusive').toUpperCase()}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Cover */}
          <View style={styles.coverWrap}>
            {item.media_url ? (
              <Image source={{ uri: item.media_url }} style={styles.cover} resizeMode="cover" />
            ) : (
              <LinearGradient
                colors={['#1a1530', '#0b0f18']}
                style={styles.cover}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Sparkles size={rs(40)} color={THEME.gold} />
              </LinearGradient>
            )}

            {/* Unlocked / Exclusive badge */}
            {isUnlocked ? (
              <View style={[styles.badge, styles.badgeUnlocked]}>
                <CheckCircle2 size={rs(12)} color="#fff" />
                <Text style={styles.badgeText}>Unlocked</Text>
              </View>
            ) : (
              <View style={[styles.badge, styles.badgeExclusive]}>
                <View style={styles.dot} />
                <Text style={styles.badgeText}>EXCLUSIVE</Text>
              </View>
            )}
          </View>

          {/* Title */}
          <Text style={styles.title}>{item.title}</Text>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Eye size={rs(13)} color={THEME.textSub} />
              <Text style={styles.statText}>{item.views ?? 0} views</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.stat}>
              <ShoppingBag size={rs(13)} color={THEME.textSub} />
              <Text style={styles.statText}>{item.unlocks ?? 0} unlocked</Text>
            </View>
          </View>

          {/* Teaser */}
          <View style={styles.teaserWrap}>
            <Text style={styles.teaser}>{item.teaser}</Text>
          </View>

          {/* Body — unlocked OR locked */}
          {isUnlocked ? (
            <View style={styles.bodyWrap}>
              <View style={styles.divider} />
              <Text style={styles.body}>{item.full_content}</Text>
              {item.video_url && (
                <View style={styles.videoNote}>
                  <Text style={styles.videoNoteText}>
                    Video URL: {item.video_url}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <LockedSection
              price={item.price_coins}
              onUnlock={() => setConfirmVisible(true)}
            />
          )}

          <View style={{ height: rp(40) }} />
        </ScrollView>
      </Animated.View>

      <ConfirmUnlockSheet
        visible={confirmVisible}
        item={item}
        balance={balance}
        isUnlocking={isUnlocking}
        onConfirm={handleUnlock}
        onCancel={() => setConfirmVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  loadingWrap: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
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
    color:         THEME.gold,
    fontSize:      rf(11),
    fontWeight:    '800',
    letterSpacing: 1.8,
    flex:          1,
    textAlign:     'center',
    marginHorizontal: rp(12),
  },
  backBtn: {
    width:           rs(36),
    height:          rs(36),
    alignItems:      'center',
    justifyContent:  'center',
  },
  scrollContent: { paddingBottom: rp(20) },

  // Cover
  coverWrap: {
    position:        'relative',
    height:          rs(220),
    backgroundColor: THEME.surfaceDark,
  },
  cover: {
    width:          '100%',
    height:         '100%',
    alignItems:     'center',
    justifyContent: 'center',
  },
  badge: {
    position:          'absolute',
    top:               rp(14),
    right:             rp(14),
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rs(5),
    paddingHorizontal: rp(10),
    paddingVertical:   rp(5),
    borderRadius:      rs(10),
  },
  badgeExclusive: { backgroundColor: 'rgba(255,99,74,0.92)' },
  badgeUnlocked:  { backgroundColor: 'rgba(76,175,80,0.92)' },
  badgeText: {
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

  // Title
  title: {
    color:             THEME.text,
    fontSize:          rf(26),
    fontWeight:        '900',
    fontFamily:        Platform.OS === 'ios' ? 'Georgia' : 'serif',
    lineHeight:        rf(34),
    paddingHorizontal: rp(20),
    paddingTop:        rp(20),
    paddingBottom:     rp(10),
  },

  // Stats
  statsRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: rp(20),
    marginBottom:      rp(16),
    gap:               rs(12),
  },
  stat: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rs(5),
  },
  statText: {
    color:    THEME.textSub,
    fontSize: rf(12),
  },
  statSep: {
    width:           rs(3),
    height:          rs(3),
    borderRadius:    rs(2),
    backgroundColor: THEME.textMuted,
  },

  // Teaser
  teaserWrap: {
    paddingHorizontal: rp(20),
    paddingBottom:     rp(8),
  },
  teaser: {
    color:      THEME.text,
    fontSize:   rf(16),
    lineHeight: rf(26),
    fontWeight: '500',
    fontStyle:  'italic',
  },

  // Body (unlocked)
  bodyWrap: {
    paddingHorizontal: rp(20),
    paddingTop:        rp(8),
  },
  divider: {
    height:          rs(2),
    width:           rs(48),
    backgroundColor: THEME.primary,
    marginVertical:  rp(20),
  },
  body: {
    color:      THEME.text,
    fontSize:   rf(15),
    lineHeight: rf(26),
  },
  videoNote: {
    backgroundColor:   THEME.surfaceAlt,
    borderRadius:      rs(12),
    padding:           rp(12),
    marginTop:         rp(20),
    borderWidth:       1,
    borderColor:       THEME.border,
  },
  videoNoteText: {
    color:    THEME.textSub,
    fontSize: rf(11),
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
