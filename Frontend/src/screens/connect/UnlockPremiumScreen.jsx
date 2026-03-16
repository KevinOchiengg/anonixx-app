import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft, Eye, Image as ImageIcon, Infinity,
  MessageCircle, Mic, Unlock, Video,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.15)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  border:        'rgba(255,255,255,0.07)',
  gold:          '#F1C40F',
  goldDim:       'rgba(241,196,15,0.15)',
  goldBorder:    'rgba(241,196,15,0.4)',
  mpesa:         '#00A651',
  stripe:        '#635BFF',
  error:         '#E74C3C',
  errorDim:      'rgba(231,76,60,0.15)',
  errorBorder:   'rgba(231,76,60,0.3)',
};

// ─── Static data (module level) ───────────────────────────────────────────────
const PERKS = [
  { icon: Infinity,      label: 'Unlimited messages',       color: T.primary  },
  { icon: ImageIcon,     label: 'Share pictures',           color: '#3498DB'  },
  { icon: Mic,           label: 'Voice messages',           color: '#9B59B6'  },
  { icon: Video,         label: 'Video calls',              color: '#2ECC71'  },
  { icon: Eye,           label: 'Optional identity reveal', color: T.gold     },
  { icon: MessageCircle, label: 'Connection never expires', color: '#E74C3C'  },
];

const PAYMENT_METHODS = [
  { id: 'mpesa',  label: 'M-Pesa', color: T.mpesa,  flag: '🇰🇪' },
  { id: 'stripe', label: 'Card',   color: T.stripe,  flag: '💳'  },
];

// ─── Perk Item ────────────────────────────────────────────────────────────────
const PerkItem = React.memo(({ icon: Icon, label, color }) => (
  <View style={styles.perkRow}>
    <View style={[styles.perkIcon, { backgroundColor: color + '20' }]}>
      <Icon size={rs(16)} color={color} />
    </View>
    <Text style={styles.perkLabel}>{label}</Text>
  </View>
));

// ─── M-Pesa Form ──────────────────────────────────────────────────────────────
const MpesaForm = React.memo(({ chatId, onSuccess, onError }) => {
  const [phone, setPhone]     = useState('');
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollRef               = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const formatPhone = useCallback((text) => {
    let cleaned = text.replace(/\D/g, '');
    if (cleaned.startsWith('0'))                             cleaned = '254' + cleaned.slice(1);
    if (cleaned.startsWith('7') || cleaned.startsWith('1')) cleaned = '254' + cleaned;
    return cleaned;
  }, []);

  const startPolling = useCallback((checkoutId) => {
    pollRef.current = setInterval(async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const res   = await fetch(
          `${API_BASE_URL}/api/v1/payments/mpesa/status/${checkoutId}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        const data = await res.json();
        if (data.status === 'completed') {
          clearInterval(pollRef.current);
          setPolling(false);
          onSuccess();
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current);
          setPolling(false);
          onError('Payment was cancelled or failed.');
        }
      } catch {}
    }, 3000);
  }, [onSuccess, onError]);

  const handlePay = useCallback(async () => {
    const formatted = formatPhone(phone);
    if (formatted.length < 12) {
      onError('Please enter a valid M-Pesa number.');
      return;
    }
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/payments/unlock/mpesa`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ chat_id: chatId, phone_number: formatted }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Payment initiation failed.');
      setPolling(true);
      startPolling(data.checkout_request_id);
    } catch (err) {
      onError('Could not initiate payment. Try again.');
    } finally {
      setLoading(false);
    }
  }, [phone, chatId, formatPhone, startPolling, onError]);

  const handleCancel = useCallback(() => {
    clearInterval(pollRef.current);
    setPolling(false);
  }, []);

  if (polling) {
    return (
      <View style={styles.waitingBox}>
        <ActivityIndicator size="large" color={T.mpesa} />
        <Text style={styles.waitingTitle}>Check your phone</Text>
        <Text style={styles.waitingBody}>Enter your M-Pesa PIN to complete the payment.</Text>
        <TouchableOpacity onPress={handleCancel} hitSlop={HIT_SLOP}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.formGap}>
      <Text style={styles.formLabel}>M-Pesa Number</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="07XX XXX XXX"
        placeholderTextColor={T.textSecondary}
        keyboardType="phone-pad"
        maxLength={13}
        style={styles.formInput}
      />
      <Text style={styles.formHint}>You'll receive an STK push on this number.</Text>
      <TouchableOpacity
        onPress={handlePay}
        style={[styles.payBtn, { backgroundColor: T.mpesa }]}
        disabled={loading}
        hitSlop={HIT_SLOP}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.payBtnText}>Pay KES 260 via M-Pesa</Text>
        }
      </TouchableOpacity>
    </View>
  );
});

