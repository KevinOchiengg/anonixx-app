/**
 * ForgotPasswordScreen — full reset flow in one screen.
 * Step 1: enter email → send OTP
 * Step 2: enter 6-digit code + new password → reset
 * Step 3: success → back to login
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, StatusBar, KeyboardAvoidingView,
  Platform, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Mail, Lock, Eye, EyeOff, CheckCircle } from 'lucide-react-native';
import { API_BASE_URL } from '../../config/api';
import { useToast } from '../../components/ui/Toast';
import {
  rs, rf, rp, rh, SPACING, FONT, RADIUS, HIT_SLOP, BUTTON_HEIGHT,
} from '../../utils/responsive';

// ─── Theme ────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.12)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#4a4f62',
  border:        'rgba(255,255,255,0.06)',
  inputBg:       'rgba(255,255,255,0.04)',
};

const STARS = Array.from({ length: 30 }, (_, i) => ({
  id:      i,
  top:     ((i * 137.5) % 100).toFixed(2),
  left:    ((i * 97.3)  % 100).toFixed(2),
  size:    (i % 3) + 2,
  opacity: 0.08 + (i % 5) * 0.04,
}));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const StarryBg = React.memo(() => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    {STARS.map((s) => (
      <View key={s.id} style={{
        position: 'absolute', top: `${s.top}%`, left: `${s.left}%`,
        width: s.size, height: s.size, borderRadius: s.size,
        backgroundColor: T.primary, opacity: s.opacity,
      }} />
    ))}
  </View>
));

export default function ForgotPasswordScreen({ navigation }) {
  const { showToast } = useToast();

  // step: 'email' | 'code' | 'done'
  const [step,        setStep]        = useState('email');
  const [email,       setEmail]       = useState('');
  const [otp,         setOtp]         = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [focused,     setFocused]     = useState('');

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(rs(28))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, delay: 80, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, delay: 80, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      showToast({ type: 'warning', message: 'Enter your email address.' });
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      showToast({ type: 'warning', message: "That doesn't look like a valid email." });
      return;
    }

    setLoading(true);
    try {
      await fetch(`${API_BASE_URL}/api/v1/auth/forgot-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: trimmed }),
      });
      setStep('code');
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  }, [email, showToast]);

  const handleReset = useCallback(async () => {
    const trimmedOtp = otp.trim();
    if (trimmedOtp.length !== 6 || !/^\d{6}$/.test(trimmedOtp)) {
      showToast({ type: 'warning', message: 'Enter the 6-digit code from your email.' });
      return;
    }
    if (newPassword.length < 8) {
      showToast({ type: 'warning', message: 'Password must be at least 8 characters.' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email:        email.trim().toLowerCase(),
          otp:          trimmedOtp,
          new_password: newPassword,
        }),
      });
      const body = await res.json();

      if (!res.ok) {
        showToast({ type: 'error', message: body.detail || 'Invalid or expired code.' });
        return;
      }

      setStep('done');
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  }, [email, otp, newPassword, showToast]);

  const handleResend = useCallback(async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE_URL}/api/v1/auth/forgot-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      showToast({ type: 'success', message: 'Code resent. Check your inbox.' });
    } catch {
      showToast({ type: 'error', message: 'Could not resend. Try again.' });
    } finally {
      setLoading(false);
    }
  }, [email, showToast]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={T.background} />
      <StarryBg />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => step === 'code' ? setStep('email') : navigation.goBack()}
          hitSlop={HIT_SLOP}
        >
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>
        <View style={{ width: rs(22) }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View
          style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          {/* Brand */}
          <View style={styles.brandMark}>
            <View style={styles.brandDot} />
            <Text style={styles.brandText}>ANONIXX</Text>
          </View>

          {/* ── Step 1: Email ── */}
          {step === 'email' && (
            <>
              <Text style={styles.title}>forgot your password?</Text>
              <Text style={styles.subtitle}>
                no stress. give us your email and we'll send a 6-digit code to get you back in.
              </Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>EMAIL</Text>
                <View style={[styles.inputRow, focused === 'email' && styles.inputRowFocused]}>
                  <Mail size={rs(16)} color={T.textMuted} style={{ marginRight: rp(10) }} />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => setFocused('email')}
                    onBlur={() => setFocused('')}
                    onSubmitEditing={handleSend}
                    placeholder="your@email.com"
                    placeholderTextColor={T.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="send"
                    selectionColor={T.primary}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.btn, (!email.trim() || loading) && styles.btnDisabled]}
                onPress={handleSend}
                disabled={!email.trim() || loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.btnText}>Send Reset Code</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backLink}
                onPress={() => navigation.goBack()}
                hitSlop={HIT_SLOP}
              >
                <Text style={styles.backLinkText}>back to sign in</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Step 2: Code + New Password ── */}
          {step === 'code' && (
            <>
              <Text style={styles.title}>check your inbox</Text>
              <Text style={styles.subtitle}>
                we sent a 6-digit code to{' '}
                <Text style={{ color: T.text }}>{email.trim()}</Text>
                . it expires in 15 minutes.
              </Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>RESET CODE</Text>
                <View style={[styles.inputRow, focused === 'otp' && styles.inputRowFocused]}>
                  <TextInput
                    style={[styles.input, styles.otpInput]}
                    value={otp}
                    onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
                    onFocus={() => setFocused('otp')}
                    onBlur={() => setFocused('')}
                    placeholder="000000"
                    placeholderTextColor={T.textMuted}
                    keyboardType="number-pad"
                    returnKeyType="next"
                    selectionColor={T.primary}
                    maxLength={6}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>NEW PASSWORD</Text>
                <View style={[styles.inputRow, focused === 'pass' && styles.inputRowFocused]}>
                  <Lock size={rs(16)} color={T.textMuted} style={{ marginRight: rp(10) }} />
                  <TextInput
                    style={styles.input}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    onFocus={() => setFocused('pass')}
                    onBlur={() => setFocused('')}
                    onSubmitEditing={handleReset}
                    placeholder="at least 8 characters"
                    placeholderTextColor={T.textMuted}
                    secureTextEntry={!showPass}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    selectionColor={T.primary}
                  />
                  <Pressable onPress={() => setShowPass((p) => !p)} hitSlop={HIT_SLOP}>
                    {showPass
                      ? <EyeOff size={rs(18)} color={T.textMuted} />
                      : <Eye    size={rs(18)} color={T.textMuted} />
                    }
                  </Pressable>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.btn, (otp.length !== 6 || newPassword.length < 8 || loading) && styles.btnDisabled]}
                onPress={handleReset}
                disabled={otp.length !== 6 || newPassword.length < 8 || loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.btnText}>Reset Password</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backLink}
                onPress={handleResend}
                hitSlop={HIT_SLOP}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color={T.primary} size="small" />
                  : <Text style={styles.backLinkText}>resend code</Text>
                }
              </TouchableOpacity>
            </>
          )}

          {/* ── Step 3: Done ── */}
          {step === 'done' && (
            <View style={styles.sentWrap}>
              <View style={styles.sentIconWrap}>
                <CheckCircle size={rs(42)} color={T.primary} />
              </View>
              <Text style={styles.sentTitle}>you're good to go</Text>
              <Text style={styles.sentBody}>
                your password has been reset. sign in with your new credentials.
              </Text>
              <TouchableOpacity
                style={styles.btn}
                onPress={() => navigation.navigate('Login')}
                activeOpacity={0.85}
              >
                <Text style={styles.btnText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.background },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
  },
  content: {
    flex:              1,
    paddingHorizontal: SPACING.lg,
    paddingTop:        SPACING.lg,
    justifyContent:    'center',
    paddingBottom:     rh(60),
  },
  brandMark: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.sm,
    marginBottom:  SPACING.xl,
  },
  brandDot: {
    width: rs(8), height: rs(8), borderRadius: rs(4),
    backgroundColor: T.primary,
    shadowColor: T.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: rs(6), elevation: 4,
  },
  brandText: {
    fontSize: rf(11), fontWeight: '800', color: T.primary, letterSpacing: rs(3), opacity: 0.8,
  },
  title: {
    fontSize:      FONT.hero,
    fontWeight:    '800',
    color:         T.text,
    letterSpacing: rs(-0.5),
    marginBottom:  SPACING.sm,
    lineHeight:    FONT.hero * 1.2,
    fontFamily:    'PlayfairDisplay-Bold',
  },
  subtitle: {
    fontSize:     FONT.md,
    color:        T.textSecondary,
    lineHeight:   FONT.md * 1.6,
    marginBottom: SPACING.xl,
    fontFamily:   'DMSans-Regular',
  },
  fieldGroup:  { marginBottom: SPACING.md },
  label: {
    fontSize: rf(11), fontWeight: '700', color: T.textSecondary,
    marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: rs(1),
    fontFamily: 'DMSans-Bold',
  },
  inputRow: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   T.inputBg,
    borderRadius:      RADIUS.lg,
    borderWidth:       1.5,
    borderColor:       T.border,
    paddingHorizontal: rp(14),
    height:            rs(52),
  },
  inputRowFocused: {
    borderColor:     'rgba(255,255,255,0.20)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  input: {
    flex: 1, height: rs(52), color: T.text, fontSize: FONT.md, fontFamily: 'DMSans-Regular',
  },
  otpInput: {
    fontSize:      rf(22),
    fontWeight:    '700',
    letterSpacing: rs(6),
    textAlign:     'center',
    fontFamily:    'DMSans-Bold',
  },
  btn: {
    backgroundColor: T.primary,
    borderRadius:    RADIUS.lg,
    height:          BUTTON_HEIGHT,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       SPACING.sm,
    shadowColor:     T.primary,
    shadowOffset:    { width: 0, height: rs(4) },
    shadowOpacity:   0.4,
    shadowRadius:    rs(16),
    elevation:       8,
  },
  btnDisabled: { opacity: 0.38, shadowOpacity: 0 },
  btnText: {
    fontSize:      FONT.md,
    fontWeight:    '700',
    color:         '#fff',
    letterSpacing: 0.4,
    fontFamily:    'DMSans-Bold',
  },
  backLink: { alignItems: 'center', paddingVertical: rp(12), marginTop: SPACING.xs },
  backLinkText: {
    fontSize: FONT.sm, color: T.textMuted, fontFamily: 'DMSans-Regular',
  },

  // Done state
  sentWrap: { alignItems: 'center' },
  sentIconWrap: {
    width: rs(88), height: rs(88), borderRadius: rs(44),
    backgroundColor: T.primaryDim,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  sentTitle: {
    fontSize:     rf(26),
    fontWeight:   '700',
    color:        T.text,
    marginBottom: SPACING.sm,
    fontFamily:   'PlayfairDisplay-Bold',
    textAlign:    'center',
  },
  sentBody: {
    fontSize:          FONT.md,
    color:             T.textSecondary,
    textAlign:         'center',
    lineHeight:        FONT.md * 1.6,
    marginBottom:      SPACING.xl,
    fontFamily:        'DMSans-Regular',
    paddingHorizontal: SPACING.sm,
  },
});
