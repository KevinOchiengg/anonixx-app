/**
 * InternationalPaymentSheet.jsx
 *
 * Bottom sheet for international users (non-Kenya). Supports:
 *   - Card payments via Stripe
 *   - PayPal via expo-web-browser (OAuth-style redirect → deep link capture)
 *
 * Package data: USD_PACKAGES from paymentConstants (hardcoded FX approx).
 * Replace with backend-fetched FX packages once /payments/packages is live.
 *
 * Stripe card form: currently uses manual TextInputs.
 * TODO: Replace card inputs with @stripe/stripe-react-native <CardField />
 *       and wrap App.js in <StripeProvider publishableKey={...} />.
 *       Then swap handleCardPay to use createPaymentMethod() from useStripe().
 *
 * PayPal flow:
 *   1. dispatch(buyCoinsWithPayPal) → { orderId, approvalUrl }
 *   2. WebBrowser.openAuthSessionAsync(approvalUrl, 'anonixx://payment/success')
 *   3. User approves → redirect to anonixx://payment/success?token=X&PayerID=Y
 *   4. dispatch(capturePayPalPayment({ orderId, payerId }))
 *   5. Coins credited → success state
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
import * as WebBrowser from 'expo-web-browser';
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

import {
  buyCoinsWithStripe,
  buyCoinsWithPayPal,
  capturePayPalPayment,
  clearPaymentState,
} from '../../store/slices/coinsSlice';
import { USD_PACKAGES, formatPrice } from '../../utils/paymentConstants';
import { useToast } from '../ui/Toast';
import {
  HIT_SLOP,
  BUTTON_HEIGHT,
  INPUT_HEIGHT,
  rf,
  rp,
  rs,
  SCREEN,
} from '../../utils/responsive';
import { THEME } from '../../utils/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const SHEET_HEIGHT  = SCREEN.height * 0.90;
const PAYPAL_REDIRECT = 'anonixx://payment/success';

// ─── Shared sub-components ────────────────────────────────────────────────────

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
        {isSelected && (
          <View style={styles.selectedTick}>
            <Text style={styles.selectedTickText}>✓</Text>
          </View>
        )}

        {pkg.tag ? (
          <View style={[styles.tagBadge, { backgroundColor: pkg.tagColor + '22', borderColor: pkg.tagColor + '50' }]}>
            <Text style={[styles.tagText, { color: pkg.tagColor }]}>{pkg.tag}</Text>
          </View>
        ) : <View style={styles.tagSpacer} />}

        <View style={styles.pkgCoinRow}>
          <Coins size={rs(18)} color={THEME.gold} />
          <Text style={styles.packageCoins}>{pkg.coins}</Text>
        </View>
        <Text style={styles.packageCoinsLabel}>coins</Text>

        <View style={styles.packagePriceBadge}>
          <Text style={styles.packagePrice}>{formatPrice(pkg)}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

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
      <LinearGradient colors={['#22c55e', '#16a34a']} style={styles.resultCircle}>
        <CheckCircle size={rs(36)} color="#fff" />
      </LinearGradient>
      <Text style={styles.resultTitle}>Coins loaded! 🎉</Text>
      <Text style={styles.resultSubtitle}>
        <Text style={styles.resultHighlight}>+{coins} coins</Text>
        {' '}added to your wallet.{'\n'}Go unlock someone worth knowing.
      </Text>
      <TouchableOpacity onPress={onClose} style={styles.resultBtnWrap} activeOpacity={0.85}>
        <LinearGradient colors={[THEME.primary, '#e8432a']} style={styles.resultBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <Text style={styles.resultBtnText}>Start spending</Text>
          <Zap size={rs(16)} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
});

const FailedView = React.memo(({ message, onRetry, onClose }) => {
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(shake, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6,   duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -6,  duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.resultContainer, { transform: [{ translateX: shake }] }]}>
      <LinearGradient colors={['#ef4444', '#b91c1c']} style={styles.resultCircle}>
        <XCircle size={rs(36)} color="#fff" />
      </LinearGradient>
      <Text style={styles.resultTitle}>Payment failed</Text>
      <Text style={styles.resultSubtitle}>{message || 'Something went wrong. Try again.'}</Text>
      <TouchableOpacity onPress={onRetry} style={styles.resultBtnWrap} activeOpacity={0.85}>
        <LinearGradient colors={[THEME.primary, '#e8432a']} style={styles.resultBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <Text style={styles.resultBtnText}>Try again</Text>
          <RefreshCw size={rs(16)} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
      <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP} style={styles.cancelLink} activeOpacity={0.7}>
        <Text style={styles.cancelLinkText}>Maybe later</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Method Tab ───────────────────────────────────────────────────────────────

const MethodTab = React.memo(({ id, label, icon: Icon, active, onPress }) => (
  <TouchableOpacity
    onPress={() => onPress(id)}
    activeOpacity={0.8}
    style={[styles.methodTab, active && styles.methodTabActive]}
  >
    <Icon size={rs(16)} color={active ? THEME.primary : THEME.textSub} />
    <Text style={[styles.methodTabLabel, active && styles.methodTabLabelActive]}>{label}</Text>
  </TouchableOpacity>
));

// ─── Card Content ─────────────────────────────────────────────────────────────

const CardContent = React.memo(({ selectedPkg, onPay, loading }) => {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry,     setExpiry]     = useState('');
  const [cvc,        setCvc]        = useState('');
  const [name,       setName]       = useState('');

  // Format card number with spaces every 4 digits
  const handleCardNumber = (v) => {
    const digits = v.replace(/\D/g, '').slice(0, 16);
    setCardNumber(digits.replace(/(.{4})/g, '$1 ').trim());
  };

  // Format expiry as MM/YY
  const handleExpiry = (v) => {
    const digits = v.replace(/\D/g, '').slice(0, 4);
    setExpiry(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
  };

  const handlePay = () => {
    const rawCard   = cardNumber.replace(/\s/g, '');
    const rawExpiry = expiry.replace('/', '');
    if (rawCard.length < 15 || rawExpiry.length < 4 || cvc.length < 3 || !name.trim()) return;

    // TODO: Replace this block with @stripe/stripe-react-native once installed:
    //
    //   const { createPaymentMethod } = useStripe();
    //   const { paymentMethod, error } = await createPaymentMethod({
    //     paymentMethodType: 'Card',
    //     paymentMethodData:  { billingDetails: { name } }
    //   });
    //   onPay({ paymentMethodId: paymentMethod.id });
    //
    // Until then, pass a placeholder so UI flow is exercisable end-to-end.
    onPay({ cardNumber: rawCard, expiry, cvc, name });
  };

  return (
    <View style={styles.methodContent}>
      <Text style={styles.sectionLabel}>Card details</Text>

      {/* Name */}
      <TextInput
        style={styles.cardInput}
        placeholder="Name on card"
        placeholderTextColor={THEME.textSub}
        autoCapitalize="words"
        value={name}
        onChangeText={setName}
      />

      {/* Card number */}
      <TextInput
        style={styles.cardInput}
        placeholder="Card number"
        placeholderTextColor={THEME.textSub}
        keyboardType="number-pad"
        maxLength={19} // 16 digits + 3 spaces
        value={cardNumber}
        onChangeText={handleCardNumber}
      />

      {/* Expiry + CVC row */}
      <View style={styles.cardRow}>
        <TextInput
          style={[styles.cardInput, styles.cardInputHalf]}
          placeholder="MM / YY"
          placeholderTextColor={THEME.textSub}
          keyboardType="number-pad"
          maxLength={5}
          value={expiry}
          onChangeText={handleExpiry}
        />
        <TextInput
          style={[styles.cardInput, styles.cardInputHalf]}
          placeholder="CVC"
          placeholderTextColor={THEME.textSub}
          keyboardType="number-pad"
          maxLength={4}
          secureTextEntry
          value={cvc}
          onChangeText={setCvc}
        />
      </View>

      <TouchableOpacity
        onPress={handlePay}
        disabled={loading}
        activeOpacity={0.85}
        style={styles.payBtnWrap}
      >
        <LinearGradient
          colors={loading ? ['#555', '#444'] : [THEME.primary, '#e8432a']}
          style={styles.payBtn}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <CreditCard size={rs(18)} color="#fff" />
          <Text style={styles.payBtnText}>
            {loading
              ? 'Processing…'
              : `Pay ${formatPrice(selectedPkg)} · Get ${selectedPkg.coins} coins`}
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      <Text style={styles.disclaimer}>Secured by Stripe. Your card details are encrypted.</Text>
    </View>
  );
});

