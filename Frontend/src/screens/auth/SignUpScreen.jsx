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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useDispatch, useSelector } from 'react-redux';
import { signup, updateUser as updateReduxUser } from '../../store/slices/authSlice';
import { setBalance } from '../../store/slices/coinsSlice';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { uploadToR2 } from '../../utils/upload';
import {
  rs, rf, rp, rh, SPACING, FONT, RADIUS,
  ICON, INPUT_HEIGHT, BUTTON_HEIGHT, SCREEN, HIT_SLOP,
} from '../../utils/responsive';
import { User, Mail, Lock, Eye, EyeOff, CheckCircle2, Check, Gift, ArrowLeft, Camera } from 'lucide-react-native';
import { API_BASE_URL } from '../../config/api';
import { THEME } from '../../utils/theme';
import { ANONYMOUS_NAME_RE, ANONYMOUS_NAME_HINT, normalizeNameSpaces } from '../../utils/anonymousName';

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

const INITIAL_FORM = {
  username: '', email: '', password: '', confirmPassword: '', referralCode: '',
};
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
  const { login: authContextLogin, updateUserProfile } = useAuth();
  const { showToast }               = useToast();
  const { loading }                 = useSelector((state) => state.auth);

  const [formData, setFormData]   = useState(INITIAL_FORM);
  const [errors, setErrors]       = useState({});
  const [focused, setFocused]     = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [gender, setGender] = useState(null);
  // "I'm 18 or older" — the only age question at signup. The age shown on a
  // hookup card is asked when the hookup is written.
  const [adult, setAdult] = useState(false);

  // Profile picture — optional; most users stay faceless on Anonixx
  const [avatarUri, setAvatarUri]       = useState(null);
  const [showPhotoDisclaimer, setShowPhotoDisclaimer] = useState(false);

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

  // Picking happens locally — there's no auth token yet to upload with, so
  // the file is only sent to R2 once signup succeeds and we have one (see
  // handleSignUp).
  const pickAvatar = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'warning', message: 'Allow photo access to add a picture.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:    'images',
        allowsEditing: true,
        aspect:        [1, 1],
        quality:       0.8,
      });
      if (result.canceled) return;
      setAvatarUri(result.assets[0].uri);
    } catch {
      showToast({ type: 'error', message: 'Could not open your photos. Try again.' });
    }
  }, [showToast]);

  const validate = useCallback(() => {
    const e = {};
    const username = formData.username.trim();
    const email    = formData.email.trim();

    if (!username)                              e.username = 'Pick a name';
    else if (username.length < 3)               e.username = 'At least 3 characters';
    else if (!ANONYMOUS_NAME_RE.test(username)) e.username = 'Letters, numbers, spaces, dots, hyphens, underscores or emoji only';

    if (!email)                                 e.email = 'Email is required';
    else if (!EMAIL_REGEX.test(email))          e.email = 'Enter a valid email address';

    if (!formData.password)                     e.password = 'Password is required';
    else if (formData.password.length < 8)      e.password = 'Minimum 8 characters';

    if (!formData.confirmPassword)              e.confirmPassword = 'Please confirm your password';
    else if (formData.password !== formData.confirmPassword)
                                                e.confirmPassword = 'Passwords do not match';

    if (!adult) e.adult = "Confirm you're 18 or older";

    setErrors(e);
    return Object.keys(e).length === 0;
  }, [formData, adult]);

  const handleSignUp = useCallback(async () => {
    if (!validate()) {
      showToast({ type: 'error', message: 'Please fix the errors before continuing.' });
      return;
    }
    try {
      const result = await dispatch(signup({
        username:      formData.username.trim(),
        email:         formData.email.trim().toLowerCase(),
        password:      formData.password,
        adult_confirmed: true,
        signup_source: { platform: Platform.OS },   // where they joined from (admin growth dashboard)
        ...(gender ? { gender } : {}),
      })).unwrap();

      await authContextLogin(result.token, result.user);
      // The register response already carries the welcome-bonus balance —
      // seed it into Redux immediately instead of leaving coins.balance at
      // its initial 0 until some other screen happens to call
      // fetchBalance(). Without this, the very first thing a new user
      // sees is "0 coins" right after being told they got 1000.
      if (result.user?.coin_balance != null) {
        dispatch(setBalance(result.user.coin_balance));
      }

      // Optional picture — upload now that we actually have a token. Not
      // blocking: a failure here shouldn't stop account creation, since
      // the photo can always be added later from Edit Profile.
      if (avatarUri) {
        try {
          const cloudUrl = await uploadToR2(avatarUri, 'image', 'image/jpeg');
          await fetch(`${API_BASE_URL}/api/v1/auth/update-profile`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${result.token}` },
            body:    JSON.stringify({ avatar_url: cloudUrl }),
          });
          updateUserProfile?.({ avatar_url: cloudUrl });
          dispatch(updateReduxUser({ avatar_url: cloudUrl }));
        } catch {
          showToast({ type: 'warning', message: 'Account created, but the photo upload failed. Add it later from your profile.' });
        }
      }

      const code = formData.referralCode.trim().toUpperCase();
      if (code) {
        try {
          const applyRes = await fetch(`${API_BASE_URL}/api/v1/referrals/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${result.token}` },
            body: JSON.stringify({ code }),
          });
          if (applyRes.ok) {
            // No separate onboarding step exists anymore to trigger this
            // later — complete it right away.
            fetch(`${API_BASE_URL}/api/v1/referrals/complete`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${result.token}` },
            }).catch(() => {});
          }
        } catch { /* fire-and-forget */ }
      }

      showToast({ type: 'success', title: 'Account created!', message: "Welcome to Anonixx 🌑" });

      // Land straight in the main feed — there's no separate identity-setup
      // step anymore. reset (not navigate) so signup/login screens aren't
      // sitting underneath in the stack.
      setTimeout(() => {
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      }, 600);
    } catch (err) {
      const msg   = err?.detail || err?.message || '';
      const lower = msg.toLowerCase();
      if (lower.includes('email') && (lower.includes('exist') || lower.includes('already registered'))) {
        showToast({ type: 'error', title: 'Email taken', message: 'An account with this email already exists.' });
        setErrors((prev) => ({ ...prev, email: 'Already in use' }));
      } else if (lower.includes('already taken')) {
        showToast({ type: 'error', title: 'Username taken', message: 'Try a different username.' });
        setErrors((prev) => ({ ...prev, username: 'Already taken' }));
      } else if (lower.includes('username')) {
        // Format/profanity rejections also mention "username" — surface the
        // backend's actual reason instead of always claiming it's taken.
        showToast({ type: 'error', title: 'Invalid username', message: msg });
        setErrors((prev) => ({ ...prev, username: msg }));
      } else if (lower.includes('network') || lower.includes('fetch')) {
        showToast({ type: 'error', title: 'No Connection', message: 'Check your internet and try again.' });
      } else if (lower.includes('18+')) {
        showToast({ type: 'error', title: 'Adults only', message: 'Anonixx is for adults 18+.' });
        setErrors((prev) => ({ ...prev, adult: 'Anonixx is for adults 18+' }));
      } else {
        showToast({ type: 'error', title: 'Signup Failed', message: 'Something went wrong. Please try again.' });
      }
    }
  }, [formData, avatarUri, validate, dispatch, authContextLogin, updateUserProfile, showToast, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />
      <GlowOrb />

      {/* Top bar — back button, top-left */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={HIT_SLOP}
        >
          <ArrowLeft size={rs(22)} color={THEME.text} />
        </TouchableOpacity>
      </View>

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
              <Text style={styles.subtitle}>No names. No judgment. Just what's real.</Text>
            </View>

            {/* Profile picture (optional) — most users stay faceless */}
            <View style={styles.avatarSection}>
              <View style={styles.avatarWrap}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <User size={rs(28)} color={THEME.textSecondary} strokeWidth={1.8} />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.avatarCameraBtn}
                  onPress={() => (avatarUri ? pickAvatar() : setShowPhotoDisclaimer((d) => !d))}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.85}
                >
                  <Camera size={rs(13)} color="#fff" strokeWidth={2} />
                </TouchableOpacity>
              </View>
              <Text style={styles.avatarHint}>
                {avatarUri ? 'tap to change' : 'add a profile picture (optional)'}
              </Text>

              {showPhotoDisclaimer && !avatarUri && (
                <View style={styles.photoDisclaimer}>
                  <Text style={styles.photoDisclaimerTitle}>⚠️  Before you upload</Text>
                  <Text style={styles.photoDisclaimerBody}>
                    A real photo makes you identifiable. Anonixx is built for anonymous
                    expression — most people stay faceless. You can always skip this and
                    add one later.
                  </Text>
                  <View style={styles.photoDisclaimerActions}>
                    <TouchableOpacity
                      style={styles.photoDisclaimerConfirm}
                      onPress={() => { setShowPhotoDisclaimer(false); pickAvatar(); }}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.photoDisclaimerConfirmText}>I understand, pick a photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowPhotoDisclaimer(false)} hitSlop={HIT_SLOP}>
                      <Text style={styles.photoDisclaimerCancel}>Skip</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Anonymous name (stored as "username" — this is what shows on your posts/comments) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Anonymous name</Text>
              <View style={[
                styles.inputRow,
                focused === 'username' && styles.inputRowFocused,
                errors.username       && styles.inputRowError,
              ]}>
                <User size={ICON.md} color={THEME.textSecondary} strokeWidth={2} style={styles.fieldIcon} />
                <TextInput
                  value={formData.username}
                  onChangeText={(v) => updateField('username', normalizeNameSpaces(v), MAX_USERNAME_LENGTH)}
                  onFocus={() => setFocused('username')}
                  onBlur={() => setFocused('')}
                  onSubmitEditing={() => emailRef.current?.focus()}
                  placeholder="what should we call you?"
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
              {errors.username
                ? <Text style={styles.fieldError}>{errors.username}</Text>
                : <Text style={styles.fieldHint}>This is what everyone sees you as — no real names. {ANONYMOUS_NAME_HINT}</Text>
              }
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

            {/* Gender (optional) */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Gender <Text style={styles.labelOptional}>(optional)</Text></Text>
              <View style={styles.genderRow}>
                {GENDER_OPTIONS.map((opt) => {
                  const isSelected = gender === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => setGender(isSelected ? null : opt.id)}
                      style={[styles.genderChip, isSelected && styles.genderChipSelected]}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.genderChipText, isSelected && styles.genderChipTextSelected]}>
                        {opt.symbol}{'  '}{opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.fieldHint}>only visible on your anonymous connect profile.</Text>
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

            {/* 18+ and terms: one tick, no birthday */}
            <TouchableOpacity
              onPress={() => { setAdult((v) => !v); if (errors.adult) setErrors((prev) => ({ ...prev, adult: null })); }}
              style={styles.adultRow}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: adult }}
            >
              <View style={[styles.adultBox, adult && styles.adultBoxOn, errors.adult && styles.inputRowError]}>
                {adult ? <Check size={rs(14)} color="#fff" strokeWidth={3} /> : null}
              </View>
              <Text style={styles.adultText}>I'm 18 or older and I agree to the Terms of Service and Privacy Policy.</Text>
            </TouchableOpacity>
            {errors.adult ? <Text style={[styles.fieldError, { marginBottom: SPACING.sm }]}>{errors.adult}</Text> : null}

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
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const GENDER_OPTIONS = [
  { id: 'male',              label: 'Male',              symbol: '♂' },
  { id: 'female',            label: 'Female',            symbol: '♀' },
  { id: 'nonbinary',         label: 'Non-binary',        symbol: '⚧' },
  { id: 'prefer_not_to_say', label: 'Prefer not to say', symbol: '—' },
];

