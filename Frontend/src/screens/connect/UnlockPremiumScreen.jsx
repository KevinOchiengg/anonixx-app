import {
  ArrowLeft,
  Eye,
  Image as ImageIcon,
  Infinity,
  MessageCircle,
  Mic,
  Unlock,
  Video,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../../services/api'; // your existing axios instance

const { width } = Dimensions.get('window');

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  surfaceDark: '#10131c',
  primary: '#FF634A',
  primaryDark: '#ff3b2f',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.07)',
  gold: '#F1C40F',
  mpesa: '#00A651', // Safaricom green
};

// ─────────────────────────────────────────────
// PERKS — what unlocking gives you
// ─────────────────────────────────────────────
const PERKS = [
  { icon: Infinity, label: 'Unlimited messages', color: THEME.primary },
  { icon: ImageIcon, label: 'Share pictures', color: '#3498DB' },
  { icon: Mic, label: 'Voice messages', color: '#9B59B6' },
  { icon: Video, label: 'Video calls', color: '#2ECC71' },
  { icon: Eye, label: 'Optional identity reveal', color: THEME.gold },
  { icon: MessageCircle, label: 'Connection never expires', color: '#E74C3C' },
];

// ─────────────────────────────────────────────
// PAYMENT METHODS
// ─────────────────────────────────────────────
const PAYMENT_METHODS = [
  { id: 'mpesa', label: 'M-Pesa', color: THEME.mpesa, flag: '🇰🇪' },
  { id: 'stripe', label: 'Card', color: '#635BFF', flag: '💳' },
];

// ─────────────────────────────────────────────
// PERK ITEM
// ─────────────────────────────────────────────
function PerkItem({ icon: Icon, label, color }) {
  return (
    <View style={perkStyles.row}>
      <View style={[perkStyles.iconWrap, { backgroundColor: `${color}20` }]}>
        <Icon size={16} color={color} />
      </View>
      <Text style={perkStyles.label}>{label}</Text>
    </View>
  );
}

const perkStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 15,
    color: THEME.text,
    fontWeight: '500',
  },
});