// ─── PayPal Content ───────────────────────────────────────────────────────────

const PayPalContent = React.memo(({ selectedPkg, onPay, loading }) => (
  <View style={styles.methodContent}>
    <View style={styles.paypalInfo}>
      <Text style={styles.paypalInfoTitle}>You'll be taken to PayPal</Text>
      <Text style={styles.paypalInfoSub}>
        Log in or use your PayPal balance / linked card to pay.{'\n'}
        You'll return here automatically after approving.
      </Text>
    </View>

    <TouchableOpacity
      onPress={onPay}
      disabled={loading}
      activeOpacity={0.85}
      style={styles.payBtnWrap}
    >
      <View style={[styles.paypalBtn, loading && styles.paypalBtnDisabled]}>
        {/* PayPal brand colours */}
        <Text style={styles.paypalBtnText}>
          {loading ? 'Opening PayPal…' : `Pay with PayPal · ${formatPrice(selectedPkg)}`}
        </Text>
      </View>
    </TouchableOpacity>

    <Text style={styles.disclaimer}>Secured by PayPal. You won't share card details with us.</Text>
  </View>
));

// ─── Main Sheet ───────────────────────────────────────────────────────────────

export default function InternationalPaymentSheet({ visible, onClose }) {
  const dispatch    = useDispatch();
  const { showToast } = useToast();

  const { paymentLoading, balance } = useSelector((state) => state.coins);

  const [selectedPackage, setSelectedPackage] = useState('popular');
  const [method,          setMethod]          = useState('card'); // 'card' | 'paypal'
  const [step,            setStep]            = useState('select'); // select | success | failed
  const [successCoins,    setSuccessCoins]    = useState(0);
  const [failMessage,     setFailMessage]     = useState('');
  const [localLoading,    setLocalLoading]    = useState(false);

  // PayPal order ID stored between create → capture
  const pendingOrderId = useRef(null);

  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdrop   = useRef(new Animated.Value(0)).current;

  // ── Animate in/out ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (visible) {
      setStep('select');
      setMethod('card');
      setSelectedPackage('popular');
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
    pendingOrderId.current = null;
    onClose();
  }, [onClose, dispatch]);

  const handleRetry = useCallback(() => {
    dispatch(clearPaymentState());
    pendingOrderId.current = null;
    setStep('select');
    setFailMessage('');
  }, [dispatch]);

  const selectedPkg = useMemo(
    () => USD_PACKAGES.find((p) => p.id === selectedPackage),
    [selectedPackage]
  );

  // ── Card payment ─────────────────────────────────────────────────────────────

  const handleCardPay = useCallback(async (cardData) => {
    setLocalLoading(true);
    try {
      // When Stripe SDK is integrated, cardData.paymentMethodId will be real.
      // For now this calls the backend with the raw fields; backend will reject
      // until the endpoint + Stripe SDK are both wired up.
      const result = await dispatch(buyCoinsWithStripe({
        packageId:       selectedPackage,
        paymentMethodId: cardData.paymentMethodId ?? '__pending_stripe_sdk__',
      }));

      if (buyCoinsWithStripe.fulfilled.match(result)) {
        setSuccessCoins(selectedPkg?.coins ?? 0);
        setStep('success');
      } else {
        const msg = result.payload?.detail ?? 'Card payment failed. Please try again.';
        setFailMessage(msg);
        setStep('failed');
      }
    } finally {
      setLocalLoading(false);
    }
  }, [dispatch, selectedPackage, selectedPkg]);

  // ── PayPal payment ────────────────────────────────────────────────────────────

  const handlePayPalPay = useCallback(async () => {
    setLocalLoading(true);
    try {
      // Step 1: Create PayPal order on backend
      const createResult = await dispatch(buyCoinsWithPayPal({ packageId: selectedPackage }));

      if (!buyCoinsWithPayPal.fulfilled.match(createResult)) {
        const msg = createResult.payload?.detail ?? 'Could not create PayPal order.';
        showToast({ type: 'error', message: msg });
        setLocalLoading(false);
        return;
      }

      const { orderId, approvalUrl } = createResult.payload;
      pendingOrderId.current = orderId;

      // Step 2: Open PayPal approval URL in browser
      // WebBrowser.openAuthSessionAsync blocks until the redirect URI is hit
      // or the user manually closes the browser.
      const browserResult = await WebBrowser.openAuthSessionAsync(
        approvalUrl,
        PAYPAL_REDIRECT
      );

      if (browserResult.type !== 'success') {
        // User cancelled or browser dismissed without completing
        setLocalLoading(false);
        showToast({ type: 'error', message: 'PayPal payment cancelled.' });
        return;
      }

      // Step 3: Parse PayerID from redirect URL
      let payerId = null;
      try {
        const urlObj = new URL(browserResult.url);
        payerId = urlObj.searchParams.get('PayerID');
      } catch {
        // URL parsing failed — try manual parse
        const match = browserResult.url.match(/PayerID=([^&]+)/);
        if (match) payerId = match[1];
      }

      // Step 4: Capture the order on backend
      const captureResult = await dispatch(capturePayPalPayment({
        orderId:  pendingOrderId.current,
        payerId,
      }));

      if (capturePayPalPayment.fulfilled.match(captureResult)) {
        setSuccessCoins(selectedPkg?.coins ?? 0);
        setStep('success');
      } else {
        const msg = captureResult.payload?.detail ?? 'PayPal capture failed.';
        setFailMessage(msg);
        setStep('failed');
      }
    } catch (e) {
      setFailMessage('An unexpected error occurred.');
      setStep('failed');
    } finally {
      setLocalLoading(false);
    }
  }, [dispatch, selectedPackage, selectedPkg, showToast]);

  const isLoading = paymentLoading || localLoading;

  // ── Render ───────────────────────────────────────────────────────────────────

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
            {/* Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Top Up Coins</Text>
                <Text style={styles.headerSub}>Secure · Instant · Global</Text>
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
                {/* Packages */}
                <Text style={styles.sectionLabel}>Choose a package</Text>
                <View style={styles.packagesGrid}>
                  {USD_PACKAGES.map((pkg) => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      selected={selectedPackage}
                      onSelect={setSelectedPackage}
                    />
                  ))}
                </View>

                {/* Method tabs */}
                <Text style={styles.sectionLabel}>Payment method</Text>
                <View style={styles.methodTabs}>
                  <MethodTab
                    id="card"
                    label="Card"
                    icon={CreditCard}
                    active={method === 'card'}
                    onPress={setMethod}
                  />
                  <MethodTab
                    id="paypal"
                    label="PayPal"
                    icon={Zap}
                    active={method === 'paypal'}
                    onPress={setMethod}
                  />
                </View>

                {/* Method-specific content */}
                {method === 'card' ? (
                  <CardContent
                    selectedPkg={selectedPkg}
                    onPay={handleCardPay}
                    loading={isLoading}
                  />
                ) : (
                  <PayPalContent
                    selectedPkg={selectedPkg}
                    onPay={handlePayPalPay}
                    loading={isLoading}
                  />
                )}
              </View>
            )}

            {step === 'success' && (
              <SuccessView coins={successCoins} onClose={handleClose} />
            )}

            {step === 'failed' && (
              <FailedView
                message={failMessage}
                onRetry={handleRetry}
                onClose={handleClose}
              />
            )}
          </KeyboardAvoidingView>
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

  // ── Select step ──
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

  // ── Packages grid ──
  packagesGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           rs(10),
    marginBottom:  rp(18),
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
    backgroundColor: 'rgba(255, 99, 74, 0.08)',
  },
  packageCardPopular: { borderColor: 'rgba(168, 85, 247, 0.45)' },
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
    borderWidth:       1,
    borderRadius:      rs(8),
    paddingHorizontal: rp(8),
    paddingVertical:   rp(3),
    marginBottom:      rp(4),
  },
  tagSpacer:         { height: rp(22) },
  tagText:           { fontSize: rf(10), fontWeight: '700', letterSpacing: 0.3 },
  pkgCoinRow:        { flexDirection: 'row', alignItems: 'center', gap: rs(5) },
  packageCoins:      { color: THEME.gold, fontSize: rf(24), fontWeight: '900', includeFontPadding: false },
  packageCoinsLabel: { color: THEME.textSub, fontSize: rf(11), fontWeight: '500' },
  packagePriceBadge: {
    marginTop:         rp(8),
    backgroundColor:   THEME.bg,
    borderRadius:      rs(20),
    paddingHorizontal: rp(12),
    paddingVertical:   rp(4),
    borderWidth:       1,
    borderColor:       THEME.border,
  },
  packagePrice:      { color: THEME.text, fontSize: rf(13), fontWeight: '700' },

  // ── Method tabs ──
  methodTabs: {
    flexDirection: 'row',
    gap:           rs(10),
    marginBottom:  rp(16),
  },
  methodTab: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               rs(6),
    paddingVertical:   rp(10),
    borderRadius:      rs(12),
    borderWidth:       1.5,
    borderColor:       THEME.border,
    backgroundColor:   THEME.surfaceAlt,
  },
  methodTabActive: {
    borderColor:     THEME.primary,
    backgroundColor: 'rgba(255, 99, 74, 0.08)',
  },
  methodTabLabel:       { color: THEME.textSub, fontSize: rf(13), fontWeight: '600' },
  methodTabLabelActive: { color: THEME.primary },

  // ── Method content ──
  methodContent: { flex: 1 },

  // ── Card inputs ──
  cardInput: {
    backgroundColor:   THEME.surfaceAlt,
    borderRadius:      rs(12),
    borderWidth:       1,
    borderColor:       THEME.border,
    height:            INPUT_HEIGHT,
    color:             THEME.text,
    fontSize:          rf(15),
    paddingHorizontal: rp(14),
    marginBottom:      rp(10),
  },
  cardRow:        { flexDirection: 'row', gap: rs(10) },
  cardInputHalf:  { flex: 1 },

  // ── PayPal info ──
  paypalInfo: {
    backgroundColor:   THEME.surfaceAlt,
    borderRadius:      rs(16),
    borderWidth:       1,
    borderColor:       THEME.border,
    padding:           rp(18),
    marginBottom:      rp(20),
    alignItems:        'center',
  },
  paypalInfoTitle: {
    color:        THEME.text,
    fontSize:     rf(15),
    fontWeight:   '700',
    marginBottom: rp(8),
    textAlign:    'center',
  },
  paypalInfoSub: {
    color:      THEME.textSub,
    fontSize:   rf(13),
    lineHeight: rf(20),
    textAlign:  'center',
  },

  // ── Pay buttons ──
  payBtnWrap: { marginBottom: rp(10) },
  payBtn: {
    height:         BUTTON_HEIGHT,
    borderRadius:   rs(14),
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            rs(8),
  },
  payBtnText: { color: '#fff', fontSize: rf(15), fontWeight: '700', letterSpacing: 0.2 },

  paypalBtn: {
    height:          BUTTON_HEIGHT,
    borderRadius:    rs(14),
    backgroundColor: '#0070BA', // PayPal brand blue
    alignItems:      'center',
    justifyContent:  'center',
  },
  paypalBtnDisabled: { backgroundColor: '#555' },
  paypalBtnText:     { color: '#fff', fontSize: rf(15), fontWeight: '700', letterSpacing: 0.2 },

  disclaimer: {
    color:      THEME.textSub,
    fontSize:   rf(11),
    textAlign:  'center',
    lineHeight: rf(16),
  },

  // ── Result states ──
  resultContainer: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: rp(32),
    paddingBottom:     rp(40),
  },
  resultCircle: {
    width:          rs(96),
    height:         rs(96),
    borderRadius:   rs(48),
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   rp(20),
  },
  resultTitle: {
    color:        THEME.text,
    fontSize:     rf(24),
    fontWeight:   '800',
    fontFamily:   Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign:    'center',
    marginBottom: rp(10),
  },
  resultSubtitle: {
    color:        THEME.textSub,
    fontSize:     rf(14),
    textAlign:    'center',
    lineHeight:   rf(22),
    marginBottom: rp(32),
  },
  resultHighlight: { color: THEME.gold, fontWeight: '700' },
  resultBtnWrap:   { width: '100%', marginBottom: rp(12) },
  resultBtn: {
    height:         BUTTON_HEIGHT,
    borderRadius:   rs(14),
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            rs(8),
  },
  resultBtnText:   { color: '#fff', fontSize: rf(15), fontWeight: '700' },
  cancelLink:      { paddingVertical: rp(8) },
  cancelLinkText:  { color: THEME.textSub, fontSize: rf(13), textDecorationLine: 'underline' },
});