const styles = StyleSheet.create({
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8) },
  genderChip: {
    paddingHorizontal: rp(14), paddingVertical: rp(8), borderRadius: RADIUS.full,
    backgroundColor: THEME.inputBg, borderWidth: 1, borderColor: THEME.border,
  },
  genderChipSelected: { backgroundColor: 'rgba(255,99,74,0.12)', borderColor: 'rgba(255,99,74,0.45)' },
  genderChipText: { fontSize: rf(13), color: THEME.textSecondary, fontWeight: '500' },
  genderChipTextSelected: { color: THEME.primary, fontWeight: '700' },
  container:    { flex: 1, backgroundColor: THEME.background },
  glowOrb: {
    position: 'absolute', width: rs(300), height: rs(300),
    borderRadius: rs(150), backgroundColor: THEME.primary,
    opacity: 0.05, top: rh(-80), right: rs(-60),
  },
  topBar:       { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  kav:          { flex: 1 },
  scroll:       { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },

  brandMark:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xl, marginBottom: SPACING.xl },
  brandDot:     { width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: THEME.primary, shadowColor: THEME.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: rs(6), elevation: 4 },
  brandText:    { fontSize: rf(11), fontWeight: '800', fontFamily: 'DMSans-Bold', color: THEME.primary, letterSpacing: rs(3), opacity: 0.8 },

  header:       { marginBottom: SPACING.xl },
  title:        { fontSize: FONT.hero, fontWeight: '800', fontFamily: 'PlayfairDisplay-Bold', color: THEME.text, letterSpacing: rs(-1), marginBottom: SPACING.sm, lineHeight: FONT.hero * 1.15 },
  subtitle:     { fontSize: FONT.md, fontFamily: 'PlayfairDisplay-Italic', color: THEME.textSecondary, lineHeight: FONT.md * 1.6 },

  // Profile picture (optional)
  avatarSection:   { alignItems: 'center', marginBottom: SPACING.lg },
  avatarWrap:      { position: 'relative', width: rs(78), height: rs(78), marginBottom: rp(8) },
  avatarImage:     { width: '100%', height: '100%', borderRadius: rs(39), borderWidth: rs(1.5), borderColor: THEME.border },
  avatarPlaceholder: {
    width: '100%', height: '100%', borderRadius: rs(39),
    backgroundColor: THEME.inputBg, alignItems: 'center', justifyContent: 'center',
    borderWidth: rs(1.5), borderColor: THEME.border,
  },
  avatarCameraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: rs(26), height: rs(26), borderRadius: rs(13),
    backgroundColor: THEME.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: rs(2), borderColor: THEME.background,
  },
  avatarHint:      { fontSize: rf(11), fontFamily: 'DMSans-Regular', color: THEME.textMuted, fontStyle: 'italic' },

  photoDisclaimer: {
    marginTop: SPACING.sm, padding: SPACING.md, width: '100%',
    backgroundColor: 'rgba(251,191,36,0.07)', borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)', gap: rp(8),
  },
  photoDisclaimerTitle: { fontSize: rf(12), fontWeight: '700', fontFamily: 'DMSans-Bold', color: THEME.text },
  photoDisclaimerBody:  { fontSize: rf(11), fontFamily: 'DMSans-Regular', color: THEME.textSecondary, lineHeight: rf(16) },
  photoDisclaimerActions: { gap: rp(8), marginTop: rp(4) },
  photoDisclaimerConfirm: { backgroundColor: THEME.primary, borderRadius: RADIUS.md, paddingVertical: rp(10), alignItems: 'center' },
  photoDisclaimerConfirmText: { color: '#fff', fontWeight: '700', fontFamily: 'DMSans-Bold', fontSize: rf(12) },
  photoDisclaimerCancel: { color: THEME.textSecondary, fontSize: rf(12), fontFamily: 'DMSans-Regular', textAlign: 'center', paddingVertical: rp(4) },

  fieldGroup:   { marginBottom: SPACING.md },
  label:        { fontSize: rf(11), fontWeight: '700', fontFamily: 'DMSans-Bold', color: THEME.textSecondary, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: rs(1) },
  labelOptional: { fontWeight: '400', fontFamily: 'DMSans-Regular', textTransform: 'none', letterSpacing: 0, opacity: 0.7 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: THEME.inputBg, borderRadius: RADIUS.lg,
    borderWidth: 1.5, borderColor: THEME.border,
    paddingHorizontal: rp(14), height: INPUT_HEIGHT,
  },
  inputRowFocused: { borderColor: 'rgba(255,255,255,0.20)', backgroundColor: 'rgba(255,255,255,0.06)' },
  inputRowError:   { borderColor: THEME.error },
  fieldIcon:       { marginRight: rp(10) },
  input:           { flex: 1, fontSize: FONT.md, fontFamily: 'DMSans-Regular', color: THEME.text, height: INPUT_HEIGHT },
  eyeBtn:          { padding: rp(4), marginLeft: rp(6) },
  fieldError:      { color: THEME.error, fontSize: rf(11), fontFamily: 'DMSans-SemiBold', marginTop: SPACING.xs, marginLeft: rp(4), fontWeight: '500' },
  fieldHint:       { color: THEME.textMuted, fontSize: rf(11), fontFamily: 'DMSans-Regular', marginTop: SPACING.xs, marginLeft: rp(4), lineHeight: rf(15) },


  // Password strength
  strengthContainer: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm, gap: SPACING.sm },
  strengthBars:      { flexDirection: 'row', gap: rp(4), flex: 1 },
  strengthBar:       { flex: 1, height: rh(3), borderRadius: rh(2) },
  strengthLabel:     { fontSize: rf(11), fontWeight: '700', fontFamily: 'DMSans-Bold', width: rs(48), textAlign: 'right' },

  adultRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: rp(10), marginTop: SPACING.xs, marginBottom: SPACING.sm },
  adultBox:         { width: rs(22), height: rs(22), borderRadius: rs(6), borderWidth: 1.5, borderColor: THEME.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: rp(1) },
  adultBoxOn:       { backgroundColor: THEME.primary, borderColor: THEME.primary },
  adultText:        { flex: 1, fontSize: rf(13), fontFamily: 'DMSans-Regular', color: THEME.textSecondary, lineHeight: rf(19) },
  submitBtn:        { height: BUTTON_HEIGHT, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.primary, marginTop: SPACING.sm, marginBottom: SPACING.lg, shadowColor: THEME.primary, shadowOffset: { width: 0, height: rh(8) }, shadowOpacity: 0.45, shadowRadius: rs(20), elevation: 10 },
  submitBtnDisabled:{ opacity: 0.55, shadowOpacity: 0 },
  submitBtnText:    { color: '#fff', fontSize: FONT.lg, fontWeight: '700', fontFamily: 'DMSans-Bold', letterSpacing: rs(0.3) },

  loginRow:         { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  loginText:        { fontSize: FONT.md, fontFamily: 'DMSans-Regular', color: THEME.textSecondary },
  loginTextBold:    { fontSize: FONT.md, fontWeight: '700', fontFamily: 'DMSans-Bold', color: THEME.primary },

  termsText:        { fontSize: rf(11), fontFamily: 'DMSans-Regular', textAlign: 'center', color: THEME.textSecondary, lineHeight: rf(11) * 1.7, opacity: 0.6, paddingHorizontal: SPACING.md },
});
