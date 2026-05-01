/**
 * MpesaPaymentSheet.jsx
 * Bottom sheet for buying Anonixx Coins via M-Pesa STK Push.
 *
 * Usage:
 *   <MpesaPaymentSheet visible={visible} onClose={() => setVisible(false)} />
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
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CheckCircle,
  ChevronDown,
  Coins,
  Phone,
  RefreshCw,
  Smartphone,
  XCircle,
  Zap,
} from 'lucide-react-native';
import { useDispatch, useSelector } from 'react-redux';

import {
  buyCoinsWithMpesa,
  checkPaymentStatus,
  clearPaymentState,
} from '../../store/slices/coinsSlice';
import { useToast } from '../ui/Toast';
import { HIT_SLOP, BUTTON_HEIGHT, INPUT_HEIGHT, rf, rp, rs, SCREEN } from '../../utils/responsive';
import { THEME } from '../../utils/theme';

// ─── Static Data ──────────────────────────────────────────────
const COIN_PACKAGES = [
  { id: 'starter', kes: 50,  coins: 55,  label: 'Starter',  tag: null,           tagColor: null },
  { id: 'popular', kes: 100, coins: 120, label: 'Popular',  tag: 'Best Value',   tagColor: '#a855f7' },
  { id: 'value',   kes: 250, coins: 350, label: 'Value',    tag: '+40% bonus',   tagColor: '#22c55e' },
  { id: 'power',   kes: 500, coins: 800, label: 'Power',    tag: '+60% bonus',   tagColor: '#FF634A' },
];

const POLL_INTERVAL_MS  = 3000;
const POLL_MAX_ATTEMPTS = 10;   // 30 seconds total

const SHEET_HEIGHT = SCREEN.height * 0.88;

// ─── Package Card (2×2 grid) ──────────────────────────────────
const PackageCard = React.memo(({ pkg, selected, onSelect }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 70, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 110, useNativeDriver: true }),
    ]).start();
    onSelect(pkg.id);
  }, [pkg.id, onSelect, scale]);

  const isSelected = selected === pkg.id;

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
        {/* Selected tick */}
        {isSelected && (
          <View style={styles.selectedTick}>
            <Text style={styles.selectedTickText}>✓</Text>
          </View>
        )}

        {/* Tag badge */}
        {pkg.tag ? (
          <View style={[styles.tagBadge, { backgroundColor: pkg.tagColor + '22', borderColor: pkg.tagColor + '50' }]}>
            <Text style={[styles.tagText, { color: pkg.tagColor }]}>{pkg.tag}</Text>
          </View>
        ) : <View style={styles.tagSpacer} />}

        {/* Coin count — dominant */}
        <View style={styles.pkgCoinRow}>
          <Coins size={rs(18)} color={THEME.gold} />
          <Text style={styles.packageCoins}>{pkg.coins}</Text>
        </View>
        <Text style={styles.packageCoinsLabel}>coins</Text>

        {/* Price */}
        <View style={styles.packagePriceBadge}>
          <Text style={styles.packageKes}>KES {pkg.kes}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Polling Indicator ────────────────────────────────────────
const PollingView = React.memo(({ secondsLeft, onCancel }) => {
  const spin   = useRef(new Animated.Value(0)).current;
  const pulse  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const rotation = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1800, useNativeDriver: true })
    );
    const pulsing = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    );
    rotation.start();
    pulsing.start();
    return () => { rotation.stop(); pulsing.stop(); };
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.pollingContainer}>
      <Animated.View style={[styles.pollingIconWrap, { transform: [{ scale: pulse }] }]}>
        <LinearGradient
          colors={['#4CAF50', '#00BCD4']}
          style={styles.pollingGradientCircle}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Smartphone size={rs(32)} color="#fff" />
        </LinearGradient>
      </Animated.View>

      <Animated.View style={[styles.pollingSpinner, { transform: [{ rotate }] }]}>
        <RefreshCw size={rs(18)} color={THEME.textSub} />
      </Animated.View>

      <Text style={styles.pollingTitle}>Check your phone</Text>
      <Text style={styles.pollingSubtitle}>
        A payment prompt has been sent to your M-Pesa number.{'\n'}
        Enter your PIN to complete the payment.
      </Text>

      <View style={styles.pollingTimer}>
        <Text style={styles.pollingTimerText}>Waiting… {secondsLeft}s</Text>
      </View>

      <TouchableOpacity
        onPress={onCancel}
        hitSlop={HIT_SLOP}
        style={styles.cancelLink}
        activeOpacity={0.7}
      >
        <Text style={styles.cancelLinkText}>Cancel payment</Text>
      </TouchableOpacity>
    </View>
  );
});

