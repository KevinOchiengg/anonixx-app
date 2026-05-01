import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { signup } from '../../store/slices/authSlice';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import {
  rs, rf, rp, rh, SPACING, FONT, RADIUS,
  ICON, INPUT_HEIGHT, BUTTON_HEIGHT, SCREEN, HIT_SLOP,
} from '../../utils/responsive';
import { User, Mail, Lock, Eye, EyeOff, CheckCircle2, Gift } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../config/api';
import { THEME } from '../../utils/theme';

const EMAIL_REGEX         = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_USERNAME_LENGTH = 30;
const MAX_EMAIL_LENGTH    = 254;
const MAX_PASSWORD_LENGTH = 128;

const STARS = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  top:     Math.random() * SCREEN.height,
  left:    Math.random() * SCREEN.width,
  size:    Math.random() * rs(2.5) + rs(0.5),
  opacity: Math.random() * 0.4 + 0.1,
}));

const StarryBackground = React.memo(() => (
  <>
    {STARS.map((s) => (
      <View key={s.id} style={{
        position: 'absolute', backgroundColor: THEME.primary,
        borderRadius: s.size, top: s.top, left: s.left,
        width: s.size, height: s.size, opacity: s.opacity,
      }} />
    ))}
  </>
));

const GlowOrb = React.memo(() => <View style={styles.glowOrb} />);

const INITIAL_FORM = { username: '', email: '', password: '', confirmPassword: '', referralCode: '' };
const MAX_REFERRAL_LENGTH = 20;

// Password strength checker
function getPasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: 'transparent' };
  let score = 0;
  if (password.length >= 8)                          score++;
  if (password.length >= 12)                         score++;
  if (/[A-Z]/.test(password))                        score++;
  if (/[0-9]/.test(password))                        score++;
  if (/[^A-Za-z0-9]/.test(password))                 score++;
  if (score <= 1) return { score, label: 'Weak',   color: '#ef4444' };
  if (score <= 3) return { score, label: 'Fair',   color: '#f59e0b' };
  return             { score, label: 'Strong', color: '#22c55e' };
}

