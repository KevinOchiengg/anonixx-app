import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useStripe } from '@stripe/stripe-react-native'

import { ArrowLeft, Check, Crown, EyeOff, Coins, TrendingUp, Clock3 } from 'lucide-react-native'
import { rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP } from '../../utils/responsive'
import { useToast } from '../../components/ui/Toast'
import { API_BASE_URL } from '../../config/api'
import T from '../../utils/theme'

// Mirrors the real perk math in Backend/app/api/v1/drops.py (unlock_cost_for
// / unlock_reward_for / grace_days_for) and the ad-free check in ads.py's
// list_active_ads — this is what premium actually changes today. There is
// no posting cap on either tier any more (see drops.py's deprecated
// /daily-limit route), so "unlimited drops" isn't a premium perk — it's
// just how the app works now.
const FEATURES = [
  {
    icon: EyeOff,
    title: 'No ads. Just drops.',
    body: 'Premium clears the ads out of your feed completely.',
  },
  {
    icon: Coins,
    title: 'Cheaper to link up',
    body: '25 coins instead of 50 to unlock and connect with someone.',
  },
  {
    icon: TrendingUp,
    title: 'You earn more, too',
    body: '10 coins (not 5) every time someone unlocks one of your drops.',
  },
  {
    icon: Clock3,
    title: 'Your drops stick around',
    body: '14 days to collect unlocks after the first one — double the usual window.',
  },
]

// Mirrors Backend/app/api/v1/premium.py PREMIUM_PLANS — used to render the
// picker instantly; /premium/plans (fetched on mount) is the source of truth
// for what actually gets charged.
const FALLBACK_PLANS = [
  { id: 'monthly',   label: '1 Month',  usd_display: '$9.99',  save: null },
  { id: 'quarterly', label: '3 Months', usd_display: '$24.99', save: '17%' },
  { id: 'yearly',    label: '1 Year',   usd_display: '$79.99', save: '33%' },
]

const PAYMENT_METHODS = [
  { id: 'mpesa',  label: 'M-Pesa', flag: '📱' },
  { id: 'stripe', label: 'Card',   flag: '💳' },
]

async function authHeaders(json = false) {
  const token = await AsyncStorage.getItem('token')
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// ─── M-Pesa form ────────────────────────────────────────────────────────────
const MpesaForm = React.memo(({ planId, onSuccess, onError }) => {
  const [phone, setPhone]     = useState('')
  const [loading, setLoading] = useState(false)
  const [polling, setPolling] = useState(false)
  const pollRef = useRef(null)

  useEffect(() => () => clearInterval(pollRef.current), [])

  const formatPhone = useCallback((text) => {
    let cleaned = text.replace(/\D/g, '')
    if (cleaned.startsWith('0')) cleaned = '254' + cleaned.slice(1)
    if (cleaned.startsWith('7') || cleaned.startsWith('1')) cleaned = '254' + cleaned
    return cleaned
  }, [])

  const startPolling = useCallback((checkoutId) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/premium/mpesa/status/${checkoutId}`,
          { headers: await authHeaders() }
        )
        const data = await res.json()
        if (data.status === 'completed') {
          clearInterval(pollRef.current)
          setPolling(false)
          onSuccess()
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current)
          setPolling(false)
          onError('Payment was cancelled or failed.')
        }
      } catch {}
    }, 3000)
  }, [onSuccess, onError])

  const handlePay = useCallback(async () => {
    const formatted = formatPhone(phone)
    if (formatted.length < 12) {
      onError('Enter a valid M-Pesa number.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/premium/mpesa`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ plan_id: planId, phone_number: formatted }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Payment initiation failed.')
      setPolling(true)
      startPolling(data.checkout_request_id)
    } catch (err) {
      onError(err.message || 'Could not initiate payment. Try again.')
    } finally {
      setLoading(false)
    }
  }, [phone, planId, formatPhone, startPolling, onError])

  if (polling) {
    return (
      <View style={styles.waitingBox}>
        <ActivityIndicator size="large" color={T.mpesa} />
        <Text style={styles.waitingTitle}>Check your phone</Text>
        <Text style={styles.waitingBody}>Enter your M-Pesa PIN to complete the payment.</Text>
        <TouchableOpacity onPress={() => { clearInterval(pollRef.current); setPolling(false) }} hitSlop={HIT_SLOP}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.formGap}>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="07XX XXX XXX"
        placeholderTextColor={T.textMuted}
        keyboardType="phone-pad"
        maxLength={13}
        style={styles.formInput}
      />
      <Text style={styles.formHint}>You'll receive an STK push on this number.</Text>
      <TouchableOpacity
        onPress={handlePay}
        style={[styles.payBtn, { backgroundColor: T.mpesa }]}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.payBtnText}>Pay via M-Pesa</Text>}
      </TouchableOpacity>
    </View>
  )
})