// ─── Success View ─────────────────────────────────────────────
const SuccessView = React.memo(({ coins, onClose }) => {
  const scale   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1,    useNativeDriver: true, tension: 60, friction: 8 }),
      Animated.timing(opacity, { toValue: 1,    duration: 320, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.resultContainer, { opacity, transform: [{ scale }] }]}>
      <View style={styles.resultIconWrap}>
        <LinearGradient
          colors={['#22c55e', '#16a34a']}
          style={styles.resultGradientCircle}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <CheckCircle size={rs(36)} color="#fff" />
        </LinearGradient>
      </View>

      <Text style={styles.resultTitle}>Coins loaded! 🎉</Text>
      <Text style={styles.resultSubtitle}>
        <Text style={styles.resultCoinsHighlight}>+{coins} coins</Text>
        {' '}have been added to your wallet.{'\n'}
        Go unlock someone worth knowing.
      </Text>

      <TouchableOpacity
        onPress={onClose}
        style={styles.resultButton}
        activeOpacity={0.85}
        hitSlop={HIT_SLOP}
      >
        <LinearGradient
          colors={[THEME.primary, '#e8432a']}
          style={styles.resultButtonGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={styles.resultButtonText}>Start spending</Text>
          <Zap size={rs(16)} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Failed View ──────────────────────────────────────────────
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
      <View style={styles.resultIconWrap}>
        <LinearGradient
          colors={['#ef4444', '#b91c1c']}
          style={styles.resultGradientCircle}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <XCircle size={rs(36)} color="#fff" />
        </LinearGradient>
      </View>

      <Text style={styles.resultTitle}>Payment didn't go through</Text>
      <Text style={styles.resultSubtitle}>
        The M-Pesa transaction was cancelled or timed out.{'\n'}
        Happens to the best of us — try again.
      </Text>

      <TouchableOpacity
        onPress={onRetry}
        style={styles.resultButton}
        activeOpacity={0.85}
        hitSlop={HIT_SLOP}
      >
        <LinearGradient
          colors={[THEME.primary, '#e8432a']}
          style={styles.resultButtonGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={styles.resultButtonText}>Try again</Text>
          <RefreshCw size={rs(16)} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onClose}
        hitSlop={HIT_SLOP}
        style={styles.cancelLink}
        activeOpacity={0.7}
      >
        <Text style={styles.cancelLinkText}>Maybe later</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Main Sheet ───────────────────────────────────────────────
export default function MpesaPaymentSheet({ visible, onClose }) {
  const dispatch   = useDispatch();
  const { showToast } = useToast();

  const { paymentStatus, pendingCheckoutId, paymentLoading, balance } =
    useSelector((state) => state.coins);

  const [selectedPackage, setSelectedPackage] = useState('popular');
  const [phone,           setPhone]           = useState('');
  const [step,            setStep]            = useState('select'); // select | polling | success | failed
  const [secondsLeft,     setSecondsLeft]     = useState(30);
  const [successCoins,    setSuccessCoins]    = useState(0);

  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdrop   = useRef(new Animated.Value(0)).current;
  const pollRef    = useRef(null);
  const timerRef   = useRef(null);
  const pollCount  = useRef(0);

  // ─── Animate in/out ──────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setStep('select');
      dispatch(clearPaymentState());
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0, useNativeDriver: true, tension: 65, friction: 11,
        }),
        Animated.timing(backdrop, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      _slideDown();
    }
  }, [visible]);

  // ─── Watch Redux payment status ───────────────────────────────
  useEffect(() => {
    if (paymentStatus === 'completed' && step === 'polling') {
      _stopPolling();
      setSuccessCoins(COIN_PACKAGES.find((p) => p.id === selectedPackage)?.coins ?? 0);
      setStep('success');
    }
    if (paymentStatus === 'failed' && step === 'polling') {
      _stopPolling();
      setStep('failed');
    }
  }, [paymentStatus]);

  const _slideDown = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: SHEET_HEIGHT, duration: 300, useNativeDriver: true }),
      Animated.timing(backdrop,   { toValue: 0,            duration: 250, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleClose = useCallback(() => {
    _stopPolling();
    dispatch(clearPaymentState());
    onClose();
  }, [onClose, dispatch]);

  // ─── Polling logic ────────────────────────────────────────────
  const _stopPolling = useCallback(() => {
    if (pollRef.current)  { clearInterval(pollRef.current);  pollRef.current  = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    pollCount.current = 0;
  }, []);

  const _startPolling = useCallback((checkoutId) => {
    pollCount.current = 0;
    setSecondsLeft(POLL_MAX_ATTEMPTS * (POLL_INTERVAL_MS / 1000));

    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    pollRef.current = setInterval(async () => {
      pollCount.current += 1;
      if (pollCount.current > POLL_MAX_ATTEMPTS) {
        _stopPolling();
        setStep('failed');
        return;
      }
      dispatch(checkPaymentStatus(checkoutId));
    }, POLL_INTERVAL_MS);
  }, [dispatch, _stopPolling]);

  // ─── Pay ──────────────────────────────────────────────────────
  const handlePay = useCallback(async () => {
    const cleaned = phone.trim().replace(/\s+/g, '');
    if (!cleaned || cleaned.length < 9) {
      showToast({ type: 'error', message: 'Enter a valid M-Pesa number' });
      return;
    }
    const result = await dispatch(buyCoinsWithMpesa({ packageId: selectedPackage, phoneNumber: cleaned }));
    if (buyCoinsWithMpesa.fulfilled.match(result)) {
      setStep('polling');
      _startPolling(result.payload.checkout_request_id);
    } else {
      const detail = result.payload?.detail ?? 'Could not initiate payment. Try again.';
      showToast({ type: 'error', message: detail });
    }
  }, [phone, selectedPackage, dispatch, _startPolling, showToast]);

  const handleRetry = useCallback(() => {
    dispatch(clearPaymentState());
    setPhone('');
    setStep('select');
  }, [dispatch]);

  const selectedPkg = useMemo(
    () => COIN_PACKAGES.find((p) => p.id === selectedPackage),
    [selectedPackage]
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
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            {/* Handle + Header */}
            <View style={styles.handle} />
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Top Up Coins</Text>
                <Text style={styles.headerSub}>M-Pesa · Instant · Secure</Text>
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

            {/* ── Content ── */}
            {step === 'select' && (
              <View style={styles.content}>
                {/* Packages — 2×2 grid */}
                <Text style={styles.sectionLabel}>Choose a package</Text>
                <View style={styles.packagesGrid}>
                  {COIN_PACKAGES.map((pkg) => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      selected={selectedPackage}
                      onSelect={setSelectedPackage}
                    />
                  ))}
                </View>

                {/* Phone input */}
                <Text style={styles.sectionLabel}>M-Pesa number</Text>
                <View style={styles.phoneInputWrap}>
                  <View style={styles.phonePrefix}>
                    <Phone size={rs(16)} color={THEME.textSub} />
                    <Text style={styles.phonePrefixText}>+254</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="7XX XXX XXX"
                    placeholderTextColor={THEME.textSub}
                    keyboardType="phone-pad"
                    maxLength={12}
                    value={phone}
                    onChangeText={setPhone}
                    returnKeyType="done"
                  />
                </View>
                <Text style={styles.phoneHint}>
                  A payment prompt will be sent to this number. You only need your PIN.
                </Text>

                {/* Pay button */}
                <TouchableOpacity
                  onPress={handlePay}
                  disabled={paymentLoading}
                  activeOpacity={0.85}
                  hitSlop={HIT_SLOP}
                  style={styles.payButtonWrap}
                >
                  <LinearGradient
                    colors={paymentLoading ? ['#555', '#444'] : ['#4CAF50', '#2E7D32']}
                    style={styles.payButton}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {paymentLoading ? (
                      <Text style={styles.payButtonText}>Sending request…</Text>
                    ) : (
                      <>
                        <Zap size={rs(18)} color="#fff" />
                        <Text style={styles.payButtonText}>
                          Pay KES {selectedPkg?.kes} · Get {selectedPkg?.coins} coins
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <Text style={styles.disclaimer}>
                  Secured by Safaricom M-Pesa. Your PIN is never stored.
                </Text>
              </View>
            )}

            {step === 'polling' && (
              <PollingView secondsLeft={secondsLeft} onCancel={handleClose} />
            )}

            {step === 'success' && (
              <SuccessView coins={successCoins} onClose={handleClose} />
            )}

            {step === 'failed' && (
              <FailedView onRetry={handleRetry} onClose={handleClose} />
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
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
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: rp(20),
    paddingVertical:   rp(14),
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  headerTitle: {
    color:      THEME.text,
    fontSize:   rf(19),
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 0.3,
  },
  headerSub: {
    color:     THEME.textSub,
    fontSize:  rf(11),
    marginTop: rp(2),
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
    flexDirection:   'row',
    alignItems:      'center',
    alignSelf:       'center',
    backgroundColor: THEME.goldBg,
    borderWidth:     1,
    borderColor:     THEME.goldBorder,
    borderRadius:    rs(20),
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

  // ── Select step ──
  content: {
    flex: 1,
    paddingHorizontal: rp(20),
    paddingTop:        rp(18),
  },
  sectionLabel: {
    color:       THEME.textSub,
    fontSize:    rf(12),
    fontWeight:  '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom:  rp(10),
    marginTop:     rp(4),
  },
  // ── Package grid ──
  packagesGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           rs(10),
    marginBottom:  rp(18),
  },
  packageCardWrap: {
    width: '48%',          // 2 columns, gap handled by parent
  },
  packageCard: {
    backgroundColor: THEME.surfaceAlt,
    borderRadius:    rs(16),
    borderWidth:     1.5,
    borderColor:     THEME.border,
    alignItems:      'center',
    paddingVertical:   rp(18),
    paddingHorizontal: rp(10),
    position:          'relative',
    minHeight:         rs(130),
    justifyContent:    'center',
    gap:               rp(4),
  },
  packageCardSelected: {
    borderColor:     THEME.primary,
    backgroundColor: 'rgba(255, 99, 74, 0.08)',
  },
  packageCardPopular: {
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  selectedTick: {
    position:          'absolute',
    top:               rp(8),
    right:             rp(8),
    width:             rs(20),
    height:            rs(20),
    borderRadius:      rs(10),
    backgroundColor:   THEME.primary,
    alignItems:        'center',
    justifyContent:    'center',
  },
  selectedTickText: {
    color:      '#fff',
    fontSize:   rf(11),
    fontWeight: '800',
  },
  tagBadge: {
    borderWidth:       1,
    borderRadius:      rs(8),
    paddingHorizontal: rp(8),
    paddingVertical:   rp(3),
    marginBottom:      rp(4),
  },
  tagSpacer: {
    height: rp(22),       // same height as tagBadge so cards stay aligned
  },
  tagText: {
    fontSize:   rf(10),
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pkgCoinRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rs(5),
  },
  packageCoins: {
    color:      THEME.gold,
    fontSize:   rf(24),
    fontWeight: '900',
    includeFontPadding: false,
  },
  packageCoinsLabel: {
    color:    THEME.textSub,
    fontSize: rf(11),
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
  packageKes: {
    color:      THEME.text,
    fontSize:   rf(13),
    fontWeight: '700',
  },

  // ── Phone input ──
  phoneInputWrap: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: THEME.surfaceAlt,
    borderRadius:    rs(12),
    borderWidth:     1,
    borderColor:     THEME.border,
    height:          INPUT_HEIGHT,
    overflow:        'hidden',
    marginBottom:    rp(8),
  },
  phonePrefix: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: rp(12),
    borderRightWidth:  1,
    borderRightColor:  THEME.border,
    gap:               rs(6),
    alignSelf:         'stretch',
    justifyContent:    'center',
  },
  phonePrefixText: {
    color:      THEME.text,
    fontSize:   rf(14),
    fontWeight: '600',
  },
  phoneInput: {
    flex:              1,
    color:             THEME.text,
    fontSize:          rf(15),
    paddingHorizontal: rp(14),
  },
  phoneHint: {
    color:        THEME.textSub,
    fontSize:     rf(11),
    lineHeight:   rf(16),
    marginBottom: rp(20),
  },

  // ── Pay button ──
  payButtonWrap: { marginBottom: rp(10) },
  payButton: {
    height:          BUTTON_HEIGHT,
    borderRadius:    rs(14),
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             rs(8),
  },
  payButtonText: {
    color:      '#fff',
    fontSize:   rf(15),
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  disclaimer: {
    color:     THEME.textSub,
    fontSize:  rf(11),
    textAlign: 'center',
    lineHeight: rf(16),
  },

  // ── Polling ──
  pollingContainer: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: rp(32),
    paddingBottom:     rp(40),
  },
  pollingIconWrap: {
    marginBottom: rp(8),
  },
  pollingGradientCircle: {
    width:          rs(88),
    height:         rs(88),
    borderRadius:   rs(44),
    alignItems:     'center',
    justifyContent: 'center',
  },
  pollingSpinner: {
    marginTop:    rp(12),
    marginBottom: rp(20),
  },
  pollingTitle: {
    color:      THEME.text,
    fontSize:   rf(22),
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign:  'center',
    marginBottom: rp(10),
  },
  pollingSubtitle: {
    color:     THEME.textSub,
    fontSize:  rf(14),
    textAlign: 'center',
    lineHeight: rf(22),
    marginBottom: rp(24),
  },
  pollingTimer: {
    backgroundColor: THEME.surfaceAlt,
    borderRadius:    rs(20),
    paddingHorizontal: rp(20),
    paddingVertical:   rp(8),
    borderWidth:       1,
    borderColor:       THEME.border,
    marginBottom:      rp(24),
  },
  pollingTimerText: {
    color:     THEME.textSub,
    fontSize:  rf(13),
    fontWeight: '600',
  },
  cancelLink:     { paddingVertical: rp(8) },
  cancelLinkText: {
    color:     THEME.textSub,
    fontSize:  rf(13),
    textDecorationLine: 'underline',
  },

  // ── Result (success / failed) ──
  resultContainer: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: rp(32),
    paddingBottom:     rp(40),
  },
  resultIconWrap:   { marginBottom: rp(20) },
  resultGradientCircle: {
    width:          rs(96),
    height:         rs(96),
    borderRadius:   rs(48),
    alignItems:     'center',
    justifyContent: 'center',
  },
  resultTitle: {
    color:      THEME.text,
    fontSize:   rf(24),
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign:  'center',
    marginBottom: rp(10),
  },
  resultSubtitle: {
    color:     THEME.textSub,
    fontSize:  rf(14),
    textAlign: 'center',
    lineHeight: rf(22),
    marginBottom: rp(32),
  },
  resultCoinsHighlight: {
    color:      THEME.gold,
    fontWeight: '700',
  },
  resultButton:         { width: '100%', marginBottom: rp(12) },
  resultButtonGradient: {
    height:         BUTTON_HEIGHT,
    borderRadius:   rs(14),
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            rs(8),
  },
  resultButtonText: {
    color:      '#fff',
    fontSize:   rf(15),
    fontWeight: '700',
  },
});