export default function SignUpScreen({ navigation }) {
  const dispatch                    = useDispatch();
  const { login: authContextLogin } = useAuth();
  const { showToast }               = useToast();
  const { loading }                 = useSelector((state) => state.auth);

  const [formData, setFormData]   = useState(INITIAL_FORM);
  const [errors, setErrors]       = useState({});
  const [focused, setFocused]     = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(rh(24))).current;

  const emailRef        = useRef(null);
  const passwordRef     = useRef(null);
  const confirmPassRef  = useRef(null);
  const referralRef     = useRef(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, delay: 150, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, delay: 150, useNativeDriver: true }),
    ]).start();
  }, []);

  const passwordStrength = useMemo(
    () => getPasswordStrength(formData.password),
    [formData.password]
  );

  const updateField = useCallback((field, value, maxLen) => {
    const sanitized = value.slice(0, maxLen);
    setFormData((prev) => ({ ...prev, [field]: sanitized }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  }, [errors]);

  const validate = useCallback(() => {
    const e = {};
    const username = formData.username.trim();
    const email    = formData.email.trim();

    if (!username)                              e.username = 'Username is required';
    else if (username.length < 3)               e.username = 'At least 3 characters';
    else if (!/^[a-zA-Z0-9_]+$/.test(username)) e.username = 'Letters, numbers and _ only';

    if (!email)                                 e.email = 'Email is required';
    else if (!EMAIL_REGEX.test(email))          e.email = 'Enter a valid email address';

    if (!formData.password)                     e.password = 'Password is required';
    else if (formData.password.length < 8)      e.password = 'Minimum 8 characters';

    if (!formData.confirmPassword)              e.confirmPassword = 'Please confirm your password';
    else if (formData.password !== formData.confirmPassword)
                                                e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [formData]);

  const handleSignUp = useCallback(async () => {
    if (!validate()) {
      showToast({ type: 'error', message: 'Please fix the errors before continuing.' });
      return;
    }
    try {
      const result = await dispatch(signup({
        username:  formData.username.trim().toLowerCase(),
        email:     formData.email.trim().toLowerCase(),
        password:  formData.password,
      })).unwrap();

      await authContextLogin(result.token, result.user);

      const code = formData.referralCode.trim().toUpperCase();
      if (code) {
        try {
          const applyRes = await fetch(`${API_BASE_URL}/api/v1/referrals/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${result.token}` },
            body: JSON.stringify({ code }),
          });
          if (applyRes.ok) {
            await AsyncStorage.setItem('pendingReferralComplete', '1');
          }
        } catch { /* fire-and-forget */ }
      }

      showToast({ type: 'success', title: 'Account created!', message: "Welcome to Anonixx 🌑" });

      setTimeout(() => {
        navigation.reset({ index: 0, routes: [{ name: 'InterestSelection' }] });
      }, 600);
    } catch (err) {
      const msg = err?.detail || err?.message || '';
      if (msg.toLowerCase().includes('email') && msg.toLowerCase().includes('exist')) {
        showToast({ type: 'error', title: 'Email taken', message: 'An account with this email already exists.' });
        setErrors((prev) => ({ ...prev, email: 'Already in use' }));
      } else if (msg.toLowerCase().includes('username')) {
        showToast({ type: 'error', title: 'Username taken', message: 'Try a different username.' });
        setErrors((prev) => ({ ...prev, username: 'Already taken' }));
      } else if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
        showToast({ type: 'error', title: 'No Connection', message: 'Check your internet and try again.' });
      } else {
        showToast({ type: 'error', title: 'Signup Failed', message: 'Something went wrong. Please try again.' });
      }
    }
  }, [formData, validate, dispatch, authContextLogin, showToast, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />
      <GlowOrb />

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

            {/* Brand */}
            <View style={styles.brandMark}>
              <View style={styles.brandDot} />
              <Text style={styles.brandText}>ANONIXX</Text>
            </View>

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Create account</Text>
              <Text style={styles.subtitle}>Anonymous. No judgement. Just truth.</Text>
            </View>

            {/* Username */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Username</Text>
              <View style={[
                styles.inputRow,
                focused === 'username' && styles.inputRowFocused,
                errors.username       && styles.inputRowError,
              ]}>
                <User size={ICON.md} color={THEME.textSecondary} strokeWidth={2} style={styles.fieldIcon} />
                <TextInput
                  value={formData.username}
                  onChangeText={(v) => updateField('username', v, MAX_USERNAME_LENGTH)}
                  onFocus={() => setFocused('username')}
                  onBlur={() => setFocused('')}
                  onSubmitEditing={() => emailRef.current?.focus()}
                  placeholder="your_username"
                  placeholderTextColor={THEME.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  textContentType="username"
                  style={styles.input}
                />
                {formData.username.length >= 3 && !errors.username && (
                  <CheckCircle2 size={ICON.md} color="#22c55e" strokeWidth={2} style={styles.fieldIcon} />
                )}
              </View>
              {errors.username ? <Text style={styles.fieldError}>{errors.username}</Text> : null}
            </View>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={[
                styles.inputRow,
                focused === 'email' && styles.inputRowFocused,
                errors.email        && styles.inputRowError,
              ]}>
                <Mail size={ICON.md} color={THEME.textSecondary} strokeWidth={2} style={styles.fieldIcon} />
                <TextInput
                  ref={emailRef}
                  value={formData.email}
                  onChangeText={(v) => updateField('email', v, MAX_EMAIL_LENGTH)}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused('')}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  placeholder="your@email.com"
                  placeholderTextColor={THEME.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  textContentType="emailAddress"
                  style={styles.input}
                />
              </View>
              {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[
                styles.inputRow,
                focused === 'password' && styles.inputRowFocused,
                errors.password        && styles.inputRowError,
              ]}>
                <Lock size={ICON.md} color={THEME.textSecondary} strokeWidth={2} style={styles.fieldIcon} />
                <TextInput
                  ref={passwordRef}
                  value={formData.password}
                  onChangeText={(v) => updateField('password', v, MAX_PASSWORD_LENGTH)}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused('')}
                  onSubmitEditing={() => confirmPassRef.current?.focus()}
                  placeholder="Min. 8 characters"
                  placeholderTextColor={THEME.textSecondary}
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  textContentType="newPassword"
                  style={styles.input}
                />
                <Pressable onPress={() => setShowPass((p) => !p)} hitSlop={HIT_SLOP} style={styles.eyeBtn}>
                  {showPass
                    ? <EyeOff size={ICON.md} color={THEME.textSecondary} strokeWidth={2} />
                    : <Eye    size={ICON.md} color={THEME.textSecondary} strokeWidth={2} />
                  }
                </Pressable>
              </View>
              {/* Password strength bar */}
              {formData.password.length > 0 && (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthBars}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <View
                        key={i}
                        style={[
                          styles.strengthBar,
                          { backgroundColor: i <= passwordStrength.score ? passwordStrength.color : THEME.border },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>
                    {passwordStrength.label}
                  </Text>
                </View>
              )}
              {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}
            </View>

            {/* Confirm Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={[
                styles.inputRow,
                focused === 'confirm' && styles.inputRowFocused,
                errors.confirmPassword && styles.inputRowError,
              ]}>
                <Lock size={ICON.md} color={THEME.textSecondary} strokeWidth={2} style={styles.fieldIcon} />
                <TextInput
                  ref={confirmPassRef}
                  value={formData.confirmPassword}
                  onChangeText={(v) => updateField('confirmPassword', v, MAX_PASSWORD_LENGTH)}
                  onFocus={() => setFocused('confirm')}
                  onBlur={() => setFocused('')}
                  onSubmitEditing={() => referralRef.current?.focus()}
                  placeholder="Re-enter your password"
                  placeholderTextColor={THEME.textSecondary}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  textContentType="newPassword"
                  style={styles.input}
                />
                <Pressable onPress={() => setShowConfirm((p) => !p)} hitSlop={HIT_SLOP} style={styles.eyeBtn}>
                  {showConfirm
                    ? <EyeOff size={ICON.md} color={THEME.textSecondary} strokeWidth={2} />
                    : <Eye    size={ICON.md} color={THEME.textSecondary} strokeWidth={2} />
                  }
                </Pressable>
              </View>
              {errors.confirmPassword ? <Text style={styles.fieldError}>{errors.confirmPassword}</Text> : null}
            </View>

            {/* Referral Code (optional) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Referral Code <Text style={styles.labelOptional}>(optional)</Text></Text>
              <View style={[
                styles.inputRow,
                focused === 'referral' && styles.inputRowFocused,
              ]}>
                <Gift size={ICON.md} color={THEME.textSecondary} strokeWidth={2} style={styles.fieldIcon} />
                <TextInput
                  ref={referralRef}
                  value={formData.referralCode}
                  onChangeText={(v) => updateField('referralCode', v.toUpperCase(), MAX_REFERRAL_LENGTH)}
                  onFocus={() => setFocused('referral')}
                  onBlur={() => setFocused('')}
                  onSubmitEditing={handleSignUp}
                  placeholder="e.g. ABC12XYZ"
                  placeholderTextColor={THEME.textSecondary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="done"
                  style={styles.input}
                />
                {formData.referralCode.length >= 4 && (
                  <CheckCircle2 size={ICON.md} color="#22c55e" strokeWidth={2} style={styles.fieldIcon} />
                )}
              </View>
            </View>

            {/* Submit */}
            <TouchableOpacity
              onPress={handleSignUp}
              disabled={loading}
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.submitBtnText}>Create Account</Text>
              }
            </TouchableOpacity>

            {/* Login link */}
            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Already have an account?  </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')} hitSlop={HIT_SLOP}>
                <Text style={styles.loginTextBold}>Sign In</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.termsText}>
              By signing up, you agree to our Terms of Service and Privacy Policy
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: THEME.background },
  glowOrb: {
    position: 'absolute', width: rs(300), height: rs(300),
    borderRadius: rs(150), backgroundColor: THEME.primary,
    opacity: 0.05, top: rh(-80), right: rs(-60),
  },
  kav:          { flex: 1 },
  scroll:       { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },

  brandMark:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xl, marginBottom: SPACING.xl },
  brandDot:     { width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: THEME.primary, shadowColor: THEME.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: rs(6), elevation: 4 },
  brandText:    { fontSize: rf(11), fontWeight: '800', color: THEME.primary, letterSpacing: rs(3), opacity: 0.8 },

  header:       { marginBottom: SPACING.xl },
  title:        { fontSize: FONT.hero, fontWeight: '800', color: THEME.text, letterSpacing: rs(-1), marginBottom: SPACING.sm, lineHeight: FONT.hero * 1.15 },
  subtitle:     { fontSize: FONT.md, color: THEME.textSecondary, lineHeight: FONT.md * 1.6 },

  fieldGroup:   { marginBottom: SPACING.md },
  label:        { fontSize: rf(11), fontWeight: '700', color: THEME.textSecondary, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: rs(1) },
  labelOptional: { fontWeight: '400', textTransform: 'none', letterSpacing: 0, opacity: 0.7 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: THEME.inputBg, borderRadius: RADIUS.lg,
    borderWidth: 1.5, borderColor: THEME.border,
    paddingHorizontal: rp(14), height: INPUT_HEIGHT,
  },
  inputRowFocused: { borderColor: 'rgba(255,255,255,0.20)', backgroundColor: 'rgba(255,255,255,0.06)' },
  inputRowError:   { borderColor: THEME.error },
  fieldIcon:       { marginRight: rp(10) },
  input:           { flex: 1, fontSize: FONT.md, color: THEME.text, height: INPUT_HEIGHT },
  eyeBtn:          { padding: rp(4), marginLeft: rp(6) },
  fieldError:      { color: THEME.error, fontSize: rf(11), marginTop: SPACING.xs, marginLeft: rp(4), fontWeight: '500' },

  // Password strength
  strengthContainer: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm, gap: SPACING.sm },
  strengthBars:      { flexDirection: 'row', gap: rp(4), flex: 1 },
  strengthBar:       { flex: 1, height: rh(3), borderRadius: rh(2) },
  strengthLabel:     { fontSize: rf(11), fontWeight: '700', width: rs(48), textAlign: 'right' },

  submitBtn:        { height: BUTTON_HEIGHT, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.primary, marginTop: SPACING.sm, marginBottom: SPACING.lg, shadowColor: THEME.primary, shadowOffset: { width: 0, height: rh(8) }, shadowOpacity: 0.45, shadowRadius: rs(20), elevation: 10 },
  submitBtnDisabled:{ opacity: 0.55, shadowOpacity: 0 },
  submitBtnText:    { color: '#fff', fontSize: FONT.lg, fontWeight: '700', letterSpacing: rs(0.3) },

  loginRow:         { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  loginText:        { fontSize: FONT.md, color: THEME.textSecondary },
  loginTextBold:    { fontSize: FONT.md, fontWeight: '700', color: THEME.primary },

  termsText:        { fontSize: rf(11), textAlign: 'center', color: THEME.textSecondary, lineHeight: rf(11) * 1.7, opacity: 0.6, paddingHorizontal: SPACING.md },
});