// ─── Stripe Form ──────────────────────────────────────────────────────────────
const StripeForm = React.memo(({ chatId, onSuccess, onError }) => {
  const [loading, setLoading] = useState(false);

  const handlePay = useCallback(async () => {
    setLoading(true);
    try {
      /**
       * Production steps:
       * 1. import { useStripe } from '@stripe/stripe-react-native'
       * 2. Call stripe.initPaymentSheet() with client_secret from backend
       * 3. Call stripe.presentPaymentSheet()
       * 4. On success, backend confirms via webhook or confirm endpoint
       */
      onError('Install @stripe/stripe-react-native to enable card payments.');
    } catch {
      onError('Card payment failed.');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  return (
    <View style={styles.formGap}>
      <Text style={styles.stripeNote}>
        Card payments require{' '}
        <Text style={{ color: T.primary }}>@stripe/stripe-react-native</Text>
        {'\n'}Run: npx expo install @stripe/stripe-react-native
      </Text>
      <TouchableOpacity
        onPress={handlePay}
        style={[styles.payBtn, { backgroundColor: T.stripe }]}
        disabled={loading}
        hitSlop={HIT_SLOP}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.payBtnText}>Pay $2.00 by Card</Text>
        }
      </TouchableOpacity>
    </View>
  );
});

// ─── Success Overlay ──────────────────────────────────────────────────────────
const SuccessOverlay = React.memo(({ onContinue }) => {
  const scale   = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.successOverlay, { opacity }]}>
      <Animated.View style={[styles.successCard, { transform: [{ scale }] }]}>
        <Text style={styles.successEmoji}>✨</Text>
        <Text style={styles.successTitle}>Unlocked!</Text>
        <Text style={styles.successBody}>
          This connection is now unlimited. No expiry. No limits.
        </Text>
        <TouchableOpacity
          onPress={onContinue}
          style={styles.successBtn}
          hitSlop={HIT_SLOP}
          activeOpacity={0.85}
        >
          <Text style={styles.successBtnText}>Continue chatting</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function UnlockPremiumScreen({ route, navigation }) {
  const { chatId, otherName } = route.params;
  const { showToast }         = useToast();

  const [selectedMethod, setSelectedMethod] = useState('mpesa');
  const [success, setSuccess]               = useState(false);

  const handleSuccess = useCallback(() => setSuccess(true), []);

  const handleError = useCallback((msg) => {
    showToast({ type: 'error', message: msg });
  }, [showToast]);

  const handleContinue = useCallback(() => {
    navigation.goBack();
    // ChatScreen reloads on focus — picks up is_unlocked: true
  }, [navigation]);

  const handleMethodSelect = useCallback((id) => setSelectedMethod(id), []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {success && <SuccessOverlay onContinue={handleContinue} />}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={styles.backBtn}>
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {otherName ? `Unlock chat with ${otherName}` : 'Unlock Chat'}
        </Text>
        <View style={{ width: rs(38) }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Price badge */}
        <View style={styles.priceBadge}>
          <Unlock size={rs(18)} color={T.gold} />
          <Text style={styles.priceText}>One-time unlock · $2</Text>
        </View>

        <Text style={styles.tagline}>One payment. Both of you unlock. Forever.</Text>

        {/* Perks */}
        <View style={styles.perksSection}>
          {PERKS.map(perk => <PerkItem key={perk.label} {...perk} />)}
        </View>

        <View style={styles.divider} />

        {/* Payment method */}
        <Text style={styles.sectionLabel}>Pay with</Text>
        <View style={styles.methodRow}>
          {PAYMENT_METHODS.map(method => (
            <TouchableOpacity
              key={method.id}
              onPress={() => handleMethodSelect(method.id)}
              hitSlop={HIT_SLOP}
              activeOpacity={0.8}
              style={[
                styles.methodBtn,
                selectedMethod === method.id && {
                  borderColor:     method.color,
                  backgroundColor: method.color + '15',
                },
              ]}
            >
              <Text style={styles.methodFlag}>{method.flag}</Text>
              <Text style={[
                styles.methodLabel,
                { color: selectedMethod === method.id ? method.color : T.textSecondary },
              ]}>
                {method.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Payment form */}
        <View style={styles.formContainer}>
          {selectedMethod === 'mpesa'
            ? <MpesaForm  chatId={chatId} onSuccess={handleSuccess} onError={handleError} />
            : <StripeForm chatId={chatId} onSuccess={handleSuccess} onError={handleError} />
          }
        </View>

        <Text style={styles.footer}>
          🔒 Payments are secure and encrypted. Your identity stays anonymous.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: T.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  backBtn: { padding: rp(4) },
  headerTitle: {
    flex: 1,
    fontSize: FONT.md,
    fontWeight: '700',
    color: T.text,
    textAlign: 'center',
  },

  // Scroll
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },

  // Price badge
  priceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: T.goldDim,
    borderWidth: 1,
    borderColor: T.goldBorder,
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: rp(8),
    borderRadius: RADIUS.full,
    marginBottom: SPACING.md,
  },
  priceText: {
    fontSize: FONT.md,
    fontWeight: '700',
    color: T.gold,
  },

  // Tagline
  tagline: {
    fontSize: FONT.xl,
    fontWeight: '800',
    color: T.text,
    marginBottom: SPACING.lg,
    lineHeight: rf(30),
  },

  // Perks
  perksSection: { marginBottom: SPACING.sm },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  perkIcon: {
    width: rs(34),
    height: rs(34),
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkLabel: {
    fontSize: FONT.md,
    color: T.text,
    fontWeight: '500',
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: T.border,
    marginVertical: SPACING.lg,
  },

  // Section label
  sectionLabel: {
    fontSize: FONT.xs,
    fontWeight: '600',
    color: T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },

  // Payment methods
  methodRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: rp(14),
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  methodFlag:  { fontSize: rf(20) },
  methodLabel: {
    fontSize: FONT.md,
    fontWeight: '600',
  },

  // Form shared
  formContainer: { marginBottom: SPACING.lg },
  formGap:       { gap: SPACING.sm },
  formLabel: {
    fontSize: FONT.sm,
    color: T.textSecondary,
    marginBottom: rp(4),
  },
  formInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: T.text,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: rp(14),
    fontSize: FONT.md,
    borderWidth: 1,
    borderColor: T.border,
  },
  formHint: {
    fontSize: FONT.xs,
    color: T.textSecondary,
  },
  payBtn: {
    height: BUTTON_HEIGHT,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: rp(4),
  },
  payBtnText: {
    color: '#fff',
    fontSize: FONT.md,
    fontWeight: '700',
  },

  // Waiting state
  waitingBox: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
  },
  waitingTitle: {
    fontSize: FONT.lg,
    fontWeight: '700',
    color: T.text,
  },
  waitingBody: {
    fontSize: FONT.sm,
    color: T.textSecondary,
    textAlign: 'center',
    lineHeight: rf(20),
  },
  cancelText: {
    color: T.textSecondary,
    fontSize: FONT.sm,
    marginTop: rp(4),
  },

  // Stripe note
  stripeNote: {
    fontSize: FONT.sm,
    color: T.textSecondary,
    lineHeight: rf(20),
    marginBottom: SPACING.sm,
  },

  // Footer
  footer: {
    fontSize: FONT.xs,
    color: T.textSecondary,
    textAlign: 'center',
    lineHeight: rf(18),
  },

  // Success overlay
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,15,24,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
    padding: SPACING.lg,
  },
  successCard: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  successEmoji: { fontSize: rf(64) },
  successTitle: {
    fontSize: FONT.xxl,
    fontWeight: '800',
    color: T.text,
  },
  successBody: {
    fontSize: FONT.md,
    color: T.textSecondary,
    textAlign: 'center',
    lineHeight: rf(22),
  },
  successBtn: {
    backgroundColor: T.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: rp(16),
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
  },
  successBtnText: {
    color: '#fff',
    fontSize: FONT.md,
    fontWeight: '700',
  },
});