// ─── Card (Stripe) form ─────────────────────────────────────────────────────
const StripeForm = React.memo(({ planId, onSuccess, onError }) => {
  const [loading, setLoading] = useState(false)
  const { initPaymentSheet, presentPaymentSheet } = useStripe()

  const handlePay = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/premium/stripe/create-intent`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ plan_id: planId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Could not start payment.')

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: data.client_secret,
        merchantDisplayName: 'Anonixx',
        style: 'alwaysDark',
      })
      if (initError) throw new Error(initError.message)

      const { error: presentError } = await presentPaymentSheet()
      if (presentError) {
        if (presentError.code !== 'Canceled') onError(presentError.message)
        return
      }

      onSuccess()
    } catch (err) {
      onError(err.message || 'Card payment failed.')
    } finally {
      setLoading(false)
    }
  }, [planId, initPaymentSheet, presentPaymentSheet, onSuccess, onError])

  return (
    <View style={styles.formGap}>
      <TouchableOpacity
        onPress={handlePay}
        style={[styles.payBtn, { backgroundColor: T.stripe }]}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.payBtnText}>Pay by Card</Text>}
      </TouchableOpacity>
    </View>
  )
})

// ─── Success overlay ────────────────────────────────────────────────────────
const SuccessOverlay = React.memo(({ onContinue }) => {
  const scale = useRef(new Animated.Value(0.5)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={[styles.successOverlay, { opacity }]}>
      <Animated.View style={[styles.successCard, { transform: [{ scale }] }]}>
        <Text style={styles.successEmoji}>✨</Text>
        <Text style={styles.successTitle}>You're in.</Text>
        <Text style={styles.successBody}>Cheaper unlocks. Bigger payouts. No ads. Go.</Text>
        <TouchableOpacity onPress={onContinue} style={styles.successBtn} activeOpacity={0.85} hitSlop={HIT_SLOP}>
          <Text style={styles.successBtnText}>Continue</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  )
})

export default function PremiumScreen({ navigation }) {
  const { showToast } = useToast()
  const [plans, setPlans] = useState(FALLBACK_PLANS)
  const [selectedPlan, setSelectedPlan] = useState('quarterly')
  const [method, setMethod] = useState('mpesa')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/premium/plans`)
        if (res.ok) {
          const data = await res.json()
          if (data?.plans?.length) setPlans(data.plans)
        }
      } catch { /* fallback list already showing */ }
    })()
  }, [])

  const handleSuccess = useCallback(() => setSuccess(true), [])
  const handleError = useCallback((msg) => showToast({ type: 'error', message: msg }), [showToast])
  const handleContinue = useCallback(() => navigation.goBack(), [navigation])

  return (
    <SafeAreaView style={styles.container}>
      {success && <SuccessOverlay onContinue={handleContinue} />}

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}>
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Anonixx Premium</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
        <View style={styles.heroSection}>
          <View style={styles.crownContainer}>
            <Crown size={rs(56)} color={T.gold} fill={T.gold} />
          </View>
          <Text style={styles.heroTitle}>Go deeper. Spend less. Keep more.</Text>
          <Text style={styles.heroSubtitle}>One less thing standing between you and the truth</Text>
        </View>

        <View style={styles.featuresContainer}>
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon
            return (
              <View key={index} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Icon size={rs(18)} color={T.primary} />
                </View>
                <View style={styles.featureTextWrap}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureBody}>{feature.body}</Text>
                </View>
              </View>
            )
          })}
        </View>

        <Text style={styles.plansTitle}>Choose Your Plan</Text>
        {plans.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            onPress={() => setSelectedPlan(plan.id)}
            style={[styles.planCard, selectedPlan === plan.id && styles.planCardSelected]}
            activeOpacity={0.85}
          >
            {plan.save && (
              <View style={styles.saveBadge}>
                <Text style={styles.saveText}>SAVE {plan.save}</Text>
              </View>
            )}
            <View style={styles.planInfo}>
              <Text style={styles.planName}>{plan.label}</Text>
              <Text style={styles.planPrice}>{plan.usd_display}</Text>
            </View>
            {selectedPlan === plan.id && (
              <View style={styles.selectedIndicator}>
                <Check size={rs(18)} color='#ffffff' />
              </View>
            )}
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionLabel}>Pay with</Text>
        <View style={styles.methodRow}>
          {PAYMENT_METHODS.map((m) => (
            <TouchableOpacity
              key={m.id}
              onPress={() => setMethod(m.id)}
              style={[styles.methodBtn, method === m.id && styles.methodBtnActive]}
              activeOpacity={0.85}
            >
              <Text style={styles.methodFlag}>{m.flag}</Text>
              <Text style={[styles.methodLabel, method === m.id && { color: T.text }]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.formContainer}>
          {method === 'mpesa'
            ? <MpesaForm planId={selectedPlan} onSuccess={handleSuccess} onError={handleError} />
            : <StripeForm planId={selectedPlan} onSuccess={handleSuccess} onError={handleError} />
          }
        </View>

        <Text style={styles.disclaimer}>
          Cancel anytime. Subscription will auto-renew.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: rp(12),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTitle: { fontSize: FONT.lg, fontWeight: '700', color: T.text, fontFamily: 'PlayfairDisplay-Bold' },
  scrollView: { flex: 1 },
  heroSection: { alignItems: 'center', paddingVertical: SPACING.xxl },
  crownContainer: {
    backgroundColor: T.goldDim,
    borderWidth: 1,
    borderColor: T.goldBorder,
    padding: SPACING.lg,
    borderRadius: rs(50),
    marginBottom: SPACING.lg,
  },
  heroTitle: {
    fontSize: rf(26),
    fontWeight: '800',
    color: T.text,
    marginBottom: SPACING.xs,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
    fontFamily: 'PlayfairDisplay-Bold',
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: FONT.sm,
    color: T.textSecondary,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
    fontFamily: 'PlayfairDisplay-Italic',
  },

  // Features
  featuresContainer: { paddingHorizontal: SPACING.md, marginBottom: SPACING.xl, gap: SPACING.md },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  featureIcon: {
    backgroundColor: T.primaryDim,
    borderWidth: 1,
    borderColor: T.primaryBorder,
    padding: rp(9),
    borderRadius: RADIUS.full,
  },
  featureTextWrap: { flex: 1, paddingTop: rp(2) },
  featureTitle: { color: T.text, fontSize: FONT.md, fontWeight: '700', fontFamily: 'DMSans-Bold' },
  featureBody: { color: T.textSecondary, fontSize: FONT.sm, marginTop: rp(2), lineHeight: rf(19) },

  plansTitle: {
    fontSize: FONT.lg,
    fontWeight: '700',
    color: T.text,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    fontFamily: 'PlayfairDisplay-Bold',
  },
  planCard: {
    backgroundColor: T.surface,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: T.border,
    position: 'relative',
  },
  planCardSelected: { borderColor: T.primary },
  saveBadge: {
    position: 'absolute',
    top: -rp(12),
    right: SPACING.lg,
    backgroundColor: T.success,
    paddingHorizontal: rp(12),
    paddingVertical: rp(4),
    borderRadius: RADIUS.md,
  },
  saveText: { color: '#ffffff', fontSize: rf(10), fontWeight: '800', fontFamily: 'DMSans-Bold' },
  planInfo: { flex: 1 },
  planName: { fontSize: FONT.md, fontWeight: '700', color: T.text, marginBottom: rp(4), fontFamily: 'DMSans-Bold' },
  planPrice: { fontSize: rf(22), fontWeight: '800', color: T.primary, fontFamily: 'PlayfairDisplay-Bold' },
  selectedIndicator: { backgroundColor: T.primary, borderRadius: RADIUS.full, padding: rp(8) },

  // Payment method
  sectionLabel: {
    fontSize: FONT.xs,
    fontWeight: '700',
    color: T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    marginBottom: rp(10),
    fontFamily: 'DMSans-Bold',
  },
  methodRow: { flexDirection: 'row', gap: rp(10), paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rp(8),
    paddingVertical: rp(14),
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  methodBtnActive: { borderColor: T.primaryBorder, backgroundColor: T.primaryDim },
  methodFlag: { fontSize: rf(18) },
  methodLabel: { fontSize: FONT.sm, fontWeight: '600', color: T.textSecondary, fontFamily: 'DMSans-SemiBold' },

  // Payment forms
  formContainer: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  formGap: { gap: rp(10) },
  formInput: {
    backgroundColor: T.surface,
    color: T.text,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: rp(14),
    fontSize: FONT.md,
    borderWidth: 1,
    borderColor: T.border,
    fontFamily: 'DMSans-Regular',
  },
  formHint: { fontSize: FONT.xs, color: T.textSecondary, fontFamily: 'DMSans-Regular' },
  payBtn: {
    height: BUTTON_HEIGHT,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: rp(4),
  },
  payBtnText: { color: '#fff', fontSize: FONT.md, fontWeight: '700', fontFamily: 'DMSans-Bold' },

  waitingBox: { alignItems: 'center', gap: rp(10), paddingVertical: SPACING.xl },
  waitingTitle: { fontSize: FONT.lg, fontWeight: '700', color: T.text, fontFamily: 'PlayfairDisplay-Bold' },
  waitingBody: { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: rf(20), fontFamily: 'DMSans-Regular' },
  cancelText: { color: T.textSecondary, fontSize: FONT.sm, marginTop: rp(4), fontFamily: 'DMSans-Regular' },

  disclaimer: {
    color: T.textMuted,
    fontSize: FONT.xs,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xl,
    fontFamily: 'DMSans-Regular',
  },

  // Success overlay
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,15,24,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
    padding: SPACING.lg,
  },
  successCard: { alignItems: 'center', gap: rp(10) },
  successEmoji: { fontSize: rf(56) },
  successTitle: { fontSize: rf(26), fontWeight: '800', color: T.text, fontFamily: 'PlayfairDisplay-Bold' },
  successBody: { fontSize: FONT.md, color: T.textSecondary, textAlign: 'center', fontFamily: 'DMSans-Regular' },
  successBtn: {
    backgroundColor: T.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: rp(10),
    shadowColor: T.primary,
    shadowOffset: { width: 0, height: rs(4) },
    shadowOpacity: 0.35,
    shadowRadius: rs(10),
    elevation: 6,
  },
  successBtnText: { color: '#fff', fontSize: FONT.md, fontWeight: '700', fontFamily: 'DMSans-Bold' },
})
