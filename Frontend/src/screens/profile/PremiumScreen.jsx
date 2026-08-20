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

import { ArrowLeft, Check, Crown } from 'lucide-react-native'
import { useToast } from '../../components/ui/Toast'
import { API_BASE_URL } from '../../config/api'

const features = [
  'Unlimited Drops every day — free accounts get 3',
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
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={styles.waitingTitle}>Check your phone</Text>
        <Text style={styles.waitingBody}>Enter your M-Pesa PIN to complete the payment.</Text>
        <TouchableOpacity onPress={() => { clearInterval(pollRef.current); setPolling(false) }}>
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
        placeholderTextColor="#6b7280"
        keyboardType="phone-pad"
        maxLength={13}
        style={styles.formInput}
      />
      <Text style={styles.formHint}>You'll receive an STK push on this number.</Text>
      <TouchableOpacity
        onPress={handlePay}
        style={[styles.payBtn, { backgroundColor: '#22c55e' }]}
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
        style={[styles.payBtn, { backgroundColor: '#635BFF' }]}
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
        <Text style={styles.successBody}>Unlimited Drops, starting now.</Text>
        <TouchableOpacity onPress={onContinue} style={styles.successBtn} activeOpacity={0.85}>
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
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <ArrowLeft size={24} color='#ffffff' />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Anonixx Premium</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
        <View style={styles.heroSection}>
          <View style={styles.crownContainer}>
            <Crown size={64} color='#fbbf24' />
          </View>
          <Text style={styles.heroTitle}>Go deeper. No limits, no waiting.</Text>
          <Text style={styles.heroSubtitle}>One less thing standing between you and the truth</Text>
        </View>

        <View style={styles.featuresContainer}>
          {features.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <View style={styles.checkIcon}>
                <Check size={20} color='#10b981' />
              </View>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.plansTitle}>Choose Your Plan</Text>
        {plans.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            onPress={() => setSelectedPlan(plan.id)}
            style={[styles.planCard, selectedPlan === plan.id && styles.planCardSelected]}
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
                <Check size={20} color='#ffffff' />
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
              <Text style={[styles.methodLabel, method === m.id && { color: '#fff' }]}>{m.label}</Text>
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
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
  scrollView: { flex: 1 },
  heroSection: { alignItems: 'center', paddingVertical: 40 },
  crownContainer: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    padding: 20,
    borderRadius: 50,
    marginBottom: 20,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  heroSubtitle: { fontSize: 16, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 32 },
  featuresContainer: { paddingHorizontal: 16, marginBottom: 32 },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkIcon: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    padding: 8,
    borderRadius: 20,
    marginRight: 12,
  },
  featureText: { color: '#ffffff', fontSize: 16, flex: 1 },
  plansTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  planCard: {
    backgroundColor: '#16213e',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#374151',
    position: 'relative',
  },
  planCardSelected: { borderColor: '#a855f7' },
  saveBadge: {
    position: 'absolute',
    top: -12,
    right: 20,
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  saveText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },
  planInfo: { flex: 1 },
  planName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#a855f7',
  },
  selectedIndicator: {
    backgroundColor: '#a855f7',
    borderRadius: 20,
    padding: 8,
  },

  // Payment method
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
  },
  methodRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 16 },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#374151',
    backgroundColor: '#16213e',
  },
  methodBtnActive: { borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.12)' },
  methodFlag: { fontSize: 18 },
  methodLabel: { fontSize: 15, fontWeight: '600', color: '#9ca3af' },

  // Payment forms
  formContainer: { paddingHorizontal: 16, marginBottom: 16 },
  formGap: { gap: 10 },
  formInput: {
    backgroundColor: '#16213e',
    color: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  formHint: { fontSize: 12, color: '#9ca3af' },
  payBtn: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  waitingBox: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  waitingTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  waitingBody: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },
  cancelText: { color: '#9ca3af', fontSize: 14, marginTop: 4 },

  disclaimer: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 32,
    marginTop: 8,
    marginBottom: 32,
  },

  // Success overlay
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,26,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
    padding: 24,
  },
  successCard: { alignItems: 'center', gap: 10 },
  successEmoji: { fontSize: 64 },
  successTitle: { fontSize: 28, fontWeight: '800', color: '#ffffff' },
  successBody: { fontSize: 16, color: '#9ca3af', textAlign: 'center' },
  successBtn: {
    backgroundColor: '#a855f7',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 10,
  },
  successBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