// ─────────────────────────────────────────────
// MPESA FORM
// ─────────────────────────────────────────────
function MpesaForm({ connectionId, onSuccess, onError }) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [checkoutId, setCheckoutId] = useState(null);
  const pollRef = useRef(null);

  const formatPhone = (text) => {
    // Auto-format to 2547XXXXXXXX
    let cleaned = text.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '254' + cleaned.slice(1);
    if (cleaned.startsWith('7') || cleaned.startsWith('1'))
      cleaned = '254' + cleaned;
    return cleaned;
  };

  const handlePay = async () => {
    const formatted = formatPhone(phone);
    if (formatted.length < 12) {
      onError('Please enter a valid M-Pesa number');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/payments/unlock/mpesa', {
        connection_id: connectionId,
        phone_number: formatted,
      });
      setCheckoutId(res.data.checkout_request_id);
      setPolling(true);
      startPolling(res.data.checkout_request_id);
    } catch (err) {
      onError(err.response?.data?.detail || 'Payment initiation failed');
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (id) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/payments/mpesa/status/${id}`);
        if (res.data.status === 'completed') {
          clearInterval(pollRef.current);
          setPolling(false);
          onSuccess();
        } else if (res.data.status === 'failed') {
          clearInterval(pollRef.current);
          setPolling(false);
          onError('Payment was cancelled or failed');
        }
      } catch (_) {}
    }, 3000); // poll every 3 seconds
  };

  useEffect(() => {
    return () => clearInterval(pollRef.current); // cleanup on unmount
  }, []);

  if (polling) {
    return (
      <View style={mpesaStyles.waitingContainer}>
        <ActivityIndicator size="large" color={THEME.mpesa} />
        <Text style={mpesaStyles.waitingTitle}>Check your phone</Text>
        <Text style={mpesaStyles.waitingSubtitle}>
          Enter your M-Pesa PIN to complete the payment
        </Text>
        <TouchableOpacity
          onPress={() => {
            clearInterval(pollRef.current);
            setPolling(false);
            setCheckoutId(null);
          }}
          style={mpesaStyles.cancelButton}
        >
          <Text style={mpesaStyles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={mpesaStyles.container}>
      <Text style={mpesaStyles.label}>M-Pesa Number</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="07XX XXX XXX"
        placeholderTextColor={THEME.textSecondary}
        keyboardType="phone-pad"
        maxLength={13}
        style={mpesaStyles.input}
      />
      <Text style={mpesaStyles.hint}>
        You'll receive an STK push on this number
      </Text>
      <TouchableOpacity
        onPress={handlePay}
        style={[mpesaStyles.button, { backgroundColor: THEME.mpesa }]}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={mpesaStyles.buttonText}>Pay KES 260 via M-Pesa</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const mpesaStyles = StyleSheet.create({
  container: { gap: 8 },
  label: { fontSize: 13, color: THEME.textSecondary, marginBottom: 4 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: THEME.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  hint: { fontSize: 12, color: THEME.textSecondary },
  button: {
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  waitingContainer: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  waitingTitle: { fontSize: 18, fontWeight: '700', color: THEME.text },
  waitingSubtitle: {
    fontSize: 14,
    color: THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  cancelButton: { marginTop: 8 },
  cancelText: { color: THEME.textSecondary, fontSize: 14 },
});

// ─────────────────────────────────────────────
// STRIPE FORM (placeholder — needs Stripe SDK)
// ─────────────────────────────────────────────
function StripeForm({ connectionId, onSuccess, onError }) {
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      /**
       * In production:
       * 1. Import { useStripe } from '@stripe/stripe-react-native'
       * 2. Call stripe.initPaymentSheet() with client secret from your backend
       * 3. Call stripe.presentPaymentSheet()
       * 4. On success, call your confirm endpoint
       *
       * For now this is a placeholder.
       */
      onError('Install @stripe/stripe-react-native to enable card payments');
    } catch (err) {
      onError('Card payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Text style={stripeStyles.note}>
        Card payments require{' '}
        <Text style={{ color: THEME.primary }}>
          @stripe/stripe-react-native
        </Text>
        {'\n'}Run: npx expo install @stripe/stripe-react-native
      </Text>
      <TouchableOpacity
        onPress={handlePay}
        style={stripeStyles.button}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={stripeStyles.buttonText}>Pay $2.00 by Card</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const stripeStyles = StyleSheet.create({
  note: {
    fontSize: 13,
    color: THEME.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#635BFF',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ─────────────────────────────────────────────
// SUCCESS OVERLAY
// ─────────────────────────────────────────────
function SuccessOverlay({ onContinue }) {
  const scale = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[successStyles.overlay, { opacity }]}>
      <Animated.View style={[successStyles.card, { transform: [{ scale }] }]}>
        <Text style={successStyles.emoji}>✨</Text>
        <Text style={successStyles.title}>Unlocked!</Text>
        <Text style={successStyles.subtitle}>
          This connection is now unlimited. No expiry. No limits.
        </Text>
        <TouchableOpacity
          onPress={onContinue}
          style={successStyles.button}
          activeOpacity={0.85}
        >
          <Text style={successStyles.buttonText}>Continue chatting</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const successStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,15,24,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
    padding: 32,
  },
  card: { alignItems: 'center', gap: 12 },
  emoji: { fontSize: 64 },
  title: { fontSize: 28, fontWeight: '800', color: THEME.text },
  subtitle: {
    fontSize: 15,
    color: THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    backgroundColor: THEME.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function UnlockPremiumScreen({ route, navigation }) {
  const { connectionId, chatId } = route.params;
  const [selectedMethod, setSelectedMethod] = useState('mpesa');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSuccess = () => setSuccess(true);

  const handleError = (msg) => {
    setError(msg);
    setTimeout(() => setError(null), 4000); // auto-clear after 4s
  };

  const handleContinue = () => {
    navigation.goBack(); // goes back to ChatScreen
    // ChatScreen should re-fetch connection status to show isPremium=true
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Success overlay */}
      {success && <SuccessOverlay onContinue={handleContinue} />}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.back}
        >
          <ArrowLeft size={24} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Unlock Connection</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Price badge */}
        <View style={styles.priceBadge}>
          <Unlock size={20} color={THEME.gold} />
          <Text style={styles.priceText}>One-time unlock • $2</Text>
        </View>

        <Text style={styles.tagline}>
          One payment. Both of you unlock. Forever.
        </Text>

        {/* Perks */}
        <View style={styles.section}>
          {PERKS.map((perk) => (
            <PerkItem key={perk.label} {...perk} />
          ))}
        </View>

        <View style={styles.divider} />

        {/* Payment method selector */}
        <Text style={styles.sectionTitle}>Pay with</Text>
        <View style={styles.methodRow}>
          {PAYMENT_METHODS.map((method) => (
            <TouchableOpacity
              key={method.id}
              onPress={() => setSelectedMethod(method.id)}
              style={[
                styles.methodButton,
                selectedMethod === method.id && {
                  borderColor: method.color,
                  backgroundColor: `${method.color}15`,
                },
              ]}
              activeOpacity={0.8}
            >
              <Text style={styles.methodFlag}>{method.flag}</Text>
              <Text
                style={[
                  styles.methodLabel,
                  {
                    color:
                      selectedMethod === method.id
                        ? method.color
                        : THEME.textSecondary,
                  },
                ]}
              >
                {method.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Payment form */}
        <View style={styles.formContainer}>
          {selectedMethod === 'mpesa' ? (
            <MpesaForm
              connectionId={connectionId}
              onSuccess={handleSuccess}
              onError={handleError}
            />
          ) : (
            <StripeForm
              connectionId={connectionId}
              onSuccess={handleSuccess}
              onError={handleError}
            />
          )}
        </View>

        <Text style={styles.footer}>
          🔒 Payments are secure and encrypted. Your identity stays anonymous.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  back: { width: 40, padding: 8 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.text,
  },
  scroll: {
    padding: 24,
    paddingBottom: 48,
  },
  priceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${THEME.gold}15`,
    borderWidth: 1,
    borderColor: `${THEME.gold}40`,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  priceText: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.gold,
  },
  tagline: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.text,
    marginBottom: 24,
    lineHeight: 30,
  },
  section: {
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.border,
    marginVertical: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: THEME.border,
    backgroundColor: THEME.surface,
  },
  methodFlag: { fontSize: 20 },
  methodLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: 'rgba(231,76,60,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#E74C3C',
    fontSize: 13,
    textAlign: 'center',
  },
  formContainer: {
    marginBottom: 24,
  },
  footer: {
    fontSize: 12,
    color: THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
