/**
 * StripePaymentSheet.jsx
 * Geo-priced coin purchase via Stripe PaymentSheet.
 *
 * Prerequisites (run once before building for device):
 *   npx expo install @stripe/stripe-react-native
 *   Wrap App.js root with <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} />
 *
 * Usage:
 *   <StripePaymentSheet
 *     visible={visible}
 *     onClose={() => setVisible(false)}
 *     packages={geoConfig.packages}   ← from fetchGeoConfig
 *   />
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CheckCircle,
  ChevronDown,
  CreditCard,
  Coins,
  RefreshCw,
  XCircle,
  Zap,
} from 'lucide-react-native';
import { useDispatch, useSelector } from 'react-redux';

// @stripe/stripe-react-native — install with: npx expo install @stripe/stripe-react-native
import { useStripe } from '@stripe/stripe-react-native';

import {
  buyCoinsStripeIntent,
  addCoinsOptimistic,
  fetchBalance,
  clearPaymentState,
} from '../../store/slices/coinsSlice';
import { useToast } from '../ui/Toast';
import {
  HIT_SLOP,
  BUTTON_HEIGHT,
  rf,
  rp,
  rs,
  SCREEN,
} from '../../utils/responsive';
import { THEME } from '../../utils/theme';

// ─── Static fallback packages (shown while geo config loads) ─────────────────
const FALLBACK_PACKAGES = [
  { id: 'starter', coins: 55,  label: 'Starter', tag: null,         stripe_display: '$0.99' },
  { id: 'popular', coins: 120, label: 'Popular', tag: 'Best Value', stripe_display: '$1.99' },
  { id: 'value',   coins: 350, label: 'Value',   tag: '+40% bonus', stripe_display: '$3.99' },
  { id: 'power',   coins: 800, label: 'Power',   tag: '+60% bonus', stripe_display: '$6.99' },
];

const SHEET_HEIGHT = SCREEN.height * 0.88;

// ─── Package card ─────────────────────────────────────────────────────────────
const PackageCard = React.memo(({ pkg, selected, onSelect }) => {
  const scale    = useRef(new Animated.Value(1)).current;
  const isSelected = selected === pkg.id;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 70,  useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 110, useNativeDriver: true }),
    ]).start();
    onSelect(pkg.id);
  }, [pkg.id, onSelect, scale]);

  return (
    <Animated.View style={[styles.packageCardWrap, { transform: [{ scale }] }]}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        hitSlop={HIT_SLOP}
        style={[
          styles.packageCard,
          isSelected && styles.packageCardSelected,
          pkg.id === 'popular' && !isSelected && styles.packageCardPopular,
        ]}
      >
        {isSelected && (
          <View style={styles.selectedTick}>
            <Text style={styles.selectedTickText}>✓</Text>
          </View>
        )}

        {pkg.tag ? (
          <View style={styles.tagBadge}>
            <Text style={styles.tagText}>{pkg.tag}</Text>
          </View>
        ) : (
          <View style={styles.tagSpacer} />
        )}

        <View style={styles.pkgCoinRow}>
          <Coins size={rs(18)} color={THEME.gold} />
          <Text style={styles.packageCoins}>{pkg.coins}</Text>
        </View>
        <Text style={styles.packageCoinsLabel}>coins</Text>

        <View style={styles.packagePriceBadge}>
          <Text style={styles.packagePrice}>{pkg.stripe_display}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Success view ─────────────────────────────────────────────────────────────
const SuccessView = React.memo(({ coins, onClose }) => {
  const scale   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
      Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.resultContainer, { opacity, transform: [{ scale }] }]}>
      <LinearGradient colors={['#22c55e', '#16a34a']} style={styles.resultIcon}>
        <CheckCircle size={rs(36)} color="#fff" />
      </LinearGradient>
      <Text style={styles.resultTitle}>Coins loaded! 🎉</Text>
      <Text style={styles.resultSub}>
        <Text style={{ color: THEME.gold, fontWeight: '700' }}>+{coins} coins</Text>
        {' '}have been added to your wallet.{'\n'}
        Go unlock someone worth knowing.
      </Text>
      <TouchableOpacity onPress={onClose} style={styles.resultBtn} activeOpacity={0.85}>
        <LinearGradient
          colors={[THEME.primary, '#e8432a']}
          style={styles.resultBtnGrad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={styles.resultBtnText}>Start spending</Text>
          <Zap size={rs(16)} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Failed view ──────────────────────────────────────────────────────────────
const FailedView = React.memo(({ onRetry, onClose }) => {
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(shake, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 8,   duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.resultContainer, { transform: [{ translateX: shake }] }]}>
      <LinearGradient colors={['#ef4444', '#b91c1c']} style={styles.resultIcon}>
        <XCircle size={rs(36)} color="#fff" />
      </LinearGradient>
      <Text style={styles.resultTitle}>Payment didn't go through</Text>
      <Text style={styles.resultSub}>
        The transaction was declined or cancelled.{'\n'}
        Double-check your card details and try again.
      </Text>
      <TouchableOpacity onPress={onRetry} style={styles.resultBtn} activeOpacity={0.85}>
        <LinearGradient
          colors={[THEME.primary, '#e8432a']}
          style={styles.resultBtnGrad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={styles.resultBtnText}>Try again</Text>
          <RefreshCw size={rs(16)} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
      <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP} style={styles.cancelLink}>
        <Text style={styles.cancelLinkText}>Maybe later</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Main sheet ───────────────────────────────────────────────────────────────
export default function StripePaymentSheet({ visible, onClose, packages }) {
  const dispatch          = useDispatch();
  const { showToast }     = useToast();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { balance, paymentLoading } = useSelector((s) => s.coins);

  const pkgList = packages?.length ? packages : FALLBACK_PACKAGES;

  const [selectedPackage, setSelectedPackage] = useState('popular');
  const [step,            setStep]            = useState('select');  // select | loading | success | failed
  const [successCoins,    setSuccessCoins]    = useState(0);

  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdrop   = useRef(new Animated.Value(0)).current;

  // ── Animate in / out ──────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setStep('select');
      dispatch(clearPaymentState());
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(backdrop,   { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      _slideDown();
    }
  }, [visible]);

  const _slideDown = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: SHEET_HEIGHT, duration: 300, useNativeDriver: true }),
      Animated.timing(backdrop,   { toValue: 0,            duration: 250, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleClose = useCallback(() => {
    dispatch(clearPaymentState());
    onClose();
  }, [onClose, dispatch]);

  const handleRetry = useCallback(() => {
    dispatch(clearPaymentState());
    setStep('select');
  }, [dispatch]);

  // ── Pay via Stripe PaymentSheet ───────────────────────────────────────────
  const handlePay = useCallback(async () => {
    setStep('loading');

    // 1. Create PaymentIntent on backend (price derived from user's IP server-side)
    const result = await dispatch(buyCoinsStripeIntent({ packageId: selectedPackage }));
    if (!buyCoinsStripeIntent.fulfilled.match(result)) {
      const msg = result.payload?.detail ?? 'Could not create payment. Try again.';
      showToast({ type: 'error', message: msg });
      setStep('select');
      return;
    }

    const { client_secret, coins } = result.payload;

    // 2. Initialise Stripe's native PaymentSheet
    const { error: initError } = await initPaymentSheet({
      paymentIntentClientSecret: client_secret,
      merchantDisplayName:       'Anonixx',
      style:                     'alwaysDark',
      appearance: {
        colors: {
          primary:           THEME.primary,
          background:        THEME.surface,
          componentBackground: THEME.surfaceAlt,
          componentBorder:   THEME.border,
          componentDivider:  THEME.border,
          primaryText:       THEME.text,
          secondaryText:     THEME.textSub,
          componentText:     THEME.text,
          placeholderText:   THEME.textMuted,
        },
      },
    });

    if (initError) {
      showToast({ type: 'error', message: initError.message });
      setStep('select');
      return;
    }

    // 3. Present the sheet — user enters card / Apple Pay / Google Pay
    const { error: presentError } = await presentPaymentSheet();

    if (presentError) {
      if (presentError.code === 'Canceled') {
        // User dismissed — just go back to select, no error toast
        setStep('select');
      } else {
        setStep('failed');
      }
      return;
    }

    // 4. Payment confirmed by Stripe client — coins will be credited via webhook.
    //    Optimistically update the balance for instant feedback.
    setSuccessCoins(coins);
    dispatch(addCoinsOptimistic(coins));
    setStep('success');

    // Sync real balance from DB after a short delay (webhook may fire async)
    setTimeout(() => dispatch(fetchBalance()), 4000);
  }, [selectedPackage, dispatch, initPaymentSheet, presentPaymentSheet, showToast]);

  const selectedPkg = useMemo(
    () => pkgList.find((p) => p.id === selectedPackage),
    [pkgList, selectedPackage]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <SafeAreaView edges={['bottom']} style={styles.safeArea}>

          {/* Handle + header */}
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Top Up Coins</Text>
              <Text style={styles.headerSub}>
                Card · Apple Pay · Google Pay · Secure
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={HIT_SLOP}
              style={styles.closeBtn}
              activeOpacity={0.7}
            >
              <ChevronDown size={rs(22)} color={THEME.textSub} />
            </TouchableOpacity>
          </View>

          {/* Balance pill */}
          <View style={styles.balancePill}>
            <Coins size={rs(14)} color={THEME.gold} />
            <Text style={styles.balancePillText}>{balance} coins in wallet</Text>
          </View>

          {/* ── Content by step ── */}
          {(step === 'select' || step === 'loading') && (
            <View style={styles.content}>
              <Text style={styles.sectionLabel}>Choose a package</Text>
              <View style={styles.packagesGrid}>
                {pkgList.map((pkg) => (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    selected={selectedPackage}
                    onSelect={setSelectedPackage}
                  />
                ))}
              </View>

              <TouchableOpacity
                onPress={handlePay}
                disabled={step === 'loading' || paymentLoading}
                activeOpacity={0.85}
                hitSlop={HIT_SLOP}
                style={styles.payBtnWrap}
              >
                <LinearGradient
                  colors={
                    step === 'loading' || paymentLoading
                      ? ['#555', '#444']
                      : [THEME.primary, '#e8432a']
                  }
                  style={styles.payBtn}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {step === 'loading' || paymentLoading ? (
                    <Text style={styles.payBtnText}>Opening payment…</Text>
                  ) : (
                    <>
                      <CreditCard size={rs(18)} color="#fff" />
                      <Text style={styles.payBtnText}>
                        Pay {selectedPkg?.stripe_display} · Get {selectedPkg?.coins} coins
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <Text style={styles.disclaimer}>
                Powered by Stripe. Your card details are never stored by Anonixx.
              </Text>
            </View>
          )}

          {step === 'success' && (
            <SuccessView coins={successCoins} onClose={handleClose} />
          )}

          {step === 'failed' && (
            <FailedView onRetry={handleRetry} onClose={handleClose} />
          )}

        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    height:          SHEET_HEIGHT,
    backgroundColor: THEME.surface,
    borderTopLeftRadius:  rs(24),
    borderTopRightRadius: rs(24),
    overflow:        'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.4, shadowRadius: 20 },
      android: { elevation: 24 },
    }),
  },
  safeArea: { flex: 1 },
  handle: {
    alignSelf:       'center',
    width:           rs(40),
    height:          rs(4),
    borderRadius:    rs(2),
    backgroundColor: THEME.border,
    marginTop:       rp(12),
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: rp(20),
    paddingVertical:   rp(14),
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  headerTitle: {
    color:         THEME.text,
    fontSize:      rf(19),
    fontWeight:    '700',
    fontFamily:    Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 0.3,
  },
  headerSub: {
    color:         THEME.textSub,
    fontSize:      rf(11),
    marginTop:     rp(2),
    letterSpacing: 0.5,
  },
  closeBtn: {
    width:           rs(36),
    height:          rs(36),
    borderRadius:    rs(18),
    backgroundColor: THEME.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
  },
  balancePill: {
    flexDirection:     'row',
    alignItems:        'center',
    alignSelf:         'center',
    backgroundColor:   THEME.goldBg,
    borderWidth:       1,
    borderColor:       THEME.goldBorder,
    borderRadius:      rs(20),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(6),
    marginTop:         rp(14),
    gap:               rs(6),
  },
  balancePillText: {
    color:      THEME.gold,
    fontSize:   rf(13),
    fontWeight: '600',
  },
  content: {
    flex:              1,
    paddingHorizontal: rp(20),
    paddingTop:        rp(18),
  },
  sectionLabel: {
    color:         THEME.textSub,
    fontSize:      rf(12),
    fontWeight:    '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom:  rp(10),
    marginTop:     rp(4),
  },
  packagesGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           rs(10),
    marginBottom:  rp(20),
  },
  packageCardWrap: { width: '48%' },
  packageCard: {
    backgroundColor:   THEME.surfaceAlt,
    borderRadius:      rs(16),
    borderWidth:       1.5,
    borderColor:       THEME.border,
    alignItems:        'center',
    paddingVertical:   rp(18),
    paddingHorizontal: rp(10),
    position:          'relative',
    minHeight:         rs(130),
    justifyContent:    'center',
    gap:               rp(4),
  },
  packageCardSelected: {
    borderColor:     THEME.primary,
    backgroundColor: 'rgba(255,99,74,0.08)',
  },
  packageCardPopular: {
    borderColor: 'rgba(168,85,247,0.45)',
  },
  selectedTick: {
    position:        'absolute',
    top:             rp(8),
    right:           rp(8),
    width:           rs(20),
    height:          rs(20),
    borderRadius:    rs(10),
    backgroundColor: THEME.primary,
    alignItems:      'center',
    justifyContent:  'center',
  },
  selectedTickText: { color: '#fff', fontSize: rf(11), fontWeight: '800' },
  tagBadge: {
    backgroundColor: 'rgba(168,85,247,0.15)',
    borderWidth:     1,
    borderColor:     'rgba(168,85,247,0.4)',
    borderRadius:    rs(8),
    paddingHorizontal: rp(8),
    paddingVertical:   rp(3),
    marginBottom:      rp(4),
  },
  tagSpacer: { height: rp(22) },
  tagText: {
    color:      '#a855f7',
    fontSize:   rf(10),
    fontWeight: '700',
  },
  pkgCoinRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rs(5),
  },
  packageCoins: {
    color:              THEME.gold,
    fontSize:           rf(24),
    fontWeight:         '900',
    includeFontPadding: false,
  },
  packageCoinsLabel: {
    color:      THEME.textSub,
    fontSize:   rf(11),
    fontWeight: '500',
  },
  packagePriceBadge: {
    marginTop:         rp(8),
    backgroundColor:   THEME.bg,
    borderRadius:      rs(20),
    paddingHorizontal: rp(12),
    paddingVertical:   rp(4),
    borderWidth:       1,
    borderColor:       THEME.border,
  },
  packagePrice: {
    color:      THEME.text,
    fontSize:   rf(13),
    fontWeight: '700',
  },
  payBtnWrap: { marginBottom: rp(10) },
  payBtn: {
    height:         BUTTON_HEIGHT,
    borderRadius:   rs(14),
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            rs(8),
  },
  payBtnText: {
    color:         '#fff',
    fontSize:      rf(15),
    fontWeight:    '700',
    letterSpacing: 0.2,
  },
  disclaimer: {
    color:      THEME.textSub,
    fontSize:   rf(11),
    textAlign:  'center',
    lineHeight: rf(16),
  },
  // ── Result views ──
  resultContainer: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: rp(32),
    paddingBottom:     rp(40),
  },
  resultIcon: {
    width:          rs(96),
    height:         rs(96),
    borderRadius:   rs(48),
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   rp(20),
  },
  resultTitle: {
    color:         THEME.text,
    fontSize:      rf(24),
    fontWeight:    '800',
    fontFamily:    Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign:     'center',
    marginBottom:  rp(10),
  },
  resultSub: {
    color:        THEME.textSub,
    fontSize:     rf(14),
    textAlign:    'center',
    lineHeight:   rf(22),
    marginBottom: rp(32),
  },
  resultBtn:     { width: '100%', marginBottom: rp(12) },
  resultBtnGrad: {
    height:         BUTTON_HEIGHT,
    borderRadius:   rs(14),
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            rs(8),
  },
  resultBtnText: { color: '#fff', fontSize: rf(15), fontWeight: '700' },
  cancelLink:     { paddingVertical: rp(8) },
  cancelLinkText: { color: THEME.textSub, fontSize: rf(13), textDecorationLine: 'underline' },
});
